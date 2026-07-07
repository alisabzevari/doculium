import type { AIProvider, AnalysisResult, AnalyzeOptions, ChatMessage, ToolDefinition, ChatResult } from './types.ts';
import { CreateMLCEngine, type MLCEngine } from '@mlc-ai/web-llm';

let webGpuAvailable: boolean | null = null;

export async function hasWebGPU(): Promise<boolean> {
  if (webGpuAvailable !== null) return webGpuAvailable;
  webGpuAvailable = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
  return webGpuAvailable;
}

const MODELS: Record<string, string> = {
  'qwen2.5-1.5b': 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  'qwen2.5-7b': 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
  'llama3.1-8b': 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
};

export function getAvailableModels(): Array<{ id: string; label: string }> {
  return [
    { id: 'qwen2.5-1.5b', label: 'Qwen 2.5 1.5B (fast, less capable)' },
    { id: 'qwen2.5-7b', label: 'Qwen 2.5 7B (balanced)' },
    { id: 'llama3.1-8b', label: 'Llama 3.1 8B (best quality)' },
  ];
}

export function getModelId(shortName: string): string {
  return MODELS[shortName] || shortName;
}

export class LocalProvider implements AIProvider {
  readonly name = 'Local (WebLLM)';
  private engine: MLCEngine | null = null;
  private loadPromise: Promise<void> | null = null;
  private modelId = '';

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

  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ChatResult> {
    const engine = await this.ensureEngine();

    const apiMessages = messages.map((m): Record<string, unknown> => {
      const msg: Record<string, unknown> = { role: m.role, content: m.content };
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      if (m.tool_calls) {
        msg.tool_calls = m.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }));
      }
      return msg;
    });

    const body: Record<string, unknown> = {
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: 2000,
    };
    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const reply = await engine.chat.completions.create(body as any);

    const message = reply.choices[0]?.message;
    if (!message) throw new Error('No response from engine');

    const result: ChatResult = { content: message.content || null };

    if (message.tool_calls) {
      result.toolCalls = message.tool_calls.map((tc: any) => ({
        id: tc.id || tc.function.name,
        name: tc.function.name,
        arguments: typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments,
      }));
    }

    return result;
  }

  async testConnection(): Promise<boolean> {
    return hasWebGPU();
  }

  async ensureEngine(): Promise<MLCEngine> {
    if (this.engine) return this.engine;
    if (this.loadPromise) {
      await this.loadPromise;
      return this.engine!;
    }
    throw new Error('Model not loaded. Download the model in Settings first.');
  }

  async downloadModel(modelShortName: string, onProgress?: (progress: number) => void): Promise<void> {
    this.modelId = getModelId(modelShortName);
    this.loadPromise = this._loadEngine(onProgress);
    await this.loadPromise;
  }

  private async _loadEngine(onProgress?: (progress: number) => void): Promise<void> {
    this.engine = await CreateMLCEngine(
      this.modelId,
      {
        initProgressCallback: (report) => {
          if (onProgress && report.progress) onProgress(report.progress);
        },
      },
    );
  }

  async unload(): Promise<void> {
    if (this.engine) {
      try { await this.engine.resetChat(); } catch { /* ignore */ }
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
