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
  year: number;
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
}

export interface ActionItem {
  id: string;
  documentId: string;
  text: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
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
}

export interface ChatMessage {
  id: string;
  documentId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export class DoculiumDB extends Dexie {
  documents!: Table<Document, string>;
  actionItems!: Table<ActionItem, string>;
  categories!: Table<Category, string>;
  analysisJobs!: Table<AnalysisJob, string>;
  chatMessages!: Table<ChatMessage, string>;

  constructor() {
    super('doculium');

    this.version(2).stores({
      documents: 'id, fileHash, category, year, urgency, status, createdAt, originalName',
      actionItems: 'id, documentId, urgency, completed, createdAt',
      categories: 'id, name, isBuiltIn, order',
      analysisJobs: 'id, documentId, status, createdAt',
      chatMessages: 'id, documentId, createdAt',
    });
  }
}

export const db = new DoculiumDB();

export async function getDefaultCategories(): Promise<Category[]> {
  return [
    { id: 'cat-home', name: 'Home', icon: '🏠', color: 'primary', isBuiltIn: true, order: 0, createdAt: new Date().toISOString() },
    { id: 'cat-education', name: 'Education', icon: '🎓', color: 'secondary', isBuiltIn: true, order: 1, createdAt: new Date().toISOString() },
    { id: 'cat-car', name: 'Car', icon: '🚗', color: 'error', isBuiltIn: true, order: 2, createdAt: new Date().toISOString() },
    { id: 'cat-medical', name: 'Medical', icon: '🏥', color: 'success', isBuiltIn: true, order: 3, createdAt: new Date().toISOString() },
    { id: 'cat-misc', name: 'Misc', icon: '📋', color: 'ghost', isBuiltIn: true, order: 4, createdAt: new Date().toISOString() },
    { id: 'cat-work', name: 'Work', icon: '💼', color: 'warning', isBuiltIn: true, order: 5, createdAt: new Date().toISOString() },
  ];
}
