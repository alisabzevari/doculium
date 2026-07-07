import type { AIProvider, AnalysisResult, AIProviderConfig, AnalyzeOptions, ChatMessage } from './types.ts';

export class GeminiProvider implements AIProvider {
  readonly name: string;

  private constructor(
    private config: AIProviderConfig,
  ) {
    this.name = `gemini:${config.model}`;
  }

  static create(config: AIProviderConfig): GeminiProvider {
    return new GeminiProvider(config);
  }

  async analyzeDocument(text: string, options?: AnalyzeOptions): Promise<AnalysisResult> {
    const prompt = buildPrompt(options?.prompt || '', options?.validCategories);

    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/v1beta/models/${this.config.model}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.config.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: prompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: `Document text:\n\n${text}` }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2000,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('No content in response');

    return this.parseResponse(content);
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');

    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/v1beta/models/${this.config.model}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.config.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
        contents: nonSystem.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('No content in response');
    return content;
  }

  async testConnection(): Promise<boolean> {
    try {
      const baseUrl = this.config.baseUrl.replace(/\/$/, '');
      const url = `${baseUrl}/v1beta/models?key=${this.config.apiKey}`;
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }

  private parseResponse(raw: string): AnalysisResult {
    const cleaned = raw.replace(/```(?:json)?\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      summary: String(parsed.summary ?? ''),
      audience: String(parsed.audience ?? ''),
      urgency: (['low', 'medium', 'high', 'critical'].includes(parsed.urgency) ? parsed.urgency : 'medium') as AnalysisResult['urgency'],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.map(String) : [],
      taxRelevant: Boolean(parsed.taxRelevant),
      category: String(parsed.category ?? 'Misc'),
      year: Number(parsed.year) || new Date().getFullYear(),
      month: parsed.month != null ? Number(parsed.month) : null,
      suggestedFilename: String(parsed.suggestedFilename ?? ''),
      dateFrom: parsed.dateFrom ? String(parsed.dateFrom) : null,
      dateTo: parsed.dateTo ? String(parsed.dateTo) : null,
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    };
  }
}

function buildPrompt(base: string, validCategories?: string[]): string {
  if (!validCategories || validCategories.length === 0) return base;
  return `${base}\n\nValid categories: ${validCategories.join(', ')}`;
}
