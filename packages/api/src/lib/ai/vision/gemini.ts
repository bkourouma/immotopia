import { logger } from '../../../utils/logger';
import {
  DEFAULT_VISION_USER_TEXT,
  VisionCallError,
  imageToBase64,
  readLimitedJson,
  type VisionFetch,
  type VisionPayload
} from './call';

/**
 * Transport Gemini, appelé directement :
 * `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
 *
 * Sortie structurée par `generationConfig.responseJsonSchema` avec
 * `responseMimeType: application/json`. La validation Zod de l'appelant reste
 * l'autorité. Référence vérifiée le 04/10/2026 (https://ai.google.dev/api/generate-content).
 */

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

type GeminiResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
};

/** Construit la requête (exportée pour les tests). */
export function buildGeminiRequest(
  payload: VisionPayload,
  model: string,
  apiKey: string
): { url: string; init: RequestInit } {
  const body = {
    ...(payload.separateSystem ? { systemInstruction: { parts: [{ text: payload.prompt }] } } : {}),
    contents: [
      {
        role: 'user',
        parts: [
          { text: payload.separateSystem ? (payload.userText ?? DEFAULT_VISION_USER_TEXT) : payload.prompt },
          { inlineData: { mimeType: payload.mimeType, data: imageToBase64(payload.image) } }
        ]
      }
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseJsonSchema: payload.jsonSchema
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

/** Appel complet : texte JSON du modèle, ou `VisionCallError`. */
export async function callGemini(params: {
  fetchImpl: VisionFetch;
  apiKey: string | undefined;
  model: string;
  payload: VisionPayload;
  signal: AbortSignal;
}): Promise<string> {
  if (!params.apiKey) throw new VisionCallError('PROVIDER_ERROR', 'GEMINI_API_KEY absente');
  const { url, init } = buildGeminiRequest(params.payload, params.model, params.apiKey);
  const response = await params.fetchImpl(url, { ...init, signal: params.signal });
  if (!response.ok) {
    // Le corps d'erreur n'est pas journalisé : il peut reprendre la requête.
    logger.warn('Vision IA (gemini) : réponse HTTP en erreur', { status: response.status, model: params.model });
    throw new VisionCallError('PROVIDER_ERROR', `HTTP ${response.status}`);
  }
  return extractGeminiText(await readLimitedJson(response));
}
