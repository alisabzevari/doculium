import { createClient } from '@libsql/client/web';
import { db, type Document, type ActionItem, type Category, type AnalysisJob, type ChatMessage } from './schema.ts';
import type { Table } from 'dexie';

let client: ReturnType<typeof createClient> | null = null;
let lastError = '';

const SYNC_TIME_KEY = 'doculium_last_sync_at';

function getLastSyncAt(): string {
  try {
    return globalThis.localStorage?.getItem(SYNC_TIME_KEY) || new Date(0).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

function setLastSyncAt(ts: string) {
  try {
    globalThis.localStorage?.setItem(SYNC_TIME_KEY, ts);
  } catch { /* ignore */ }
}

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

async function ensureTables() {
  if (!client) return;

  // create all tables first
  await client.execute(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, originalName TEXT, originalPath TEXT,
      storedPath TEXT, fileType TEXT, fileSize INTEGER, fileHash TEXT,
      extractedText TEXT, summary TEXT, audience TEXT, urgency TEXT,
      taxRelevant INTEGER, category TEXT, year INTEGER, month INTEGER,
      dateFrom TEXT, dateTo TEXT, suggestedFilename TEXT, tags TEXT,
      confidence REAL, status TEXT, error TEXT, createdAt TEXT,
      updatedAt TEXT, syncedAt TEXT
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS action_items (
      id TEXT PRIMARY KEY, documentId TEXT, text TEXT,
      urgency TEXT, completed INTEGER, completedAt TEXT,
      createdAt TEXT, updatedAt TEXT, dueDate TEXT
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY, name TEXT, icon TEXT, color TEXT,
      isBuiltIn INTEGER, "order" INTEGER, createdAt TEXT, updatedAt TEXT
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS analysis_jobs (
      id TEXT PRIMARY KEY, documentId TEXT, status TEXT,
      provider TEXT, model TEXT, promptTokens INTEGER,
      completionTokens INTEGER, error TEXT,
      startedAt TEXT, completedAt TEXT, createdAt TEXT, updatedAt TEXT
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY, documentId TEXT, role TEXT,
      content TEXT, createdAt TEXT, updatedAt TEXT
    )
  `);

  // migrate existing tables that may lack newer columns
  for (const stmt of [
    `ALTER TABLE documents ADD COLUMN extractedText TEXT`,
    `ALTER TABLE action_items ADD COLUMN updatedAt TEXT`,
    `ALTER TABLE categories ADD COLUMN updatedAt TEXT`,
    `ALTER TABLE analysis_jobs ADD COLUMN updatedAt TEXT`,
    `ALTER TABLE chat_messages ADD COLUMN updatedAt TEXT`,
  ]) {
    try { await client!.execute(stmt); } catch { /* column already exists */ }
  }
}

export async function syncDocuments(
  onProgress?: (p: { phase: string; current: number; total: number }) => void,
): Promise<{ pushed: number; pulled: number; deleted: number }> {
  lastError = '';
  if (!client) {
    lastError = 'Not connected. Click Test Connection first.';
    return { pushed: 0, pulled: 0, deleted: 0 };
  }

  let pushed = 0;
  let pulled = 0;
  let deleted = 0;
  const syncStartedAt = new Date().toISOString();
  const lastSyncAt = getLastSyncAt();
  const BATCH_SIZE = 25;

  function progress(phase: string, current: number, total: number) {
    onProgress?.({ phase, current, total });
  }

  async function executeBatch(stmts: { sql: string; args: any[] }[]) {
    if (stmts.length === 0) return;
    for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
      await client!.batch(stmts.slice(i, i + BATCH_SIZE));
    }
  }

  try {
    await ensureTables();

    // ── PROCESS PENDING DELETIONS ──
    const pendingDeletions = await db.pendingDeletions.toArray();
    if (pendingDeletions.length > 0) {
      const tableMap: Record<string, string> = {
        documents: 'documents',
        action_items: 'action_items',
        categories: 'categories',
        analysis_jobs: 'analysis_jobs',
        chat_messages: 'chat_messages',
      };
      const delStmts = pendingDeletions
        .filter(pd => tableMap[pd.tableName])
        .map(pd => ({ sql: `DELETE FROM ${tableMap[pd.tableName]} WHERE id = ?`, args: [pd.recordId] }));
      try {
        await executeBatch(delStmts);
        deleted = delStmts.length;
      } catch { /* ignore */ }
      await db.pendingDeletions.clear();
    }

    // ── PUSH: local → remote ──
    const pushTotal = await db.documents.count() * 2; // rough upper bound

    const dirtyDocs = await db.documents
      .filter(d => !d.syncedAt || d.updatedAt > d.syncedAt)
      .toArray();

    if (dirtyDocs.length > 0) {
      const docStmts = dirtyDocs.map(doc => {
        const tags = JSON.stringify(doc.tags);
        return {
          sql: `INSERT OR REPLACE INTO documents
            (id, originalName, originalPath, storedPath, fileType, fileSize, fileHash,
             extractedText, summary, audience, urgency, taxRelevant, category, year,
             month, dateFrom, dateTo, suggestedFilename, tags, confidence,
             status, error, createdAt, updatedAt, syncedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [doc.id, doc.originalName, doc.originalPath, doc.storedPath,
            doc.fileType, doc.fileSize, doc.fileHash, doc.extractedText,
            doc.summary, doc.audience, doc.urgency, doc.taxRelevant ? 1 : 0,
            doc.category, doc.year, doc.month, doc.dateFrom, doc.dateTo,
            doc.suggestedFilename, tags, doc.confidence, doc.status, doc.error,
            doc.createdAt, doc.updatedAt, syncStartedAt],
        };
      });
      progress('Push', 0, pushTotal);
      await executeBatch(docStmts);
      const ids = dirtyDocs.map(d => d.id);
      await db.documents.where('id').anyOf(ids).modify({ syncedAt: syncStartedAt });
      pushed += dirtyDocs.length;
    }

    async function pushTable<T extends { id: string; updatedAt: string }>(
      table: Table<T, string>,
      sql: string,
      argsFn: (row: T) => any[],
    ) {
      const dirty = await table.filter(r => r.updatedAt > lastSyncAt).toArray();
      if (dirty.length === 0) return;
      const stmts = dirty.map(row => ({ sql, args: argsFn(row) }));
      await executeBatch(stmts);
      pushed += dirty.length;
    }

    await pushTable(db.actionItems,
      `INSERT OR REPLACE INTO action_items (id, documentId, text, urgency, completed, completedAt, createdAt, updatedAt, dueDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      (item: ActionItem) => [item.id, item.documentId, item.text, item.urgency, item.completed ? 1 : 0, item.completedAt, item.createdAt, item.updatedAt, item.dueDate],
    );

    await pushTable(db.categories,
      `INSERT OR REPLACE INTO categories (id, name, icon, color, isBuiltIn, "order", createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      (cat: Category) => [cat.id, cat.name, cat.icon, cat.color, cat.isBuiltIn ? 1 : 0, cat.order, cat.createdAt, cat.updatedAt],
    );

    await pushTable(db.analysisJobs,
      `INSERT OR REPLACE INTO analysis_jobs (id, documentId, status, provider, model, promptTokens, completionTokens, error, startedAt, completedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      (job: AnalysisJob) => [job.id, job.documentId, job.status, job.provider, job.model, job.promptTokens, job.completionTokens, job.error, job.startedAt, job.completedAt, job.createdAt, job.updatedAt],
    );

    await pushTable(db.chatMessages,
      `INSERT OR REPLACE INTO chat_messages (id, documentId, role, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
      (msg: ChatMessage) => [msg.id, msg.documentId, msg.role, msg.content, msg.createdAt, msg.updatedAt],
    );

    // ── PULL: remote → local ──

    async function pullTable<T extends { id: string; updatedAt: string }>(
      table: Table<T, string>,
      sql: string,
      mapFn: (row: Record<string, unknown>) => T,
      label: string,
    ) {
      const result = await client!.execute({ sql, args: [lastSyncAt] });
      if (result.rows.length === 0) return;
      progress(`Pull ${label}`, 0, result.rows.length);
      const rows = result.rows as unknown as Record<string, unknown>[];
      const toPut: T[] = [];
      for (const r of rows) {
        const id = r.id as string;
        const remoteUpdated = (r.updatedAt as string) || '';
        const existing = await table.get(id);
        if (!existing || remoteUpdated > existing.updatedAt) {
          toPut.push(mapFn(r));
        }
      }
      if (toPut.length > 0) {
        await table.bulkPut(toPut);
        pulled += toPut.length;
      }
    }

    await pullTable(db.documents,
      `SELECT * FROM documents WHERE updatedAt > ?`,
      (row): Document => {
        let tags: string[] = [];
        try { tags = JSON.parse(row.tags as string || '[]'); } catch { /* ignore */ }
        return {
          id: row.id as string, originalName: row.originalName as string || '',
          originalPath: row.originalPath as string || '',
          storedPath: row.storedPath as string || null,
          fileType: row.fileType as string || '',
          fileSize: (row.fileSize as number) || 0,
          fileHash: row.fileHash as string || '',
          extractedText: (row.extractedText as string) || '',
          summary: row.summary as string || '',
          audience: row.audience as string || '',
          urgency: (row.urgency as Document['urgency']) || 'medium',
          taxRelevant: (row.taxRelevant as number) === 1,
          category: row.category as string || '',
          year: (row.year as number) || null,
          month: row.month as number | null || null,
          dateFrom: row.dateFrom as string | null || null,
          dateTo: row.dateTo as string | null || null,
          suggestedFilename: row.suggestedFilename as string | null || null,
          tags, confidence: (row.confidence as number) || 0,
          status: (row.status as Document['status']) || 'pending',
          error: row.error as string | null || null,
          createdAt: row.createdAt as string || syncStartedAt,
          updatedAt: row.updatedAt as string || syncStartedAt,
          syncedAt: syncStartedAt,
        };
      }, 'documents',
    );

    await pullTable(db.actionItems,
      `SELECT * FROM action_items WHERE updatedAt > ?`,
      (row): ActionItem => ({
        id: row.id as string, documentId: row.documentId as string || '',
        text: row.text as string || '',
        urgency: (row.urgency as ActionItem['urgency']) || 'medium',
        completed: (row.completed as number) === 1,
        completedAt: row.completedAt as string | null || null,
        createdAt: row.createdAt as string || syncStartedAt,
        updatedAt: row.updatedAt as string || syncStartedAt,
        dueDate: row.dueDate as string | null || null,
      }), 'action items',
    );

    await pullTable(db.categories,
      `SELECT * FROM categories WHERE updatedAt > ?`,
      (row): Category => ({
        id: row.id as string, name: row.name as string || '',
        icon: row.icon as string || '📄',
        color: row.color as string || 'ghost',
        isBuiltIn: (row.isBuiltIn as number) === 1,
        order: (row.order as number) || 0,
        createdAt: row.createdAt as string || syncStartedAt,
        updatedAt: row.updatedAt as string || syncStartedAt,
      }), 'categories',
    );

    await pullTable(db.analysisJobs,
      `SELECT * FROM analysis_jobs WHERE updatedAt > ?`,
      (row): AnalysisJob => ({
        id: row.id as string, documentId: row.documentId as string || '',
        status: (row.status as AnalysisJob['status']) || 'queued',
        provider: row.provider as string || '',
        model: row.model as string || '',
        promptTokens: (row.promptTokens as number) || 0,
        completionTokens: (row.completionTokens as number) || 0,
        error: row.error as string | null || null,
        startedAt: row.startedAt as string | null || null,
        completedAt: row.completedAt as string | null || null,
        createdAt: row.createdAt as string || syncStartedAt,
        updatedAt: row.updatedAt as string || syncStartedAt,
      }), 'analysis jobs',
    );

    await pullTable(db.chatMessages,
      `SELECT * FROM chat_messages WHERE updatedAt > ?`,
      (row): ChatMessage => ({
        id: row.id as string, documentId: row.documentId as string || '',
        role: (row.role as ChatMessage['role']) || 'user',
        content: row.content as string || '',
        createdAt: row.createdAt as string || syncStartedAt,
        updatedAt: row.updatedAt as string || syncStartedAt,
      }), 'chat messages',
    );

    setLastSyncAt(syncStartedAt);
  } catch (err: any) {
    lastError = err.message || String(err);
    return { pushed, pulled, deleted: 0 };
  }

  return { pushed, pulled, deleted };
}
