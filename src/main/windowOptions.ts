import { join } from 'node:path';
import type { WebPreferences } from 'electron';

export function createSecureWebPreferences(currentDirectory: string): WebPreferences {
  return {
    preload: join(currentDirectory, '../preload/index.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  };
}
