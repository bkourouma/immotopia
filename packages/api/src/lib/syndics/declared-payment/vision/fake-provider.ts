import { runVisionCall } from '../../../ai/vision';
import { parseProofModelOutput, type ProofModelRead } from './schema';
import type { PaymentProofVisionOutcome, PaymentProofVisionProvider, PaymentProofVisionRequest } from './types';

/**
 * Faux fournisseur (développement, test, recette) : il ne regarde pas l'image et
 * rend toujours la même lecture plausible. La sortie passe par la même validation
 * que celle d'une vraie IA. Refusé en production par `config/env.ts`.
 */
export const FAKE_PAYMENT_PROOF_MODEL = 'fake-proof-1';

export const FAKE_PROOF_OUTPUT = {
  quality: 'OK',
  operator: 'ORANGE',
  amount: 25000,
  paidAt: null,
  transactionReference: 'CI240101.1234.A12345',
  payerPhone: '0707070707',
  recipientPhone: null,
  recipientName: null,
  confidence: { operator: 0.95, amount: 0.9, paidAt: null, transactionReference: 0.85, payerPhone: 0.8 }
} as const;

export class FakePaymentProofProvider implements PaymentProofVisionProvider {
  readonly id = 'fake' as const;
  readonly model = FAKE_PAYMENT_PROOF_MODEL;

  analyze(_request: PaymentProofVisionRequest, signal: AbortSignal): Promise<PaymentProofVisionOutcome> {
    const meta = { provider: this.id, model: this.model, timeoutMs: 5000 };
    return runVisionCall<ProofModelRead>(meta, signal, async () => ({ ...FAKE_PROOF_OUTPUT }), parseProofModelOutput);
  }
}
