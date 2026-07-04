import { contextBridge, ipcRenderer } from 'electron';
import type {
  BrokerEventBatch,
  ConnectionProfileInput,
  MqttTreeApi,
  PublishRequest,
  PublishTemplate,
  Subscription
} from '../shared/contracts';
import { ipcChannels } from '../shared/ipc';

const api: MqttTreeApi = {
  profiles: {
    list: () => ipcRenderer.invoke(ipcChannels.profilesList),
    save: (profile: ConnectionProfileInput) =>
      ipcRenderer.invoke(ipcChannels.profilesSave, profile),
    remove: (profileId: string) => ipcRenderer.invoke(ipcChannels.profilesRemove, profileId)
  },
  templates: {
    list: () => ipcRenderer.invoke(ipcChannels.templatesList),
    save: (template: PublishTemplate) =>
      ipcRenderer.invoke(ipcChannels.templatesSave, template),
    remove: (templateId: string) =>
      ipcRenderer.invoke(ipcChannels.templatesRemove, templateId)
  },
  broker: {
    listConnections: () => ipcRenderer.invoke(ipcChannels.brokerListConnections),
    connect: (profileId: string) => ipcRenderer.invoke(ipcChannels.brokerConnect, profileId),
    disconnect: (connectionId: string) =>
      ipcRenderer.invoke(ipcChannels.brokerDisconnect, connectionId),
    subscribe: (connectionId: string, subscription: Subscription) =>
      ipcRenderer.invoke(ipcChannels.brokerSubscribe, { connectionId, subscription }),
    unsubscribe: (connectionId: string, filter: string) =>
      ipcRenderer.invoke(ipcChannels.brokerUnsubscribe, { connectionId, filter }),
    publish: (request: PublishRequest) =>
      ipcRenderer.invoke(ipcChannels.brokerPublish, request),
    setCapturePaused: (connectionId: string, paused: boolean) =>
      ipcRenderer.invoke(ipcChannels.brokerSetCapturePaused, { connectionId, paused }),
    getHistory: (connectionId: string, topic?: string, limit?: number) =>
      ipcRenderer.invoke(ipcChannels.brokerGetHistory, { connectionId, topic, limit }),
    onEvents: (listener: (batch: BrokerEventBatch) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, batch: BrokerEventBatch): void =>
        listener(batch);
      ipcRenderer.on(ipcChannels.brokerEvents, handler);
      return () => ipcRenderer.removeListener(ipcChannels.brokerEvents, handler);
    }
  }
};

contextBridge.exposeInMainWorld('mqttTree', api);
