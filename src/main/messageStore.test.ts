import { describe, expect, it } from 'vitest';
import { MessageStore } from './messageStore';
import type { CapturedMessage } from '../shared/contracts';

function message(id: string, topic: string, timestamp: number): CapturedMessage {
  return {
    id,
    connectionId: 'broker-1',
    topic,
    payloadBase64: Buffer.from(id).toString('base64'),
    qos: 0,
    retain: false,
    duplicate: false,
    timestamp,
    properties: {}
  };
}

describe('MessageStore', () => {
  it('evicts the oldest message and removes it from topic indexes', () => {
    const store = new MessageStore(2);
    store.add(message('one', 'a/one', 1));
    store.add(message('two', 'a/two', 2));
    store.add(message('three', 'a/one', 3));

    expect(store.getRecent().map((item) => item.id)).toEqual(['three', 'two']);
    expect(store.getByTopic('a/one').map((item) => item.id)).toEqual(['three']);
    expect(store.evictedCount).toBe(1);
    expect(store.oldestTimestamp).toBe(2);
  });

  it('can pause capture without losing the existing session history', () => {
    const store = new MessageStore(10);
    store.add(message('one', 'a/one', 1));
    store.setPaused(true);
    store.add(message('two', 'a/two', 2));

    expect(store.getRecent().map((item) => item.id)).toEqual(['one']);
    expect(store.ignoredWhilePausedCount).toBe(1);
  });
});
