import { useEffect, useMemo, useState } from 'react';
import type {
  CapturedMessage,
  ConnectionSnapshot,
  MqttQos,
  PublishTemplate
} from '../shared/contracts';
import { formatPayload } from '../shared/payload';
import { IconActionButton } from './IconActionButton';
import { TopicExplorer } from './TopicExplorer';

type InspectorTab = 'latest' | 'history' | 'metadata' | 'publish' | 'subscriptions' | 'logs';

interface BrokerWorkspaceProps {
  snapshot: ConnectionSnapshot;
  templates: PublishTemplate[];
  onSnapshotChange(snapshot: ConnectionSnapshot): void;
  onTemplateSaved(template: PublishTemplate): void;
  onEditProfile(profile: ConnectionSnapshot['profile']): void;
  onDeleteProfile(profile: ConnectionSnapshot['profile']): void;
}

function formatLogEntry(log: ConnectionSnapshot['logs'][number]): string {
  const details = log.details ? `\n${JSON.stringify(log.details, null, 2)}` : '';
  return `[${new Date(log.timestamp).toISOString()}] ${log.level.toUpperCase()} ${log.event}: ${log.message}${details}`;
}

function PayloadView({ message }: { message: CapturedMessage }): React.JSX.Element {
  const [view, setView] = useState<'json' | 'text' | 'hex'>('json');
  const formatted = useMemo(() => formatPayload(message.payloadBase64), [message.payloadBase64]);
  const value = view === 'json' ? formatted.json ?? formatted.text : formatted[view];
  return (
    <div className="payload-view">
      <div className="segmented-control">
        {(['json', 'text', 'hex'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={view === option ? 'active' : ''}
            onClick={() => setView(option)}
          >
            {option.toUpperCase()}
          </button>
        ))}
      </div>
      <pre className="payload-block">
        {value.split('\n').map((line, index) => <span key={`${index}-${line}`}>{line}{'\n'}</span>)}
      </pre>
    </div>
  );
}

function MessageMetadata({ message }: { message: CapturedMessage }): React.JSX.Element {
  return (
    <dl className="metadata-grid">
      <div><dt>Topic</dt><dd>{message.topic}</dd></div>
      <div><dt>QoS</dt><dd>{message.qos}</dd></div>
      <div><dt>Retained</dt><dd>{message.retain ? 'Yes' : 'No'}</dd></div>
      <div><dt>Duplicate</dt><dd>{message.duplicate ? 'Yes' : 'No'}</dd></div>
      <div><dt>Received</dt><dd>{new Date(message.timestamp).toLocaleString()}</dd></div>
      <div className="metadata-properties">
        <dt>MQTT properties</dt>
        <dd><pre>{JSON.stringify(message.properties, null, 2)}</pre></dd>
      </div>
    </dl>
  );
}

export function BrokerWorkspace({
  snapshot,
  templates,
  onSnapshotChange,
  onTemplateSaved,
  onEditProfile,
  onDeleteProfile
}: BrokerWorkspaceProps): React.JSX.Element {
  const [selectedTopic, setSelectedTopic] = useState<string>();
  const [tab, setTab] = useState<InspectorTab>(() =>
    snapshot.status.state === 'connecting' ||
    snapshot.status.state === 'reconnecting' ||
    snapshot.status.state === 'error'
      ? 'logs'
      : 'latest'
  );
  const [publishPayload, setPublishPayload] = useState('');
  const [publishQos, setPublishQos] = useState<MqttQos>(0);
  const [publishRetain, setPublishRetain] = useState(false);
  const [contentType, setContentType] = useState('');
  const [publishStatus, setPublishStatus] = useState('');
  const [copyLogStatus, setCopyLogStatus] = useState('');
  const [subscriptionFilter, setSubscriptionFilter] = useState('');
  const [loadedHistory, setLoadedHistory] = useState<CapturedMessage[]>([]);
  const topicMessages = useMemo(() => {
    const messages = [
      ...snapshot.recentMessages.filter((message) => message.topic === selectedTopic),
      ...loadedHistory
    ];
    return [...new Map(messages.map((message) => [message.id, message])).values()].sort(
      (left, right) => right.timestamp - left.timestamp
    );
  }, [snapshot.recentMessages, loadedHistory, selectedTopic]);
  const latestMessage = topicMessages[0];
  const latestReceivedMessage = snapshot.recentMessages[0];

  useEffect(() => {
    setSelectedTopic(undefined);
    setTab(
      snapshot.status.state === 'connecting' ||
      snapshot.status.state === 'reconnecting' ||
      snapshot.status.state === 'error'
        ? 'logs'
        : 'latest'
    );
    setCopyLogStatus('');
  }, [snapshot.profile.id]);

  useEffect(() => {
    setPublishPayload(latestMessage ? formatPayload(latestMessage.payloadBase64).text : '');
    setContentType(
      typeof latestMessage?.properties.contentType === 'string'
        ? latestMessage.properties.contentType
        : latestMessage
          ? 'text/plain'
          : ''
    );
  }, [selectedTopic, latestMessage?.id]);

  useEffect(() => {
    let active = true;
    if (!selectedTopic) {
      setLoadedHistory([]);
      return () => {
        active = false;
      };
    }
    void window.mqttTree.broker
      .getHistory(snapshot.profile.id, selectedTopic, 1_000)
      .then((history) => {
        if (active) setLoadedHistory(history);
      });
    return () => {
      active = false;
    };
  }, [snapshot.profile.id, selectedTopic]);

  const publish = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!selectedTopic) return;
    setPublishStatus('Publishing…');
    try {
      await window.mqttTree.broker.publish({
        connectionId: snapshot.profile.id,
        topic: selectedTopic,
        payload: publishPayload,
        qos: publishQos,
        retain: publishRetain,
        contentType: contentType.trim() || undefined
      });
      setPublishStatus('Published');
    } catch (error) {
      setPublishStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const saveTemplate = async (): Promise<void> => {
    if (!selectedTopic) return;
    const template = await window.mqttTree.templates.save({
      id: crypto.randomUUID(),
      name: selectedTopic,
      topic: selectedTopic,
      payload: publishPayload,
      qos: publishQos,
      retain: publishRetain,
      contentType: contentType.trim() || undefined
    });
    onTemplateSaved(template);
    setPublishStatus('Template saved');
  };

  const addSubscription = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!subscriptionFilter.trim()) return;
    const subscription = { filter: subscriptionFilter.trim(), qos: 0 as MqttQos };
    await window.mqttTree.broker.subscribe(snapshot.profile.id, subscription);
    onSnapshotChange({
      ...snapshot,
      subscriptions: [
        ...snapshot.subscriptions.filter((item) => item.filter !== subscription.filter),
        subscription
      ]
    });
    setSubscriptionFilter('');
  };

  const removeSubscription = async (filter: string): Promise<void> => {
    await window.mqttTree.broker.unsubscribe(snapshot.profile.id, filter);
    onSnapshotChange({
      ...snapshot,
      subscriptions: snapshot.subscriptions.filter((item) => item.filter !== filter)
    });
  };

  const toggleCapture = async (): Promise<void> => {
    const status = await window.mqttTree.broker.setCapturePaused(
      snapshot.profile.id,
      !snapshot.status.capturePaused
    );
    onSnapshotChange({ ...snapshot, status });
  };

  const copyLogs = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(snapshot.logs.map(formatLogEntry).join('\n\n'));
      setCopyLogStatus('Copied');
    } catch (error) {
      setCopyLogStatus(error instanceof Error ? error.message : 'Unable to copy logs');
    }
  };

  const inspectorTabs: Array<[InspectorTab, string]> = [
    ['latest', 'Latest'],
    ['history', `History ${topicMessages.length ? `(${topicMessages.length})` : ''}`],
    ['metadata', 'Metadata'],
    ['publish', 'Publish'],
    ['subscriptions', 'Subscriptions'],
    ['logs', 'Logs']
  ];

  return (
    <main className="broker-workspace">
      <div className="workspace-toolbar">
        <div className="broker-identity">
          <span className={`status-light ${snapshot.status.state}`} />
          <div>
            <strong>{snapshot.profile.name}</strong>
            <span>{snapshot.profile.transport}://{snapshot.profile.host}:{snapshot.profile.port}</span>
          </div>
        </div>
        <div className="workspace-metrics">
          <span><b>{snapshot.status.receivedMessages.toLocaleString()}</b> received</span>
          <span><b>{snapshot.status.evictedMessages.toLocaleString()}</b> evicted</span>
          <IconActionButton icon="edit" label={`Edit profile ${snapshot.profile.name}`} tooltip="Edit connection" onClick={() => onEditProfile(snapshot.profile)} />
          <IconActionButton icon="delete" label={`Delete profile ${snapshot.profile.name}`} tooltip="Delete connection" tone="danger" onClick={() => onDeleteProfile(snapshot.profile)} />
          <button type="button" className="button small ghost" onClick={() => void toggleCapture()}>
            {snapshot.status.capturePaused ? 'Resume capture' : 'Pause capture'}
          </button>
        </div>
      </div>
      {snapshot.status.lastError && <div className="error-banner">{snapshot.status.lastError}</div>}
      <div className="workspace-columns">
        <TopicExplorer
          key={snapshot.profile.id}
          tree={snapshot.topicTree}
          selectedTopic={selectedTopic}
          pulseTopic={latestReceivedMessage?.topic}
          pulseKey={latestReceivedMessage?.id}
          onSelect={(topic) => {
            setSelectedTopic(topic);
            setTab('latest');
            setPublishStatus('');
          }}
        />
        <section className="inspector">
          <div className="inspector-title">
            <div>
              <span className="eyebrow">Selected topic</span>
              <h2>{selectedTopic ?? 'Choose a topic from the tree'}</h2>
            </div>
            {latestMessage && (
              <div className="message-chips">
                <span>QoS {latestMessage.qos}</span>
                {latestMessage.retain && <span>Retained</span>}
              </div>
            )}
          </div>
          <div className="inspector-tabs" role="tablist" aria-label="Topic tools">
            {inspectorTabs.map(([value, label]) => (
              tab === value ? (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected="true"
                  className="active"
                  onClick={() => setTab(value)}
                >
                  {label}
                </button>
              ) : (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected="false"
                  className=""
                  onClick={() => setTab(value)}
                >
                  {label}
                </button>
              )
            ))}
          </div>
          <div className="inspector-content">
            {!selectedTopic && tab !== 'subscriptions' && tab !== 'logs' ? (
              <div className="empty-inspector">
                <div className="empty-icon">⌁</div>
                <h3>Your broker’s topic map appears here</h3>
                <p>The app subscribes to <code>#</code> and builds this hierarchy from messages you are authorized to receive.</p>
              </div>
            ) : tab === 'latest' ? (
              latestMessage ? <PayloadView message={latestMessage} /> : <p className="empty-copy">No captured message for this exact topic.</p>
            ) : tab === 'history' ? (
              <div className="history-list">
                {topicMessages.map((message) => (
                  <article key={message.id}>
                    <header><span>{new Date(message.timestamp).toLocaleTimeString()}</span><span>QoS {message.qos}</span></header>
                    <pre>{formatPayload(message.payloadBase64).text}</pre>
                  </article>
                ))}
                {topicMessages.length === 0 && <p className="empty-copy">No session history for this topic.</p>}
              </div>
            ) : tab === 'metadata' ? (
              latestMessage ? <MessageMetadata message={latestMessage} /> : <p className="empty-copy">No metadata captured yet.</p>
            ) : tab === 'publish' ? (
              <form className="publish-form" onSubmit={(event) => void publish(event)}>
                <label>Topic<input value={selectedTopic} readOnly /></label>
                <label>Payload<textarea aria-label="Payload" rows={12} value={publishPayload} onChange={(event) => setPublishPayload(event.target.value)} /></label>
                <div className="publish-options">
                  <label>QoS<select value={publishQos} onChange={(event) => setPublishQos(Number(event.target.value) as MqttQos)}><option value="0">0</option><option value="1">1</option><option value="2">2</option></select></label>
                  <label className="checkbox-field"><input type="checkbox" checked={publishRetain} onChange={(event) => setPublishRetain(event.target.checked)} /> Retain message</label>
                  <label>Content type<input aria-label="Content type" value={contentType} onChange={(event) => setContentType(event.target.value)} placeholder="application/json" /></label>
                  <label>Template<select defaultValue="" onChange={(event) => {
                    const template = templates.find((item) => item.id === event.target.value);
                    if (template) {
                      setPublishPayload(template.payload);
                      setPublishQos(template.qos);
                      setPublishRetain(template.retain);
                      setContentType(template.contentType ?? '');
                    }
                  }}><option value="">Choose…</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
                </div>
                <div className="form-actions">
                  <button type="button" className="button ghost" onClick={() => void saveTemplate()}>Save template</button>
                  <button type="submit" className="button primary" aria-label="Publish message">Publish</button>
                  {publishStatus && <span className="form-status">{publishStatus}</span>}
                </div>
              </form>
            ) : tab === 'subscriptions' ? (
              <div className="subscription-panel">
                <form onSubmit={(event) => void addSubscription(event)}>
                  <input aria-label="Subscription filter" value={subscriptionFilter} onChange={(event) => setSubscriptionFilter(event.target.value)} placeholder="factory/+/sensors/#" />
                  <button type="submit" className="button primary small">Subscribe</button>
                </form>
                <div className="subscription-list">
                  {snapshot.subscriptions.map((subscription) => (
                    <div key={subscription.filter}><code>{subscription.filter}</code><span>QoS {subscription.qos}</span><button type="button" className="icon-button" aria-label={`Unsubscribe ${subscription.filter}`} onClick={() => void removeSubscription(subscription.filter)}>×</button></div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="log-panel">
                <div className="log-toolbar">
                  <span>{snapshot.logs.length.toLocaleString()} session events</span>
                  <button type="button" className="button small ghost" onClick={() => void copyLogs()} disabled={snapshot.logs.length === 0}>Copy logs</button>
                  {copyLogStatus && <span className="form-status">{copyLogStatus}</span>}
                </div>
                <div className="log-list">
                  {snapshot.logs.map((log) => (
                    <div key={log.id} className={`log-entry ${log.level}`}>
                      <time>{new Date(log.timestamp).toLocaleTimeString()}</time>
                      <span>{log.level}</span>
                      <div>
                        <p>{log.message}</p>
                        {log.details && <pre className="log-details">{JSON.stringify(log.details, null, 2)}</pre>}
                      </div>
                    </div>
                  ))}
                  {snapshot.logs.length === 0 && <p className="empty-copy">No connection events yet.</p>}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
