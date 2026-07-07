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

const TEXT_IMPROVE_PROMPT = `You are a document text formatting assistant. Your task is to convert raw extracted text from a PDF into clean, well-structured markdown.

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

export async function improveText(rawText: string): Promise<string> {
  if (!rawText || rawText.length < 20) return rawText;
  const provider = await getAIProvider();
  const result = await provider.chat([
    { role: 'system', content: TEXT_IMPROVE_PROMPT },
    { role: 'user', content: `Convert this document text to markdown:\n\n${rawText}` },
  ]);
  return result.content?.trim() || rawText;
}

export async function testConnection(): Promise<boolean> {
  try {
    const provider = await getAIProvider();
    return provider.testConnection();
  } catch {
    return false;
  }
}
