import { basename } from 'node:path';
import type {
  IClientOptions,
  IClientPublishOptions,
  IClientSubscribeOptions
} from 'mqtt';
import type {
  BrokerEventBatch,
  BrokerLogEntry,
  BrokerStatus,
  CapturedMessage,
  ConnectionProfile,
  ConnectionSnapshot,
  PublishRequest,
  Subscription
} from '../shared/contracts';
import { validatePublishRequest, validateSubscription } from '../shared/validation';
import { EventBatcher } from './eventBatcher';
import { MessageStore } from './messageStore';
import { buildBrokerUrl, buildMqttOptions } from './mqttOptions';
import { TopicTree } from './topicTree';

interface MessagePacket {
  qos: 0 | 1 | 2;
  retain: boolean;
  dup: boolean;
  properties?: Record<string, unknown>;
}

interface ConnectPacket {
  sessionPresent?: boolean;
  reasonCode?: number;
  properties?: Record<string, unknown>;
}

interface GrantedSubscription {
  topic?: string;
  qos?: 0 | 1 | 2;
  nl?: boolean;
  rap?: boolean;
  rh?: number;
}

export interface ManagedMqttClient {
  connected: boolean;
  reconnecting: boolean;
  on(event: string, listener: (...args: any[]) => void): this;
  subscribe(
    filter: string,
    options: IClientSubscribeOptions,
    callback: (error?: Error | null, granted?: GrantedSubscription[]) => void
  ): unknown;
  unsubscribe(filter: string, callback: (error?: Error | null) => void): unknown;
  publish(
    topic: string,
    payload: string | Buffer,
    options: IClientPublishOptions,
    callback: (error?: Error) => void
  ): unknown;
  end(force: boolean, callback: () => void): unknown;
}

export type MqttConnector = (url: string, options: IClientOptions) => ManagedMqttClient;

interface Session {
  profile: ConnectionProfile;
  client: ManagedMqttClient;
  status: BrokerStatus;
  subscriptions: Subscription[];
  messages: MessageStore;
  topicTree: TopicTree;
  topicTreeDirty: boolean;
  logs: BrokerLogEntry[];
  batcher: EventBatcher<BrokerEventBatch>;
}

function publicProfile(profile: ConnectionProfile): ConnectionProfile {
  const {
    password: _password,
    privateKeyPassphrase: _privateKeyPassphrase,
    ...safeProfile
  } = profile;
  return safeProfile;
}

function newStatus(connectionId: string): BrokerStatus {
  return {
    connectionId,
    state: 'connecting',
    capturePaused: false,
    evictedMessages: 0,
    ignoredWhilePaused: 0,
    receivedMessages: 0
  };
}

function protocolLabel(protocolVersion: ConnectionProfile['protocolVersion']): string {
  return protocolVersion === 5 ? 'MQTT 5.0' : 'MQTT 3.1.1';
}

function transportLabel(transport: ConnectionProfile['transport']): string {
  if (transport === 'mqtt') return 'MQTT TCP';
  if (transport === 'mqtts') return 'MQTT over TLS';
  return 'WebSocket over TLS';
}

function baseNameOrUndefined(path?: string): string | undefined {
  return path ? basename(path) : undefined;
}

function connectionDetails(profile: ConnectionProfile, url: string): Record<string, unknown> {
  return {
    profile: {
      id: profile.id,
      name: profile.name
    },
    endpoint: {
      url,
      host: profile.host,
      port: profile.port,
      transport: profile.transport,
      transportLabel: transportLabel(profile.transport),
      websocketPath: profile.transport === 'wss' ? profile.websocketPath : undefined
    },
    mqtt: {
      protocolVersion: protocolLabel(profile.protocolVersion),
      clientId: profile.clientId,
      clean: profile.clean,
      reconnectPeriodMs: profile.reconnectPeriodMs,
      connectTimeoutMs: profile.connectTimeoutMs
    },
    authentication: {
      mode: profile.username ? 'username' : 'anonymous',
      username: profile.username,
      passwordProvided: Boolean(profile.password)
    },
    tls: {
      enabled: profile.transport !== 'mqtt',
      rejectUnauthorized: profile.transport === 'mqtt' ? undefined : profile.rejectUnauthorized,
      customCa: Boolean(profile.caPath),
      caFile: baseNameOrUndefined(profile.caPath),
      clientCertificate: Boolean(profile.certificatePath),
      clientCertificateFile: baseNameOrUndefined(profile.certificatePath),
      privateKey: Boolean(profile.privateKeyPath),
      privateKeyFile: baseNameOrUndefined(profile.privateKeyPath),
      privateKeyPassphraseProvided: Boolean(profile.privateKeyPassphrase)
    },
    subscriptions: profile.subscriptions
  };
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }
  const withExtras = error as Error & {
    code?: string;
    errno?: number;
    syscall?: string;
    address?: string;
    port?: number;
    reasonCode?: number;
  };
  return {
    name: error.name,
    message: error.message,
    code: withExtras.code,
    errno: withExtras.errno,
    syscall: withExtras.syscall,
    address: withExtras.address,
    port: withExtras.port,
    reasonCode: withExtras.reasonCode
  };
}

export class BrokerManager {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly connector: MqttConnector,
    private readonly emit: (batch: BrokerEventBatch) => void,
    private readonly batchIntervalMs = 100
  ) {}

  async connect(profile: ConnectionProfile): Promise<ConnectionSnapshot> {
    if (this.sessions.has(profile.id)) return this.getSnapshot(profile.id);

    const url = buildBrokerUrl(profile);
    const options = await buildMqttOptions(profile);
    const client = this.connector(url, options);
    const session = this.createSession(profile, client);
    this.sessions.set(profile.id, session);
    this.installListeners(session);
    this.log(
      session,
      'info',
      'connect',
      `Opening ${transportLabel(profile.transport)} connection to ${profile.host}:${profile.port}.`,
      connectionDetails(profile, url)
    );
    this.log(session, 'debug', 'connect', 'MQTT client options prepared.', {
      protocolVersion: protocolLabel(profile.protocolVersion),
      clientId: profile.clientId,
      clean: profile.clean,
      reconnectPeriodMs: profile.reconnectPeriodMs,
      connectTimeoutMs: profile.connectTimeoutMs,
      usernameProvided: Boolean(profile.username),
      passwordProvided: Boolean(profile.password),
      willConfigured: Boolean(profile.will),
      tlsEnabled: profile.transport !== 'mqtt',
      customCa: Boolean(profile.caPath),
      mutualTls: Boolean(profile.certificatePath && profile.privateKeyPath)
    });
    return this.snapshot(session);
  }

  listSnapshots(): ConnectionSnapshot[] {
    return [...this.sessions.values()].map((session) => this.snapshot(session));
  }

  getSnapshot(connectionId: string): ConnectionSnapshot {
    return this.snapshot(this.requireSession(connectionId));
  }

  async disconnect(connectionId: string): Promise<void> {
    const session = this.requireSession(connectionId);
    await new Promise<void>((resolve) => session.client.end(false, resolve));
    session.status.state = 'disconnected';
    this.log(session, 'info', 'disconnect', 'Disconnected by the user.');
    session.batcher.dispose();
    this.sessions.delete(connectionId);
  }

  async subscribe(connectionId: string, subscription: Subscription): Promise<void> {
    const validation = validateSubscription(subscription);
    if (!validation.ok) throw new Error(validation.error);
    const session = this.requireSession(connectionId);
    await new Promise<void>((resolve, reject) => {
      session.client.subscribe(subscription.filter, { qos: subscription.qos }, (error, granted) => {
        if (error) reject(error);
        else resolve();
      });
    });
    const index = session.subscriptions.findIndex(({ filter }) => filter === subscription.filter);
    if (index >= 0) session.subscriptions[index] = subscription;
    else session.subscriptions.push(subscription);
    this.log(session, 'info', 'subscribe', `Subscribe requested for ${subscription.filter}.`, {
      filter: subscription.filter,
      requestedQos: subscription.qos
    });
  }

  async unsubscribe(connectionId: string, filter: string): Promise<void> {
    const session = this.requireSession(connectionId);
    await new Promise<void>((resolve, reject) => {
      session.client.unsubscribe(filter, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    session.subscriptions = session.subscriptions.filter((item) => item.filter !== filter);
    this.log(session, 'info', 'unsubscribe', `Unsubscribed from ${filter}.`);
  }

  async publish(request: PublishRequest): Promise<void> {
    const validation = validatePublishRequest(request);
    if (!validation.ok) throw new Error(validation.error);
    const session = this.requireSession(request.connectionId);
    const payload =
      request.payloadEncoding === 'base64'
        ? Buffer.from(request.payload, 'base64')
        : Buffer.from(request.payload);
    const properties =
      session.profile.protocolVersion === 5
        ? {
            contentType: request.contentType,
            responseTopic: request.responseTopic,
            correlationData: request.correlationDataBase64
              ? Buffer.from(request.correlationDataBase64, 'base64')
              : undefined,
            userProperties: request.userProperties
          }
        : undefined;

    await new Promise<void>((resolve, reject) => {
      session.client.publish(
        request.topic,
        payload,
        { qos: request.qos, retain: request.retain, properties },
        (error) => {
          if (error) reject(error);
          else resolve();
        }
      );
    });
    this.log(session, 'info', 'publish', `Published to ${request.topic}.`, {
      qos: request.qos,
      retain: request.retain,
      payloadBytes: payload.byteLength,
      contentType: request.contentType
    });
  }

  setCapturePaused(connectionId: string, paused: boolean): BrokerStatus {
    const session = this.requireSession(connectionId);
    session.messages.setPaused(paused);
    this.syncCounters(session);
    this.queue(session, { status: { ...session.status } });
    return { ...session.status };
  }

  getHistory(connectionId: string, topic?: string, limit = 100): CapturedMessage[] {
    const messages = this.requireSession(connectionId).messages;
    return topic ? messages.getByTopic(topic, limit) : messages.getRecent(limit);
  }

  private createSession(profile: ConnectionProfile, client: ManagedMqttClient): Session {
    const status = newStatus(profile.id);
    const session = {} as Session;
    session.profile = profile;
    session.client = client;
    session.status = status;
    session.subscriptions = [...profile.subscriptions];
    session.messages = new MessageStore();
    session.topicTree = new TopicTree();
    session.topicTreeDirty = false;
    session.logs = [];
    session.batcher = new EventBatcher<BrokerEventBatch>(this.batchIntervalMs, (batches) => {
      const latestStatus = [...batches].reverse().find((batch) => batch.status)?.status;
      const latestTopicTree = session.topicTreeDirty || batches.some((batch) => batch.topicTree)
        ? session.topicTree.snapshot()
        : undefined;
      session.topicTreeDirty = false;
      this.emit({
        connectionId: profile.id,
        messages: batches.flatMap((batch) => batch.messages),
        logs: batches.flatMap((batch) => batch.logs),
        status: latestStatus,
        topicTree: latestTopicTree
      });
    });
    return session;
  }

  private installListeners(session: Session): void {
    session.client.on('connect', (packet?: ConnectPacket) => {
      session.status.state = 'connected';
      session.status.connectedAt = Date.now();
      session.status.lastError = undefined;
      this.log(session, 'info', 'connect', 'Connected to broker. CONNACK accepted.', {
        sessionPresent: packet?.sessionPresent,
        reasonCode: packet?.reasonCode,
        properties: packet?.properties ?? {}
      });
      this.queue(session, { status: { ...session.status } });
      for (const subscription of session.subscriptions) {
        session.client.subscribe(subscription.filter, { qos: subscription.qos }, (error, granted) => {
          if (error) {
            this.log(session, 'error', 'subscribe', error.message, {
              filter: subscription.filter,
              ...errorDetails(error)
            });
          } else {
            this.log(session, 'info', 'subscribe', `Subscribed to ${subscription.filter}.`, {
              filter: subscription.filter,
              requestedQos: subscription.qos,
              granted
            });
          }
        });
      }
    });

    session.client.on(
      'message',
      (topic: string, payload: Buffer, packet: MessagePacket) => {
        const message: CapturedMessage = {
          id: crypto.randomUUID(),
          connectionId: session.profile.id,
          topic,
          payloadBase64: payload.toString('base64'),
          qos: packet.qos,
          retain: packet.retain,
          duplicate: packet.dup,
          timestamp: Date.now(),
          properties: packet.properties ?? {}
        };
        if (session.messages.add(message)) {
          session.status.receivedMessages += 1;
          session.topicTree.observe(topic, {
            timestamp: message.timestamp,
            retained: message.retain
          });
          if (session.messages.oldestTimestamp !== undefined) {
            session.topicTree.pruneBefore(session.messages.oldestTimestamp);
          }
          session.topicTreeDirty = true;
          this.syncCounters(session);
          this.queue(session, {
            messages: [message],
            status: { ...session.status }
          });
        } else {
          this.syncCounters(session);
          this.queue(session, { status: { ...session.status } });
        }
      }
    );

    session.client.on('reconnect', () => {
      session.status.state = 'reconnecting';
      this.log(session, 'warn', 'reconnect', 'Attempting to reconnect.', {
        reconnectPeriodMs: session.profile.reconnectPeriodMs
      });
      this.queue(session, { status: { ...session.status } });
    });
    session.client.on('offline', () => {
      session.status.state = 'reconnecting';
      this.log(session, 'warn', 'offline', 'Broker connection is offline.');
      this.queue(session, { status: { ...session.status } });
    });
    session.client.on('close', () => {
      if (session.status.state !== 'disconnected') session.status.state = 'reconnecting';
      this.log(session, 'warn', 'close', 'Broker connection closed.');
      this.queue(session, { status: { ...session.status } });
    });
    session.client.on('error', (error: Error) => {
      session.status.state = 'error';
      session.status.lastError = error.message;
      this.log(session, 'error', 'error', error.message, errorDetails(error));
      this.queue(session, { status: { ...session.status } });
    });
  }

  private syncCounters(session: Session): void {
    session.status.capturePaused = session.messages.isPaused;
    session.status.evictedMessages = session.messages.evictedCount;
    session.status.ignoredWhilePaused = session.messages.ignoredWhilePausedCount;
  }

  private log(
    session: Session,
    level: BrokerLogEntry['level'],
    event: BrokerLogEntry['event'],
    message: string,
    details?: Record<string, unknown>
  ): void {
    const entry: BrokerLogEntry = {
      id: crypto.randomUUID(),
      connectionId: session.profile.id,
      timestamp: Date.now(),
      level,
      event,
      message,
      details
    };
    session.logs.push(entry);
    if (session.logs.length > 500) session.logs.shift();
    this.queue(session, { logs: [entry] });
  }

  private queue(
    session: Session,
    partial: Partial<Omit<BrokerEventBatch, 'connectionId'>>
  ): void {
    session.batcher.push({
      connectionId: session.profile.id,
      messages: partial.messages ?? [],
      logs: partial.logs ?? [],
      status: partial.status,
      topicTree: partial.topicTree
    });
  }

  private snapshot(session: Session): ConnectionSnapshot {
    return {
      profile: publicProfile(session.profile),
      status: { ...session.status },
      subscriptions: [...session.subscriptions],
      topicTree: session.topicTree.snapshot(),
      recentMessages: session.messages.getRecent(),
      logs: [...session.logs].reverse()
    };
  }

  private requireSession(connectionId: string): Session {
    const session = this.sessions.get(connectionId);
    if (!session) throw new Error(`Connection "${connectionId}" is not active.`);
    return session;
  }
}
