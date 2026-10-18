import { env } from '../../../config/env';
import {
  GEMINI_API_BASE,
  buildGeminiRequest as buildGenericGeminiRequest,
  callGemini,
  extractGeminiText,
  type VisionFetch,
  type VisionPayload
} from '../../ai/vision';
import type { StockVisionOutcome, StockVisionProvider, StockVisionRequest } from '../types';
import { buildStockVisionPrompt } from './prompt';
import { STOCK_VISION_JSON_SCHEMA, STOCK_VISION_SCHEMA_NAME, runVisionCall } from './schema';

/**
 * Fournisseur Gemini des photos de stock (spec 041, W8-R2). Le transport
 * (requête, extraction du texte, erreurs) vit dans `lib/ai/vision/gemini.ts`
 * depuis la spec 047 ; ce fichier ne garde que la consigne et le schéma du stock.
 *
 * Indépendant du réglage ImmoCopilot du super-admin (`getLlmProvider`) : la clé
 * vient de `GEMINI_API_KEY`, le modèle de `STOCK_VISION_MODEL`.
 */

export { GEMINI_API_BASE, extractGeminiText };
export type { VisionFetch };

export interface GeminiVisionProviderOptions {
  /** Injection pour les tests ; par défaut le `fetch` global. */
  fetch?: VisionFetch;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

/** Charge utile générique d'une requête de stock (partagée avec OpenRouter). */
export function stockVisionPayload(request: StockVisionRequest): VisionPayload {
  return {
    prompt: buildStockVisionPrompt({ candidates: request.candidates, imposedItemId: request.imposedItemId }),
    image: request.image,
    mimeType: request.mimeType,
    jsonSchema: STOCK_VISION_JSON_SCHEMA as unknown as Record<string, unknown>,
    schemaName: STOCK_VISION_SCHEMA_NAME
  };
}

/** Construit la requête (exportée pour les tests : aucun champ de stock, aucune légende). */
export function buildGeminiRequest(
  request: StockVisionRequest,
  model: string,
  apiKey: string
): { url: string; init: RequestInit } {
  return buildGenericGeminiRequest(stockVisionPayload(request), model, apiKey);
}

export class GeminiVisionProvider implements StockVisionProvider {
  readonly id = 'gemini' as const;
  readonly model: string;
  private readonly fetchImpl: VisionFetch;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;

  constructor(options: GeminiVisionProviderOptions = {}) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.apiKey = options.apiKey ?? env.GEMINI_API_KEY;
    this.model = options.model ?? env.STOCK_VISION_MODEL;
    this.timeoutMs = options.timeoutMs ?? env.STOCK_VISION_TIMEOUT_MS;
  }

  analyze(request: StockVisionRequest, signal: AbortSignal): Promise<StockVisionOutcome> {
    const meta = { provider: this.id, model: this.model, timeoutMs: this.timeoutMs };
    return runVisionCall(meta, request, signal, callSignal =>
      callGemini({
        fetchImpl: this.fetchImpl,
        apiKey: this.apiKey,
        model: this.model,
        payload: stockVisionPayload(request),
        signal: callSignal
      })
    );
  }
}
