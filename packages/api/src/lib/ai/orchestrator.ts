import { env } from '../../config/env';
import { currentLanguage, t } from '../../i18n';
import { AppError, ForbiddenError } from '../../middleware/error-middleware';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { logger } from '../../utils/logger';
import type {
  ChatRequest,
  CopilotErrorCode,
  CopilotSseEvent,
  CopilotToolContext,
  CopilotToolDefinition,
  LlmMessage,
  LlmProvider,
  LlmTurnResult
} from './contracts';
import { formatContextBlock, type ResolvedPageContext } from './page-context';
import { isAbortError, LlmProviderError } from './providers';
import { buildSystemPrompt } from './system-prompt';
import { ALL_TOOLS, findTool, toLlmToolSpecs } from './tools/registry';

/**
 * Orchestrateur du chat ImmoCopilot (docs/architecture/PLAN_IMMOCOPILOT.md,
 * lot E). Boucle : le modèle répond, demande des outils, l'orchestrateur les
 * exécute et rend les résultats, jusqu'à une réponse finale.
 *
 * GARANTIE CENTRALE : aucun chemin du chat vers une écriture. Ce module
 * n'importe ni `executeRentalDocument` ni `generateDocument`. Les seuls outils
 * joignables sont ceux du registre autorisé pour l'utilisateur (lecture, ou
 * proposition qui n'écrit rien) ; la génération n'existe que derrière la route
 * HTTP de confirmation, avec un jeton signé.
 *
 * Tout ce qui vient du modèle est non fiable : un nom d'outil hors registre
 * autorisé est refusé et audité, chaque entrée est validée par le schéma Zod
 * strict de l'outil, `tenantId` et `userId` viennent du contexte de la requête.
 */

/** Plafond d'appels d'outils par requête (plan, décision 4). */
export const MAX_TOOL_CALLS_PER_REQUEST = 8;

export type ChatDoneReason = Extract<CopilotSseEvent, { type: 'done' }>['reason'];

export interface RunChatInput {
  provider: LlmProvider;
  tenantId: string;
  userId: string;
  permissions: ReadonlySet<string>;
  /** Outils autorisés pour cet utilisateur (`toolsForUser`), jamais plus. */
  tools: readonly CopilotToolDefinition[];
  /** Conversation déjà validée par `chatRequestSchema`. */
  messages: ChatRequest['messages'];
  /** Contexte d'écran déjà vérifié (page-context.ts), ou null. */
  pageContext: ResolvedPageContext | null;
  conversationId: string;
  requestId: string;
  signal: AbortSignal;
  emit: (event: CopilotSseEvent) => void;
  now?: () => Date;
}

type ToolResultBlock = Extract<LlmMessage['content'][number], { type: 'tool_result' }>;

const KNOWN_TOOL_NAMES: ReadonlySet<string> = new Set(ALL_TOOLS.map(tool => tool.name));
const MAX_ISSUES_REPORTED = 5;

function errorResult(
  toolUseId: string,
  error: string,
  message: string,
  extra?: Record<string, unknown>
): ToolResultBlock {
  return { type: 'tool_result', toolUseId, isError: true, content: JSON.stringify({ error, message, ...extra }) };
}

/** Messages de la conversation : rôles alternés, premier message utilisateur (exigence des fournisseurs). */
function toLlmMessages(messages: ChatRequest['messages'], contextBlock: string): LlmMessage[] {
  const out: LlmMessage[] = [];
  const lastIndex = messages.length - 1;
  messages.forEach((message, index) => {
    if (out.length === 0 && message.role !== 'user') return;
    // Le bloc d'écran ouvre le DERNIER message utilisateur : c'est une donnée, séparée du texte par une ligne vide.
    const text = index === lastIndex ? `${contextBlock}\n\n${message.content}` : message.content;
    const previous = out[out.length - 1];
    if (previous && previous.role === message.role) {
      previous.content.push({ type: 'text', text });
    } else {
      out.push({ role: message.role, content: [{ type: 'text', text }] });
    }
  });
  return out;
}

function toSseError(error: unknown): { code: CopilotErrorCode; message: string; retryable: boolean } {
  if (error instanceof LlmProviderError) {
    return { code: error.copilotCode, message: error.message, retryable: error.retryable };
  }
  if (error instanceof AppError) {
    return { code: 'INTERNAL', message: t(error.message), retryable: false };
  }
  // Erreur non typée : jamais son message brut (chemin, requête SQL, clé…).
  return { code: 'INTERNAL', message: t('Une erreur est survenue. Réessayez dans un instant.'), retryable: true };
}

/**
 * Exécute un tour de chat complet et l'émet en événements. Se termine toujours
 * par un événement `done` ; ne lève pas d'erreur (elles deviennent `error`).
 */
export async function runChat(input: RunChatInput): Promise<ChatDoneReason> {
  const { provider, tenantId, userId, signal, emit } = input;
  const startedAt = Date.now();
  const maxRounds = env.AI_MAX_TOOL_ROUNDS;

  const system = buildSystemPrompt(currentLanguage());
  const messages = toLlmMessages(input.messages, formatContextBlock(input.pageContext, input.now?.()));
  const toolSpecs = toLlmToolSpecs(input.tools);
  const ctx: CopilotToolContext = {
    tenantId,
    userId,
    permissions: input.permissions,
    requestId: input.requestId,
    conversationId: input.conversationId,
    signal
  };

  let rounds = 0;
  let toolCalls = 0;
  let outcome: ChatDoneReason = 'end_turn';
  let errorCode: CopilotErrorCode | undefined;

  const fail = (code: CopilotErrorCode, message: string, retryable: boolean): void => {
    errorCode = code;
    emit({ type: 'error', code, message, retryable });
  };

  emit({ type: 'meta', conversationId: input.conversationId, requestId: input.requestId });

  try {
    for (;;) {
      if (signal.aborted) {
        outcome = 'aborted';
        break;
      }

      const turn: LlmTurnResult = await provider.runTurn(
        { system, messages, tools: toolSpecs, maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS },
        text => emit({ type: 'text_delta', text }),
        signal
      );

      // Le contenu assistant est rejoué tel quel (blocs opaques compris).
      messages.push({ role: 'assistant', content: turn.assistantContent });

      // Refus et coupure AVANT toute exécution d'outil : un appel d'outil
      // tronqué (max_tokens) ou issu d'un refus n'est jamais exécuté.
      if (turn.stopReason === 'refusal') {
        outcome = 'refusal';
        fail('PROVIDER_REFUSAL', t("L'assistant ne peut pas répondre à cette demande."), false);
        break;
      }
      if (turn.stopReason === 'max_tokens') {
        outcome = 'error';
        fail('INTERNAL', t('La réponse a été interrompue car elle est trop longue. Précisez votre demande.'), true);
        break;
      }
      if (turn.stopReason !== 'tool_use' || turn.toolCalls.length === 0) {
        outcome = 'end_turn';
        break;
      }

      if (rounds >= maxRounds || toolCalls + turn.toolCalls.length > MAX_TOOL_CALLS_PER_REQUEST) {
        outcome = 'max_rounds';
        fail('MAX_ROUNDS', t("La demande a nécessité trop d'étapes. Reformulez-la plus simplement."), false);
        break;
      }
      rounds += 1;

      const results: ToolResultBlock[] = [];
      for (const call of turn.toolCalls) {
        toolCalls += 1;
        results.push(await runToolCall(call, input, ctx));
        if (signal.aborted) break;
      }
      if (signal.aborted) {
        outcome = 'aborted';
        break;
      }
      // Tous les tool_result dans UN SEUL message utilisateur.
      messages.push({ role: 'user', content: results });
    }
  } catch (error) {
    if (signal.aborted || isAbortError(error)) {
      outcome = 'aborted';
    } else {
      outcome = 'error';
      const sse = toSseError(error);
      if (!(error instanceof AppError)) {
        logger.error('ImmoCopilot : erreur inattendue pendant le chat', {
          tenantId,
          requestId: input.requestId,
          error
        });
      }
      fail(sse.code, sse.message, sse.retryable);
    }
  }

  // Journal du tour : jamais le texte des messages ni des réponses.
  logAuditEvent({
    actorUserId: userId,
    tenantId,
    actionKey: AuditActionKey.AI_CHAT_TURN,
    entityType: 'AI_CONVERSATION',
    // Préfixé par l'utilisateur : l'identifiant vient du client, il ne sert jamais seul de clé d'audit.
    entityId: `${userId}:${input.conversationId}`,
    payload: {
      requestId: input.requestId,
      provider: provider.id,
      outcome,
      ...(errorCode ? { errorCode } : {}),
      rounds,
      toolCalls,
      messageCount: input.messages.length,
      durationMs: Date.now() - startedAt
    }
  });

  emit({ type: 'done', reason: outcome });
  return outcome;
}

/** Exécute un appel d'outil demandé par le modèle ; renvoie toujours un `tool_result`. */
async function runToolCall(
  call: LlmTurnResult['toolCalls'][number],
  input: RunChatInput,
  ctx: CopilotToolContext
): Promise<ToolResultBlock> {
  const { tenantId, userId, emit } = input;
  const tool = findTool(input.tools, call.name);
  const known = KNOWN_TOOL_NAMES.has(call.name);

  const audit = (actionKey: AuditActionKey, payload: Record<string, unknown>): void =>
    logAuditEvent({
      actorUserId: userId,
      tenantId,
      actionKey,
      entityType: 'AI_TOOL',
      entityId: input.requestId,
      payload: { tool: String(call.name).slice(0, 64), ...payload }
    });

  // Hors du registre autorisé : refusé, jamais exécuté, audité.
  if (!tool) {
    if (known) emit({ type: 'tool_status', tool: call.name as CopilotToolDefinition['name'], status: 'forbidden' });
    audit(AuditActionKey.AI_TOOL_DENIED, { reason: known ? 'NOT_PERMITTED' : 'UNKNOWN_TOOL' });
    return errorResult(call.id, 'TOOL_FORBIDDEN', "Cet outil n'est pas disponible.");
  }

  const startedAt = Date.now();
  emit({ type: 'tool_status', tool: tool.name, status: 'started' });

  const parsed = tool.inputSchema.safeParse(call.input);
  if (!parsed.success) {
    emit({ type: 'tool_status', tool: tool.name, status: 'failed' });
    audit(AuditActionKey.AI_TOOL_CALLED, { status: 'invalid_input', durationMs: Date.now() - startedAt });
    const issues = parsed.error.issues.slice(0, MAX_ISSUES_REPORTED).map(issue => ({
      path: issue.path.join('.'),
      message: issue.message.slice(0, 200)
    }));
    return errorResult(call.id, 'INVALID_INPUT', "Les paramètres de l'outil sont invalides.", { issues });
  }

  try {
    const result = await tool.execute(parsed.data, ctx);
    if (result.uiEvent) emit(result.uiEvent);
    emit({ type: 'tool_status', tool: tool.name, status: 'succeeded' });
    audit(AuditActionKey.AI_TOOL_CALLED, { status: 'ok', durationMs: Date.now() - startedAt });
    return { type: 'tool_result', toolUseId: call.id, content: JSON.stringify(result.modelResult) };
  } catch (error) {
    if (ctx.signal.aborted || isAbortError(error)) throw error;
    const denied = error instanceof ForbiddenError;
    emit({ type: 'tool_status', tool: tool.name, status: denied ? 'forbidden' : 'failed' });
    audit(denied ? AuditActionKey.AI_TOOL_DENIED : AuditActionKey.AI_TOOL_CALLED, {
      status: 'error',
      ...(denied ? { reason: 'PERMISSION' } : {}),
      durationMs: Date.now() - startedAt
    });
    if (error instanceof AppError) {
      // Message d'une erreur typée : rédigé pour l'utilisateur (« Bail introuvable. »), sans détail interne.
      return errorResult(call.id, error.code ?? 'ERROR', error.message);
    }
    logger.error('ImmoCopilot : échec inattendu d’un outil', { tenantId, tool: tool.name, error });
    return errorResult(call.id, 'INTERNAL', "L'outil a rencontré une erreur.");
  }
}
