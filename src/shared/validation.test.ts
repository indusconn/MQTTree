import { describe, expect, it } from 'vitest';
import { normalizeProfile, validatePublishRequest, validateSubscriptionFilter } from './validation';

describe('normalizeProfile', () => {
  it('applies secure MQTT defaults', () => {
    const result = normalizeProfile({
      id: 'broker-1',
      name: 'Production',
      host: 'broker.example.com',
      transport: 'mqtts'
    });

    expect(result).toMatchObject({
      port: 8883,
      protocolVersion: 5,
      rejectUnauthorized: true,
      reconnectPeriodMs: 2_000,
      subscriptions: [{ filter: '#', qos: 0 }]
    });
  });

  it('uses the secure WebSocket port for wss profiles', () => {
    const result = normalizeProfile({
      id: 'broker-2',
      name: 'Cloud',
      host: 'broker.example.com',
      transport: 'wss'
    });

    expect(result.port).toBe(8084);
    expect(result.websocketPath).toBe('/mqtt');
  });

  it('uses the public MQTT TCP port for plain mqtt profiles', () => {
    const result = normalizeProfile({
      id: 'broker-3',
      name: 'Mosquitto test',
      host: 'test.mosquitto.org',
      transport: 'mqtt'
    });

    expect(result.port).toBe(1883);
    expect(result.transport).toBe('mqtt');
  });
});

describe('validateSubscriptionFilter', () => {
  it('accepts MQTT wildcards only as complete path levels', () => {
    expect(validateSubscriptionFilter('factory/+/temperature')).toEqual({ ok: true });
    expect(validateSubscriptionFilter('factory/#')).toEqual({ ok: true });
    expect(validateSubscriptionFilter('factory/line#')).toEqual({
      ok: false,
      error: '# must occupy an entire final topic level.'
    });
  });
});

describe('validatePublishRequest', () => {
  it('rejects wildcards in publish topics', () => {
    expect(
      validatePublishRequest({
        connectionId: 'broker-1',
        topic: 'factory/+/temperature',
        payload: '20',
        qos: 1,
        retain: false
      })
    ).toEqual({ ok: false, error: 'Publish topics cannot contain wildcards.' });
  });
});
