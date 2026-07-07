import type { AIProvider, AIProviderConfig } from './types.ts';
import { OpenAICompatibleProvider } from './openai-compatible.ts';
import { LocalProvider } from './local.ts';

export function createProvider(config: AIProviderConfig): AIProvider {
  switch (config.type) {
    case 'openai-compatible':
      return new OpenAICompatibleProvider(config);
    case 'local':
      return new LocalProvider();
    default:
      return new OpenAICompatibleProvider(config);
  }
}
