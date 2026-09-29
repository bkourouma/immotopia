import { env } from '../../../config/env';
import { t } from '../../../i18n';
import { logger } from '../../../utils/logger';
import { getEffectiveAiConfig } from '../../../services/ai-settings-service';
import type {
  LlmBlock,
  LlmMessage,
  LlmProvider,
  LlmToolSpec,
  LlmTurnResult,
  ProviderRuntimeConfig
} from '../contracts';
import { LlmProviderError, createAbortError, isAbortError } from './anthropic-provider';

/**
 * Fournisseur OpenRouter d'ImmoCopilot (API compatible OpenAI :
 * `POST {base}/chat/completions`, flux SSE, appel d'outils au format OpenAI).
 *
 * Choix : `fetch` + analyse SSE maison plutôt que le paquet `openai`.
 * - aucune dépendance de plus (surface d'attaque et lockfile inchangés) ;
 * - pas de nouvelles tentatives implicites du SDK, qui multiplieraient le délai
 *   `AI_REQUEST_TIMEOUT_MS` ; le délai et l'abandon restent maîtrisés ici ;
 * - clé et URL passées explicitement, jamais lues implicitement.
 * Aucune fonction bêta Anthropic (repli serveur, effort, eager_input_streaming).
 */

type StopReason = LlmTurnResult['stopReason'];

function translateFinishReason(reason: string | null | undefined): StopReason {
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'tool_calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    case 'content_filter':
      return 'refusal';
    default:
      return 'other';
  }
}

// --- Traduction des messages ------------------------------------------------

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

type OpenAiMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

function textOf(blocks: LlmBlock[]): string {
  return blocks
    .filter((block): block is Extract<LlmBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('');
}

function stringifyInput(input: unknown): string {
  try {
    return JSON.stringify(input ?? {}) ?? '{}';
  } catch {
    return '{}';
  }
}

/** Les blocs `opaque` (natifs Anthropic, thinking…) n'ont pas d'équivalent OpenAI : ignorés. */
export function toOpenAiMessages(system: string, messages: LlmMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: 'system', content: system }];
  for (const message of messages) {
    if (message.role === 'assistant') {
      const toolCalls = message.content
        .filter((block): block is Extract<LlmBlock, { type: 'tool_use' }> => block.type === 'tool_use')
        .map((block): OpenAiToolCall => ({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: stringifyInput(block.input) }
        }));
      const text = textOf(message.content);
      if (!text && toolCalls.length === 0) continue;
      out.push({
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
      });
      continue;
    }
    // Rôle user : les résultats d'outils deviennent des messages `tool`, placés avant le texte.
    for (const block of message.content) {
      if (block.type === 'tool_result') {
        out.push({ role: 'tool', tool_call_id: block.toolUseId, content: block.content });
      }
    }
    const text = textOf(message.content);
    if (text) out.push({ role: 'user', content: text });
  }
  return out;
}

// --- Lecture du flux SSE ----------------------------------------------------

interface ToolCallAccumulator {
  id: string;
  name: string;
  args: string;
}

interface StreamChunk {
  error?: { code?: unknown; message?: unknown };
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
}

/** Erreur de flux OpenRouter (statut HTTP amont ou code d'erreur en cours de flux). */
class UpstreamStatusError extends Error {
  constructor(readonly status: number | undefined) {
    super('upstream error');
    this.name = 'UpstreamStatusError';
  }
}

function parseToolInput(raw: string): unknown {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // JSON tronqué ou invalide : entrée vide, la validation de l'outil la refusera proprement.
    return {};
  }
}

async function consumeStream(
  body: ReadableStream<Uint8Array>,
  onTextDelta: (text: string) => void
): Promise<LlmTurnResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<number, ToolCallAccumulator>();
  let text = '';
  let finishReason: string | null | undefined;
  let buffer = '';
  let done = false;

  const handleData = (data: string) => {
    if (data === '[DONE]') {
      done = true;
      return;
    }
    let chunk: StreamChunk;
    try {
      chunk = JSON.parse(data) as StreamChunk;
    } catch {
      return; // ligne SSE illisible : ignorée
    }
    if (chunk.error) {
      const code = Number(chunk.error.code);
      throw new UpstreamStatusError(Number.isFinite(code) ? code : undefined);
    }
    const choice = chunk.choices?.[0];
    if (!choice) return;
    const delta = choice.delta;
    if (delta?.content) {
      text += delta.content;
      onTextDelta(delta.content);
    }
    for (const fragment of delta?.tool_calls ?? []) {
      const index = fragment.index ?? 0;
      const acc = calls.get(index) ?? { id: '', name: '', args: '' };
      if (fragment.id) acc.id = fragment.id;
      if (fragment.function?.name) acc.name += fragment.function.name;
      if (fragment.function?.arguments) acc.args += fragment.function.arguments;
      calls.set(index, acc);
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  };

  const handleLine = (line: string) => {
    // Lignes vides et commentaires (`: OPENROUTER PROCESSING`) ignorés.
    if (!line || line.startsWith(':')) return;
    if (!line.startsWith('data:')) return;
    handleData(line.slice(5).trim());
  };

  while (!done) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      handleLine(buffer.slice(0, newline).replace(/\r$/, ''));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  buffer += decoder.decode();
  if (!done && buffer) handleLine(buffer.replace(/\r$/, ''));
  reader.cancel().catch(() => undefined);

  const toolCalls = [...calls.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, acc]) => acc.name)
    .map(([index, acc]) => ({
      id: acc.id || `call_${index}`,
      name: acc.name,
      input: parseToolInput(acc.args)
    }));

  const assistantContent: LlmBlock[] = [
    ...(text ? [{ type: 'text', text } as LlmBlock] : []),
    ...toolCalls.map((call): LlmBlock => ({ type: 'tool_use', id: call.id, name: call.name, input: call.input }))
  ];

  let stopReason = translateFinishReason(finishReason);
  // Certains modèles terminent par `stop` tout en ayant émis des appels d'outils.
  if (toolCalls.length > 0 && stopReason === 'end_turn') stopReason = 'tool_use';

  return { stopReason, assistantContent, toolCalls };
}

// --- Fournisseur ------------------------------------------------------------

export type OpenRouterFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface OpenRouterProviderOptions {
  /** Injection pour les tests ; par défaut le `fetch` global. */
  fetch?: OpenRouterFetch;
  /** Injection pour les tests ; par défaut la configuration effective (base, sinon env). */
  getConfig?: () => Promise<ProviderRuntimeConfig>;
}

export class OpenRouterProvider implements LlmProvider {
  readonly id = 'openrouter' as const;
  private readonly fetchImpl: OpenRouterFetch;
  private readonly getConfig: () => Promise<ProviderRuntimeConfig>;

  constructor(options: OpenRouterProviderOptions = {}) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.getConfig = options.getConfig ?? getEffectiveAiConfig;
  }

  private buildRequest(
    req: { system: string; messages: LlmMessage[]; tools: LlmToolSpec[]; maxOutputTokens: number },
    model: string
  ): { url: string; headers: Record<string, string>; body: string } {
    // Clé passée explicitement depuis `env` (jamais en base) ; absente : erreur propre, sans planter.
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
      logger.error('ImmoCopilot : OPENROUTER_API_KEY absente');
      throw new LlmProviderError(t("L'assistant est momentanément indisponible. Réessayez dans un instant."), {
        retryable: false
      });
    }
    const payload = {
      model,
      max_tokens: req.maxOutputTokens,
      stream: true,
      messages: toOpenAiMessages(req.system, req.messages),
      ...(req.tools.length > 0
        ? {
            tools: req.tools.map(tool => ({
              type: 'function',
              function: { name: tool.name, description: tool.description, parameters: tool.inputSchema }
            })),
            tool_choice: 'auto'
          }
        : {})
    };
    return {
      url: `${env.OPENROUTER_BASE_URL.replace(/\/+$/, '')}/chat/completions`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'HTTP-Referer': env.FRONTEND_URL,
        'X-Title': 'ImmoTopia'
      },
      body: JSON.stringify(payload)
    };
  }

  async runTurn(
    req: { system: string; messages: LlmMessage[]; tools: LlmToolSpec[]; maxOutputTokens: number },
    onTextDelta: (text: string) => void,
    signal: AbortSignal
  ): Promise<LlmTurnResult> {
    if (signal.aborted) throw createAbortError();

    // Modèle relu à chaque tour : un changement d'admin s'applique à chaud.
    const config = await this.getConfig();
    if (signal.aborted) throw createAbortError(); // coupé pendant la lecture de la configuration
    const request = this.buildRequest(req, config.model);

    // Abandon relié au signal de l'appelant et au délai global.
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, env.AI_REQUEST_TIMEOUT_MS);
    const onCallerAbort = () => controller.abort();
    signal.addEventListener('abort', onCallerAbort, { once: true });

    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(createAbortError()), { once: true });
    });
    aborted.catch(() => undefined);

    try {
      const work = (async () => {
        const response = await this.fetchImpl(request.url, {
          method: 'POST',
          headers: request.headers,
          body: request.body,
          signal: controller.signal
        });
        if (!response.ok) throw new UpstreamStatusError(response.status);
        if (!response.body) throw new UpstreamStatusError(undefined);
        return consumeStream(response.body, onTextDelta);
      })();
      work.catch(() => undefined);
      return await Promise.race([work, aborted]);
    } catch (error) {
      if (timedOut) {
        logger.warn('ImmoCopilot : délai dépassé côté fournisseur', { timeoutMs: env.AI_REQUEST_TIMEOUT_MS });
        throw new LlmProviderError(t("L'assistant a mis trop de temps à répondre. Réessayez."), { retryable: true });
      }
      if (signal.aborted || isAbortError(error)) throw createAbortError();
      if (error instanceof LlmProviderError) throw error;

      const status = error instanceof UpstreamStatusError ? error.status : undefined;
      // Jamais le message amont à l'utilisateur ; on journalise seulement le type et le statut.
      logger.warn('ImmoCopilot : erreur du fournisseur', {
        provider: 'openrouter',
        errorName: error instanceof Error ? error.name : typeof error,
        status
      });
      throw new LlmProviderError(t("L'assistant est momentanément indisponible. Réessayez dans un instant."), {
        retryable: status === undefined || status === 429 || status >= 500,
        upstreamStatus: status
      });
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onCallerAbort);
      controller.abort();
    }
  }
}
