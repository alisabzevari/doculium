import {
  db,
  type Document,
  type ActionItem,
  type AnalysisJob,
  type ChatMessage,
} from "./schema.ts";
import { getClient } from './turso-sync.ts';

function requireOnline(): void {
  if (!getClient()) {
    throw new Error('Cannot write while offline. Connect to the internet and try again.');
  }
}

async function tursoInsert(sql: string, args: any[]): Promise<void> {
  const client = getClient();
  if (!client) throw new Error('Cannot write while offline.');
  await client.execute({ sql, args });
}

async function tursoDelete(table: string, id: string): Promise<void> {
  const client = getClient();
  if (!client) throw new Error('Cannot write while offline.');
  await client.execute({ sql: `DELETE FROM ${table} WHERE id = ?`, args: [id] });
}

async function upsertDocumentOnTurso(doc: Document): Promise<void> {
  const tags = JSON.stringify(doc.tags || []);
  await tursoInsert(
    `INSERT OR REPLACE INTO documents (id, originalName, originalPath, storedPath, fileType, fileSize, fileHash, extractedText, summary, audience, urgency, taxRelevant, category, year, month, dateFrom, dateTo, suggestedFilename, tags, confidence, status, error, createdAt, updatedAt, syncedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [doc.id, doc.originalName, doc.originalPath, doc.storedPath, doc.fileType, doc.fileSize, doc.fileHash, doc.extractedText, doc.summary, doc.audience, doc.urgency, doc.taxRelevant ? 1 : 0, doc.category, doc.year, doc.month, doc.dateFrom, doc.dateTo, doc.suggestedFilename, tags, doc.confidence, doc.status, doc.error, doc.createdAt, doc.updatedAt, doc.syncedAt],
  );
}

async function upsertActionItemOnTurso(item: ActionItem): Promise<void> {
  await tursoInsert(
    `INSERT OR REPLACE INTO action_items (id, documentId, text, urgency, completed, completedAt, createdAt, updatedAt, dueDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [item.id, item.documentId, item.text, item.urgency, item.completed ? 1 : 0, item.completedAt, item.createdAt, item.updatedAt, item.dueDate],
  );
}

async function upsertAnalysisJobOnTurso(job: AnalysisJob): Promise<void> {
  await tursoInsert(
    `INSERT OR REPLACE INTO analysis_jobs (id, documentId, status, provider, model, promptTokens, completionTokens, error, startedAt, completedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [job.id, job.documentId, job.status, job.provider, job.model, job.promptTokens, job.completionTokens, job.error, job.startedAt, job.completedAt, job.createdAt, job.updatedAt],
  );
}

async function upsertChatMessageOnTurso(msg: ChatMessage): Promise<void> {
  await tursoInsert(
    `INSERT OR REPLACE INTO chat_messages (id, documentId, role, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
    [msg.id, msg.documentId, msg.role, msg.content, msg.createdAt, msg.updatedAt],
  );
}

export async function addDocument(doc: Document): Promise<string> {
  const now = new Date().toISOString();
  const full = { ...doc, updatedAt: doc.updatedAt || now };
  requireOnline();
  await upsertDocumentOnTurso(full);
  await db.documents.add(full);
  return doc.id;
}

export async function updateDocument(
  id: string,
  changes: Partial<Document>,
): Promise<void> {
  const now = new Date().toISOString();
  requireOnline();
  const existing = await db.documents.get(id);
  if (existing) {
    const merged: Document = { ...existing, ...changes, updatedAt: now };
    await upsertDocumentOnTurso(merged);
  }
  await db.documents.update(id, {
    ...changes,
    updatedAt: now,
  });
}

export async function getDocument(id: string): Promise<Document | undefined> {
  return db.documents.get(id);
}

export async function getAllDocuments(): Promise<Document[]> {
  return db.documents.orderBy("createdAt").reverse().toArray();
}

export async function findDocumentByHash(
  hash: string,
): Promise<Document | undefined> {
  return db.documents.where("fileHash").equals(hash).first();
}

export async function findDocumentByDropboxHash(
  hash: string,
): Promise<Document | undefined> {
  return db.documents.filter(d => d.dropboxContentHash === hash).first();
}

export async function getDocumentsByCategory(
  category: string,
): Promise<Document[]> {
  return db.documents.where("category").equals(category).toArray();
}

export async function getDocumentsByYear(year: number): Promise<Document[]> {
  return db.documents.where("year").equals(year).toArray();
}

export async function getRecentDocuments(limit: number = 6): Promise<Document[]> {
  return db.documents.orderBy("createdAt").reverse().limit(limit).toArray();
}

export async function getYearCounts(): Promise<{ year: number | null; count: number }[]> {
  const keys = (await db.documents.orderBy('year').keys()) as (number | null)[];
  const map = new Map<number | null, number>();
  for (const key of keys) {
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].map(([year, count]) => ({ year, count }));
}

export async function getCategoryNames(): Promise<string[]> {
  const keys = (await db.documents.orderBy('category').keys()) as string[];
  return [...new Set(keys.filter(Boolean))];
}

export async function getCategoryCountsForYear(year: number | null): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const collection = year === null
    ? db.documents.filter(d => d.year === null)
    : db.documents.where('year').equals(year);
  await collection.each(d => {
    if (d.category) counts[d.category] = (counts[d.category] || 0) + 1;
  });
  return counts;
}

export async function searchDocuments(query: string): Promise<Document[]> {
  const docs = await db.documents.toArray();
  const lower = query.toLowerCase();
  return docs.filter(
    (d) =>
      d.originalName.toLowerCase().includes(lower) ||
      d.summary.toLowerCase().includes(lower) ||
      d.audience.toLowerCase().includes(lower) ||
      d.tags.some((t) => t.toLowerCase().includes(lower)) ||
      d.extractedText.toLowerCase().includes(lower),
  );
}

export async function addActionItem(item: ActionItem): Promise<string> {
  const now = new Date().toISOString();
  const full = { ...item, updatedAt: item.updatedAt || now };
  requireOnline();
  await upsertActionItemOnTurso(full);
  await db.actionItems.add(full);
  return item.id;
}

export async function updateActionItem(
  id: string,
  changes: Partial<ActionItem>,
): Promise<void> {
  const now = new Date().toISOString();
  requireOnline();
  const existing = await db.actionItems.get(id);
  if (existing) {
    const merged: ActionItem = { ...existing, ...changes, updatedAt: now };
    await upsertActionItemOnTurso(merged);
  }
  await db.actionItems.update(id, { ...changes, updatedAt: now });
}

export async function getActionItemsByDocument(
  docId: string,
): Promise<ActionItem[]> {
  return db.actionItems.where("documentId").equals(docId).toArray();
}

export async function getPendingActionItems(): Promise<ActionItem[]> {
  const items = await db.actionItems.where("completed").equals(0).toArray();
  return items.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.urgency] - order[b.urgency];
  });
}

export async function markActionItemDone(id: string): Promise<void> {
  const now = new Date().toISOString();
  requireOnline();
  const existing = await db.actionItems.get(id);
  if (existing) {
    const merged: ActionItem = { ...existing, completed: true, completedAt: now, updatedAt: now };
    await upsertActionItemOnTurso(merged);
  }
  await db.actionItems.update(id, { completed: true, completedAt: now });
}

export async function getAnalyzableDocuments(): Promise<Document[]> {
  return db.documents.where("status").anyOf("pending", "error").toArray();
}

export async function getFailedDocuments(): Promise<Document[]> {
  return db.documents.where("status").equals("error").toArray();
}

export async function deleteDocument(id: string): Promise<void> {
  requireOnline();
  const relatedItems = await db.actionItems.where('documentId').equals(id).toArray();
  const relatedJobs = await db.analysisJobs.where('documentId').equals(id).toArray();
  const relatedChat = await db.chatMessages.where('documentId').equals(id).toArray();

  await tursoDelete('documents', id);
  for (const item of relatedItems) await tursoDelete('action_items', item.id);
  for (const job of relatedJobs) await tursoDelete('analysis_jobs', job.id);
  for (const msg of relatedChat) await tursoDelete('chat_messages', msg.id);

  await db.documents.delete(id);
  await db.actionItems.where('documentId').equals(id).delete();
  await db.analysisJobs.where('documentId').equals(id).delete();
  await db.chatMessages.where('documentId').equals(id).delete();
}

export async function deleteAllDocuments(): Promise<number> {
  requireOnline();
  const all = await db.documents.toArray();
  const ids = all.map(d => d.id);

  for (const doc of all) await tursoDelete('documents', doc.id);
  const allItems = await db.actionItems.toArray();
  for (const item of allItems) await tursoDelete('action_items', item.id);
  const allJobs = await db.analysisJobs.toArray();
  for (const job of allJobs) await tursoDelete('analysis_jobs', job.id);
  const allChat = await db.chatMessages.toArray();
  for (const msg of allChat) await tursoDelete('chat_messages', msg.id);

  await db.documents.clear();
  await db.actionItems.clear();
  await db.analysisJobs.clear();
  await db.chatMessages.clear();
  return ids.length;
}

export async function resetDocumentForAnalysis(id: string): Promise<void> {
  requireOnline();
  const existing = await db.documents.get(id);
  if (!existing) return;
  const now = new Date().toISOString();
  const merged: Document = {
    ...existing,
    summary: '', audience: '', urgency: 'medium', taxRelevant: false,
    category: '', year: null, month: null, dateFrom: null, dateTo: null,
    suggestedFilename: null, tags: [], confidence: 0, status: 'pending',
    error: null, updatedAt: now,
  };
  await upsertDocumentOnTurso(merged);
  const relatedItems = await db.actionItems.where('documentId').equals(id).toArray();
  const relatedJobs = await db.analysisJobs.where('documentId').equals(id).toArray();
  for (const item of relatedItems) await tursoDelete('action_items', item.id);
  for (const job of relatedJobs) await tursoDelete('analysis_jobs', job.id);
  await db.actionItems.where('documentId').equals(id).delete();
  await db.analysisJobs.where('documentId').equals(id).delete();
  await db.documents.put(merged);
}

export async function addAnalysisJob(job: AnalysisJob): Promise<string> {
  const now = new Date().toISOString();
  const full = { ...job, updatedAt: job.updatedAt || now };
  requireOnline();
  await upsertAnalysisJobOnTurso(full);
  await db.analysisJobs.add(full);
  return job.id;
}

export async function updateAnalysisJob(
  id: string,
  changes: Partial<AnalysisJob>,
): Promise<void> {
  const now = new Date().toISOString();
  requireOnline();
  const existing = await db.analysisJobs.get(id);
  if (existing) {
    const merged: AnalysisJob = { ...existing, ...changes, updatedAt: now };
    await upsertAnalysisJobOnTurso(merged);
  }
  await db.analysisJobs.update(id, { ...changes, updatedAt: now });
}

export async function getPendingAnalysisJobs(): Promise<AnalysisJob[]> {
  return db.analysisJobs.where("status").equals("queued").toArray();
}

export async function getStats() {
  const docs = await db.documents.count();
  const analyzed = await db.documents
    .where("status")
    .equals("analyzed")
    .count();
  const pending = await db.documents
    .where("status")
    .anyOf("pending", "error")
    .count();
  const urgent = await db.actionItems.where("completed").equals(0).count();
  return { docs, analyzed, pending, urgent };
}

export async function getChatMessages(docId: string): Promise<ChatMessage[]> {
  return db.chatMessages
    .where('documentId')
    .equals(docId)
    .sortBy('createdAt');
}

export async function addChatMessage(msg: ChatMessage): Promise<string> {
  const now = new Date().toISOString();
  const full = { ...msg, updatedAt: msg.updatedAt || now };
  requireOnline();
  await upsertChatMessageOnTurso(full);
  await db.chatMessages.add(full);
  return msg.id;
}

export async function clearChatMessages(docId: string): Promise<void> {
  requireOnline();
  const messages = await db.chatMessages.where('documentId').equals(docId).toArray();
  for (const msg of messages) await tursoDelete('chat_messages', msg.id);
  await db.chatMessages.where('documentId').equals(docId).delete();
}
