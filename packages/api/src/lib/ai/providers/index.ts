import type { LlmProvider } from '../contracts';
import {
  getEffectiveAiConfig,
  isProviderUsable,
  resolveAiMode,
  type AiMode
} from '../../../services/ai-settings-service';
import { AnthropicProvider } from './anthropic-provider';
import { FakeProvider } from './fake-provider';
import { OpenRouterProvider } from './openrouter-provider';

/**
 * Fournisseur LLM désigné par la configuration EFFECTIVE (réglage en base du
 * super-admin, sinon `AI_PROVIDER` de l'environnement ; cache de 30 s,
 * invalidé à chaque mise à jour). Renvoie `null` quand l'assistant est
 * désactivé OU que le fournisseur désigné ne peut pas servir (clé absente,
 * `fake` en production) : le contrôleur répond alors 503 `AI_DISABLED`.
 * Le profil est sélectionné au début de la requête et réutilisé pendant ses tours.
 */
const cached = new Map<AiMode, { key: string; provider: LlmProvider }>();

export async function getLlmProvider(mode: AiMode = 'standard'): Promise<LlmProvider | null> {
  const config = await getEffectiveAiConfig();
  const profile = resolveAiMode(config, mode);
  if (!isProviderUsable({ provider: config.provider, model: profile.model })) return null;

  const key = JSON.stringify([config.provider, profile]);
  const entry = cached.get(mode);
  if (entry?.key === key) return entry.provider;

  const getConfig = async () => profile;
  const provider: LlmProvider =
    config.provider === 'fake'
      ? new FakeProvider()
      : config.provider === 'openrouter'
        ? new OpenRouterProvider({ getConfig })
        : new AnthropicProvider({ getConfig });
  cached.set(mode, { key, provider });
  return provider;
}

/** Oublie l'instance en cache (tests). */
export function resetLlmProviderCache(): void {
  cached.clear();
}

export { AnthropicProvider, LlmProviderError, isAbortError } from './anthropic-provider';
export { OpenRouterProvider } from './openrouter-provider';
export { FakeProvider } from './fake-provider';
export type { FakeStep } from './fake-provider';
