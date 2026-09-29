import type { LlmProvider } from '../contracts';
import { getEffectiveAiConfig, isProviderUsable } from '../../../services/ai-settings-service';
import { AnthropicProvider } from './anthropic-provider';
import { FakeProvider } from './fake-provider';
import { OpenRouterProvider } from './openrouter-provider';

/**
 * Fournisseur LLM désigné par la configuration EFFECTIVE (réglage en base du
 * super-admin, sinon `AI_PROVIDER` de l'environnement ; cache de 30 s,
 * invalidé à chaque mise à jour). Renvoie `null` quand l'assistant est
 * désactivé OU que le fournisseur désigné ne peut pas servir (clé absente,
 * `fake` en production) : le contrôleur répond alors 503 `AI_DISABLED`.
 * L'instance est réutilisée tant que fournisseur et modèle ne changent pas.
 */
let cached: { key: string; provider: LlmProvider } | null = null;

export async function getLlmProvider(): Promise<LlmProvider | null> {
  const config = await getEffectiveAiConfig();
  if (!isProviderUsable(config)) return null;

  const key = `${config.provider}:${config.model}`;
  if (cached?.key === key) return cached.provider;

  const provider: LlmProvider =
    config.provider === 'fake'
      ? new FakeProvider()
      : config.provider === 'openrouter'
        ? new OpenRouterProvider()
        : new AnthropicProvider();
  cached = { key, provider };
  return provider;
}

/** Oublie l'instance en cache (tests). */
export function resetLlmProviderCache(): void {
  cached = null;
}

export { AnthropicProvider, LlmProviderError, isAbortError } from './anthropic-provider';
export { OpenRouterProvider } from './openrouter-provider';
export { FakeProvider } from './fake-provider';
export type { FakeStep } from './fake-provider';
