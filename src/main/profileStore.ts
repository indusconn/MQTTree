import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  ConnectionProfile,
  ConnectionProfileInput,
  PublishTemplate
} from '../shared/contracts';
import { normalizeProfile, validateProfile } from '../shared/validation';

export interface SecretVault {
  encrypt(value: string): string;
  decrypt(value: string): string;
}

interface PersistedProfile {
  profile: ConnectionProfile;
  encryptedPassword?: string;
  encryptedPrivateKeyPassphrase?: string;
}

interface PersistedStore {
  profiles: PersistedProfile[];
  templates: PublishTemplate[];
}

const emptyStore = (): PersistedStore => ({ profiles: [], templates: [] });

function withoutSecrets(profile: ConnectionProfile): ConnectionProfile {
  const {
    password: _password,
    privateKeyPassphrase: _privateKeyPassphrase,
    ...publicProfile
  } = profile;
  return publicProfile;
}

export class ProfileStore {
  constructor(
    private readonly path: string,
    private readonly vault: SecretVault
  ) {}

  async listProfiles(): Promise<ConnectionProfile[]> {
    const store = await this.read();
    return store.profiles.map(({ profile }) => withoutSecrets(profile));
  }

  async resolveProfile(profileId: string): Promise<ConnectionProfile> {
    const store = await this.read();
    const persisted = store.profiles.find(({ profile }) => profile.id === profileId);
    if (!persisted) throw new Error(`Profile "${profileId}" was not found.`);

    return {
      ...persisted.profile,
      password: persisted.encryptedPassword
        ? this.vault.decrypt(persisted.encryptedPassword)
        : undefined,
      privateKeyPassphrase: persisted.encryptedPrivateKeyPassphrase
        ? this.vault.decrypt(persisted.encryptedPrivateKeyPassphrase)
        : undefined
    };
  }

  async saveProfile(input: ConnectionProfileInput): Promise<ConnectionProfile> {
    const validation = validateProfile(input);
    if (!validation.ok) throw new Error(validation.error);

    const profile = normalizeProfile(input);
    const store = await this.read();
    const existingIndex = store.profiles.findIndex(
      (persisted) => persisted.profile.id === profile.id
    );
    const existing = existingIndex >= 0 ? store.profiles[existingIndex] : undefined;
    const persisted: PersistedProfile = {
      profile: withoutSecrets(profile),
      encryptedPassword:
        profile.rememberPassword && profile.password
          ? this.vault.encrypt(profile.password)
          : profile.rememberPassword
            ? existing?.encryptedPassword
            : undefined,
      encryptedPrivateKeyPassphrase: profile.privateKeyPassphrase
        ? this.vault.encrypt(profile.privateKeyPassphrase)
        : existing?.encryptedPrivateKeyPassphrase
    };

    if (existingIndex >= 0) store.profiles[existingIndex] = persisted;
    else store.profiles.push(persisted);
    await this.write(store);
    return withoutSecrets(profile);
  }

  async removeProfile(profileId: string): Promise<void> {
    const store = await this.read();
    store.profiles = store.profiles.filter(({ profile }) => profile.id !== profileId);
    await this.write(store);
  }

  async listTemplates(): Promise<PublishTemplate[]> {
    return (await this.read()).templates;
  }

  async saveTemplate(template: PublishTemplate): Promise<PublishTemplate> {
    if (!template.id.trim() || !template.name.trim() || !template.topic.trim()) {
      throw new Error('Template id, name, and topic are required.');
    }
    const store = await this.read();
    const index = store.templates.findIndex((item) => item.id === template.id);
    if (index >= 0) store.templates[index] = template;
    else store.templates.push(template);
    await this.write(store);
    return template;
  }

  async removeTemplate(templateId: string): Promise<void> {
    const store = await this.read();
    store.templates = store.templates.filter((template) => template.id !== templateId);
    await this.write(store);
  }

  private async read(): Promise<PersistedStore> {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8')) as Partial<PersistedStore>;
      return {
        profiles: Array.isArray(value.profiles) ? value.profiles : [],
        templates: Array.isArray(value.templates) ? value.templates : []
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore();
      throw error;
    }
  }

  private async write(store: PersistedStore): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  }
}
