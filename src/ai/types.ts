export interface AnalysisResult {
  summary: string;
  audience: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  actionItems: string[];
  taxRelevant: boolean;
  category: string;
  year: number;
  month: number | null;
  suggestedFilename: string;
  dateFrom: string | null;
  dateTo: string | null;
  tags: string[];
}

export interface AIProviderConfig {
  type: 'openai-compatible' | 'anthropic' | 'gemini';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AnalyzeOptions {
  prompt?: string;
  validCategories?: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIProvider {
  readonly name: string;
  analyzeDocument(text: string, options?: AnalyzeOptions): Promise<AnalysisResult>;
  chat(messages: ChatMessage[]): Promise<string>;
  testConnection(): Promise<boolean>;
}
