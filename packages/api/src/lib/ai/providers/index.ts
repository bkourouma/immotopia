import { env } from '../../../config/env';
import type { LlmProvider } from '../contracts';
import { AnthropicProvider } from './anthropic-provider';
import { FakeProvider } from './fake-provider';
import { OpenRouterProvider } from './openrouter-provider';

/**
 * Fournisseur LLM choisi par `AI_PROVIDER`. `disabled` renvoie `null` : le
 * contrôleur répond alors 503 `AI_DISABLED`. Instance unique par processus.
 */
let cached: { key: string; provider: LlmProvider } | null = null;

export function getLlmProvider(): LlmProvider | null {
  const key = env.AI_PROVIDER;
  if (key === 'disabled') return null;
  if (cached?.key === key) return cached.provider;

  const provider: LlmProvider =
    key === 'fake' ? new FakeProvider() : key === 'openrouter' ? new OpenRouterProvider() : new AnthropicProvider();
  cached = { key, provider };
  return provider;
}

export { AnthropicProvider, LlmProviderError, isAbortError } from './anthropic-provider';
export { OpenRouterProvider } from './openrouter-provider';
export { FakeProvider } from './fake-provider';
export type { FakeStep } from './fake-provider';
