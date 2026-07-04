import { readFile as nodeReadFile } from 'node:fs/promises';
import type { ConnectionOptions as TlsConnectionOptions } from 'node:tls';
import type { IClientOptions } from 'mqtt';
import type { ConnectionProfile } from '../shared/contracts';

type ReadFile = (path: string) => Promise<Buffer>;
export type MqttConnectionOptions = IClientOptions & Pick<TlsConnectionOptions, 'passphrase'>;

export function buildBrokerUrl(profile: ConnectionProfile): string {
  const host = profile.host.includes(':') && !profile.host.startsWith('[')
    ? `[${profile.host}]`
    : profile.host;
  if (profile.transport === 'mqtt') {
    return `mqtt://${host}:${profile.port}`;
  }
  if (profile.transport === 'mqtts') {
    return `mqtts://${host}:${profile.port}`;
  }
  const path = profile.websocketPath.startsWith('/')
    ? profile.websocketPath
    : `/${profile.websocketPath}`;
  return `wss://${host}:${profile.port}${path}`;
}

export async function buildMqttOptions(
  profile: ConnectionProfile,
  readFile: ReadFile = nodeReadFile
): Promise<MqttConnectionOptions> {
  const [ca, cert, key] = await Promise.all([
    profile.caPath ? readFile(profile.caPath) : undefined,
    profile.certificatePath ? readFile(profile.certificatePath) : undefined,
    profile.privateKeyPath ? readFile(profile.privateKeyPath) : undefined
  ]);

  return {
    protocolVersion: profile.protocolVersion,
    clientId: profile.clientId,
    username: profile.username,
    password: profile.password,
    clean: profile.clean,
    reconnectPeriod: profile.reconnectPeriodMs,
    connectTimeout: profile.connectTimeoutMs,
    rejectUnauthorized: profile.rejectUnauthorized,
    ca,
    cert,
    key,
    passphrase: profile.privateKeyPassphrase,
    will: profile.will
      ? {
          topic: profile.will.topic,
          payload: Buffer.from(profile.will.payload),
          qos: profile.will.qos,
          retain: profile.will.retain
        }
      : undefined
  };
}
