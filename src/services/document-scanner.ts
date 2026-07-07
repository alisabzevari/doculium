import { pickSourceDirectory, readFileAsText, computeFileHash, type FileEntry } from './file-operations.ts';
import { extractTextFromPDF } from '../utils/pdf-parser.ts';
import { findDocumentByHash } from '../db/document-store.ts';
import { v4 as uuid } from 'uuid';

export interface ScanProgress {
  total: number;
  current: number;
  currentFile: string;
  newFiles: number;
  duplicates: number;
}

export interface NewDocInfo {
  id: string;
  name: string;
  size: number;
  fileHash: string;
  extractedText: string;
  fileType: string;
}

export interface ScanResult {
  dirHandle: FileSystemDirectoryHandle | null;
  scanned: number;
  newFiles: number;
  duplicates: number;
  newDocs: NewDocInfo[];
}

export type ScanCallback = (progress: ScanProgress) => void;

export async function scanDirectory(
  onProgress: ScanCallback,
  existingHandle?: FileSystemDirectoryHandle | null,
): Promise<ScanResult> {
  const dirHandle = existingHandle ?? await pickSourceDirectory();
  if (!dirHandle) return { dirHandle: null, scanned: 0, newFiles: 0, duplicates: 0, newDocs: [] };

  const entries: FileEntry[] = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file') {
      const file = await (handle as FileSystemFileHandle).getFile();
      if (isSupportedFileType(name)) {
        entries.push({
          handle: handle as FileSystemFileHandle,
          name,
          path: [name],
          size: file.size,
          type: file.type || inferType(name),
        });
      }
    }
  }

  const total = entries.length;
  let current = 0;
  let newFiles = 0;
  let duplicates = 0;
  const newDocs: ScanResult['newDocs'] = [];

  for (const entry of entries) {
    current++;
    onProgress({ total, current, currentFile: entry.name, newFiles, duplicates });

    const file = await entry.handle.getFile();
    const hash = await computeFileHash(file);

    const existing = await findDocumentByHash(hash);
    if (existing) {
      duplicates++;
      continue;
    }

    let extractedText = '';
    if (file.type === 'application/pdf' || entry.name.toLowerCase().endsWith('.pdf')) {
      try {
        extractedText = await extractTextFromPDF(file);
      } catch {
        extractedText = '[PDF text extraction failed]';
      }
    } else {
      try {
        extractedText = await readFileAsText(file);
      } catch {
        extractedText = '';
      }
    }

    const docId = uuid();

    newDocs.push({ id: docId, name: entry.name, size: file.size, fileHash: hash, extractedText, fileType: entry.type });
    newFiles++;
  }

  return { dirHandle, scanned: total, newFiles, duplicates, newDocs };
}

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.txt', '.csv', '.json', '.xml',
  '.md', '.rtf', '.html', '.htm',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp',
  '.doc', '.docx',
]);

function isSupportedFileType(name: string): boolean {
  const ext = name.toLowerCase().match(/\.[^.]+$/)?.[0];
  return ext ? SUPPORTED_EXTENSIONS.has(ext) : false;
}

function inferType(name: string): string {
  const ext = name.toLowerCase().match(/\.[^.]+$/)?.[0];
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.md': 'text/markdown',
    '.rtf': 'application/rtf',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
  };
  return map[ext ?? ''] || 'application/octet-stream';
}
