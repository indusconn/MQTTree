import { describe, expect, it } from 'vitest';
import {
  parseConnectionId,
  parseHistoryRequest,
  parseProfileInput,
  parsePublishRequest,
  parseSubscriptionRequest
} from './ipcValidation';

describe('IPC request validation', () => {
  it('normalizes a valid profile input and rejects unknown properties', () => {
    expect(
      parseProfileInput({
        id: 'broker-1',
        name: 'Production',
        host: 'broker.example.com',
        transport: 'mqtts'
      })
    ).toMatchObject({ id: 'broker-1', port: 8883 });

    expect(() =>
      parseProfileInput({
        id: 'broker-1',
        name: 'Production',
        host: 'broker.example.com',
        transport: 'mqtts',
        unsafe: true
      })
    ).toThrow();
  });

  it('accepts plain MQTT profile input for public test brokers', () => {
    expect(
      parseProfileInput({
        id: 'sample-mosquitto-public',
        name: 'Mosquitto public test',
        host: 'test.mosquitto.org',
        port: 1883,
        transport: 'mqtt',
        protocolVersion: 4,
        rememberPassword: false,
        rejectUnauthorized: false
      })
    ).toMatchObject({
      id: 'sample-mosquitto-public',
      host: 'test.mosquitto.org',
      port: 1883,
      transport: 'mqtt'
    });
  });

  it('validates connection, subscription, publish, and history payloads', () => {
    expect(parseConnectionId('broker-1')).toBe('broker-1');
    expect(
      parseSubscriptionRequest({
        connectionId: 'broker-1',
        subscription: { filter: 'factory/#', qos: 1 }
      })
    ).toEqual({
      connectionId: 'broker-1',
      subscription: { filter: 'factory/#', qos: 1 }
    });
    expect(
      parsePublishRequest({
        connectionId: 'broker-1',
        topic: 'factory/target',
        payload: '21',
        qos: 1,
        retain: false
      })
    ).toMatchObject({ topic: 'factory/target' });
    expect(parseHistoryRequest({ connectionId: 'broker-1', limit: 250 })).toEqual({
      connectionId: 'broker-1',
      limit: 250
    });
  });

  it('rejects oversized history requests and wildcard publish topics', () => {
    expect(() =>
      parseHistoryRequest({ connectionId: 'broker-1', limit: 10_001 })
    ).toThrow();
    expect(() =>
      parsePublishRequest({
        connectionId: 'broker-1',
        topic: 'factory/#',
        payload: '21',
        qos: 0,
        retain: false
      })
    ).toThrow('Publish topics cannot contain wildcards.');
  });
});
