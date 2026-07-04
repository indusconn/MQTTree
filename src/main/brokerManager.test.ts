import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { IClientOptions, IClientPublishOptions, IClientSubscribeOptions } from 'mqtt';
import type { BrokerEventBatch, ConnectionProfile } from '../shared/contracts';
import { normalizeProfile } from '../shared/validation';
import { BrokerManager, type ManagedMqttClient } from './brokerManager';
import { TopicTree } from './topicTree';

class FakeClient extends EventEmitter implements ManagedMqttClient {
  connected = false;
  reconnecting = false;
  subscribe = vi.fn(
    (
      _filter: string,
      _options: IClientSubscribeOptions,
      callback: (error?: Error | null) => void
    ) => callback()
  );
  unsubscribe = vi.fn((_filter: string, callback: (error?: Error | null) => void) => callback());
  publish = vi.fn(
    (
      _topic: string,
      _payload: string | Buffer,
      _options: IClientPublishOptions,
      callback: (error?: Error) => void
    ) => callback()
  );
  end = vi.fn((_force: boolean, callback: () => void) => callback());
}

function profile(id: string): ConnectionProfile {
  return normalizeProfile({
    id,
    name: id,
    host: 'broker.example.com',
    transport: 'mqtts',
    clientId: `client-${id}`
  });
}

describe('BrokerManager', () => {
  it('isolates concurrent connections and subscribes each profile after connect', async () => {
    const clients = new Map<string, FakeClient>();
    const connect = vi.fn((_url: string, options: IClientOptions) => {
      const client = new FakeClient();
      clients.set(options.clientId ?? '', client);
      return client;
    });
    const batches: BrokerEventBatch[] = [];
    const manager = new BrokerManager(connect, (batch) => batches.push(batch), 1);

    await manager.connect(profile('one'));
    await manager.connect(profile('two'));
    clients.get('client-one')?.emit('connect');
    clients.get('client-two')?.emit('connect');

    expect(manager.listSnapshots()).toHaveLength(2);
    expect(clients.get('client-one')?.subscribe).toHaveBeenCalledWith(
      '#',
      { qos: 0 },
      expect.any(Function)
    );
    expect(clients.get('client-two')?.subscribe).toHaveBeenCalledTimes(1);
  });

  it('captures messages into topic history and emits batched renderer updates', async () => {
    vi.useFakeTimers();
    const client = new FakeClient();
    const batches: BrokerEventBatch[] = [];
    const manager = new BrokerManager(() => client, (batch) => batches.push(batch), 100);
    await manager.connect(profile('one'));
    client.emit('connect');
    client.emit(
      'message',
      'factory/line-1/temperature',
      Buffer.from('23.8'),
      { qos: 1, retain: true, dup: false, properties: { contentType: 'text/plain' } }
    );

    expect(manager.getHistory('one', 'factory/line-1/temperature')).toHaveLength(1);
    expect(manager.getSnapshot('one').topicTree[0].segment).toBe('factory');

    vi.advanceTimersByTime(100);
    expect(batches.some((batch) => batch.messages.length === 1)).toBe(true);
    vi.useRealTimers();
  });

  it('snapshots the topic tree once per renderer batch under high message volume', async () => {
    vi.useFakeTimers();
    const client = new FakeClient();
    const manager = new BrokerManager(() => client, () => undefined, 100);
    const snapshotSpy = vi.spyOn(TopicTree.prototype, 'snapshot');

    await manager.connect(profile('one'));
    snapshotSpy.mockClear();

    for (const topic of [
      'factory/line-1/temperature',
      'factory/line-2/temperature',
      'devices/sensor-1/status'
    ]) {
      client.emit('message', topic, Buffer.from('value'), {
        qos: 0,
        retain: false,
        dup: false
      });
    }

    expect(snapshotSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(snapshotSpy).toHaveBeenCalledTimes(1);
    snapshotSpy.mockRestore();
    vi.useRealTimers();
  });

  it('records detailed connection diagnostics without logging secrets', async () => {
    const client = new FakeClient();
    const connect = vi.fn(() => client);
    const manager = new BrokerManager(connect, () => undefined, 1);
    const publicProfile = normalizeProfile({
      id: 'mosquitto',
      name: 'Mosquitto public test',
      host: 'test.mosquitto.org',
      port: 1883,
      transport: 'mqtt',
      clientId: 'mqtttree-test',
      username: 'public-user',
      password: 'do-not-log-this',
      rejectUnauthorized: false
    });

    await manager.connect(publicProfile);
    client.emit('connect', {
      sessionPresent: false,
      reasonCode: 0,
      properties: { serverKeepAlive: 60 }
    });

    expect(connect).toHaveBeenCalledWith(
      'mqtt://test.mosquitto.org:1883',
      expect.objectContaining({ clientId: 'mqtttree-test' })
    );
    const serializedLogs = JSON.stringify(manager.getSnapshot('mosquitto').logs);
    expect(serializedLogs).toContain('Opening MQTT TCP connection');
    expect(serializedLogs).toContain('test.mosquitto.org');
    expect(serializedLogs).toContain('CONNACK accepted');
    expect(serializedLogs).toContain('serverKeepAlive');
    expect(serializedLogs).not.toContain('do-not-log-this');
  });

  it('pauses capture without disconnecting the broker', async () => {
    const client = new FakeClient();
    const manager = new BrokerManager(() => client, () => undefined, 1);
    await manager.connect(profile('one'));

    manager.setCapturePaused('one', true);
    client.emit('message', 'ignored/topic', Buffer.from('value'), {
      qos: 0,
      retain: false,
      dup: false
    });

    expect(manager.getHistory('one')).toEqual([]);
    expect(manager.getSnapshot('one').status).toMatchObject({
      capturePaused: true,
      ignoredWhilePaused: 1
    });
    expect(client.end).not.toHaveBeenCalled();
  });
});
