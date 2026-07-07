import type { AIProvider, AnalysisResult, AIProviderConfig, AnalyzeOptions, ChatMessage } from './types.ts';

export class AnthropicProvider implements AIProvider {
  readonly name: string;

  private constructor(
    private config: AIProviderConfig,
  ) {
    this.name = `anthropic:${config.model}`;
  }

  static create(config: AIProviderConfig): AnthropicProvider {
    return new AnthropicProvider(config);
  }

  async analyzeDocument(text: string, options?: AnalyzeOptions): Promise<AnalysisResult> {
    const prompt = buildPrompt(options?.prompt || '', options?.validCategories);

    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        system: prompt,
        messages: [{ role: 'user', content: `Document text:\n\n${text}` }],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;
    if (!content) throw new Error('No content in response');

    return this.parseResponse(content);
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');

    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        system: systemMsg?.content || '',
        messages: nonSystem.map(m => ({ role: m.role, content: m.content })),
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;
    if (!content) throw new Error('No content in response');
    return content;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'test' }],
        }),
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
