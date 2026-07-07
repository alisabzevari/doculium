import { computeFileHash, readFileAsText } from './file-operations.ts';
import { extractTextFromPDF } from '../utils/pdf-parser.ts';
import { addDocument, findDocumentByHash } from '../db/document-store.ts';
import { v4 as uuid } from 'uuid';

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
    '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv',
    '.md': 'text/markdown', '.rtf': 'application/rtf', '.html': 'text/html',
    '.htm': 'text/html', '.json': 'application/json', '.xml': 'application/xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp',
  };
  return map[ext ?? ''] || 'application/octet-stream';
}

export interface ScanProgress {
  total: number;
  current: number;
  currentFile: string;
  imported: number;
  skipped: number;
}

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

export async function scanAndImport(
  dirHandle: FileSystemDirectoryHandle,
  onProgress?: (p: ScanProgress) => void,
): Promise<{ imported: number; skipped: number }> {
  const rootEntries: { handle: FileSystemFileHandle; name: string; type: string }[] = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file' && isSupportedFileType(name)) {
      const file = await (handle as FileSystemFileHandle).getFile();
      rootEntries.push({ handle: handle as FileSystemFileHandle, name, type: file.type || inferType(name) });
    }
  }

  const organizedFiles = await collectOrganizedFiles(dirHandle);
  const allEntries = [
    ...rootEntries.map(e => ({ handle: e.handle, name: e.name, type: e.type, organizedPath: undefined as string | undefined, orgYear: null as number | null, orgCategory: '' })),
    ...organizedFiles.map(org => ({ handle: org.handle, name: org.name, type: inferType(org.name), organizedPath: `${org.year}/${org.category}/${org.name}`, orgYear: org.year, orgCategory: org.category })),
  ];
  const total = allEntries.length;
  let current = 0;
  let imported = 0;
  let skipped = 0;
  const CONCURRENCY = 3;

  for (let i = 0; i < allEntries.length; i += CONCURRENCY) {
    const batch = allEntries.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (entry) => {
        const file = await entry.handle.getFile();
        const hash = await computeFileHash(file);
        const existing = await findDocumentByHash(hash);
        if (existing) return null;

        let extractedText = '';
        if (file.type === 'application/pdf' || entry.name.toLowerCase().endsWith('.pdf')) {
          try { extractedText = await extractTextFromPDF(file); } catch { extractedText = '[PDF text extraction failed]'; }
        } else {
          try { extractedText = await readFileAsText(file); } catch { extractedText = ''; }
        }

        const now = new Date().toISOString();
        await addDocument({
          id: uuid(),
          originalName: entry.name,
          originalPath: entry.organizedPath || entry.name,
          storedPath: entry.organizedPath || null,
          fileType: entry.type,
          fileSize: file.size,
          fileHash: hash,
          extractedText,
          summary: '', audience: '', urgency: 'medium', taxRelevant: false,
          category: entry.orgCategory || '',
          year: entry.orgYear,
          month: null, dateFrom: null, dateTo: null, suggestedFilename: null,
          tags: [], confidence: 0, status: 'pending', error: null,
          createdAt: now, updatedAt: now, syncedAt: null,
        });
        return true;
      }),
    );
    for (let j = 0; j < batch.length; j++) {
      current++;
      const r = results[j];
      if (r.status === 'fulfilled' && r.value !== null) {
        imported++;
      } else {
        skipped++;
      }
      onProgress?.({ total, current, currentFile: batch[j].name, imported, skipped });
    }
  }

  return { imported, skipped };
}
