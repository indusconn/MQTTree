import { z } from 'zod';
import type {
  ConnectionProfileInput,
  PublishRequest,
  PublishTemplate,
  Subscription
} from '../shared/contracts';
import {
  normalizeProfile,
  validateProfile,
  validatePublishRequest,
  validateSubscription
} from '../shared/validation';

const qos = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const id = z.string().trim().min(1).max(200);

const subscription = z
  .object({
    filter: z.string().min(1).max(65_535),
    qos
  })
  .strict();

const will = z
  .object({
    topic: z.string().min(1).max(65_535),
    payload: z.string().max(1_000_000),
    qos,
    retain: z.boolean()
  })
  .strict();

const profileInput = z
  .object({
    id,
    name: z.string().trim().min(1).max(200),
    host: z.string().trim().min(1).max(500),
    port: z.number().int().min(1).max(65_535).optional(),
    transport: z.enum(['mqtt', 'mqtts', 'wss']),
    websocketPath: z.string().max(1_000).optional(),
    protocolVersion: z.union([z.literal(4), z.literal(5)]).optional(),
    clientId: z.string().max(65_535).optional(),
    username: z.string().max(65_535).optional(),
    rememberPassword: z.boolean().optional(),
    password: z.string().max(100_000).optional(),
    caPath: z.string().max(32_000).optional(),
    certificatePath: z.string().max(32_000).optional(),
    privateKeyPath: z.string().max(32_000).optional(),
    privateKeyPassphrase: z.string().max(100_000).optional(),
    rejectUnauthorized: z.boolean().optional(),
    reconnectPeriodMs: z.number().int().min(0).max(3_600_000).optional(),
    connectTimeoutMs: z.number().int().min(1_000).max(3_600_000).optional(),
    clean: z.boolean().optional(),
    subscriptions: z.array(subscription).max(1_000).optional(),
    will: will.optional()
  })
  .strict();

const publishRequest = z
  .object({
    connectionId: id,
    topic: z.string().min(1).max(65_535),
    payload: z.string().max(10_000_000),
    payloadEncoding: z.enum(['utf8', 'base64']).optional(),
    qos,
    retain: z.boolean(),
    contentType: z.string().max(1_000).optional(),
    responseTopic: z.string().max(65_535).optional(),
    correlationDataBase64: z.string().max(1_000_000).optional(),
    userProperties: z
      .record(z.string().max(1_000), z.union([z.string().max(10_000), z.array(z.string())]))
      .optional()
  })
  .strict();

const publishTemplate = z
  .object({
    id,
    name: z.string().trim().min(1).max(200),
    topic: z.string().trim().min(1).max(65_535),
    payload: z.string().max(10_000_000),
    qos,
    retain: z.boolean(),
    contentType: z.string().max(1_000).optional()
  })
  .strict();

export function parseConnectionId(value: unknown): string {
  return id.parse(value);
}

export function parseProfileInput(value: unknown): ReturnType<typeof normalizeProfile> {
  const parsed = profileInput.parse(value) as ConnectionProfileInput;
  const validation = validateProfile(parsed);
  if (!validation.ok) throw new Error(validation.error);
  return normalizeProfile(parsed);
}

export function parseSubscriptionRequest(value: unknown): {
  connectionId: string;
  subscription: Subscription;
} {
  const parsed = z
    .object({ connectionId: id, subscription })
    .strict()
    .parse(value) as { connectionId: string; subscription: Subscription };
  const validation = validateSubscription(parsed.subscription);
  if (!validation.ok) throw new Error(validation.error);
  return parsed;
}

export function parseUnsubscribeRequest(value: unknown): {
  connectionId: string;
  filter: string;
} {
  return z.object({ connectionId: id, filter: z.string().min(1).max(65_535) }).strict().parse(value);
}

export function parsePublishRequest(value: unknown): PublishRequest {
  const parsed = publishRequest.parse(value) as PublishRequest;
  const validation = validatePublishRequest(parsed);
  if (!validation.ok) throw new Error(validation.error);
  return parsed;
}

export function parseCaptureRequest(value: unknown): {
  connectionId: string;
  paused: boolean;
} {
  return z.object({ connectionId: id, paused: z.boolean() }).strict().parse(value);
}

export function parseHistoryRequest(value: unknown): {
  connectionId: string;
  topic?: string;
  limit?: number;
} {
  return z
    .object({
      connectionId: id,
      topic: z.string().max(65_535).optional(),
      limit: z.number().int().min(1).max(10_000).optional()
    })
    .strict()
    .parse(value);
}

export function parseTemplate(value: unknown): PublishTemplate {
  const parsed = publishTemplate.parse(value) as PublishTemplate;
  const validation = validatePublishRequest({
    connectionId: 'template',
    topic: parsed.topic,
    payload: parsed.payload,
    qos: parsed.qos,
    retain: parsed.retain
  });
  if (!validation.ok) throw new Error(validation.error);
  return parsed;
}
