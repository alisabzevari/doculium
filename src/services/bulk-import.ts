import { extractTextFromPDF } from '../utils/pdf-parser.ts';
import { addDocument, findDocumentByHash, findDocumentByDropboxHash, updateDocument } from '../db/document-store.ts';
import { v4 as uuid } from 'uuid';
import { getStorageProvider } from './storage/registry.ts';
import { computeFileHash, readFileAsText } from './storage/utils.ts';

export interface ScanProgress {
  total: number;
  current: number;
  currentFile: string;
  imported: number;
  skipped: number;
}

export async function scanAndImport(
  onProgress?: (p: ScanProgress) => void,
): Promise<{ imported: number; skipped: number }> {
  const provider = await getStorageProvider();
  if (!(await provider.isReady())) {
    throw new Error('No storage configured. Go to Settings > Storage to set up.');
  }

  const allEntries: { path: string; name: string; type: string; hash?: string; size: number }[] = [];
  for await (const entry of provider.walkDirectory('')) {
    allEntries.push({
      path: entry.path,
      name: entry.name,
      type: entry.type,
      hash: entry.hash,
      size: entry.size,
    });
  }

  const total = allEntries.length;
  let imported = 0;
  let skipped = 0;
  const CONCURRENCY = 3;

  for (let i = 0; i < allEntries.length; i += CONCURRENCY) {
    const batch = allEntries.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (entry) => {
        try {
          // Fast path: use provider hash (e.g. Dropbox content_hash) to skip download
          if (entry.hash) {
            const existing = await findDocumentByDropboxHash(entry.hash);
            if (existing) return null;
          }

          const file = await provider.getFile(entry.path);
          const hash = await computeFileHash(file);

          const existing = await findDocumentByHash(hash);
          if (existing) {
            // Backfill dropboxContentHash for files imported before we tracked it
            if (entry.hash && !existing.dropboxContentHash) {
              await updateDocument(existing.id, { dropboxContentHash: entry.hash });
            }
            return null;
          }

          const isOrganized = entry.path.includes('/');
          let orgYear: number | null = null;
          let orgCategory = '';
          let storedPath: string | null = null;

          if (isOrganized) {
            const parts = entry.path.split('/');
            const yearNum = parseInt(parts[0], 10);
            if (!isNaN(yearNum) && yearNum >= 1900 && yearNum <= 2100) {
              orgYear = yearNum;
              orgCategory = parts[1] || '';
              storedPath = entry.path;
            }
          }

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
            originalPath: entry.path,
            storedPath,
            fileType: entry.type,
            fileSize: entry.size,
            fileHash: hash,
            dropboxContentHash: entry.hash,
            extractedText,
            summary: '', audience: '', urgency: 'medium', taxRelevant: false,
            category: orgCategory,
            year: orgYear,
            month: null, dateFrom: null, dateTo: null, suggestedFilename: null,
            tags: [], confidence: 0, status: 'pending', error: null,
            createdAt: now, updatedAt: now, syncedAt: null,
          });
          return true;
        } catch {
          return null;
        }
      }),
    );
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled' && r.value !== null) {
        imported++;
      } else {
        skipped++;
      }
      onProgress?.({ total, current: i + j + 1, currentFile: batch[j].name, imported, skipped });
    }
  }

  return { imported, skipped };
}
