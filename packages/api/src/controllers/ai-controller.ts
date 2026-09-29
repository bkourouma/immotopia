import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { AiDisabledError } from '../middleware/ai-access-middleware';
import { asyncHandler, ForbiddenError } from '../middleware/error-middleware';
import {
  chatRequestSchema,
  COPILOT_MAX_MESSAGE_CHARS,
  COPILOT_MAX_MESSAGES,
  executeRequestSchema
} from '../lib/ai/contracts';
import type { CopilotStatus, CopilotToolDefinition } from '../lib/ai/contracts';
import { executeRentalDocument } from '../lib/ai/actions/execute-rental-document';
import { runChat } from '../lib/ai/orchestrator';
import { resolvePageContext } from '../lib/ai/page-context';
import { getLlmProvider } from '../lib/ai/providers';
import { openSseStream } from '../lib/ai/sse';
import { toolsForUser, type ToolFeature } from '../lib/ai/tools/registry';
import { evaluateFeatureAccess } from '../lib/subscription/feature-access';
import { getSubscriptionEnforcement } from '../lib/subscription/enforcement';
import { getEntitlements } from '../services/subscription-v2-service';
import { getUserPermissions } from '../services/permission-service';
import { logger } from '../utils/logger';

/**
 * Contrôleur d'ImmoCopilot (docs/architecture/PLAN_IMMOCOPILOT.md, lot E).
 *
 * `chatHandler` (flux SSE) ne mène à aucune écriture : il passe par
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
 * (aucun filtre) hors mode `enforce`, ou si les droits sont indisponibles :
 * comme le garde d'abonnement, une panne du module ne ferme pas l'assistant.
 */
async function entitledFeatures(
  tenantId: string
): Promise<{ read: Set<ToolFeature>; write: Set<ToolFeature> } | undefined> {
  if (getSubscriptionEnforcement() !== 'enforce') return undefined;
  try {
    const entitlements = await getEntitlements(tenantId);
    const allowed = (write: boolean) =>
      new Set(TOOL_FEATURES.filter(feature => evaluateFeatureAccess(entitlements, feature, write).allowed));
    return { read: allowed(false), write: allowed(true) };
  } catch (error) {
    logger.error('ImmoCopilot : droits d’abonnement indisponibles, outils non filtrés', { tenantId, error });
    return undefined;
  }
}

/** Outils que cet utilisateur peut employer : permission détenue et module d'abonnement inclus. */
async function resolveAvailableTools(
  userId: string,
  tenantId: string
): Promise<{ permissions: Set<string>; tools: CopilotToolDefinition[] }> {
  const permissions = new Set(await getUserPermissions(userId, tenantId));
  const features = await entitledFeatures(tenantId);
  // Une proposition prépare une écriture : elle exige l'accès en écriture au module.
  const tools = toolsForUser(permissions, features?.read).filter(
    tool => tool.kind !== 'proposal' || !features || features.write.has(tool.feature)
  );
  return { permissions, tools };
}

/** GET /ai/status — ce que l'interface peut proposer à cet utilisateur. Répond aussi quand l'assistant est désactivé. */
export const getStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = requireContext(req);
  const provider = getLlmProvider();
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
  const provider = getLlmProvider();
  if (!provider) throw new AiDisabledError();

  const body = chatRequestSchema.parse(req.body ?? {});

  const { permissions, tools } = await resolveAvailableTools(userId, tenantId);
  if (tools.length === 0) {
    throw new ForbiddenError("Aucun outil de l'assistant n'est disponible avec vos droits.");
  }
  const pageContext = await resolvePageContext(body.context, tenantId, permissions);

  const stream = openSseStream(res);
  try {
    await runChat({
      provider,
      tenantId,
      userId,
      permissions,
      tools,
      messages: body.messages,
      pageContext,
      // La valeur cliente n'est qu'un écho pour l'interface ; l'audit la préfixe par l'utilisateur.
      conversationId: body.conversationId ?? randomUUID(),
      requestId: randomUUID(),
      signal: stream.signal,
      emit: event => stream.send(event)
    });
  } finally {
    stream.end();
  }
});

/**
 * POST /ai/actions/execute — confirmation humaine d'une proposition.
 * Rejoue auth, agence, collaborateur et RENTAL_DOCUMENTS_GENERATE (routes),
 * puis le jeton signé, à usage unique. `userId` et `tenantId` viennent de la
 * requête authentifiée, jamais du corps. Toujours 201 : une quittance déjà
 * existante est renvoyée avec `alreadyExisted: true`.
 */
export const executeActionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = requireContext(req);
  const { proposalToken } = executeRequestSchema.parse(req.body ?? {});
  const { payload } = await executeRentalDocument({ token: proposalToken, userId, tenantId });
  res.status(201).json({ success: true, data: payload });
});
