import { useState } from 'react';
import type {
  ConnectionProfile,
  ConnectionProfileInput,
  MqttProtocolVersion,
  MqttQos,
  Subscription,
  MqttTransport
} from '../shared/contracts';

interface ConnectionDialogProps {
  profile?: ConnectionProfile;
  onClose(): void;
  onSaved(profile: ConnectionProfile): void | Promise<void>;
}

function defaultPort(transport: MqttTransport): number {
  if (transport === 'mqtt') return 1883;
  if (transport === 'wss') return 8084;
  return 8883;
}

function transportLabel(transport: MqttTransport): string {
  if (transport === 'mqtt') return 'Plain MQTT TCP';
  if (transport === 'mqtts') return 'MQTT over TLS';
  return 'WebSocket over TLS';
}

function defaultSubscriptionsForHost(host: string): Subscription[] {
  return host.trim().toLowerCase() === 'test.mosquitto.org'
    ? [{ filter: '$SYS/#', qos: 0 }]
    : [{ filter: '#', qos: 0 }];
}

function isSingleDefaultWildcard(subscriptions: Subscription[]): boolean {
  return subscriptions.length === 1 && subscriptions[0]?.filter === '#' && subscriptions[0].qos === 0;
}

export function ConnectionDialog({
  profile: initialProfile,
  onClose,
  onSaved
}: ConnectionDialogProps): React.JSX.Element {
  const editing = Boolean(initialProfile);
  const [transport, setTransport] = useState<MqttTransport>(
    initialProfile?.transport ?? 'mqtts'
  );
  const [protocolVersion, setProtocolVersion] = useState<MqttProtocolVersion>(
    initialProfile?.protocolVersion ?? 5
  );
  const [host, setHost] = useState(initialProfile?.host ?? '');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(
    initialProfile?.subscriptions ?? defaultSubscriptionsForHost('')
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const updateHost = (value: string): void => {
    setHost(value);
    if (!initialProfile && isSingleDefaultWildcard(subscriptions)) {
      setSubscriptions(defaultSubscriptionsForHost(value));
    }
  };

  const updateSubscription = (
    index: number,
    patch: Partial<Subscription>
  ): void => {
    setSubscriptions((current) =>
      current.map((subscription, itemIndex) =>
        itemIndex === index ? { ...subscription, ...patch } : subscription
      )
    );
  };

  const removeSubscription = (index: number): void => {
    setSubscriptions((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const addSubscription = (): void => {
    setSubscriptions((current) => [...current, { filter: '', qos: 0 }]);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const text = (name: string): string => String(form.get(name) ?? '').trim();
    const optional = (name: string): string | undefined => text(name) || undefined;
    const willTopic = optional('willTopic');
    const cleanedSubscriptions = subscriptions
      .map((subscription) => ({ ...subscription, filter: subscription.filter.trim() }))
      .filter((subscription) => subscription.filter);
    if (cleanedSubscriptions.length === 0) {
      setSaving(false);
      setError('Add at least one subscription filter.');
      return;
    }
    const profile: ConnectionProfileInput = {
      id: initialProfile?.id ?? crypto.randomUUID(),
      name: text('name'),
      host: host.trim(),
      port: Number(text('port')),
      transport,
      websocketPath: text('websocketPath') || '/mqtt',
      protocolVersion,
      clientId: optional('clientId'),
      username: optional('username'),
      password: optional('password'),
      rememberPassword: form.get('rememberPassword') === 'on',
      caPath: optional('caPath'),
      certificatePath: optional('certificatePath'),
      privateKeyPath: optional('privateKeyPath'),
      privateKeyPassphrase: optional('privateKeyPassphrase'),
      rejectUnauthorized:
        transport === 'mqtt' ? false : form.get('rejectUnauthorized') === 'on',
      reconnectPeriodMs: initialProfile?.reconnectPeriodMs,
      connectTimeoutMs: initialProfile?.connectTimeoutMs,
      clean: form.get('clean') === 'on',
      subscriptions: cleanedSubscriptions,
      will: willTopic
        ? {
            topic: willTopic,
            payload: text('willPayload'),
            qos: Number(text('willQos')) as 0 | 1 | 2,
            retain: form.get('willRetain') === 'on'
          }
        : undefined
    };
    try {
      await onSaved(await window.mqttTree.profiles.save(profile));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="connection-title">
        <header className="dialog-header">
          <div>
            <span className="eyebrow">{editing ? 'Edit broker profile' : 'Broker profile'}</span>
            <h2 id="connection-title">{editing ? 'Edit connection' : 'New connection'}</h2>
          </div>
          <button className="icon-button" aria-label="Close connection dialog" onClick={onClose}>
            ×
          </button>
        </header>
        <form onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <label>
              Name
              <input name="name" required placeholder="Production EMQX" defaultValue={initialProfile?.name} />
            </label>
            <label>
              Host
              <input
                name="host"
                required
                placeholder="broker.example.com"
                value={host}
                onChange={(event) => updateHost(event.target.value)}
              />
            </label>
            <label>
              Transport
              <select
                name="transport"
                value={transport}
                onChange={(event) => {
                  const value = event.target.value as MqttTransport;
                  setTransport(value);
                  const port = event.currentTarget.form?.elements.namedItem('port') as HTMLInputElement;
                  if (port) port.value = String(defaultPort(value));
                }}
              >
                <option value="mqtts">MQTT over TLS</option>
                <option value="wss">WebSocket over TLS</option>
                <option value="mqtt">Plain MQTT TCP</option>
              </select>
            </label>
            <label>
              Port
              <input name="port" type="number" min="1" max="65535" defaultValue={initialProfile?.port ?? defaultPort(transport)} required />
            </label>
            {transport === 'wss' && (
              <label className="full-field">
                WebSocket path
                <input name="websocketPath" defaultValue={initialProfile?.websocketPath ?? '/mqtt'} />
              </label>
            )}
            <label>
              MQTT version
              <select
                value={protocolVersion}
                onChange={(event) =>
                  setProtocolVersion(Number(event.target.value) as MqttProtocolVersion)
                }
              >
                <option value="5">MQTT 5.0</option>
                <option value="4">MQTT 3.1.1</option>
              </select>
            </label>
            <label>
              Client ID
              <input name="clientId" placeholder="Generated automatically" defaultValue={initialProfile?.clientId} />
            </label>
            <label>
              Username
              <input name="username" autoComplete="username" defaultValue={initialProfile?.username} />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder={editing ? 'Leave blank to keep saved password' : undefined}
              />
            </label>
          </div>
          <div className="check-row">
            <label><input name="rememberPassword" type="checkbox" defaultChecked={initialProfile?.rememberPassword ?? true} /> Remember securely</label>
            {transport !== 'mqtt' && (
              <label><input name="rejectUnauthorized" type="checkbox" defaultChecked={initialProfile?.rejectUnauthorized ?? true} /> Verify server certificate</label>
            )}
            <label><input name="clean" type="checkbox" defaultChecked={initialProfile?.clean ?? true} /> Clean session</label>
          </div>
          <section className="subscription-editor" aria-labelledby="default-subscriptions-heading">
            <div className="subscription-editor-heading">
              <div>
                <span className="eyebrow">Startup subscriptions</span>
                <h3 id="default-subscriptions-heading">Default subscriptions</h3>
              </div>
              <button type="button" className="button small ghost" onClick={addSubscription}>
                Add subscription
              </button>
            </div>
            <div className="subscription-editor-list">
              {subscriptions.map((subscription, index) => {
                const itemNumber = index + 1;
                return (
                  <div className="subscription-editor-row" key={index}>
                    <label>
                      {`Subscription filter ${itemNumber}`}
                      <input
                        value={subscription.filter}
                        placeholder={host.trim().toLowerCase() === 'test.mosquitto.org' ? '$SYS/#' : '#'}
                        onChange={(event) =>
                          updateSubscription(index, { filter: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      {`Subscription QoS ${itemNumber}`}
                      <select
                        value={subscription.qos}
                        onChange={(event) =>
                          updateSubscription(index, {
                            qos: Number(event.target.value) as MqttQos
                          })
                        }
                      >
                        <option value="0">0</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="button small ghost"
                      aria-label={`Remove subscription ${subscription.filter || itemNumber}`}
                      onClick={() => removeSubscription(index)}
                      disabled={subscriptions.length === 1}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
            {subscriptions.some((subscription) => subscription.filter.trim() === '#') && (
              <p className="form-hint warning-hint">
                The # wildcard can be rejected or flood the app on big/public brokers. Use
                a narrower filter such as $SYS/# or your own test namespace when possible.
              </p>
            )}
          </section>
          <details>
            <summary>{transport === 'mqtt' ? 'Last Will' : 'TLS certificates and Last Will'}</summary>
            <div className="form-grid advanced-grid">
              {transport !== 'mqtt' && (
                <>
                  <label className="full-field">Custom CA path<input name="caPath" defaultValue={initialProfile?.caPath} /></label>
                  <label>Client certificate path<input name="certificatePath" defaultValue={initialProfile?.certificatePath} /></label>
                  <label>Private key path<input name="privateKeyPath" defaultValue={initialProfile?.privateKeyPath} /></label>
                  <label>Private key passphrase<input name="privateKeyPassphrase" type="password" placeholder={editing ? 'Leave blank to keep saved passphrase' : undefined} /></label>
                </>
              )}
              <label>Last Will topic<input name="willTopic" defaultValue={initialProfile?.will?.topic} /></label>
              <label className="full-field">Last Will payload<textarea name="willPayload" rows={2} defaultValue={initialProfile?.will?.payload} /></label>
              <label>Last Will QoS<select name="willQos" defaultValue={initialProfile?.will?.qos ?? 0}><option>0</option><option>1</option><option>2</option></select></label>
              <label className="checkbox-field"><input name="willRetain" type="checkbox" defaultChecked={initialProfile?.will?.retain ?? false} /> Retain Last Will</label>
            </div>
          </details>
          {transport === 'mqtt' && (
            <p className="form-hint">
              {transportLabel(transport)} is useful for local or public test brokers such as test.mosquitto.org:1883. Use TLS for production credentials.
            </p>
          )}
          {error && <p className="form-error">{error}</p>}
          <footer className="dialog-actions">
            <button type="button" className="button ghost" onClick={onClose}>Cancel</button>
            <button className="button primary" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Save connection'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
