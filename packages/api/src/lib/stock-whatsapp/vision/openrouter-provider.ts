import { env } from '../../../config/env';
import {
  buildOpenRouterRequest as buildGenericOpenRouterRequest,
  callOpenRouter,
  extractOpenRouterText,
  type VisionFetch
} from '../../ai/vision';
import type { StockVisionOutcome, StockVisionProvider, StockVisionRequest } from '../types';
import { stockVisionPayload } from './gemini-provider';
import { runVisionCall } from './schema';

/**
 * Fournisseur OpenRouter des photos de stock (spec 041, W8-R3). Le transport
 * vit dans `lib/ai/vision/openrouter.ts` depuis la spec 047.
 *
 * Réutilise `OPENROUTER_API_KEY` et `OPENROUTER_BASE_URL`, mais PAS
 * `getLlmProvider` ni le modèle ImmoCopilot réglé par le super-admin : le modèle
 * vient de `STOCK_VISION_MODEL` (`fournisseur/modèle`).
 */

export { extractOpenRouterText };

export interface OpenRouterVisionProviderOptions {
  fetch?: VisionFetch;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

export function buildOpenRouterRequest(
  request: StockVisionRequest,
  options: { model: string; apiKey: string; baseUrl: string; referer: string }
): { url: string; init: RequestInit } {
  return buildGenericOpenRouterRequest(stockVisionPayload(request), options);
}

export class OpenRouterVisionProvider implements StockVisionProvider {
  readonly id = 'openrouter' as const;
  readonly model: string;
  private readonly fetchImpl: VisionFetch;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: OpenRouterVisionProviderOptions = {}) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.apiKey = options.apiKey ?? env.OPENROUTER_API_KEY;
    this.baseUrl = options.baseUrl ?? env.OPENROUTER_BASE_URL;
    this.model = options.model ?? env.STOCK_VISION_MODEL;
    this.timeoutMs = options.timeoutMs ?? env.STOCK_VISION_TIMEOUT_MS;
  }

  analyze(request: StockVisionRequest, signal: AbortSignal): Promise<StockVisionOutcome> {
    const meta = { provider: this.id, model: this.model, timeoutMs: this.timeoutMs };
    return runVisionCall(meta, request, signal, callSignal =>
      callOpenRouter({
        fetchImpl: this.fetchImpl,
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        referer: env.FRONTEND_URL,
        zdr: env.OPENROUTER_VISION_ZDR,
        model: this.model,
        payload: stockVisionPayload(request),
        signal: callSignal
      })
    );
  }
}
