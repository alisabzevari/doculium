import type { AIProvider, AnalysisResult, AIProviderConfig, AnalyzeOptions, ChatMessage } from './types.ts';

export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;

  private constructor(
    private config: AIProviderConfig,
  ) {
    this.name = `${config.type}:${config.model}`;
  }

  static create(config: AIProviderConfig): OpenAICompatibleProvider {
    return new OpenAICompatibleProvider(config);
  }

  async analyzeDocument(text: string, options?: AnalyzeOptions): Promise<AnalysisResult> {
    const prompt = buildPrompt(options?.prompt || '', options?.validCategories);

    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `Document text:\n\n${text}` },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No content in response');

    return this.parseResponse(content);
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No content in response');
    return content;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/v1/models`, {
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private parseResponse(raw: string): AnalysisResult {
    const cleaned = raw.replace(/```(?:json)?\s*/g, '').trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          throw new Error(`AI returned invalid JSON. Response preview: ${cleaned.slice(0, 300)}`);
        }
      } else {
        throw new Error(`AI returned invalid JSON. Response preview: ${cleaned.slice(0, 300)}`);
      }
    }

    return {
      summary: String(parsed.summary ?? ''),
      audience: String(parsed.audience ?? ''),
      urgency: this.validateUrgency(parsed.urgency),
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

  private validateUrgency(v: string): AnalysisResult['urgency'] {
    if (['low', 'medium', 'high', 'critical'].includes(v)) return v as AnalysisResult['urgency'];
    return 'medium';
  }
}

function buildPrompt(base: string, validCategories?: string[]): string {
  if (!validCategories || validCategories.length === 0) return base;
  return `${base}\n\nValid categories: ${validCategories.join(', ')}`;
}
