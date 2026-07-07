import { db, getDefaultCategories } from './schema.ts';

export interface AIProviderConfig {
  type: 'openai-compatible' | 'anthropic' | 'gemini';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AppSettings {
  aiProvider: AIProviderConfig;
  analysisPrompt: string;
  searchPrompt: string;
  chatPrompt: string;
  tursoUrl: string;
  tursoToken: string;
  theme: string;
  categories: string[];
}

const STORAGE_KEY = 'doculium-settings';

const DEFAULT_ANALYSIS_PROMPT = `You are a document analysis assistant. Analyze the following document and return ONLY a JSON object (no markdown, no code fences) with these fields:
- summary: 2-3 sentence summary of what this document is about
- audience: who sent this / who is it addressed to
- urgency: "low", "medium", "high", or "critical"
- actionItems: array of suggested action strings
- taxRelevant: boolean indicating if important for tax purposes
- category: must be one of the valid categories. never invent a new category
- year: 4-digit year this document relates to
- month: 1-12 month number if applicable, or null
- suggestedFilename: a clean descriptive filename with extension
- dateFrom: ISO date string for effective date, or null
- dateTo: ISO date string if it covers a range, or null
- tags: array of relevant keyword strings

Valid categories:`;

const DEFAULT_SEARCH_PROMPT = `Given the user's search query and the following document summaries, return only the IDs of the most relevant documents as a JSON array of strings. Do not include any other text or formatting.`;

const DEFAULT_CHAT_PROMPT = `You are a helpful assistant analyzing a document. Answer questions based on the document content. If the answer is not in the document, say so.`;

function envDefaults(): Partial<AppSettings> {
  if (!import.meta.env.DEV) return {};
  const env = import.meta.env as Record<string, string>;
  return {
    aiProvider: {
      type: (env.VITE_DOCULIUM_AI_TYPE as any) || 'openai-compatible',
      baseUrl: env.VITE_DOCULIUM_BASE_URL || 'https://api.openai.com',
      apiKey: env.VITE_DOCULIUM_API_KEY || '',
      model: env.VITE_DOCULIUM_MODEL || 'gpt-4o',
    },
    analysisPrompt: env.VITE_DOCULIUM_ANALYSIS_PROMPT || DEFAULT_ANALYSIS_PROMPT,
    searchPrompt: env.VITE_DOCULIUM_SEARCH_PROMPT || DEFAULT_SEARCH_PROMPT,
    chatPrompt: env.VITE_DOCULIUM_CHAT_PROMPT || DEFAULT_CHAT_PROMPT,
    tursoUrl: env.VITE_DOCULIUM_TURSO_URL || '',
    tursoToken: env.VITE_DOCULIUM_TURSO_TOKEN || '',
    theme: env.VITE_DOCULIUM_THEME || 'cupcake',
  };
}

const DEFAULTS: AppSettings = {
  aiProvider: {
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    model: 'gpt-4o',
  },
  analysisPrompt: DEFAULT_ANALYSIS_PROMPT,
  searchPrompt: DEFAULT_SEARCH_PROMPT,
  chatPrompt: DEFAULT_CHAT_PROMPT,
  tursoUrl: '',
  tursoToken: '',
  theme: 'cupcake',
  categories: ['Home', 'Education', 'Car', 'Medical', 'Misc', 'Work'],
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULTS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULTS, ...envDefaults() };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export async function seedCategories(): Promise<void> {
  const count = await db.categories.count();
  if (count === 0) {
    const cats = await getDefaultCategories();
    await db.categories.bulkAdd(cats);
  }
}
