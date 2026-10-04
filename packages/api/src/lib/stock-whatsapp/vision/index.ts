import { env } from '../../../config/env';
import type { StockVisionOutcome, StockVisionProvider, StockVisionRequest } from '../types';
import { FakeVisionProvider } from './fake-provider';
import { GeminiVisionProvider } from './gemini-provider';
import { OpenRouterVisionProvider } from './openrouter-provider';

/**
 * Analyse des photos de stock (spec 041, W8). Point d'entrée unique du moteur
 * (W3) : `getStockVisionProvider()`.
 *
 * Le fournisseur se choisit par `STOCK_VISION_PROVIDER` (`disabled` par
 * défaut), le modèle par `STOCK_VISION_MODEL` ; ces réglages ne dépendent PAS
 * du réglage ImmoCopilot du super-admin (`getLlmProvider`, texte seul). Les
 * exigences de clé et de forme du modèle sont contrôlées au démarrage par
 * `src/config/env.ts`.
 */

/** Fournisseur coupé : toute analyse échoue proprement (`DISABLED`). */
export class DisabledVisionProvider implements StockVisionProvider {
  readonly id = 'disabled' as const;
  readonly model = 'none';

  async analyze(_request: StockVisionRequest, _signal: AbortSignal): Promise<StockVisionOutcome> {
    return { ok: false, reason: 'DISABLED', provider: this.id, model: this.model, latencyMs: 0 };
  }
}

/**
 * Le faux fournisseur est-il permis sur ce serveur (W8-R9, écart E1) ?
 * `NODE_ENV` vaut `development` ou `test`, ou `WHATSAPP_INVENTORY_SIMULATOR=1`.
 * `env.ts` le refuse déjà au démarrage ; ce second contrôle évite qu'une
 * configuration contournée active des comptages simulés en production.
 */
export function fakeVisionAllowed(): boolean {
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test' || env.WHATSAPP_INVENTORY_SIMULATOR === '1';
}

let cached: { key: string; provider: StockVisionProvider } | null = null;

/** Fournisseur de vision configuré. Ne lève jamais ; son `analyze` non plus. */
export function getStockVisionProvider(): StockVisionProvider {
  const key = [
    env.STOCK_VISION_PROVIDER,
    env.STOCK_VISION_MODEL,
    env.STOCK_VISION_TIMEOUT_MS,
    env.NODE_ENV,
    env.WHATSAPP_INVENTORY_SIMULATOR
  ].join('|');
  if (cached?.key === key) return cached.provider;
  let provider: StockVisionProvider;
  switch (env.STOCK_VISION_PROVIDER) {
    case 'gemini':
      provider = new GeminiVisionProvider();
      break;
    case 'openrouter':
      provider = new OpenRouterVisionProvider();
      break;
    case 'fake':
      provider = fakeVisionAllowed() ? new FakeVisionProvider() : new DisabledVisionProvider();
      break;
    case 'disabled':
    default:
      provider = new DisabledVisionProvider();
  }
  cached = { key, provider };
  return provider;
}

/** Pour les tests : oublie le fournisseur mémorisé. */
export function resetStockVisionProviderForTests(): void {
  cached = null;
}

export { FakeVisionProvider, parseFakeDirective, FAKE_VISION_MODEL } from './fake-provider';
export { GeminiVisionProvider } from './gemini-provider';
export { OpenRouterVisionProvider } from './openrouter-provider';
export { buildStockVisionPrompt } from './prompt';
export { STOCK_VISION_JSON_SCHEMA, finalizeVisionResult, stockVisionResultSchema } from './schema';
// Choix des candidats (W8-R4) : importer `./candidates` directement (il charge Prisma).
