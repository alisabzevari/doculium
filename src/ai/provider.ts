import type { AIProvider, AIProviderConfig } from './types.ts';
import { OpenAICompatibleProvider } from './openai-compatible.ts';
import { AnthropicProvider } from './anthropic.ts';
import { GeminiProvider } from './gemini.ts';
import { LocalProvider } from './local.ts';

export function createProvider(config: AIProviderConfig): AIProvider {
  switch (config.type) {
    case 'openai-compatible':
      return OpenAICompatibleProvider.create(config);
    case 'anthropic':
      return AnthropicProvider.create(config);
    case 'gemini':
      return GeminiProvider.create(config);
    case 'local':
      return LocalProvider.create(config);
    default:
      return OpenAICompatibleProvider.create(config);
  }
}
