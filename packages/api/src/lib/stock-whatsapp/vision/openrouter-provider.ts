import { env } from '../../../config/env';
import { logger } from '../../../utils/logger';
import type { StockVisionOutcome, StockVisionProvider, StockVisionRequest } from '../types';
import type { VisionFetch } from './gemini-provider';
import { buildStockVisionPrompt } from './prompt';
import {
  STOCK_VISION_JSON_SCHEMA,
  STOCK_VISION_SCHEMA_NAME,
  VisionCallError,
  imageToBase64,
  runVisionCall
} from './schema';

/**
 * Fournisseur OpenRouter (spec 041, W8-R3) : `POST {OPENROUTER_BASE_URL}/chat/completions`,
 * sans flux, message utilisateur en deux parties (texte, puis `image_url` en URI
 * `data:`), `response_format` `json_schema` strict et
 * `provider.require_parameters` pour n'être routé que vers un fournisseur qui
 * accepte la sortie structurée. Références vérifiées le 04/10/2026 :
 * https://openrouter.ai/docs/guides/overview/multimodal/image-understanding et
 * https://openrouter.ai/docs/features/structured-outputs — le respect du schéma
 * varie selon le fournisseur : la validation Zod reste l'autorité.
 *
 * Réutilise `OPENROUTER_API_KEY` et `OPENROUTER_BASE_URL`, mais PAS
 * `getLlmProvider` ni le modèle ImmoCopilot réglé par le super-admin : le modèle
 * vient de `STOCK_VISION_MODEL` (`fournisseur/modèle`).
 */

export interface OpenRouterVisionProviderOptions {
  fetch?: VisionFetch;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

type ChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | Array<{ type?: string; text?: string }> | null; refusal?: string | null };
  }>;
  error?: { code?: number | string };
};

export function buildOpenRouterRequest(
  request: StockVisionRequest,
  options: { model: string; apiKey: string; baseUrl: string; referer: string }
): { url: string; init: RequestInit } {
  const body = {
    model: options.model,
    stream: false,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildStockVisionPrompt({ candidates: request.candidates, imposedItemId: request.imposedItemId })
          },
          { type: 'image_url', image_url: { url: `data:${request.mimeType};base64,${imageToBase64(request.image)}` } }
        ]
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: STOCK_VISION_SCHEMA_NAME, strict: true, schema: STOCK_VISION_JSON_SCHEMA }
    },
    provider: { require_parameters: true }
  };
  return {
    url: `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': options.referer,
        'X-Title': 'ImmoTopia'
      },
      body: JSON.stringify(body),
      redirect: 'manual'
    }
  };
}

/** Texte JSON rendu par le modèle, ou `VisionCallError`. */
export function extractOpenRouterText(payload: unknown): string {
  const data = (payload ?? {}) as ChatCompletionResponse;
  if (data.error) throw new VisionCallError('PROVIDER_ERROR', 'erreur du fournisseur');
  const choice = data.choices?.[0];
  if (!choice?.message) throw new VisionCallError('PROVIDER_ERROR', 'aucune réponse');
  if (choice.message.refusal) throw new VisionCallError('PROVIDER_ERROR', 'refus du modèle');
  const content = choice.message.content;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .filter(part => part?.type === 'text' && typeof part.text === 'string')
            .map(part => part.text)
            .join('')
        : '';
  if (!text) throw new VisionCallError('INVALID_OUTPUT', 'réponse vide');
  return text;
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
    return runVisionCall(meta, request, signal, async callSignal => {
      if (!this.apiKey) throw new VisionCallError('PROVIDER_ERROR', 'OPENROUTER_API_KEY absente');
      const { url, init } = buildOpenRouterRequest(request, {
        model: this.model,
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        referer: env.FRONTEND_URL
      });
      const response = await this.fetchImpl(url, { ...init, signal: callSignal });
      if (!response.ok) {
        logger.warn('Vision IA (openrouter) : réponse HTTP en erreur', { status: response.status, model: this.model });
        throw new VisionCallError('PROVIDER_ERROR', `HTTP ${response.status}`);
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new VisionCallError('PROVIDER_ERROR', 'réponse illisible');
      }
      return extractOpenRouterText(payload);
    });
  }
}
