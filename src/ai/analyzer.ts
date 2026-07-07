import type { AnalysisResult, AIProvider, AnalyzeOptions, ChatMessage, ToolDefinition, ChatResult } from './types.ts';
import { createProvider } from './provider.ts';
import { getSettings } from '../db/config-store.ts';

let currentProvider: AIProvider | null = null;

export async function getAIProvider(): Promise<AIProvider> {
  if (currentProvider) return currentProvider;
  const settings = await getSettings();
  currentProvider = createProvider(settings.aiProvider);
  return currentProvider;
}

export function resetProvider(): void {
  currentProvider = null;
}

export async function analyzeDocument(text: string, options?: AnalyzeOptions): Promise<AnalysisResult> {
  const provider = await getAIProvider();
  return provider.analyzeDocument(text, options);
}

function buildSystemPrompt(chatPrompt: string, extractedText: string): string {
  return `${chatPrompt || 'You are a helpful assistant analyzing a document.'}

Document content:
${extractedText || '[No extractable text available]'}`;
}

export async function chatWithDocument(
  extractedText: string,
  messages: ChatMessage[],
  tools?: ToolDefinition[],
): Promise<ChatResult> {
  const provider = await getAIProvider();
  const settings = await getSettings();

  const chatMessages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(settings.chatPrompt, extractedText) },
    ...messages,
  ];

  return provider.chat(chatMessages, tools);
}

export async function testConnection(): Promise<boolean> {
  try {
    const provider = await getAIProvider();
    return provider.testConnection();
  } catch {
    return false;
  }
}
