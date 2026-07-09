import type { StorageProvider, StorageConfig } from './types.ts';
import { STORAGE_CONFIG_KEY, getDefaultStorageConfig } from './types.ts';
import { LocalStorageProvider } from './local.ts';
import { DropboxStorageProvider } from './dropbox.ts';

let _provider: StorageProvider | null = null;
let _config: StorageConfig | null = null;

export function getStorageConfig(): StorageConfig {
  if (_config) return _config;
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG_KEY);
    if (raw) {
      const parsed = { ...getDefaultStorageConfig(), ...JSON.parse(raw) } as StorageConfig;
      _config = parsed;
      return parsed;
    }
  } catch {
    // ignore
  }
  const config = getDefaultStorageConfig();
  _config = config;
  return config;
}

export function saveStorageConfig(config: StorageConfig): void {
  _config = config;
  try {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function updateStorageConfig(partial: Partial<StorageConfig>): StorageConfig {
  const current = getStorageConfig();
  const updated = { ...current, ...partial };
  saveStorageConfig(updated);
  return updated;
}

export async function getStorageProvider(): Promise<StorageProvider> {
  if (_provider) return _provider;
  const config = getStorageConfig();
  _provider = createProvider(config);
  await _provider.init();
  return _provider;
}

export function resetStorageProvider(): void {
  if (_provider) {
    _provider.destroy().catch(() => {});
    _provider = null;
  }
}

function createProvider(config: StorageConfig): StorageProvider {
  if (config.type === 'dropbox') {
    return new DropboxStorageProvider(config);
  }
  return new LocalStorageProvider(config);
}

export async function recreateStorageProvider(): Promise<StorageProvider> {
  resetStorageProvider();
  return getStorageProvider();
}
