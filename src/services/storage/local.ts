import type { StorageProvider, FileEntry, StorageConfig } from './types.ts';
import { isSupportedFileType, inferType } from './utils.ts';

const DB_NAME = 'doculium-handle';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'root';

function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class LocalStorageProvider implements StorageProvider {
  readonly type = 'local';
  readonly supportsOAuth = false;
  private _handle: FileSystemDirectoryHandle | null = null;
  private _config: StorageConfig;

  get name(): string {
    return this._config.localFolderName || 'Local Folder';
  }

  constructor(config: StorageConfig) {
    this._config = config;
  }

  async init(): Promise<void> {
    this._handle = await this._loadHandle();
  }

  async destroy(): Promise<void> {
    this._handle = null;
  }

  async isReady(): Promise<boolean> {
    if (!this._handle) {
      this._handle = await this._loadHandle();
    }
    return this._handle !== null;
  }

  private async _loadHandle(): Promise<FileSystemDirectoryHandle | null> {
    try {
      const db = await openHandleDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  private async _saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await openHandleDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async pickDirectory(): Promise<{ name: string } | null> {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await this._saveHandle(handle);
      this._handle = handle;
      this._config.localFolderName = handle.name;
      localStorage.setItem('doculium-folder-name', handle.name);
      return { name: handle.name };
    } catch {
      return null;
    }
  }

  getDirectoryName(): string | null {
    return localStorage.getItem('doculium-folder-name');
  }

  private async _getHandle(): Promise<FileSystemDirectoryHandle> {
    if (this._handle) return this._handle;
    const h = await this._loadHandle();
    if (!h) throw new Error('No folder selected. Go to Settings > Storage to select a folder.');
    this._handle = h;
    return h;
  }

  private async _resolveFile(path: string): Promise<File | null> {
    try {
      const handle = await this._getHandle();
      const parts = path.split('/');
      let current: FileSystemDirectoryHandle | FileSystemFileHandle = handle;
      for (let i = 0; i < parts.length - 1; i++) {
        current = await (current as FileSystemDirectoryHandle).getDirectoryHandle(parts[i]);
      }
      const fileHandle = await (current as FileSystemDirectoryHandle).getFileHandle(parts[parts.length - 1]);
      return await fileHandle.getFile();
    } catch {
      return null;
    }
  }

  async *walkDirectory(path: string) {
    const handle = await this._getHandle();
    let rootHandle = handle;
    if (path) {
      const parts = path.split('/');
      for (const part of parts) {
        if (part) rootHandle = await rootHandle.getDirectoryHandle(part);
      }
    }
    yield* this._walk(rootHandle, path ? path + '/' : '');
  }

  private async *_walk(dirHandle: FileSystemDirectoryHandle, prefix: string): AsyncGenerator<FileEntry> {
    for await (const [name, entry] of dirHandle.entries()) {
      const path = prefix + name;
      if (entry.kind === 'directory') {
        yield* this._walk(entry, path + '/');
      } else if (isSupportedFileType(name)) {
        const file = await entry.getFile();
        yield {
          name,
          path,
          size: file.size,
          type: file.type || inferType(name),
          handle: entry,
        };
      }
    }
  }

  async getFile(path: string): Promise<File> {
    const file = await this._resolveFile(path);
    if (!file) throw new Error(`File not found: ${path}`);
    return file;
  }

  async writeFile(path: string, data: Blob | ArrayBuffer): Promise<string> {
    const handle = await this._getHandle();
    const parts = path.split('/');
    let current = handle;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i], { create: true });
    }
    const fileHandle = await current.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
    return path;
  }

  async organizeFile(file: File, year: number, category: string, filename: string): Promise<string> {
    const handle = await this._getHandle();
    const yearDir = await handle.getDirectoryHandle(String(year), { create: true });
    const catDir = await yearDir.getDirectoryHandle(category, { create: true });

    const existingNames = new Set<string>();
    for await (const [name] of catDir.entries()) {
      existingNames.add(name);
    }

    let uniqueName = filename;
    let counter = 1;
    while (existingNames.has(uniqueName)) {
      const dot = filename.lastIndexOf('.');
      if (dot > 0) {
        uniqueName = `${filename.slice(0, dot)}_${counter}${filename.slice(dot)}`;
      } else {
        uniqueName = `${filename}_${counter}`;
      }
      counter++;
    }

    const fileHandle = await catDir.getFileHandle(uniqueName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();

    return `${year}/${category}/${uniqueName}`;
  }

  async deleteFile(path: string): Promise<void> {
    const handle = await this._getHandle();
    const parts = path.split('/');
    let current = handle;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i]);
    }
    await current.removeEntry(parts[parts.length - 1]);
  }
}
