import {
  db,
  type Document,
  type ActionItem,
  type AnalysisJob,
  type ChatMessage,
} from "./schema.ts";

export async function addDocument(doc: Document): Promise<string> {
  await db.documents.add(doc);
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
  await db.actionItems.add(item);
  return item.id;
}

export async function updateActionItem(
  id: string,
  changes: Partial<ActionItem>,
): Promise<void> {
  await db.actionItems.update(id, changes);
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
  await db.documents.delete(id);
  await db.actionItems.where("documentId").equals(id).delete();
  await db.analysisJobs.where("documentId").equals(id).delete();
}

export async function addAnalysisJob(job: AnalysisJob): Promise<string> {
  await db.analysisJobs.add(job);
  return job.id;
}

export async function updateAnalysisJob(
  id: string,
  changes: Partial<AnalysisJob>,
): Promise<void> {
  await db.analysisJobs.update(id, changes);
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
  await db.chatMessages.add(msg);
  return msg.id;
}

export async function clearChatMessages(docId: string): Promise<void> {
  await db.chatMessages.where('documentId').equals(docId).delete();
}
