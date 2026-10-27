import type { VisionOutcome } from '../../../ai/vision';
import type { ProofModelRead } from './schema';

/** Ce que reçoit un fournisseur de lecture de capture. */
export interface PaymentProofVisionRequest {
  image: Buffer;
  mimeType: string;
}

export type PaymentProofVisionOutcome = VisionOutcome<ProofModelRead>;

/** Fournisseur de lecture : `analyze` ne lève jamais. */
export interface PaymentProofVisionProvider {
  readonly id: 'disabled' | 'fake' | 'gemini' | 'openrouter';
  readonly model: string;
  analyze(request: PaymentProofVisionRequest, signal: AbortSignal): Promise<PaymentProofVisionOutcome>;
}
