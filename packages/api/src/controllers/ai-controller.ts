import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { buildArtifactPdf } from '../lib/ai/artifact-pdf';
import { buildArtifactPowerPoint } from '../lib/ai/artifact-pptx';
import type { Request, Response } from 'express';
import { AiDisabledError } from '../middleware/ai-access-middleware';
import { AppError, asyncHandler, ForbiddenError } from '../middleware/error-middleware';
import { t } from '../i18n';
import {
  chatRequestSchema,
  COPILOT_MAX_MESSAGE_CHARS,
  COPILOT_MAX_MESSAGES,
  executeRequestSchema,
  rejectRequestSchema
} from '../lib/ai/contracts';
import type { CopilotStatus, CopilotToolDefinition } from '../lib/ai/contracts';
import { executeCapability } from '../lib/ai/actions/execute-capability';
import { executeRentalDocument } from '../lib/ai/actions/execute-rental-document';
import { ProposalError, peekProposalAction, redeemProposal, verifyAnyProposal } from '../lib/ai/proposal-token';
import { logAuditEvent } from '../services/audit-service';
import { AuditActionKey } from '../types/audit-types';
import { runChat } from '../lib/ai/orchestrator';
import { resolvePageContext } from '../lib/ai/page-context';
import { getLlmProvider } from '../lib/ai/providers';
import { loopbackHeadersFor } from '../lib/ai/gateway/loopback-auth';
import { openSseStream } from '../lib/ai/sse';
import type { CopilotSseEvent } from '../lib/ai/contracts';
import {
  assistantScope,
  beginAssistantTurn,
  conversationParams,
  conversationPatch,
  deleteConversation,
  finishAssistantTurn,
  getConversation,
  getStoredArtifact,
  historyQuery,
  listConversations,
  updateConversation
} from '../lib/ai/conversations';
import { toolsForUser, type ToolFeature } from '../lib/ai/tools/registry';
import { evaluateFeatureAccess } from '../lib/subscription/feature-access';
import { getSubscriptionEnforcement } from '../lib/subscription/enforcement';
import { getEntitlements } from '../services/subscription-v2-service';
import { getUserPermissions, hasPermission } from '../services/permission-service';
import { assertModuleAccess, assertSubscriptionWritable } from '../lib/subscription/guards';
import { logger } from '../utils/logger';

/**
 * Contrôleur d'ImmoCopilot (docs/architecture/PLAN_IMMOCOPILOT.md, lot E).
 *
 * `chatHandler` (flux SSE) ne modifie aucune donnée métier : il passe par
 * l'orchestrateur, qui n'atteint que le registre d'outils autorisé.
 * `executeActionHandler` est la SEULE porte de génération : route HTTP
 * distincte, avec `requireDocumentsGenerate` et un jeton de proposition signé.
 */

function requireContext(req: Request): { tenantId: string; userId: string } {
  const tenantId = req.tenantContext?.tenantId;
  const userId = req.user?.userId;
  if (!tenantId || !userId) throw new ForbiddenError();
  return { tenantId, userId };
}

const TOOL_FEATURES: readonly ToolFeature[] = ['CORE', 'RENTAL'];

/**
 * Modules de l'abonnement ouvrant chaque fonctionnalité d'outil. `undefined`
 * (aucun filtre) hors mode `enforce`. Les conversations persistantes exigent
 * un périmètre établi avant de relire des données déjà calculées.
 */
async function entitledFeatures(
  tenantId: string,
  requireFreshScope: boolean
): Promise<{ read: Set<ToolFeature>; write: Set<ToolFeature> } | undefined> {
  if (getSubscriptionEnforcement() !== 'enforce') return undefined;
  try {
    const entitlements = await getEntitlements(tenantId);
    const allowed = (write: boolean) =>
      new Set(TOOL_FEATURES.filter(feature => evaluateFeatureAccess(entitlements, feature, write).allowed));
    return { read: allowed(false), write: allowed(true) };
  } catch (error) {
    logger.error('ImmoCopilot : droits d’abonnement indisponibles', { tenantId, error });
    if (requireFreshScope) throw new AppError(t('Les droits de l’assistant sont temporairement indisponibles.'), 503);
    return undefined;
  }
}

/** Outils que cet utilisateur peut employer : permission détenue et module d'abonnement inclus. */
async function resolveAvailableTools(
  userId: string,
  tenantId: string,
  requireFreshScope = false
): Promise<{ permissions: Set<string>; tools: CopilotToolDefinition[]; unavailableFeatures: Set<ToolFeature> }> {
  const permissions = new Set(await getUserPermissions(userId, tenantId));
  const features = await entitledFeatures(tenantId, requireFreshScope);
  // Une proposition prépare une écriture : elle exige l'accès en écriture au module.
  const tools = toolsForUser(permissions, features?.read).filter(
    tool => tool.kind !== 'proposal' || !features || features.write.has(tool.feature)
  );
  // Fonctionnalités sans accès en lecture : un appel forgé reçoit MODULE_NOT_INCLUDED.
  const unavailableFeatures = new Set<ToolFeature>(
    features ? TOOL_FEATURES.filter(feature => !features.read.has(feature)) : []
  );
  return { permissions, tools, unavailableFeatures };
}

async function conversationScope(req: Request) {
  const { tenantId, userId } = requireContext(req);
  const { permissions, tools } = await resolveAvailableTools(userId, tenantId, true);
  if (tools.length === 0) throw new ForbiddenError();
  return {
    owner: { tenantId, ownerId: userId },
    scopeKey: assistantScope(
      permissions,
      tools.map(tool => tool.name)
    )
  };
}

export const listConversationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = historyQuery.parse(req.query);
  const { owner, scopeKey } = await conversationScope(req);
  res
    .set('Cache-Control', 'private, no-store')
    .json({ success: true, data: await listConversations(owner, scopeKey, query) });
});

export const getConversationHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = conversationParams.parse(req.params);
  const { owner, scopeKey } = await conversationScope(req);
  res
    .set('Cache-Control', 'private, no-store')
    .json({ success: true, data: await getConversation(owner, id, scopeKey) });
});

const artifactExportParams = z.object({ id: z.string().uuid(), artifactId: z.string().uuid() });

const artifactExportFormat = z.enum(['pdf', 'pptx']);

export const downloadArtifactHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id, artifactId } = artifactExportParams.parse(req.params);
  const { owner, scopeKey } = await conversationScope(req);
  const artifact = await getStoredArtifact(owner, id, artifactId, scopeKey);
  const format = artifactExportFormat.parse(req.params.format);
  const file = format === 'pdf' ? await buildArtifactPdf(artifact) : await buildArtifactPowerPoint(artifact);
  const filename =
    artifact.title
      .replace(/[^\p{L}\p{N} ._-]+/gu, ' ')
      .trim()
      .slice(0, 100) || 'ImmoTopia';
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set(
    'Content-Disposition',
    `attachment; filename="ImmoTopia.${format}"; filename*=UTF-8''${encodeURIComponent(filename)}.${format}`
  );
  res
    .type(
      format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    )
    .send(file);
});

export const updateConversationHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = conversationParams.parse(req.params);
  const changes = conversationPatch.parse(req.body);
  const { owner, scopeKey } = await conversationScope(req);
  await updateConversation(owner, id, scopeKey, changes);
  res.sendStatus(204);
});

export const deleteConversationHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = conversationParams.parse(req.params);
  const { tenantId, userId } = requireContext(req);
  await deleteConversation({ tenantId, ownerId: userId }, id);
  res.sendStatus(204);
});

/** GET /ai/status — ce que l'interface peut proposer à cet utilisateur. Répond aussi quand l'assistant est désactivé. */
export const getStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = requireContext(req);
  const provider = await getLlmProvider();
  const limits = { maxMessages: COPILOT_MAX_MESSAGES, maxMessageChars: COPILOT_MAX_MESSAGE_CHARS };

  let status: CopilotStatus;
  if (!provider) {
    status = { enabled: false, reason: 'NOT_CONFIGURED', provider: null, tools: [], limits };
  } else {
    const { tools } = await resolveAvailableTools(userId, tenantId);
    status =
      tools.length === 0
        ? { enabled: false, reason: 'NO_TOOLS', provider: provider.id, tools: [], limits }
        : { enabled: true, provider: provider.id, tools: tools.map(tool => tool.name), limits };
  }
  res.json({ success: true, data: status });
});

/**
 * POST /ai/chat — conversation en flux SSE.
 *
 * Tout ce qui peut échouer proprement échoue AVANT l'ouverture du flux, en
 * JSON typé (corps invalide 400, assistant désactivé 503, aucun outil 403).
 * Une fois les en-têtes envoyés, l'orchestrateur convertit toute erreur en
 * événement `error` puis `done`.
 */
export const chatHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = requireContext(req);
  const provider = await getLlmProvider();
  if (!provider) throw new AiDisabledError();

  const body = chatRequestSchema.parse(req.body ?? {});

  const { permissions, tools, unavailableFeatures } = await resolveAvailableTools(
    userId,
    tenantId,
    Boolean(body.turnId)
  );
  if (tools.length === 0) {
    throw new ForbiddenError("Aucun outil de l'assistant n'est disponible avec vos droits.");
  }
  const pageContext = await resolvePageContext(body.context, tenantId, permissions);

  const owner = { tenantId, ownerId: userId };
  const saved = body.turnId
    ? await beginAssistantTurn(
        owner,
        assistantScope(
          permissions,
          tools.map(tool => tool.name)
        ),
        {
          conversationId: body.conversationId,
          turnId: body.turnId,
          question: body.messages[0].content
        }
      )
    : undefined;

  const stream = openSseStream(res);
  const deadline = new AbortController();
  const timeout = saved ? setTimeout(() => deadline.abort(), 300_000) : undefined;
  timeout?.unref();
  const signal = saved ? AbortSignal.any([stream.signal, deadline.signal]) : stream.signal;
  const result: Extract<CopilotSseEvent, { type: 'artifact' }>[] = [];
  let response = '';
  let terminal: Extract<CopilotSseEvent, { type: 'done' }> | undefined;
  try {
    const outcome = await runChat({
      provider,
      deep: body.deep,
      analysisTables: saved?.analysisTables,
      tenantId,
      userId,
      permissions,
      tools,
      unavailableFeatures,
      messages: saved?.messages ?? body.messages,
      pageContext,
      conversationId: saved?.conversationId ?? body.conversationId ?? randomUUID(),
      requestId: randomUUID(),
      signal,
      loopbackHeaders: loopbackHeadersFor(req),
      emit: event => {
        if (body.turnId) {
          if (event.type === 'text_delta') response = (response + event.text).slice(0, 100_000);
          if (event.type === 'artifact' && result.length < 20) result.push(event);
          if (event.type === 'done') {
            terminal = event;
            return;
          }
        }
        stream.send(event);
      }
    });
    if (body.turnId) {
      await finishAssistantTurn(owner, body.turnId, { response, result, outcome });
      if (terminal) stream.send(terminal);
    }
  } catch {
    if (body.turnId) {
      logger.error('ImmoCopilot : échec de persistance du tour', { tenantId, turnId: body.turnId });
      stream.send({
        type: 'error',
        code: 'INTERNAL',
        message: t('La conversation n’a pas pu être enregistrée.'),
        retryable: true
      });
      stream.send({ type: 'done', reason: 'error' });
    }
  } finally {
    clearTimeout(timeout);
    stream.end();
  }
});

const RENTAL_GENERATE = 'RENTAL_DOCUMENTS_GENERATE';
/** Le téléchargement du document produit exige aussi la lecture. */
const RENTAL_VIEW = 'RENTAL_DOCUMENTS_VIEW';

/**
 * Module « location » de l'abonnement, exigé pour confirmer une quittance (il l'était par la table
 * `route-features` quand `/ai/actions` entier était classé RENTAL ; une écriture générique n'en dépend pas :
 * la route réellement appelée porte son propre module). Même décision que `subscriptionRouteGuard`, en `enforce`.
 */
async function assertRentalWritable(tenantId: string): Promise<void> {
  if (getSubscriptionEnforcement() !== 'enforce') return;
  let entitlements: Awaited<ReturnType<typeof getEntitlements>>;
  try {
    entitlements = await getEntitlements(tenantId);
  } catch (error) {
    logger.error('ImmoCopilot : droits d’abonnement indisponibles, confirmation non filtrée', { tenantId, error });
    return;
  }
  if (entitlements.enforcement !== 'enforce') return;
  const decision = evaluateFeatureAccess(entitlements, 'RENTAL', true);
  if (decision.allowed) return;
  if (decision.code === 'SUBSCRIPTION_READ_ONLY') assertSubscriptionWritable(entitlements);
  else if (decision.moduleKey) assertModuleAccess(entitlements, decision.moduleKey, { write: true });
}

/**
 * POST /ai/actions/execute — confirmation humaine d'une proposition (SEULE porte d'écriture
 * de l'assistant). Rejoue auth, agence, collaborateur, garde de l'assistant (routes), puis
 * aiguille selon l'action du jeton (lue sans confiance, chaque exécuteur re-vérifie tout) :
 *
 * - `EXECUTE_CAPABILITY` (plan d'écriture générique, étape 4) : aucune permission fixe ici,
 *   l'écriture part par loopback sous l'identité de l'utilisateur qui confirme et c'est la route
 *   réelle qui porte la permission de l'écriture ; l'exécuteur relit en plus les permissions
 *   connues du catalogue. `confirmation` (mot CONFIRMER) exigé pour un plan sensible. 201 si la
 *   route a réussi, 200 avec `ok: false` si elle a refusé (le jeton est alors consommé).
 * - `GENERATE_RENTAL_DOCUMENT` (ou jeton illisible) : `RENTAL_DOCUMENTS_GENERATE` ET
 *   `RENTAL_DOCUMENTS_VIEW`, module location de l'abonnement, puis jeton. Toujours 201 : une
 *   quittance déjà existante est renvoyée avec `alreadyExisted: true`.
 *
 * `userId` et `tenantId` viennent de la requête authentifiée, jamais du corps.
 */
export const executeActionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = requireContext(req);
  const { proposalToken, confirmation } = executeRequestSchema.parse(req.body ?? {});

  if (peekProposalAction(proposalToken) === 'EXECUTE_CAPABILITY') {
    const { payload } = await executeCapability({
      token: proposalToken,
      userId,
      tenantId,
      confirmation,
      loopbackHeaders: loopbackHeadersFor(req)
    });
    res.status(payload.ok ? 201 : 200).json({ success: true, data: payload });
    return;
  }

  if (
    !(await hasPermission(userId, RENTAL_GENERATE, tenantId)) ||
    !(await hasPermission(userId, RENTAL_VIEW, tenantId))
  ) {
    throw new ForbiddenError(t("Vous n'avez pas la permission de générer ce document."));
  }
  await assertRentalWritable(tenantId);
  const { payload } = await executeRentalDocument({ token: proposalToken, userId, tenantId });
  res.status(201).json({ success: true, data: payload });
});

/**
 * POST /ai/actions/reject — l'humain REFUSE un plan : le jeton est CONSOMMÉ (même mécanisme d'usage
 * unique que l'exécution), pour qu'un plan refusé ne puisse plus jamais être confirmé (jeton volé ou
 * conservé). Mêmes middlewares que `execute`, sans permission de génération : refuser n'écrit rien.
 *
 * Signature, utilisateur et agence vérifiés (`PROPOSAL_INVALID` 400 sinon). Idempotent : un jeton déjà
 * utilisé ou expiré répond 200 `{ rejected: false }`, sans erreur. Audit `AI_PROPOSAL_REJECTED`
 * (identifiant du plan seulement, jamais le jeton ni le corps).
 */
export const rejectActionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = requireContext(req);
  const { proposalToken } = rejectRequestSchema.parse(req.body ?? {});

  let rejected = false;
  try {
    const claims = verifyAnyProposal(proposalToken, { userId, tenantId });
    await redeemProposal(claims);
    rejected = true;
    logAuditEvent({
      actorUserId: userId,
      tenantId,
      actionKey: AuditActionKey.AI_PROPOSAL_REJECTED,
      entityType: 'AI_PROPOSAL',
      entityId: claims.jti,
      payload: {
        act: claims.act,
        ...(claims.act === 'EXECUTE_CAPABILITY' ? { capabilityId: claims.args.capabilityId } : {})
      }
    });
  } catch (error) {
    // Déjà utilisé ou expiré : rien à révoquer. Toute autre erreur (signature, utilisateur, agence) reste une erreur.
    const idempotent =
      error instanceof ProposalError && (error.code === 'PROPOSAL_ALREADY_USED' || error.code === 'PROPOSAL_EXPIRED');
    if (!idempotent) throw error;
  }
  res.json({ success: true, data: { rejected } });
});
