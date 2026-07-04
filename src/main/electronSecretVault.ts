import { safeStorage } from 'electron';
import type { SecretVault } from './profileStore';

export class ElectronSecretVault implements SecretVault {
  encrypt(value: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Windows secure credential storage is not available.');
    }
    return safeStorage.encryptString(value).toString('base64');
  }

  decrypt(value: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Windows secure credential storage is not available.');
    }
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  }
}
