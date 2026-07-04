import { describe, expect, it } from 'vitest';
import type { BrokerEventBatch, ConnectionSnapshot } from '../shared/contracts';
import { applyBrokerBatch } from './workspaceState';

const snapshot: ConnectionSnapshot = {
  profile: {
    id: 'broker-1',
    name: 'Production',
    host: 'broker.example.com',
    port: 8883,
    transport: 'mqtts',
    websocketPath: '/mqtt',
    protocolVersion: 5,
    clientId: 'client-one',
    rememberPassword: true,
    rejectUnauthorized: true,
    reconnectPeriodMs: 2_000,
    connectTimeoutMs: 30_000,
    clean: true,
    subscriptions: [{ filter: '#', qos: 0 }]
  },
  status: {
    connectionId: 'broker-1',
    state: 'connected',
    capturePaused: false,
    evictedMessages: 0,
    ignoredWhilePaused: 0,
    receivedMessages: 1
  },
  subscriptions: [{ filter: '#', qos: 0 }],
  topicTree: [],
  recentMessages: [],
  logs: []
};

describe('applyBrokerBatch', () => {
  it('merges status, topic tree, logs, and newest messages into one connection', () => {
    const batch: BrokerEventBatch = {
      connectionId: 'broker-1',
      messages: [
        {
          id: 'message-1',
          connectionId: 'broker-1',
          topic: 'factory/temperature',
          payloadBase64: 'MjM=',
          qos: 1,
          retain: false,
          duplicate: false,
          timestamp: 10,
          properties: {}
        }
      ],
      logs: [
        {
          id: 'log-1',
          connectionId: 'broker-1',
          timestamp: 10,
          level: 'info',
          event: 'message',
          message: 'Message received.'
        }
      ],
      status: { ...snapshot.status, receivedMessages: 2 },
      topicTree: [
        {
          segment: 'factory',
          fullTopic: 'factory',
          messageCount: 1,
          latestTimestamp: 10,
          retained: false,
          children: []
        }
      ]
    };

    const result = applyBrokerBatch([snapshot], batch);

    expect(result[0].status.receivedMessages).toBe(2);
    expect(result[0].recentMessages[0].id).toBe('message-1');
    expect(result[0].topicTree[0].segment).toBe('factory');
    expect(result[0].logs[0].id).toBe('log-1');
  });

  it('ignores batches for connections that are no longer open', () => {
    expect(
      applyBrokerBatch([], {
        connectionId: 'closed',
        messages: [],
        logs: []
      })
    ).toEqual([]);
  });
});
