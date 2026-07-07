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
  organizedPath?: string;
}

export interface ScanResult {
  dirHandle: FileSystemDirectoryHandle | null;
  scanned: number;
  newFiles: number;
  duplicates: number;
  newDocs: NewDocInfo[];
}

export type ScanCallback = (progress: ScanProgress) => void;

async function collectOrganizedFiles(
  dirHandle: FileSystemDirectoryHandle,
): Promise<{ year: number; category: string; handle: FileSystemFileHandle; name: string }[]> {
  const results: { year: number; category: string; handle: FileSystemFileHandle; name: string }[] = [];

  for await (const [yearName, yearHandle] of dirHandle.entries()) {
    if (yearHandle.kind !== 'directory') continue;
    const year = parseInt(yearName, 10);
    if (isNaN(year) || year < 1900 || year > 2100) continue;

    for await (const [catName, catHandle] of (yearHandle as FileSystemDirectoryHandle).entries()) {
      if (catHandle.kind !== 'directory') continue;
      for await (const [fileName, fileHandle] of (catHandle as FileSystemDirectoryHandle).entries()) {
        if (fileHandle.kind !== 'file') continue;
        if (!isSupportedFileType(fileName)) continue;
        results.push({ year, category: catName, handle: fileHandle as FileSystemFileHandle, name: fileName });
      }
    }
  }

  return results;
}

export async function scanDirectory(
  onProgress: ScanCallback,
  existingHandle?: FileSystemDirectoryHandle | null,
): Promise<ScanResult> {
  const dirHandle = existingHandle ?? await pickSourceDirectory();
  if (!dirHandle) return { dirHandle: null, scanned: 0, newFiles: 0, duplicates: 0, newDocs: [] };

  const rootEntries: FileEntry[] = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file') {
      const file = await (handle as FileSystemFileHandle).getFile();
      if (isSupportedFileType(name)) {
        rootEntries.push({
          handle: handle as FileSystemFileHandle,
          name,
          path: [name],
          size: file.size,
          type: file.type || inferType(name),
        });
      }
    }
  }

  const organizedFiles = await collectOrganizedFiles(dirHandle);
  const total = rootEntries.length + organizedFiles.length;
  let current = 0;
  let newFiles = 0;
  let duplicates = 0;
  const newDocs: ScanResult['newDocs'] = [];

  for (const entry of rootEntries) {
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

  for (const org of organizedFiles) {
    current++;
    const pathStr = `${org.year}/${org.category}/${org.name}`;
    onProgress({ total, current, currentFile: pathStr, newFiles, duplicates });

    const file = await org.handle.getFile();
    const hash = await computeFileHash(file);

    const existing = await findDocumentByHash(hash);
    if (existing) {
      duplicates++;
      continue;
    }

    let extractedText = '';
    if (file.type === 'application/pdf' || org.name.toLowerCase().endsWith('.pdf')) {
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
    newDocs.push({ id: docId, name: org.name, size: file.size, fileHash: hash, extractedText, fileType: file.type || inferType(org.name), organizedPath: pathStr });
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
