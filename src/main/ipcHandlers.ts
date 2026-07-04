import type { IpcMain } from 'electron';
import type { BrokerManager } from './brokerManager';
import {
  parseCaptureRequest,
  parseConnectionId,
  parseHistoryRequest,
  parseProfileInput,
  parsePublishRequest,
  parseSubscriptionRequest,
  parseTemplate,
  parseUnsubscribeRequest
} from './ipcValidation';
import type { ProfileStore } from './profileStore';
import { ipcChannels } from '../shared/ipc';

export function registerIpcHandlers(
  ipcMain: IpcMain,
  profiles: ProfileStore,
  brokers: BrokerManager
): void {
  ipcMain.handle(ipcChannels.profilesList, () => profiles.listProfiles());
  ipcMain.handle(ipcChannels.profilesSave, (_event, value: unknown) =>
    profiles.saveProfile(parseProfileInput(value))
  );
  ipcMain.handle(ipcChannels.profilesRemove, (_event, value: unknown) =>
    profiles.removeProfile(parseConnectionId(value))
  );

  ipcMain.handle(ipcChannels.templatesList, () => profiles.listTemplates());
  ipcMain.handle(ipcChannels.templatesSave, (_event, value: unknown) =>
    profiles.saveTemplate(parseTemplate(value))
  );
  ipcMain.handle(ipcChannels.templatesRemove, (_event, value: unknown) =>
    profiles.removeTemplate(parseConnectionId(value))
  );

  ipcMain.handle(ipcChannels.brokerListConnections, () => brokers.listSnapshots());
  ipcMain.handle(ipcChannels.brokerConnect, async (_event, value: unknown) => {
    const profile = await profiles.resolveProfile(parseConnectionId(value));
    return brokers.connect(profile);
  });
  ipcMain.handle(ipcChannels.brokerDisconnect, (_event, value: unknown) =>
    brokers.disconnect(parseConnectionId(value))
  );
  ipcMain.handle(ipcChannels.brokerSubscribe, (_event, value: unknown) => {
    const request = parseSubscriptionRequest(value);
    return brokers.subscribe(request.connectionId, request.subscription);
  });
  ipcMain.handle(ipcChannels.brokerUnsubscribe, (_event, value: unknown) => {
    const request = parseUnsubscribeRequest(value);
    return brokers.unsubscribe(request.connectionId, request.filter);
  });
  ipcMain.handle(ipcChannels.brokerPublish, (_event, value: unknown) =>
    brokers.publish(parsePublishRequest(value))
  );
  ipcMain.handle(ipcChannels.brokerSetCapturePaused, (_event, value: unknown) => {
    const request = parseCaptureRequest(value);
    return brokers.setCapturePaused(request.connectionId, request.paused);
  });
  ipcMain.handle(ipcChannels.brokerGetHistory, (_event, value: unknown) => {
    const request = parseHistoryRequest(value);
    return brokers.getHistory(request.connectionId, request.topic, request.limit);
  });
}
