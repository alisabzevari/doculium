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
  type: 'openai-compatible' | 'local';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AnalyzeOptions {
  prompt?: string;
  validCategories?: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatResult {
  content: string | null;
  toolCalls?: ToolCall[];
}

export interface AIProvider {
  readonly name: string;
  analyzeDocument(text: string, options?: AnalyzeOptions): Promise<AnalysisResult>;
  chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ChatResult>;
  testConnection(): Promise<boolean>;
}
