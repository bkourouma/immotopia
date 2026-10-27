import { env, fakeProviderAllowed } from '../../../../config/env';
import { FakePaymentProofProvider } from './fake-provider';
import { GeminiPaymentProofProvider } from './gemini-provider';
import { OpenRouterPaymentProofProvider } from './openrouter-provider';
import type { PaymentProofVisionOutcome, PaymentProofVisionProvider } from './types';

/**
 * Lecture IA des captures de paiement (spec 047, D9). Point d'entrée unique :
 * `getPaymentProofVisionProvider()`. Le fournisseur se choisit par
 * `PAYMENT_PROOF_VISION_PROVIDER` (`disabled` par défaut). Indépendant du
 * réglage ImmoCopilot du super-admin et de la vision du stock, dont il ne
 * partage que le transport (`lib/ai/vision`) et les clés.
 */

/** Fournisseur coupé : la fonction est indisponible, rien n'est appelé. */
export class DisabledPaymentProofProvider implements PaymentProofVisionProvider {
  readonly id = 'disabled' as const;
  readonly model = 'none';

  async analyze(): Promise<PaymentProofVisionOutcome> {
    return { ok: false, reason: 'DISABLED', provider: this.id, model: this.model, latencyMs: 0 };
  }
}

let cached: { key: string; provider: PaymentProofVisionProvider } | null = null;

export function getPaymentProofVisionProvider(): PaymentProofVisionProvider {
  const key = [
    env.PAYMENT_PROOF_VISION_PROVIDER,
    env.PAYMENT_PROOF_VISION_MODEL,
    env.PAYMENT_PROOF_VISION_TIMEOUT_MS,
    env.NODE_ENV
  ].join('|');
  if (cached?.key === key) return cached.provider;
  let provider: PaymentProofVisionProvider;
  switch (env.PAYMENT_PROOF_VISION_PROVIDER) {
    case 'gemini':
      provider = env.GEMINI_API_KEY ? new GeminiPaymentProofProvider() : new DisabledPaymentProofProvider();
      break;
    case 'openrouter':
      provider = env.OPENROUTER_API_KEY ? new OpenRouterPaymentProofProvider() : new DisabledPaymentProofProvider();
      break;
    case 'fake':
      // Second contrôle : `env.ts` le refuse déjà au démarrage hors développement et test.
      provider = fakeProviderAllowed(env.NODE_ENV)
        ? new FakePaymentProofProvider()
        : new DisabledPaymentProofProvider();
      break;
    case 'disabled':
    default:
      provider = new DisabledPaymentProofProvider();
  }
  cached = { key, provider };
  return provider;
}

/** Un fournisseur de lecture est-il configuré sur ce serveur ? */
export function isPaymentProofVisionConfigured(): boolean {
  return getPaymentProofVisionProvider().id !== 'disabled';
}

/** Pour les tests : oublie le fournisseur mémorisé. */
export function resetPaymentProofVisionProviderForTests(): void {
  cached = null;
}

export { FakePaymentProofProvider } from './fake-provider';
export { GeminiPaymentProofProvider } from './gemini-provider';
export { OpenRouterPaymentProofProvider } from './openrouter-provider';
export { buildPaymentProofPrompt } from './prompt';
export { PAYMENT_PROOF_JSON_SCHEMA, parseProofModelOutput, type ProofModelRead } from './schema';
export type { PaymentProofVisionOutcome, PaymentProofVisionProvider, PaymentProofVisionRequest } from './types';
