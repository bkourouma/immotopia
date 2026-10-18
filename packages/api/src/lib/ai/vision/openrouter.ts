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
 * Transport OpenRouter : `POST {OPENROUTER_BASE_URL}/chat/completions`, sans
 * flux, message utilisateur en deux parties (texte, puis image en URI `data:`
 * ou, pour un PDF, partie `file`), `response_format` `json_schema` strict et
 * `provider.require_parameters`. La validation Zod de l'appelant reste
 * l'autorité. Références vérifiées le 04/10/2026 :
 * https://openrouter.ai/docs/guides/overview/multimodal/image-understanding et
 * https://openrouter.ai/docs/features/structured-outputs.
 */

type ChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | Array<{ type?: string; text?: string }> | null; refusal?: string | null };
  }>;
  error?: { code?: number | string };
};

export function buildOpenRouterRequest(
  payload: VisionPayload,
  options: { model: string; apiKey: string; baseUrl: string; referer: string; zdr?: boolean }
): { url: string; init: RequestInit } {
  const dataUri = `data:${payload.mimeType};base64,${imageToBase64(payload.image)}`;
  const mediaPart =
    payload.mimeType === 'application/pdf'
      ? { type: 'file', file: { filename: 'document.pdf', file_data: dataUri } }
      : { type: 'image_url', image_url: { url: dataUri } };
  const body = {
    model: options.model,
    stream: false,
    temperature: 0,
    messages: payload.separateSystem
      ? [
          { role: 'system', content: payload.prompt },
          { role: 'user', content: [{ type: 'text', text: payload.userText ?? DEFAULT_VISION_USER_TEXT }, mediaPart] }
        ]
      : [{ role: 'user', content: [{ type: 'text', text: payload.prompt }, mediaPart] }],
    response_format: {
      type: 'json_schema',
      json_schema: { name: payload.schemaName, strict: true, schema: payload.jsonSchema }
    },
    // data_collection « deny » : seuls les fournisseurs qui ne conservent ni n'entraînent sur les données
    // sont routés (les captures contiennent des numéros et des noms). `zdr` : rétention nulle exigée.
    provider: { require_parameters: true, data_collection: 'deny', ...(options.zdr ? { zdr: true } : {}) }
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

/** Appel complet : texte JSON du modèle, ou `VisionCallError`. */
export async function callOpenRouter(params: {
  fetchImpl: VisionFetch;
  apiKey: string | undefined;
  baseUrl: string;
  referer: string;
  zdr?: boolean;
  model: string;
  payload: VisionPayload;
  signal: AbortSignal;
}): Promise<string> {
  if (!params.apiKey) throw new VisionCallError('PROVIDER_ERROR', 'OPENROUTER_API_KEY absente');
  const { url, init } = buildOpenRouterRequest(params.payload, {
    model: params.model,
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    referer: params.referer,
    zdr: params.zdr
  });
  const response = await params.fetchImpl(url, { ...init, signal: params.signal });
  if (!response.ok) {
    logger.warn('Vision IA (openrouter) : réponse HTTP en erreur', { status: response.status, model: params.model });
    throw new VisionCallError('PROVIDER_ERROR', `HTTP ${response.status}`);
  }
  return extractOpenRouterText(await readLimitedJson(response));
}
