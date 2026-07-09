export interface FileEntry {
  name: string;
  path: string;
  size: number;
  type: string;
  handle?: unknown;
  hash?: string;
}

export interface StorageProvider {
  readonly type: 'local' | 'dropbox';
  readonly name: string;
  readonly supportsOAuth: boolean;

  init(): Promise<void>;
  destroy(): Promise<void>;
  isReady(): Promise<boolean>;

  walkDirectory(path: string): AsyncGenerator<FileEntry>;
  getFile(path: string): Promise<File>;
  writeFile(path: string, data: Blob | ArrayBuffer): Promise<string>;
  organizeFile(file: File, year: number, category: string, filename: string): Promise<string>;
  deleteFile(path: string): Promise<void>;
}

export interface StorageConfig {
  type: 'local' | 'dropbox';
  localFolderName?: string;
  dropboxAppKey?: string;
  dropboxAccessToken?: string;
  dropboxRefreshToken?: string;
  dropboxTokenExpiresAt?: string;
  dropboxAccountName?: string;
  dropboxPath?: string;
}

export const STORAGE_CONFIG_KEY = 'doculium-storage-config';

export function getDefaultStorageConfig(): StorageConfig {
  return { type: 'local' };
}
