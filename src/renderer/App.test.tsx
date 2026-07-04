// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BrokerLogEntry,
  ConnectionProfile,
  ConnectionSnapshot,
  MqttTreeApi
} from '../shared/contracts';
import { App } from './App';

const profile: ConnectionProfile = {
  id: 'broker-1',
  name: 'Production EMQX',
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
};

const activeSnapshot: ConnectionSnapshot = {
  profile,
  status: {
    connectionId: 'broker-1',
    state: 'connected',
    capturePaused: false,
    evictedMessages: 0,
    ignoredWhilePaused: 0,
    receivedMessages: 1
  },
  subscriptions: [{ filter: '#', qos: 0 }],
  topicTree: [
    {
      segment: 'factory',
      fullTopic: 'factory',
      messageCount: 1,
      latestTimestamp: 10,
      retained: false,
      children: [
        {
          segment: 'temperature',
          fullTopic: 'factory/temperature',
          messageCount: 1,
          latestTimestamp: 10,
          retained: true,
          children: []
        }
      ]
    }
  ],
  recentMessages: [
    {
      id: 'message-1',
      connectionId: 'broker-1',
      topic: 'factory/temperature',
      payloadBase64: 'eyJ2YWx1ZSI6MjN9',
      qos: 1,
      retain: true,
      duplicate: false,
      timestamp: 10,
      properties: { contentType: 'application/json' }
    }
  ],
  logs: []
};

const connectionLog: BrokerLogEntry = {
  id: 'log-1',
  connectionId: 'broker-1',
  timestamp: 10,
  level: 'info',
  event: 'connect',
  message: 'Opening MQTT TCP connection to test.mosquitto.org:1883.',
  details: {
    transport: 'mqtt',
    protocolVersion: 'MQTT 3.1.1',
    authentication: { mode: 'anonymous' }
  }
};

function createApi(connections: ConnectionSnapshot[] = []): MqttTreeApi {
  return {
    profiles: {
      list: vi.fn(async () => [profile]),
      save: vi.fn(async () => profile),
      remove: vi.fn(async () => undefined)
    },
    templates: {
      list: vi.fn(async () => []),
      save: vi.fn(async (template) => template),
      remove: vi.fn(async () => undefined)
    },
    broker: {
      listConnections: vi.fn(async () => connections),
      connect: vi.fn(async () => activeSnapshot),
      disconnect: vi.fn(async () => undefined),
      subscribe: vi.fn(async () => undefined),
      unsubscribe: vi.fn(async () => undefined),
      publish: vi.fn(async () => undefined),
      setCapturePaused: vi.fn(async () => activeSnapshot.status),
      getHistory: vi.fn(async () => activeSnapshot.recentMessages),
      onEvents: vi.fn(() => () => undefined)
    }
  };
}

describe('App', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'mqttTree', {
      configurable: true,
      value: createApi()
    });
  });

  it('uses the MQTTree app branding', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'MQTTree' })).toBeInTheDocument();
  });

  it('connects a saved broker profile and opens its workspace tab', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('Production EMQX')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Connect Production EMQX' }));

    expect(await screen.findByRole('button', { name: 'Production EMQX connected' })).toBeInTheDocument();
    expect(window.mqttTree.broker.connect).toHaveBeenCalledWith('broker-1');
  });

  it('offers a built-in Mosquitto public test connection', async () => {
    const api = createApi();
    Object.defineProperty(window, 'mqttTree', { configurable: true, value: api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Connect Mosquitto public test' }));

    await waitFor(() =>
      expect(api.profiles.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'sample-mosquitto-public',
          name: 'Mosquitto public test',
          host: 'test.mosquitto.org',
          port: 1883,
          transport: 'mqtt',
          subscriptions: [{ filter: '$SYS/#', qos: 0 }]
        })
      )
    );
    expect(api.broker.connect).toHaveBeenCalledWith('sample-mosquitto-public');
  });

  it('renders connection actions as icon-only buttons with tooltips', async () => {
    const api = createApi();
    Object.defineProperty(window, 'mqttTree', { configurable: true, value: api });
    const { unmount } = render(<App />);

    const savedConnect = await screen.findByRole('button', {
      name: 'Connect Production EMQX'
    });
    const savedEdit = await screen.findByRole('button', {
      name: 'Edit profile Production EMQX'
    });
    const savedDelete = await screen.findByRole('button', {
      name: 'Delete profile Production EMQX'
    });

    expect(savedConnect).toHaveAttribute('data-tooltip', 'Connect');
    expect(savedEdit).toHaveAttribute('data-tooltip', 'Edit connection');
    expect(savedDelete).toHaveAttribute('data-tooltip', 'Delete connection');
    expect(savedConnect).toHaveAttribute('data-icon-action', 'connect');
    expect(savedEdit).toHaveAttribute('data-icon-action', 'edit');
    expect(savedDelete).toHaveAttribute('data-icon-action', 'delete');
    expect(savedConnect).not.toHaveTextContent('Connect');
    expect(savedEdit).not.toHaveTextContent('Edit');
    expect(savedDelete).not.toHaveTextContent('Delete');

    unmount();
    Object.defineProperty(window, 'mqttTree', {
      configurable: true,
      value: createApi([activeSnapshot])
    });
    render(<App />);

    const workspaceEdit = await screen.findByRole('button', {
      name: 'Edit profile Production EMQX'
    });
    const workspaceDelete = await screen.findByRole('button', {
      name: 'Delete profile Production EMQX'
    });

    expect(workspaceEdit).toHaveAttribute('data-tooltip', 'Edit connection');
    expect(workspaceDelete).toHaveAttribute('data-tooltip', 'Delete connection');
    expect(workspaceEdit).toHaveAttribute('data-icon-action', 'edit');
    expect(workspaceDelete).toHaveAttribute('data-icon-action', 'delete');
    expect(workspaceEdit).not.toHaveTextContent('Edit');
    expect(workspaceDelete).not.toHaveTextContent('Delete');
  });

  it('edits an active profile and reconnects it with the saved settings', async () => {
    const editedProfile = { ...profile, host: 'edited.example.com' };
    const api = createApi([activeSnapshot]);
    vi.mocked(api.profiles.save).mockResolvedValue(editedProfile);
    vi.mocked(api.broker.connect).mockResolvedValue({ ...activeSnapshot, profile: editedProfile });
    Object.defineProperty(window, 'mqttTree', { configurable: true, value: api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Edit profile Production EMQX' }));
    await user.clear(screen.getByLabelText('Host'));
    await user.type(screen.getByLabelText('Host'), 'edited.example.com');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(api.profiles.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'broker-1',
          host: 'edited.example.com'
        })
      )
    );
    expect(api.broker.disconnect).toHaveBeenCalledWith('broker-1');
    expect(api.broker.connect).toHaveBeenCalledWith('broker-1');
  });

  it('edits saved subscription filters before reconnecting a profile', async () => {
    const editedProfile = { ...profile, subscriptions: [{ filter: '$SYS/#', qos: 1 as const }] };
    const api = createApi([activeSnapshot]);
    vi.mocked(api.profiles.save).mockResolvedValue(editedProfile);
    vi.mocked(api.broker.connect).mockResolvedValue({ ...activeSnapshot, profile: editedProfile });
    Object.defineProperty(window, 'mqttTree', { configurable: true, value: api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Edit profile Production EMQX' }));
    expect(screen.getByText(/can be rejected or flood the app/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add subscription' }));
    await user.type(screen.getByLabelText('Subscription filter 2'), '$SYS/#');
    await user.selectOptions(screen.getByLabelText('Subscription QoS 2'), '1');
    await user.click(screen.getByRole('button', { name: 'Remove subscription #' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(api.profiles.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'broker-1',
          subscriptions: [{ filter: '$SYS/#', qos: 1 }]
        })
      )
    );
    expect(api.broker.disconnect).toHaveBeenCalledWith('broker-1');
    expect(api.broker.connect).toHaveBeenCalledWith('broker-1');
  });

  it('defaults new Mosquitto manual profiles to a safer system subscription', async () => {
    const api = createApi();
    Object.defineProperty(window, 'mqttTree', { configurable: true, value: api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /New connection/ }));
    await user.type(screen.getByLabelText('Name'), 'Manual Mosquitto');
    await user.type(screen.getByLabelText('Host'), 'test.mosquitto.org');
    await user.selectOptions(screen.getByLabelText('Transport'), 'mqtt');
    expect(screen.getByLabelText('Subscription filter 1')).toHaveValue('$SYS/#');
  });

  it('confirms and deletes an active profile after disconnecting it', async () => {
    const api = createApi([activeSnapshot]);
    Object.defineProperty(window, 'mqttTree', { configurable: true, value: api });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Delete profile Production EMQX' }));

    await waitFor(() => expect(api.broker.disconnect).toHaveBeenCalledWith('broker-1'));
    expect(api.profiles.remove).toHaveBeenCalledWith('broker-1');
  });

  it('opens the logs tab for a connecting broker and copies session logs', async () => {
    const clipboard = { writeText: vi.fn(async () => undefined) };
    const connectingSnapshot: ConnectionSnapshot = {
      ...activeSnapshot,
      status: { ...activeSnapshot.status, state: 'connecting' },
      logs: [connectionLog]
    };
    const api = createApi([connectingSnapshot]);
    Object.defineProperty(window, 'mqttTree', { configurable: true, value: api });
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: clipboard
    });
    render(<App />);

    expect(
      await screen.findByText('Opening MQTT TCP connection to test.mosquitto.org:1883.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy logs' }));

    await waitFor(() =>
      expect(clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('Opening MQTT TCP connection to test.mosquitto.org:1883.')
      )
    );
  });

  it('inspects a selected topic and publishes to it', async () => {
    const api = createApi([activeSnapshot]);
    Object.defineProperty(window, 'mqttTree', { configurable: true, value: api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Toggle factory' }));
    await user.click(await screen.findByRole('button', { name: 'factory/temperature' }));
    expect(screen.getByText('"value": 23')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Publish' }));
    await user.clear(screen.getByLabelText('Payload'));
    fireEvent.change(screen.getByLabelText('Payload'), { target: { value: '{"value":24}' } });
    fireEvent.change(screen.getByLabelText('Content type'), {
      target: { value: 'application/vnd.factory+json' }
    });
    await user.click(screen.getByRole('button', { name: 'Publish message' }));

    await waitFor(() =>
      expect(api.broker.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: 'broker-1',
          topic: 'factory/temperature',
          payload: '{"value":24}',
          contentType: 'application/vnd.factory+json'
        })
      )
    );
  });
});
