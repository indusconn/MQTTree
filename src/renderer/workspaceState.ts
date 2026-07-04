import type { BrokerEventBatch, ConnectionSnapshot } from '../shared/contracts';

export function applyBrokerBatch(
  connections: ConnectionSnapshot[],
  batch: BrokerEventBatch
): ConnectionSnapshot[] {
  if (!connections.some(({ profile }) => profile.id === batch.connectionId)) return connections;

  return connections.map((connection) => {
    if (connection.profile.id !== batch.connectionId) return connection;
    return {
      ...connection,
      status: batch.status ?? connection.status,
      topicTree: batch.topicTree ?? connection.topicTree,
      recentMessages: [
        ...[...batch.messages].reverse(),
        ...connection.recentMessages
      ].slice(0, 2_000),
      logs: [...[...batch.logs].reverse(), ...connection.logs].slice(0, 500)
    };
  });
}
