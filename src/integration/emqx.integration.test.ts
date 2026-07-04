import { connect as mqttConnect } from 'mqtt';
import { describe, expect, it } from 'vitest';
import { BrokerManager, type ManagedMqttClient } from '../main/brokerManager';
import { normalizeProfile } from '../shared/validation';

const integration = process.env.RUN_MQTT_INTEGRATION === '1' ? describe : describe.skip;

async function waitFor(
  predicate: () => boolean,
  description: string,
  timeoutMs = 10_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

integration('EMQX secure transport integration', () => {
  it(
    'connects simultaneously through MQTT/TLS and WSS, subscribes, publishes, and captures messages',
    async () => {
      const caPath = process.env.MQTT_TEST_CA;
      if (!caPath) throw new Error('MQTT_TEST_CA is required.');
      const manager = new BrokerManager(
        (url, options) => mqttConnect(url, options) as ManagedMqttClient,
        () => undefined,
        10
      );
      const tls = normalizeProfile({
        id: 'tls',
        name: 'Local TLS',
        host: 'localhost',
        port: 8883,
        transport: 'mqtts',
        clientId: `mqtttree-tls-${Date.now()}`,
        caPath,
        rejectUnauthorized: true,
        subscriptions: [{ filter: 'integration/#', qos: 1 }]
      });
      const wss = normalizeProfile({
        id: 'wss',
        name: 'Local WSS',
        host: 'localhost',
        port: 8084,
        transport: 'wss',
        websocketPath: '/mqtt',
        clientId: `mqtttree-wss-${Date.now()}`,
        caPath,
        rejectUnauthorized: true,
        subscriptions: [{ filter: 'integration/#', qos: 1 }]
      });

      await manager.connect(tls);
      await manager.connect(wss);
      await waitFor(
        () =>
          manager.getSnapshot('tls').status.state === 'connected' &&
          manager.getSnapshot('wss').status.state === 'connected',
        'both secure connections'
      );
      await waitFor(
        () =>
          manager
            .getSnapshot('tls')
            .logs.some((log) => log.message === 'Subscribed to integration/#.') &&
          manager
            .getSnapshot('wss')
            .logs.some((log) => log.message === 'Subscribed to integration/#.'),
        'custom wildcard subscriptions'
      );

      await manager.publish({
        connectionId: 'tls',
        topic: 'integration/tls',
        payload: '{"transport":"mqtts"}',
        qos: 1,
        retain: true
      });
      await manager.publish({
        connectionId: 'wss',
        topic: 'integration/wss',
        payload: '{"transport":"wss"}',
        qos: 2,
        retain: false
      });

      await waitFor(
        () =>
          manager.getHistory('tls', 'integration/tls').length > 0 &&
          manager.getHistory('wss', 'integration/wss').length > 0,
        'published messages to return through subscriptions'
      );
      expect(manager.getSnapshot('tls').topicTree[0].segment).toBe('integration');
      expect(manager.getSnapshot('wss').topicTree[0].segment).toBe('integration');

      await manager.disconnect('tls');
      await manager.disconnect('wss');
    },
    20_000
  );

  it(
    'reports an authorization denial when EMQX rejects the default # subscription',
    async () => {
      const caPath = process.env.MQTT_TEST_CA;
      if (!caPath) throw new Error('MQTT_TEST_CA is required.');
      const manager = new BrokerManager(
        (url, options) => mqttConnect(url, options) as ManagedMqttClient,
        () => undefined,
        10
      );

      await manager.connect(
        normalizeProfile({
          id: 'denied',
          name: 'Denied wildcard',
          host: 'localhost',
          port: 8883,
          transport: 'mqtts',
          caPath,
          rejectUnauthorized: true
        })
      );
      await waitFor(
        () =>
          manager
            .getSnapshot('denied')
            .logs.some((log) => log.event === 'subscribe' && log.level === 'error'),
        'subscription authorization error'
      );

      expect(manager.getSnapshot('denied').logs[0]).toMatchObject({
        event: 'subscribe',
        level: 'error',
        details: { filter: '#' }
      });
      expect(manager.getSnapshot('denied').logs[0].message).toMatch(/not authorized/i);
      await manager.disconnect('denied');
    },
    20_000
  );

  it(
    'reports certificate validation failures without affecting another connection',
    async () => {
      const caPath = process.env.MQTT_TEST_CA;
      if (!caPath) throw new Error('MQTT_TEST_CA is required.');
      const manager = new BrokerManager(
        (url, options) => mqttConnect(url, options) as ManagedMqttClient,
        () => undefined,
        10
      );

      await manager.connect(
        normalizeProfile({
          id: 'valid',
          name: 'Valid',
          host: 'localhost',
          port: 8883,
          transport: 'mqtts',
          caPath,
          rejectUnauthorized: true
        })
      );
      await manager.connect(
        normalizeProfile({
          id: 'invalid',
          name: 'Invalid',
          host: 'localhost',
          port: 8883,
          transport: 'mqtts',
          rejectUnauthorized: true,
          reconnectPeriodMs: 0
        })
      );

      await waitFor(
        () => manager.getSnapshot('valid').status.state === 'connected',
        'valid TLS connection'
      );
      await waitFor(
        () => Boolean(manager.getSnapshot('invalid').status.lastError),
        'invalid certificate error'
      );

      expect(manager.getSnapshot('valid').status.state).toBe('connected');
      expect(manager.getSnapshot('invalid').status.lastError).toMatch(
        /self-signed|certificate|unable to verify/i
      );

      await manager.disconnect('valid');
      await manager.disconnect('invalid');
    },
    20_000
  );
});
