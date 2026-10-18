import { env } from '../../../../config/env';
import { callOpenRouter, runVisionCall, type VisionFetch } from '../../../ai/vision';
import { buildPaymentProofPrompt } from './prompt';
import { PAYMENT_PROOF_JSON_SCHEMA, PAYMENT_PROOF_SCHEMA_NAME, parseProofModelOutput } from './schema';
import type { PaymentProofVisionOutcome, PaymentProofVisionProvider, PaymentProofVisionRequest } from './types';

/**
 * Lecture des captures par OpenRouter (transport commun `lib/ai/vision/openrouter.ts`).
 * Clé et URL : `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` ; modèle `fournisseur/modèle`.
 */
export class OpenRouterPaymentProofProvider implements PaymentProofVisionProvider {
  readonly id = 'openrouter' as const;
  readonly model: string;
  private readonly fetchImpl: VisionFetch;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    options: { fetch?: VisionFetch; apiKey?: string; baseUrl?: string; model?: string; timeoutMs?: number } = {}
  ) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.apiKey = options.apiKey ?? env.OPENROUTER_API_KEY;
    this.baseUrl = options.baseUrl ?? env.OPENROUTER_BASE_URL;
    this.model = options.model ?? env.PAYMENT_PROOF_VISION_MODEL;
    this.timeoutMs = options.timeoutMs ?? env.PAYMENT_PROOF_VISION_TIMEOUT_MS;
  }

  analyze(request: PaymentProofVisionRequest, signal: AbortSignal): Promise<PaymentProofVisionOutcome> {
    const meta = { provider: this.id, model: this.model, timeoutMs: this.timeoutMs };
    return runVisionCall(
      meta,
      signal,
      callSignal =>
        callOpenRouter({
          fetchImpl: this.fetchImpl,
          apiKey: this.apiKey,
          baseUrl: this.baseUrl,
          referer: env.FRONTEND_URL,
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
