import { describe, expect, it } from 'vitest';
import { createSecureWebPreferences } from './windowOptions';

describe('createSecureWebPreferences', () => {
  it('loads the CommonJS preload with renderer isolation enabled', () => {
    expect(createSecureWebPreferences('C:\\app\\out\\main')).toEqual({
      preload: 'C:\\app\\out\\preload\\index.cjs',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    });
  });
});
