import { env } from '../../../config/env';
import { logger } from '../../../utils/logger';
import type { StockVisionOutcome, StockVisionProvider, StockVisionRequest } from '../types';
import { buildStockVisionPrompt } from './prompt';
import { STOCK_VISION_JSON_SCHEMA, VisionCallError, imageToBase64, runVisionCall } from './schema';

/**
 * Fournisseur Gemini, appelé directement (spec 041, W8-R2) :
 * `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
 *
 * Sortie structurée par `generationConfig.responseJsonSchema` (JSON Schema) avec
 * `responseMimeType: application/json`. Référence vérifiée le 04/10/2026
 * (https://ai.google.dev/api/generate-content) : `responseSchema` (sous-ensemble
 * OpenAPI) et `_responseJsonSchema` y sont marqués dépréciés ;
 * `responseJsonSchema` figure dans `GenerationConfig` sans mention de
 * dépréciation. La validation Zod reste l'autorité.
 *
 * Indépendant du réglage ImmoCopilot du super-admin (`getLlmProvider`) : la clé
 * vient de `GEMINI_API_KEY`, le modèle de `STOCK_VISION_MODEL`.
 */

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type VisionFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface GeminiVisionProviderOptions {
  /** Injection pour les tests ; par défaut le `fetch` global. */
  fetch?: VisionFetch;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

type GeminiResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
};

/** Construit la requête (exportée pour les tests : aucun champ de stock, aucune légende). */
export function buildGeminiRequest(
  request: StockVisionRequest,
  model: string,
  apiKey: string
): { url: string; init: RequestInit } {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: buildStockVisionPrompt({ candidates: request.candidates, imposedItemId: request.imposedItemId }) },
          { inlineData: { mimeType: request.mimeType, data: imageToBase64(request.image) } }
        ]
      }
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseJsonSchema: STOCK_VISION_JSON_SCHEMA
    }
  };
  return {
    url: `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      redirect: 'manual'
    }
  };
}

/** Texte JSON rendu par le modèle, ou `VisionCallError`. */
export function extractGeminiText(payload: unknown): string {
  const data = (payload ?? {}) as GeminiResponse;
  if (data.promptFeedback?.blockReason) {
    throw new VisionCallError('PROVIDER_ERROR', `requête refusée (${data.promptFeedback.blockReason})`);
  }
  const candidate = data.candidates?.[0];
  if (!candidate) throw new VisionCallError('PROVIDER_ERROR', 'aucune réponse candidate');
  const text = (candidate.content?.parts ?? [])
    .filter(part => !part.thought && typeof part.text === 'string')
    .map(part => part.text)
    .join('');
  if (!text) {
    // SAFETY, RECITATION… : refus du fournisseur ; sinon sortie vide.
    if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
      throw new VisionCallError('PROVIDER_ERROR', `réponse interrompue (${candidate.finishReason})`);
    }
    throw new VisionCallError('INVALID_OUTPUT', 'réponse vide');
  }
  return text;
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
    return runVisionCall(meta, request, signal, async callSignal => {
      if (!this.apiKey) throw new VisionCallError('PROVIDER_ERROR', 'GEMINI_API_KEY absente');
      const { url, init } = buildGeminiRequest(request, this.model, this.apiKey);
      const response = await this.fetchImpl(url, { ...init, signal: callSignal });
      if (!response.ok) {
        // Le corps d'erreur n'est pas journalisé : il peut reprendre la requête.
        logger.warn('Vision IA (gemini) : réponse HTTP en erreur', { status: response.status, model: this.model });
        throw new VisionCallError('PROVIDER_ERROR', `HTTP ${response.status}`);
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new VisionCallError('PROVIDER_ERROR', 'réponse illisible');
      }
      return extractGeminiText(payload);
    });
  }
}
