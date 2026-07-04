export type MqttTransport = 'mqtt' | 'mqtts' | 'wss';
export type MqttProtocolVersion = 4 | 5;
export type MqttQos = 0 | 1 | 2;
export type BrokerConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface Subscription {
  filter: string;
  qos: MqttQos;
}

export interface LastWillSettings {
  topic: string;
  payload: string;
  qos: MqttQos;
  retain: boolean;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  transport: MqttTransport;
  websocketPath: string;
  protocolVersion: MqttProtocolVersion;
  clientId: string;
  username?: string;
  rememberPassword: boolean;
  password?: string;
  caPath?: string;
  certificatePath?: string;
  privateKeyPath?: string;
  privateKeyPassphrase?: string;
  rejectUnauthorized: boolean;
  reconnectPeriodMs: number;
  connectTimeoutMs: number;
  clean: boolean;
  subscriptions: Subscription[];
  will?: LastWillSettings;
}

export type ConnectionProfileInput = Pick<
  ConnectionProfile,
  'id' | 'name' | 'host' | 'transport'
> &
  Partial<Omit<ConnectionProfile, 'id' | 'name' | 'host' | 'transport'>>;

export interface BrokerStatus {
  connectionId: string;
  state: BrokerConnectionState;
  connectedAt?: number;
  lastError?: string;
  capturePaused: boolean;
  evictedMessages: number;
  ignoredWhilePaused: number;
  receivedMessages: number;
}

export interface CapturedMessage {
  id: string;
  connectionId: string;
  topic: string;
  payloadBase64: string;
  qos: MqttQos;
  retain: boolean;
  duplicate: boolean;
  timestamp: number;
  properties: Record<string, unknown>;
}

export interface TopicNode {
  segment: string;
  fullTopic: string;
  messageCount: number;
  latestTimestamp: number;
  retained: boolean;
  children: TopicNode[];
}

export interface PublishRequest {
  connectionId: string;
  topic: string;
  payload: string;
  payloadEncoding?: 'utf8' | 'base64';
  qos: MqttQos;
  retain: boolean;
  contentType?: string;
  responseTopic?: string;
  correlationDataBase64?: string;
  userProperties?: Record<string, string | string[]>;
}

export interface PublishTemplate {
  id: string;
  name: string;
  topic: string;
  payload: string;
  qos: MqttQos;
  retain: boolean;
  contentType?: string;
}

export type BrokerLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface BrokerLogEntry {
  id: string;
  connectionId: string;
  timestamp: number;
  level: BrokerLogLevel;
  event:
    | 'connect'
    | 'disconnect'
    | 'reconnect'
    | 'close'
    | 'offline'
    | 'error'
    | 'subscribe'
    | 'unsubscribe'
    | 'publish'
    | 'message';
  message: string;
  details?: Record<string, unknown>;
}

export interface ConnectionSnapshot {
  profile: ConnectionProfile;
  status: BrokerStatus;
  subscriptions: Subscription[];
  topicTree: TopicNode[];
  recentMessages: CapturedMessage[];
  logs: BrokerLogEntry[];
}

export interface BrokerEventBatch {
  connectionId: string;
  messages: CapturedMessage[];
  status?: BrokerStatus;
  topicTree?: TopicNode[];
  logs: BrokerLogEntry[];
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export interface SaveProfileRequest {
  profile: ConnectionProfileInput;
}

export interface MqttTreeApi {
  profiles: {
    list(): Promise<ConnectionProfile[]>;
    save(profile: ConnectionProfileInput): Promise<ConnectionProfile>;
    remove(profileId: string): Promise<void>;
  };
  templates: {
    list(): Promise<PublishTemplate[]>;
    save(template: PublishTemplate): Promise<PublishTemplate>;
    remove(templateId: string): Promise<void>;
  };
  broker: {
    listConnections(): Promise<ConnectionSnapshot[]>;
    connect(profileId: string): Promise<ConnectionSnapshot>;
    disconnect(connectionId: string): Promise<void>;
    subscribe(connectionId: string, subscription: Subscription): Promise<void>;
    unsubscribe(connectionId: string, filter: string): Promise<void>;
    publish(request: PublishRequest): Promise<void>;
    setCapturePaused(connectionId: string, paused: boolean): Promise<BrokerStatus>;
    getHistory(connectionId: string, topic?: string, limit?: number): Promise<CapturedMessage[]>;
    onEvents(listener: (batch: BrokerEventBatch) => void): () => void;
  };
}
