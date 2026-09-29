import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../../config/env';
import { AppError } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import { logger } from '../../../utils/logger';
import type { CopilotErrorCode, LlmBlock, LlmMessage, LlmProvider, LlmToolSpec, LlmTurnResult } from '../contracts';

/**
 * Fournisseur Anthropic d'ImmoCopilot (docs/architecture/PLAN_IMMOCOPILOT.md,
 * décision 1 et lot C).
 *
 * Choix imposés par le plan :
 * - `client.beta.messages.stream`, clé passée explicitement depuis `env` ;
 * - `tool_choice: auto` (`any`/`tool` renvoient une 400), `eager_input_streaming`
 *   sur chaque outil ;
 * - ni `temperature` ni `thinking` ; `output_config: { effort }` ;
 * - repli serveur en cas de refus (`fallbacks: 'default'`, bêta
 *   `server-side-fallback-2026-07-01`) sauf `AI_REFUSAL_FALLBACK=off`.
 */

export const SERVER_SIDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Erreur typée du fournisseur. Elle étend `AppError` (503) et porte en plus le
 * `CopilotErrorCode` que l'orchestrateur place dans l'événement SSE `error`,
 * ainsi que `retryable`. `code` (hérité) reprend la même valeur.
 */
export class LlmProviderError extends AppError {
  readonly copilotCode: CopilotErrorCode;
  readonly retryable: boolean;
  readonly upstreamStatus?: number;

  constructor(message: string, options: { retryable: boolean; upstreamStatus?: number }) {
    super(message, 503, 'PROVIDER_UNAVAILABLE');
    this.copilotCode = 'PROVIDER_UNAVAILABLE';
    this.retryable = options.retryable;
    this.upstreamStatus = options.upstreamStatus;
  }
}

/** Abandon demandé par l'appelant (client parti) : ce n'est pas une panne. */
export function createAbortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

type StopReason = LlmTurnResult['stopReason'];

function translateStopReason(reason: string | null | undefined): StopReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end_turn';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    default:
      return 'other';
  }
}

type AnthropicMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type AnthropicContentParam = Anthropic.Beta.Messages.BetaContentBlockParam;

function toAnthropicBlock(block: LlmBlock): AnthropicContentParam {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };
    case 'tool_use':
      return {
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: (block.input ?? {}) as Record<string, unknown>
      };
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: block.toolUseId,
        content: block.content,
        ...(block.isError ? { is_error: true } : {})
      };
    case 'opaque':
      // Bloc natif (thinking, repli…) renvoyé tel quel, signature comprise.
      return block.raw as AnthropicContentParam;
  }
}

function toAnthropicMessages(messages: LlmMessage[]): AnthropicMessageParam[] {
  return messages.map(message => ({
    role: message.role,
    content: message.content.map(toAnthropicBlock)
  }));
}

function fromAnthropicContent(content: Anthropic.Beta.Messages.BetaContentBlock[]): LlmBlock[] {
  return content.map((block): LlmBlock => {
    if (block.type === 'text') return { type: 'text', text: block.text };
    if (block.type === 'tool_use') return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
    return { type: 'opaque', raw: block };
  });
}

export interface AnthropicProviderOptions {
  /** Injection pour les tests ; par défaut un client construit depuis `env`. */
  client?: Anthropic;
}

export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic' as const;
  private client: Anthropic | null;

  constructor(options: AnthropicProviderOptions = {}) {
    this.client = options.client ?? null;
  }

  private getClient(): Anthropic {
    if (!this.client) {
      // Clé passée explicitement : jamais lue implicitement par le SDK.
      this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  async runTurn(
    req: { system: string; messages: LlmMessage[]; tools: LlmToolSpec[]; maxOutputTokens: number },
    onTextDelta: (text: string) => void,
    signal: AbortSignal
  ): Promise<LlmTurnResult> {
    if (signal.aborted) throw createAbortError();

    const useFallback = env.AI_REFUSAL_FALLBACK !== 'off';

    const params: Anthropic.Beta.Messages.MessageCreateParams = {
      model: env.AI_MODEL,
      max_tokens: req.maxOutputTokens,
      system: req.system,
      messages: toAnthropicMessages(req.messages),
      tools: req.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema,
        eager_input_streaming: true
      })),
      tool_choice: { type: 'auto' },
      output_config: { effort: env.AI_EFFORT },
      ...(useFallback ? { fallbacks: 'default' as const, betas: [SERVER_SIDE_FALLBACK_BETA] } : {})
    };

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
    // Évite un « unhandled rejection » si l'appel réussit avant l'abandon.
    aborted.catch(() => undefined);

    try {
      const stream = this.getClient().beta.messages.stream(params, { signal: controller.signal });
      stream.on('text', (delta: string) => {
        if (delta) onTextDelta(delta);
      });
      const message = await Promise.race([stream.finalMessage(), aborted]);

      const assistantContent = fromAnthropicContent(message.content);
      return {
        stopReason: translateStopReason(message.stop_reason),
        assistantContent,
        toolCalls: assistantContent
          .filter((block): block is Extract<LlmBlock, { type: 'tool_use' }> => block.type === 'tool_use')
          .map(block => ({ id: block.id, name: block.name, input: block.input }))
      };
    } catch (error) {
      if (timedOut) {
        logger.warn('ImmoCopilot : délai dépassé côté fournisseur', { timeoutMs: env.AI_REQUEST_TIMEOUT_MS });
        throw new LlmProviderError(t("L'assistant a mis trop de temps à répondre. Réessayez."), { retryable: true });
      }
      if (signal.aborted || isAbortError(error)) throw createAbortError();

      const status =
        typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : undefined;
      // Jamais le message du SDK à l'utilisateur ; on journalise seulement le type et le statut.
      logger.warn('ImmoCopilot : erreur du fournisseur', {
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
    }
  }
}
