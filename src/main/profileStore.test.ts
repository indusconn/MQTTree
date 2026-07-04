import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PublishTemplate } from '../shared/contracts';
import { ProfileStore, type SecretVault } from './profileStore';

class TestVault implements SecretVault {
  encrypt(value: string): string {
    return Buffer.from(`protected:${value}`).toString('base64');
  }

  decrypt(value: string): string {
    return Buffer.from(value, 'base64').toString('utf8').replace('protected:', '');
  }
}

describe('ProfileStore', () => {
  it('keeps passwords encrypted on disk and omits them from public profiles', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqtttree-'));
    const path = join(directory, 'store.json');
    const store = new ProfileStore(path, new TestVault());

    await store.saveProfile({
      id: 'broker-1',
      name: 'Production',
      host: 'broker.example.com',
      transport: 'mqtts',
      username: 'operator',
      password: 'plain-password',
      privateKeyPassphrase: 'key-secret'
    });

    const disk = await readFile(path, 'utf8');
    expect(disk).not.toContain('plain-password');
    expect(disk).not.toContain('key-secret');
    expect((await store.listProfiles())[0]).not.toHaveProperty('password');

    const resolved = await store.resolveProfile('broker-1');
    expect(resolved.password).toBe('plain-password');
    expect(resolved.privateKeyPassphrase).toBe('key-secret');
  });

  it('stores, updates, and removes reusable publish templates', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqtttree-'));
    const store = new ProfileStore(join(directory, 'store.json'), new TestVault());
    const template: PublishTemplate = {
      id: 'template-1',
      name: 'Set temperature',
      topic: 'factory/target',
      payload: '{"value":21}',
      qos: 1,
      retain: true,
      contentType: 'application/json'
    };

    await store.saveTemplate(template);
    await store.saveTemplate({ ...template, payload: '{"value":22}' });
    expect(await store.listTemplates()).toEqual([{ ...template, payload: '{"value":22}' }]);

    await store.removeTemplate(template.id);
    expect(await store.listTemplates()).toEqual([]);
  });
});
