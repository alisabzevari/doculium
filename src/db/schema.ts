import Dexie, { type Table } from 'dexie';

export interface Document {
  id: string;
  originalName: string;
  originalPath: string;
  storedPath: string | null;
  fileType: string;
  fileSize: number;
  fileHash: string;
  extractedText: string;
  summary: string;
  audience: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  taxRelevant: boolean;
  category: string;
  year: number | null;
  month: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  suggestedFilename: string | null;
  tags: string[];
  confidence: number;
  status: 'pending' | 'analyzing' | 'analyzed' | 'error';
  error: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  dropboxContentHash?: string;
}

export interface ActionItem {
  id: string;
  documentId: string;
  text: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  isBuiltIn: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisJob {
  id: string;
  documentId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  documentId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface PendingDeletion {
  id: string;
  tableName: string;
  recordId: string;
  createdAt: string;
}

export class DoculiumDB extends Dexie {
  documents!: Table<Document, string>;
  actionItems!: Table<ActionItem, string>;
  categories!: Table<Category, string>;
  analysisJobs!: Table<AnalysisJob, string>;
  chatMessages!: Table<ChatMessage, string>;
  pendingDeletions!: Table<PendingDeletion, string>;

  constructor() {
    super('doculium');

    this.version(4).stores({
      documents: 'id, fileHash, category, year, urgency, status, createdAt, originalName',
      actionItems: 'id, documentId, urgency, completed, createdAt',
      categories: 'id, name, isBuiltIn, order',
      analysisJobs: 'id, documentId, status, createdAt',
      chatMessages: 'id, documentId, createdAt',
      pendingDeletions: 'id, tableName, createdAt',
    }).upgrade(async tx => {
      const now = new Date().toISOString();
      await tx.table('actionItems').toCollection().modify(item => { item.updatedAt = now; });
      await tx.table('categories').toCollection().modify(item => { item.updatedAt = now; });
      await tx.table('analysisJobs').toCollection().modify(item => { item.updatedAt = now; });
      await tx.table('chatMessages').toCollection().modify(item => { item.updatedAt = now; });
    });
  }
}

export const db = new DoculiumDB();

export async function getDefaultCategories(): Promise<Category[]> {
  const now = new Date().toISOString();
  return [
    { id: 'cat-home', name: 'Home', icon: '🏠', color: 'primary', isBuiltIn: true, order: 0, createdAt: now, updatedAt: now },
    { id: 'cat-education', name: 'Education', icon: '🎓', color: 'secondary', isBuiltIn: true, order: 1, createdAt: now, updatedAt: now },
    { id: 'cat-car', name: 'Car', icon: '🚗', color: 'error', isBuiltIn: true, order: 2, createdAt: now, updatedAt: now },
    { id: 'cat-medical', name: 'Medical', icon: '🏥', color: 'success', isBuiltIn: true, order: 3, createdAt: now, updatedAt: now },
    { id: 'cat-misc', name: 'Misc', icon: '📋', color: 'ghost', isBuiltIn: true, order: 4, createdAt: now, updatedAt: now },
    { id: 'cat-work', name: 'Work', icon: '💼', color: 'warning', isBuiltIn: true, order: 5, createdAt: now, updatedAt: now },
  ];
}
