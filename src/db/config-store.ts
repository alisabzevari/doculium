import { db, getDefaultCategories } from './schema.ts';

export interface AIProviderConfig {
  type: 'openai-compatible' | 'local';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AppSettings {
  aiProvider: AIProviderConfig;
  analysisPrompt: string;
  searchPrompt: string;
  chatPrompt: string;
  improvePrompt: string;
  tursoUrl: string;
  tursoToken: string;
  theme: string;
  categories: string[];
}

const STORAGE_KEY = 'doculium-settings';

const DEFAULT_ANALYSIS_PROMPT = `You are a document analysis assistant. Analyze the document text below and return ONLY a valid JSON object with EXACTLY this structure (no markdown, no code fences, no extra text):

{
  "summary": "2-3 sentence summary of what this document is about",
  "audience": "who sent this / who is it addressed to",
  "urgency": "low",
  "actionItems": ["action item 1", "action item 2"],
  "taxRelevant": false,
  "category": "Misc",
  "year": 2026,
  "month": null,
  "suggestedFilename": "descriptive-filename.pdf",
  "dateFrom": null,
  "dateTo": null,
  "tags": ["keyword1", "keyword2"]
}

Rules:
- urgency must be one of: "low", "medium", "high", "critical"
- category must be one of the valid categories listed below. Never invent a new category.
- year is the 4-digit year this document relates to
- month is 1-12 or null
- dateFrom and dateTo are ISO date strings (e.g. "2026-01-15") or null
- suggestedFilename should be a clean descriptive filename with extension
- taxRelevant is boolean
- actionItems and tags are arrays of strings

Important conventions:
- Any document from DSL bank including its bank statements should go to Home category.

Valid categories:`;

const DEFAULT_SEARCH_PROMPT = `Given the user's search query and the following document summaries, return only the IDs of the most relevant documents as a JSON array of strings. Do not include any other text or formatting.`;

const DEFAULT_CHAT_PROMPT = `You are a helpful assistant analyzing a document. Answer questions based on the document content. If the answer is not in the document, say so.`;

const DEFAULT_IMPROVE_PROMPT = `You are a document text formatting assistant. Your task is to convert raw extracted text from a PDF into clean, well-structured markdown.

Rules:
- Convert headings, paragraphs, lists, and tables into proper markdown syntax.
- Do NOT add any commentary, metadata, or notes outside the markdown content.
- Keep all original text content — do not summarize or omit anything.
- Preserve the reading order and structure of the original document.
- Use ## and ### for section headings based on the document's hierarchy.
- Format lists with - or 1. as appropriate.
- Format tables with | column | syntax.
- Use **bold** where the original has strong emphasis.
- Ignore headers, footers, page numbers, and repetitive watermarks.`;

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
    improvePrompt: env.VITE_DOCULIUM_IMPROVE_PROMPT || DEFAULT_IMPROVE_PROMPT,
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
  improvePrompt: DEFAULT_IMPROVE_PROMPT,
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
