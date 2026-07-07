import type { Document } from '../db/schema.ts';

const DB_NAME = 'doculium-handle';
const STORE_NAME = 'handles';
const KEY = 'root';
const NAME_STORAGE_KEY = 'doculium-folder-name';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(handle, KEY);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const req = tx.objectStore(STORE_NAME).get(KEY);
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

async function resolveFile(
  handle: FileSystemDirectoryHandle,
  path: string,
): Promise<File | null> {
  try {
    const parts = path.split('/');
    let current: FileSystemDirectoryHandle | FileSystemFileHandle = handle;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await (current as FileSystemDirectoryHandle).getDirectoryHandle(parts[i]);
    }
    const fileHandle = await (current as FileSystemDirectoryHandle).getFileHandle(
      parts[parts.length - 1],
    );
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

export async function getDocumentFile(doc: Document): Promise<File | null> {
  const handle = await getDirectoryHandle();
  if (!handle) return null;
  const path = doc.storedPath || doc.originalName;
  return resolveFile(handle, path);
}

export async function pickAndSaveDirectory(): Promise<{ name: string } | null> {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveDirectoryHandle(handle);
    localStorage.setItem(NAME_STORAGE_KEY, handle.name);
    return { name: handle.name };
  } catch {
    return null;
  }
}

export function getDirectoryName(): string | null {
  return localStorage.getItem(NAME_STORAGE_KEY);
}

export async function hasDirectoryHandle(): Promise<boolean> {
  const handle = await getDirectoryHandle();
  return handle !== null;
}
