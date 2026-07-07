import {
  db,
  type Document,
  type ActionItem,
  type AnalysisJob,
  type ChatMessage,
} from "./schema.ts";

export async function addDocument(doc: Document): Promise<string> {
  await db.documents.add({ ...doc, updatedAt: doc.updatedAt || new Date().toISOString() });
  return doc.id;
}

export async function updateDocument(
  id: string,
  changes: Partial<Document>,
): Promise<void> {
  await db.documents.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
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

export async function getDocumentsByCategory(
  category: string,
): Promise<Document[]> {
  return db.documents.where("category").equals(category).toArray();
}

export async function getDocumentsByYear(year: number): Promise<Document[]> {
  return db.documents.where("year").equals(year).toArray();
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
  await db.actionItems.add({ ...item, updatedAt: item.updatedAt || new Date().toISOString() });
  return item.id;
}

export async function updateActionItem(
  id: string,
  changes: Partial<ActionItem>,
): Promise<void> {
  await db.actionItems.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
  });
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
  await db.actionItems.update(id, {
    completed: true,
    completedAt: new Date().toISOString(),
  });
}

export async function getAnalyzableDocuments(): Promise<Document[]> {
  return db.documents.where("status").anyOf("pending", "error").toArray();
}

export async function getFailedDocuments(): Promise<Document[]> {
  return db.documents.where("status").equals("error").toArray();
}

export async function deleteDocument(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.pendingDeletions.add({ id: `doc-${id}`, tableName: 'documents', recordId: id, createdAt: now });

  // cascade: collect related record IDs before deleting
  const relatedItems = await db.actionItems.where('documentId').equals(id).toArray();
  const relatedJobs = await db.analysisJobs.where('documentId').equals(id).toArray();
  const relatedChat = await db.chatMessages.where('documentId').equals(id).toArray();

  for (const item of relatedItems) {
    await db.pendingDeletions.add({ id: `ai-${item.id}`, tableName: 'action_items', recordId: item.id, createdAt: now });
  }
  for (const job of relatedJobs) {
    await db.pendingDeletions.add({ id: `aj-${job.id}`, tableName: 'analysis_jobs', recordId: job.id, createdAt: now });
  }
  for (const msg of relatedChat) {
    await db.pendingDeletions.add({ id: `cm-${msg.id}`, tableName: 'chat_messages', recordId: msg.id, createdAt: now });
  }

  await db.documents.delete(id);
  await db.actionItems.where('documentId').equals(id).delete();
  await db.analysisJobs.where('documentId').equals(id).delete();
  await db.chatMessages.where('documentId').equals(id).delete();
}

export async function deleteAllDocuments(): Promise<number> {
  const all = await db.documents.toArray();
  const ids = all.map(d => d.id);
  const now = new Date().toISOString();

  for (const id of ids) {
    await db.pendingDeletions.add({ id: `doc-${id}`, tableName: 'documents', recordId: id, createdAt: now });
  }

  // cascade: record all related records as pending deletions
  const allItems = await db.actionItems.toArray();
  for (const item of allItems) {
    await db.pendingDeletions.add({ id: `ai-${item.id}`, tableName: 'action_items', recordId: item.id, createdAt: now });
  }
  const allJobs = await db.analysisJobs.toArray();
  for (const job of allJobs) {
    await db.pendingDeletions.add({ id: `aj-${job.id}`, tableName: 'analysis_jobs', recordId: job.id, createdAt: now });
  }
  const allChat = await db.chatMessages.toArray();
  for (const msg of allChat) {
    await db.pendingDeletions.add({ id: `cm-${msg.id}`, tableName: 'chat_messages', recordId: msg.id, createdAt: now });
  }

  await db.documents.clear();
  await db.actionItems.clear();
  await db.analysisJobs.clear();
  await db.chatMessages.clear();
  return ids.length;
}

export async function resetDocumentForAnalysis(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.documents.update(id, {
    summary: '',
    audience: '',
    urgency: 'medium',
    taxRelevant: false,
    category: '',
    year: new Date().getFullYear(),
    month: null,
    dateFrom: null,
    dateTo: null,
    suggestedFilename: null,
    tags: [],
    confidence: 0,
    status: 'pending',
    error: null,
    updatedAt: now,
  });
  await db.actionItems.where('documentId').equals(id).delete();
  await db.analysisJobs.where('documentId').equals(id).delete();
}

export async function addAnalysisJob(job: AnalysisJob): Promise<string> {
  await db.analysisJobs.add({ ...job, updatedAt: job.updatedAt || new Date().toISOString() });
  return job.id;
}

export async function updateAnalysisJob(
  id: string,
  changes: Partial<AnalysisJob>,
): Promise<void> {
  await db.analysisJobs.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
  });
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
  await db.chatMessages.add({ ...msg, updatedAt: msg.updatedAt || new Date().toISOString() });
  return msg.id;
}

export async function clearChatMessages(docId: string): Promise<void> {
  await db.chatMessages.where('documentId').equals(docId).delete();
}
