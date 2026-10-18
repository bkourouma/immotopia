import { env } from '../../../../config/env';
import { callGemini, runVisionCall, type VisionFetch } from '../../../ai/vision';
import { buildPaymentProofPrompt } from './prompt';
import { PAYMENT_PROOF_JSON_SCHEMA, PAYMENT_PROOF_SCHEMA_NAME, parseProofModelOutput } from './schema';
import type { PaymentProofVisionOutcome, PaymentProofVisionProvider, PaymentProofVisionRequest } from './types';

/** Lecture des captures par Gemini (transport commun `lib/ai/vision/gemini.ts`). Clé : `GEMINI_API_KEY`. */
export class GeminiPaymentProofProvider implements PaymentProofVisionProvider {
  readonly id = 'gemini' as const;
  readonly model: string;
  private readonly fetchImpl: VisionFetch;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;

  constructor(options: { fetch?: VisionFetch; apiKey?: string; model?: string; timeoutMs?: number } = {}) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.apiKey = options.apiKey ?? env.GEMINI_API_KEY;
    this.model = options.model ?? env.PAYMENT_PROOF_VISION_MODEL;
    this.timeoutMs = options.timeoutMs ?? env.PAYMENT_PROOF_VISION_TIMEOUT_MS;
  }

  analyze(request: PaymentProofVisionRequest, signal: AbortSignal): Promise<PaymentProofVisionOutcome> {
    const meta = { provider: this.id, model: this.model, timeoutMs: this.timeoutMs };
    return runVisionCall(
      meta,
      signal,
      callSignal =>
        callGemini({
          fetchImpl: this.fetchImpl,
          apiKey: this.apiKey,
          model: this.model,
          signal: callSignal,
          payload: {
            prompt: buildPaymentProofPrompt(),
            image: request.image,
            mimeType: request.mimeType,
            jsonSchema: PAYMENT_PROOF_JSON_SCHEMA as unknown as Record<string, unknown>,
            schemaName: PAYMENT_PROOF_SCHEMA_NAME
          }
        }),
      parseProofModelOutput
    );
  }
}
