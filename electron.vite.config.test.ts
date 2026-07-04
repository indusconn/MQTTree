import { describe, expect, it } from 'vitest';
import config from './electron.vite.config';

describe('Electron preload build', () => {
  it('emits a CommonJS preload that Electron can execute in a sandbox', () => {
    const output = config.preload?.build?.rollupOptions?.output;

    expect(output).toMatchObject({
      format: 'cjs',
      entryFileNames: 'index.cjs'
    });
  });
});
