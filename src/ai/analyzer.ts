import type { AnalysisResult, AIProvider, AnalyzeOptions, ChatMessage } from './types.ts';
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

export async function chatWithDocument(
  extractedText: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  const provider = await getAIProvider();
  const settings = await getSettings();

  const systemPrompt = `${settings.chatPrompt || 'You are a helpful assistant analyzing a document.'}

Document content:
${extractedText || '[No extractable text available]'}`;

  const chatMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  return provider.chat(chatMessages);
}

export async function testConnection(): Promise<boolean> {
  try {
    const provider = await getAIProvider();
    return provider.testConnection();
  } catch {
    return false;
  }
}
