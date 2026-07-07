import type { AIProvider, AnalysisResult, AIProviderConfig, AnalyzeOptions, ChatMessage } from './types.ts';
import { CreateMLCEngine, type MLCEngineInterface } from '@mlc-ai/web-llm';

function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && !!navigator.gpu;
}

export class LocalProvider implements AIProvider {
  readonly name: string;
  private engine: MLCEngineInterface | null = null;
  private loading = false;
  private loadPromise: Promise<MLCEngineInterface> | null = null;
  private _initProgress = '';

  private constructor(private config: AIProviderConfig) {
    this.name = `local:${config.model}`;
  }

  static create(config: AIProviderConfig): LocalProvider {
    return new LocalProvider(config);
  }

  get initProgress(): string {
    return this._initProgress;
  }

  get isLoaded(): boolean {
    return this.engine !== null;
  }

  get isLoading(): boolean {
    return this.loading;
  }

  async downloadModel(onProgress?: (text: string, progress: number) => void): Promise<void> {
    this._initProgress = '';
    this.loading = true;
    this.loadPromise = CreateMLCEngine(this.config.model, {
      initProgressCallback: (p) => {
        const text = p.text || `Loading... ${Math.round(p.progress * 100)}%`;
        this._initProgress = text;
        onProgress?.(text, p.progress);
      },
    });
    try {
      this.engine = await this.loadPromise;
    } catch (err) {
      this.loadPromise = null;
      throw err;
    } finally {
      this.loading = false;
    }
  }

  async ensureEngine(): Promise<MLCEngineInterface> {
    if (this.engine) return this.engine;
    if (this.loadPromise) return this.loadPromise;

    if (!hasWebGPU()) {
      throw new Error('WebGPU is not available in this browser. Local AI models require WebGPU. Try Chrome or Edge.');
    }

    await this.downloadModel();
    return this.engine!;
  }

  async analyzeDocument(text: string, options?: AnalyzeOptions): Promise<AnalysisResult> {
    const engine = await this.ensureEngine();
    const prompt = options?.prompt || '';
    const validCats = options?.validCategories;
    const systemPrompt = validCats?.length ? `${prompt}\n\nValid categories: ${validCats.join(', ')}` : prompt;

    const reply = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Document text:\n\n${text}` },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });

    const content = reply.choices[0]?.message?.content;
    if (!content) throw new Error('No content in response');

    return this.parseResponse(content);
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const engine = await this.ensureEngine();

    const reply = await engine.chat.completions.create({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: 0.7,
      max_tokens: 2000,
    });

    const content = reply.choices[0]?.message?.content;
    if (!content) throw new Error('No content in response');
    return content;
  }

  async testConnection(): Promise<boolean> {
    return hasWebGPU();
  }

  async unload(): Promise<void> {
    if (this.engine) {
      try {
        await this.engine.resetChat();
      } catch { /* ignore */ }
      this.engine = null;
    }
    this.loadPromise = null;
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
