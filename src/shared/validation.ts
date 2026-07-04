import { z } from 'zod';
import type {
  ConnectionProfile,
  ConnectionProfileInput,
  MqttQos,
  PublishRequest,
  Subscription,
  ValidationResult
} from './contracts';

const qosSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

const subscriptionSchema = z.object({
  filter: z.string().min(1),
  qos: qosSchema
});

function defaultPort(transport: ConnectionProfileInput['transport']): number {
  if (transport === 'mqtt') return 1883;
  if (transport === 'wss') return 8084;
  return 8883;
}

export function normalizeProfile(input: ConnectionProfileInput): ConnectionProfile {
  const subscriptions =
    input.subscriptions?.map((item) => subscriptionSchema.parse(item)) ?? [
      { filter: '#', qos: 0 as MqttQos }
    ];

  return {
    id: input.id.trim(),
    name: input.name.trim(),
    host: input.host.trim(),
    port: input.port ?? defaultPort(input.transport),
    transport: input.transport,
    websocketPath: input.websocketPath?.trim() || '/mqtt',
    protocolVersion: input.protocolVersion ?? 5,
    clientId:
      input.clientId?.trim() ||
      `mqtttree-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    username: input.username?.trim() || undefined,
    rememberPassword: input.rememberPassword ?? true,
    password: input.password,
    caPath: input.caPath?.trim() || undefined,
    certificatePath: input.certificatePath?.trim() || undefined,
    privateKeyPath: input.privateKeyPath?.trim() || undefined,
    privateKeyPassphrase: input.privateKeyPassphrase,
    rejectUnauthorized: input.rejectUnauthorized ?? true,
    reconnectPeriodMs: input.reconnectPeriodMs ?? 2_000,
    connectTimeoutMs: input.connectTimeoutMs ?? 30_000,
    clean: input.clean ?? true,
    subscriptions,
    will: input.will
  };
}

export function validateProfile(input: ConnectionProfileInput): ValidationResult {
  if (!input.id?.trim()) return { ok: false, error: 'Profile id is required.' };
  if (!input.name?.trim()) return { ok: false, error: 'Profile name is required.' };
  if (!input.host?.trim()) return { ok: false, error: 'Broker host is required.' };
  const port = input.port ?? defaultPort(input.transport);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return { ok: false, error: 'Port must be between 1 and 65535.' };
  }
  if (input.certificatePath && (!input.privateKeyPath || !input.caPath)) {
    return {
      ok: false,
      error: 'Mutual TLS requires a CA file, client certificate, and private key.'
    };
  }
  for (const subscription of input.subscriptions ?? [{ filter: '#', qos: 0 as MqttQos }]) {
    const result = validateSubscription(subscription);
    if (!result.ok) return result;
  }
  return { ok: true };
}

export function validateSubscription(subscription: Subscription): ValidationResult {
  if (![0, 1, 2].includes(subscription.qos)) {
    return { ok: false, error: 'QoS must be 0, 1, or 2.' };
  }
  return validateSubscriptionFilter(subscription.filter);
}

export function validateSubscriptionFilter(filter: string): ValidationResult {
  if (!filter) return { ok: false, error: 'Subscription filter is required.' };
  if (filter.includes('\u0000')) {
    return { ok: false, error: 'Topic filters cannot contain null characters.' };
  }

  const levels = filter.split('/');
  for (let index = 0; index < levels.length; index += 1) {
    const level = levels[index];
    if (level.includes('#') && (level !== '#' || index !== levels.length - 1)) {
      return { ok: false, error: '# must occupy an entire final topic level.' };
    }
    if (level.includes('+') && level !== '+') {
      return { ok: false, error: '+ must occupy an entire topic level.' };
    }
  }
  return { ok: true };
}

export function validatePublishRequest(request: PublishRequest): ValidationResult {
  if (!request.connectionId?.trim()) {
    return { ok: false, error: 'Connection id is required.' };
  }
  if (!request.topic?.trim()) return { ok: false, error: 'Publish topic is required.' };
  if (request.topic.includes('#') || request.topic.includes('+')) {
    return { ok: false, error: 'Publish topics cannot contain wildcards.' };
  }
  if (request.topic.includes('\u0000')) {
    return { ok: false, error: 'Publish topics cannot contain null characters.' };
  }
  if (![0, 1, 2].includes(request.qos)) {
    return { ok: false, error: 'QoS must be 0, 1, or 2.' };
  }
  return { ok: true };
}
