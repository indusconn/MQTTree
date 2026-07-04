import { useEffect, useMemo, useState } from 'react';
import type {
  ConnectionProfile,
  ConnectionSnapshot,
  PublishTemplate
} from '../shared/contracts';
import { applyBrokerBatch } from './workspaceState';
import { BrokerWorkspace } from './BrokerWorkspace';
import { ConnectionDialog } from './ConnectionDialog';
import { IconActionButton } from './IconActionButton';

const mosquittoTestProfile = {
  id: 'sample-mosquitto-public',
  name: 'Mosquitto public test',
  host: 'test.mosquitto.org',
  port: 1883,
  transport: 'mqtt' as const,
  websocketPath: '/mqtt',
  protocolVersion: 4 as const,
  rememberPassword: false,
  rejectUnauthorized: false,
  reconnectPeriodMs: 2_000,
  connectTimeoutMs: 30_000,
  clean: true,
  subscriptions: [{ filter: '$SYS/#', qos: 0 as const }]
};

function transportBadge(profile: ConnectionProfile): string {
  if (profile.transport === 'mqtt') return 'TCP';
  if (profile.transport === 'mqtts') return 'TLS';
  return 'WSS';
}

function transportLabel(profile: ConnectionProfile): string {
  if (profile.transport === 'mqtt') return 'MQTT TCP';
  if (profile.transport === 'mqtts') return 'MQTT over TLS';
  return 'WebSocket over TLS';
}

function upsertProfile(
  current: ConnectionProfile[],
  profile: ConnectionProfile
): ConnectionProfile[] {
  return [...current.filter((item) => item.id !== profile.id), profile];
}

export function App(): React.JSX.Element {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [connections, setConnections] = useState<ConnectionSnapshot[]>([]);
  const [templates, setTemplates] = useState<PublishTemplate[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([
      window.mqttTree.profiles.list(),
      window.mqttTree.templates.list(),
      window.mqttTree.broker.listConnections()
    ])
      .then(([loadedProfiles, loadedTemplates, loadedConnections]) => {
        if (!active) return;
        setProfiles(loadedProfiles);
        setTemplates(loadedTemplates);
        setConnections(loadedConnections);
        setActiveId(loadedConnections[0]?.profile.id);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)))
      .finally(() => setLoading(false));

    const unsubscribe = window.mqttTree.broker.onEvents((batch) => {
      setConnections((current) => applyBrokerBatch(current, batch));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const activeConnection = useMemo(
    () => connections.find(({ profile }) => profile.id === activeId),
    [connections, activeId]
  );

  const removeConnectionFromState = (connectionId: string): void => {
    setConnections((current) => {
      const remaining = current.filter(({ profile }) => profile.id !== connectionId);
      setActiveId((currentActiveId) =>
        currentActiveId === connectionId ? remaining[0]?.profile.id : currentActiveId
      );
      return remaining;
    });
  };

  const connect = async (profileId: string): Promise<void> => {
    setError('');
    try {
      const snapshot = await window.mqttTree.broker.connect(profileId);
      setConnections((current) => [
        ...current.filter(({ profile }) => profile.id !== profileId),
        snapshot
      ]);
      setActiveId(profileId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const disconnect = async (connectionId: string): Promise<void> => {
    await window.mqttTree.broker.disconnect(connectionId);
    removeConnectionFromState(connectionId);
  };

  const updateSnapshot = (snapshot: ConnectionSnapshot): void => {
    setConnections((current) =>
      current.map((item) => (item.profile.id === snapshot.profile.id ? snapshot : item))
    );
  };

  const openNewConnectionDialog = (): void => {
    setEditingProfile(undefined);
    setShowConnectionDialog(true);
  };

  const openEditDialog = (profile: ConnectionProfile): void => {
    setEditingProfile(profile);
    setShowConnectionDialog(true);
  };

  const saveMosquittoTestProfile = async (): Promise<void> => {
    setError('');
    try {
      const existingProfile = profiles.find(({ id }) => id === mosquittoTestProfile.id);
      if (!existingProfile) {
        const savedProfile = await window.mqttTree.profiles.save(mosquittoTestProfile);
        setProfiles((current) => upsertProfile(current, savedProfile));
      }
      await connect(mosquittoTestProfile.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const handleSavedProfile = async (profile: ConnectionProfile): Promise<void> => {
    const editedProfileId = editingProfile?.id;
    const shouldReconnect = Boolean(
      editedProfileId && connections.some((connection) => connection.profile.id === editedProfileId)
    );
    setProfiles((current) => upsertProfile(current, profile));
    setShowConnectionDialog(false);
    setEditingProfile(undefined);

    if (!editedProfileId) {
      await connect(profile.id);
      return;
    }

    if (shouldReconnect) {
      setError('');
      try {
        await window.mqttTree.broker.disconnect(editedProfileId);
        removeConnectionFromState(editedProfileId);
        const snapshot = await window.mqttTree.broker.connect(editedProfileId);
        setConnections((current) => [
          ...current.filter((connection) => connection.profile.id !== editedProfileId),
          snapshot
        ]);
        setActiveId(editedProfileId);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    }
  };

  const deleteProfile = async (profile: ConnectionProfile): Promise<void> => {
    if (!window.confirm(`Delete connection "${profile.name}"? This cannot be undone.`)) {
      return;
    }

    setError('');
    try {
      const isConnected = connections.some((connection) => connection.profile.id === profile.id);
      if (isConnected) {
        await window.mqttTree.broker.disconnect(profile.id);
        removeConnectionFromState(profile.id);
      }
      await window.mqttTree.profiles.remove(profile.id);
      setProfiles((current) => current.filter((item) => item.id !== profile.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const hasMosquittoProfile = profiles.some(({ id }) => id === mosquittoTestProfile.id);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div>
            <h1>MQTTree</h1>
            <span>MQTT topic tree workspace</span>
          </div>
        </div>
        <button type="button" className="button primary" onClick={openNewConnectionDialog}>
          <span>＋</span> New connection
        </button>
      </header>
      <nav className="connection-tabs" aria-label="Broker connections">
        {connections.map((connection) => (
          <div
            key={connection.profile.id}
            className={`connection-tab ${activeId === connection.profile.id ? 'active' : ''}`}
          >
            {activeId === connection.profile.id ? (
              <button
                type="button"
                className="connection-tab-button"
                aria-pressed="true"
                aria-label={`${connection.profile.name} ${connection.status.state}`}
                onClick={() => setActiveId(connection.profile.id)}
              >
                <span className={`status-light ${connection.status.state}`} />
                <span>{connection.profile.name}</span>
              </button>
            ) : (
              <button
                type="button"
                className="connection-tab-button"
                aria-pressed="false"
                aria-label={`${connection.profile.name} ${connection.status.state}`}
                onClick={() => setActiveId(connection.profile.id)}
              >
                <span className={`status-light ${connection.status.state}`} />
                <span>{connection.profile.name}</span>
              </button>
            )}
            <button
              type="button"
              className="tab-close"
              aria-label={`Disconnect ${connection.profile.name}`}
              onClick={() => void disconnect(connection.profile.id)}
            >
              ×
            </button>
          </div>
        ))}
      </nav>
      {error && <div className="global-error"><span>{error}</span><button type="button" onClick={() => setError('')}>×</button></div>}
      {loading ? (
        <div className="loading-screen">Opening workspace…</div>
      ) : activeConnection ? (
        <BrokerWorkspace
          snapshot={activeConnection}
          templates={templates}
          onSnapshotChange={updateSnapshot}
          onTemplateSaved={(template) =>
            setTemplates((current) => [
              ...current.filter((item) => item.id !== template.id),
              template
            ])
          }
          onEditProfile={openEditDialog}
          onDeleteProfile={(profile) => void deleteProfile(profile)}
        />
      ) : (
        <main className="welcome">
          <section className="welcome-copy">
            <span className="eyebrow">Windows MQTT operations</span>
            <h2>See every topic as a living hierarchy.</h2>
            <p>Connect securely through port 8883 or 8084, try a public MQTT broker on 1883, inspect messages, publish payloads, and keep several brokers open side by side.</p>
            <div className="hero-actions">
              <button type="button" className="button primary large" onClick={openNewConnectionDialog}>Create your first connection</button>
              <button type="button" className="button ghost large" onClick={() => void saveMosquittoTestProfile()}>Try Mosquitto test broker</button>
            </div>
          </section>
          <section className="profile-section">
            <div className="section-title"><h3>Saved brokers</h3><span>{profiles.length}</span></div>
            <div className="profile-grid">
              {profiles.map((profile) => (
                <article className="profile-card" key={profile.id}>
                  <div className="profile-icon">{transportBadge(profile)}</div>
                  <div><h4>{profile.name}</h4><p>{profile.host}:{profile.port}</p><span>{transportLabel(profile)} · MQTT {profile.protocolVersion === 5 ? '5.0' : '3.1.1'}</span></div>
                  <div className="profile-actions">
                    <IconActionButton icon="connect" label={`Connect ${profile.name}`} tooltip="Connect" onClick={() => void connect(profile.id)} />
                    <IconActionButton icon="edit" label={`Edit profile ${profile.name}`} tooltip="Edit connection" onClick={() => openEditDialog(profile)} />
                    <IconActionButton icon="delete" label={`Delete profile ${profile.name}`} tooltip="Delete connection" tone="danger" onClick={() => void deleteProfile(profile)} />
                  </div>
                </article>
              ))}
              {!hasMosquittoProfile && (
                <article className="profile-card sample-card">
                  <div className="profile-icon">TCP</div>
                  <div>
                    <h4>Mosquitto public test</h4>
                    <p>test.mosquitto.org:1883</p>
                    <span>Plain MQTT TCP · public anonymous test broker</span>
                  </div>
                  <div className="profile-actions">
                    <IconActionButton icon="connect" label="Connect Mosquitto public test" tooltip="Connect" onClick={() => void saveMosquittoTestProfile()} />
                  </div>
                </article>
              )}
              {profiles.length === 0 && <div className="empty-profiles">No broker profiles saved yet. You can create one or use the Mosquitto public test broker.</div>}
            </div>
          </section>
        </main>
      )}
      {showConnectionDialog && (
        <ConnectionDialog
          onClose={() => setShowConnectionDialog(false)}
          profile={editingProfile}
          onSaved={handleSavedProfile}
        />
      )}
    </div>
  );
}
