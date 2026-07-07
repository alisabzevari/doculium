import { createClient } from '@libsql/client/web';
import { db, type Document, type ActionItem } from './schema.ts';

let client: ReturnType<typeof createClient> | null = null;
let lastError = '';

export function getLastError(): string {
  return lastError;
}

export async function initTurso(url: string, token: string): Promise<boolean> {
  lastError = '';
  if (!url || !token) {
    lastError = 'URL and token are required';
    return false;
  }
  try {
    client = createClient({ url, authToken: token });
    await client.execute('SELECT 1');
    return true;
  } catch (err: any) {
    client = null;
    lastError = err.message || String(err);
    return false;
  }
}

export async function syncDocuments(): Promise<{ pushed: number; pulled: number }> {
  lastError = '';
  if (!client) {
    lastError = 'Not connected. Click Test Connection first.';
    return { pushed: 0, pulled: 0 };
  }

  let pushed = 0;
  let pulled = 0;

  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, originalName TEXT, originalPath TEXT,
        storedPath TEXT, fileType TEXT, fileSize INTEGER, fileHash TEXT,
        summary TEXT, audience TEXT, urgency TEXT, taxRelevant INTEGER,
        category TEXT, year INTEGER, month INTEGER, dateFrom TEXT, dateTo TEXT,
        suggestedFilename TEXT, tags TEXT, confidence REAL,
        status TEXT, error TEXT, createdAt TEXT, updatedAt TEXT, syncedAt TEXT
      )
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS action_items (
        id TEXT PRIMARY KEY, documentId TEXT, text TEXT,
        urgency TEXT, completed INTEGER, completedAt TEXT,
        createdAt TEXT, dueDate TEXT
      )
    `);

    const localDocs = await db.documents
      .filter(d => !d.syncedAt || d.updatedAt > d.syncedAt)
      .toArray();

    for (const doc of localDocs) {
      const tags = JSON.stringify(doc.tags);
      await client.execute({
        sql: `INSERT OR REPLACE INTO documents
          (id, originalName, originalPath, storedPath, fileType, fileSize, fileHash,
           summary, audience, urgency, taxRelevant, category, year, month,
           dateFrom, dateTo, suggestedFilename, tags, confidence,
           status, error, createdAt, updatedAt, syncedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          doc.id, doc.originalName, doc.originalPath, doc.storedPath,
          doc.fileType, doc.fileSize, doc.fileHash, doc.summary, doc.audience,
          doc.urgency, doc.taxRelevant ? 1 : 0, doc.category, doc.year,
          doc.month, doc.dateFrom, doc.dateTo, doc.suggestedFilename,
          tags, doc.confidence, doc.status, doc.error,
          doc.createdAt, doc.updatedAt, new Date().toISOString(),
        ],
      });
      await db.documents.update(doc.id, { syncedAt: new Date().toISOString() });
      pushed++;
    }

    const localItems = await db.actionItems.toArray();

    for (const item of localItems) {
      await client.execute({
        sql: `INSERT OR REPLACE INTO action_items
          (id, documentId, text, urgency, completed, completedAt, createdAt, dueDate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          item.id, item.documentId, item.text, item.urgency,
          item.completed ? 1 : 0, item.completedAt, item.createdAt, item.dueDate,
        ],
      });
    }

    pulled = pushed;
  } catch (err: any) {
    lastError = err.message || String(err);
    return { pushed: 0, pulled: 0 };
  }

  return { pushed, pulled };
}
