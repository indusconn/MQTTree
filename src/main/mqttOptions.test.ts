import { describe, expect, it, vi } from 'vitest';
import { buildBrokerUrl, buildMqttOptions } from './mqttOptions';
import { normalizeProfile } from '../shared/validation';

describe('buildBrokerUrl', () => {
  it('builds direct TLS and secure WebSocket URLs', () => {
    expect(
      buildBrokerUrl(
        normalizeProfile({
          id: 'one',
          name: 'TLS',
          host: 'broker.example.com',
          transport: 'mqtts'
        })
      )
    ).toBe('mqtts://broker.example.com:8883');

    expect(
      buildBrokerUrl(
        normalizeProfile({
          id: 'two',
          name: 'WSS',
          host: 'broker.example.com',
          transport: 'wss',
          websocketPath: 'custom/mqtt'
        })
      )
    ).toBe('wss://broker.example.com:8084/custom/mqtt');
  });

  it('builds a plain MQTT URL for public test brokers', () => {
    expect(
      buildBrokerUrl(
        normalizeProfile({
          id: 'mosquitto',
          name: 'Mosquitto public test',
          host: 'test.mosquitto.org',
          transport: 'mqtt',
          port: 1883
        })
      )
    ).toBe('mqtt://test.mosquitto.org:1883');
  });
});

describe('buildMqttOptions', () => {
  it('maps connection, authentication, will, and MQTT 5 settings', async () => {
    const profile = normalizeProfile({
      id: 'one',
      name: 'TLS',
      host: 'broker.example.com',
      transport: 'mqtts',
      clientId: 'client-one',
      username: 'operator',
      password: 'secret',
      will: {
        topic: 'clients/client-one/status',
        payload: 'offline',
        qos: 1,
        retain: true
      }
    });

    const options = await buildMqttOptions(profile);

    expect(options).toMatchObject({
      protocolVersion: 5,
      clientId: 'client-one',
      username: 'operator',
      password: 'secret',
      rejectUnauthorized: true,
      will: {
        topic: 'clients/client-one/status',
        qos: 1,
        retain: true
      }
    });
    expect(options.will?.payload.toString()).toBe('offline');
  });

  it('loads custom CA and mutual TLS files', async () => {
    const readFile = vi.fn(async (path: string) => Buffer.from(path));
    const profile = normalizeProfile({
      id: 'one',
      name: 'TLS',
      host: 'broker.example.com',
      transport: 'mqtts',
      caPath: 'ca.pem',
      certificatePath: 'client.pem',
      privateKeyPath: 'client-key.pem',
      privateKeyPassphrase: 'passphrase'
    });

    const options = await buildMqttOptions(profile, readFile);

    expect(readFile.mock.calls.map(([path]) => path)).toEqual([
      'ca.pem',
      'client.pem',
      'client-key.pem'
    ]);
    expect(options).toMatchObject({
      passphrase: 'passphrase'
    });
    expect(options.ca?.toString()).toBe('ca.pem');
    expect(options.cert?.toString()).toBe('client.pem');
    expect(options.key?.toString()).toBe('client-key.pem');
  });
});
