import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { connect as mqttConnect } from 'mqtt';
import { BrokerManager, type ManagedMqttClient } from './brokerManager';
import { ElectronSecretVault } from './electronSecretVault';
import { registerIpcHandlers } from './ipcHandlers';
import { ProfileStore } from './profileStore';
import { createSecureWebPreferences } from './windowOptions';
import { ipcChannels } from '../shared/ipc';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | undefined;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#07111f',
    show: false,
    title: 'MQTTree',
    webPreferences: createSecureWebPreferences(currentDirectory)
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(currentDirectory, '../renderer/index.html'));
  }
  return window;
}

void app.whenReady().then(() => {
  const profileStore = new ProfileStore(
    join(app.getPath('userData'), 'mqtttree.json'),
    new ElectronSecretVault()
  );
  const brokerManager = new BrokerManager(
    (url, options) => mqttConnect(url, options) as ManagedMqttClient,
    (batch) => mainWindow?.webContents.send(ipcChannels.brokerEvents, batch)
  );
  registerIpcHandlers(ipcMain, profileStore, brokerManager);
  mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
