import type { NextFunction, Request, Response } from 'express';
import {
  AppError,
  asyncHandler,
  BadRequestError,
  ErrorCode,
  NotFoundError,
  UnauthorizedError
} from '../middleware/error-middleware';
import { sendPrivateFile } from '../lib/files/private-files';
import { loadBlindLocationIds, buildStockMeta, resolveStockCallerContext } from '../lib/finance/stock-controles';
import { prisma } from '../utils/database';
import {
  createRegistration,
  getRegistration,
  listEligibleMembers,
  listEligibleSites,
  listRegistrations,
  regenerateActivationCode,
  revokeRegistration,
  updateRegistrationSites
} from '../lib/stock-whatsapp/registrations/service';
import {
  advanceSimulatorClockBodySchema,
  capturesQuerySchema,
  createRegistrationBodySchema,
  fieldCountsQuerySchema,
  isUuid,
  listRegistrationsQuerySchema,
  overviewQuerySchema,
  removeCapturePhotoBodySchema,
  revokeRegistrationBodySchema,
  sessionsQuerySchema,
  simulatorConversationQuerySchema,
  simulatorPhotoFieldsSchema,
  simulatorTextOrReplySchema,
  updateRegistrationSitesBodySchema
} from '../lib/stock-whatsapp/admin/schemas';
import { getWhatsappOverview } from '../lib/stock-whatsapp/admin/overview';
import { listFieldCounts } from '../lib/stock-whatsapp/admin/field-counts';
import {
  getCapture,
  getCaptureFile,
  listCaptures,
  listCountCaptures,
  removeCapturePhoto
} from '../lib/stock-whatsapp/admin/captures';
import { listSessionMessages, listSessions } from '../lib/stock-whatsapp/admin/sessions';
import {
  advanceSimulatorSession,
  getSimulatorConversation,
  injectSimulatorMessage,
  isWhatsappSimulatorAvailable,
  simulatorUnavailableError,
  type SimulatorTarget
} from '../lib/stock-whatsapp/admin/simulator';

/**
 * Contrôleur des routes d'agence de l'inventaire par WhatsApp (lot 041,
 * contrat `specs/041-inventaire-whatsapp/contracts/openapi.yaml`).
 *
 * Modèle : `property-media-controller.ts` — chaque gestionnaire est enveloppé
 * dans `asyncHandler`, lève des erreurs typées (`AppError` à code
 * `STOCK_WHATSAPP_*`) et laisse le gestionnaire central fixer le statut ; aucun
 * `try/catch` ne devine un statut à partir d'un message.
 *
 * `tenantId` vient TOUJOURS de l'URL (vérifié par `requireTenantAccess`),
 * jamais du corps ni d'une query ; l'acteur est l'utilisateur authentifié.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations du stock.');
  }
  return tenantId;
}

function requireUserId(req: Request): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new UnauthorizedError();
  }
  return userId;
}

/** Un identifiant de chemin mal formé répond comme un objet inexistant. */
function pathId(req: Request, name: string, message: string): string {
  const value = req.params[name];
  if (!isUuid(value)) throw new NotFoundError(message);
  return value;
}

function sitesRequired(): AppError {
  return new AppError('Choisissez au moins un chantier.', 400, ErrorCode.STOCK_WHATSAPP_SITES_REQUIRED);
}

// ---------------------------------------------------------------------------
// Gardes propres à ce module
// ---------------------------------------------------------------------------

/**
 * Le simulateur, AVANT toute lecture (W13-R1) : ni droit, ni corps, ni fichier,
 * ni base ne sont lus sur un serveur qui ne l'offre pas.
 */
export function requireSimulatorAvailable(_req: Request, _res: Response, next: NextFunction): void {
  if (!isWhatsappSimulatorAvailable()) {
    next(simulatorUnavailableError());
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Passerelle, quota, mesures
// ---------------------------------------------------------------------------

export const getOverviewHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = overviewQuerySchema.parse(req.query ?? {});
  res.status(200).json({ success: true, data: await getWhatsappOverview(tenantId, query.month) });
});

// ---------------------------------------------------------------------------
// Inscriptions (W3) — service du territoire W3
// ---------------------------------------------------------------------------

export const listEligibleMembersHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  res.status(200).json({ success: true, data: await listEligibleMembers(tenantId, requireUserId(req), {}) });
});

export const listEligibleSitesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  res.status(200).json({ success: true, data: await listEligibleSites(tenantId, requireUserId(req), {}) });
});

export const listRegistrationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listRegistrationsQuerySchema.parse(req.query ?? {});
  res.status(200).json({
    success: true,
    data: await listRegistrations(tenantId, requireUserId(req), { status: query.status })
  });
});

export const createRegistrationHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const actorUserId = requireUserId(req);
  const body = createRegistrationBodySchema.parse(req.body ?? {});
  if (body.siteIds.length === 0) throw sitesRequired();

  const created = await createRegistration(tenantId, actorUserId, {
    userId: body.userId,
    phone: body.phone,
    siteIds: body.siteIds
  });
  res.status(201).json({ success: true, data: created });
});

export const getRegistrationHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const registrationId = pathId(req, 'registrationId', 'Inscription introuvable.');
  res.status(200).json({
    success: true,
    data: await getRegistration(tenantId, requireUserId(req), { registrationId })
  });
});

export const updateRegistrationSitesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const actorUserId = requireUserId(req);
  const registrationId = pathId(req, 'registrationId', 'Inscription introuvable.');
  const body = updateRegistrationSitesBodySchema.parse(req.body ?? {});
  if (body.siteIds.length === 0) throw sitesRequired();

  res.status(200).json({
    success: true,
    data: await updateRegistrationSites(tenantId, actorUserId, { registrationId, siteIds: body.siteIds })
  });
});

export const regenerateActivationCodeHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const actorUserId = requireUserId(req);
  const registrationId = pathId(req, 'registrationId', 'Inscription introuvable.');
  res.status(200).json({
    success: true,
    data: await regenerateActivationCode(tenantId, actorUserId, { registrationId })
  });
});

export const revokeRegistrationHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const actorUserId = requireUserId(req);
  const registrationId = pathId(req, 'registrationId', 'Inscription introuvable.');
  const body = revokeRegistrationBodySchema.parse(req.body ?? {});
  const reason = body.reason?.trim() ? body.reason.trim() : null;

  res.status(200).json({
    success: true,
    data: await revokeRegistration(tenantId, actorUserId, { registrationId, reason })
  });
});

// ---------------------------------------------------------------------------
// Comptages terrain (W14-R2, masques du lot 040)
// ---------------------------------------------------------------------------

export const listFieldCountsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = fieldCountsQuerySchema.parse(req.query ?? {});
  const ctx = await resolveStockCallerContext(requireUserId(req), tenantId);
  const blind = await loadBlindLocationIds(prisma, tenantId, ctx);

  const { data, nextCursor } = await listFieldCounts(tenantId, ctx, blind, query);
  res.status(200).json({ success: true, data, meta: buildStockMeta(ctx, blind, nextCursor) });
});

// ---------------------------------------------------------------------------
// Captures et preuve (T10, W14)
// ---------------------------------------------------------------------------

export const listCapturesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = capturesQuerySchema.parse(req.query ?? {});
  const { data, nextCursor } = await listCaptures(tenantId, query);
  res.status(200).json({ success: true, data, meta: { nextCursor } });
});

export const getCaptureHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const captureId = pathId(req, 'captureId', 'Capture introuvable.');
  const ctx = await resolveStockCallerContext(requireUserId(req), tenantId);
  res.status(200).json({ success: true, data: await getCapture(tenantId, captureId, ctx) });
});

/** Le fichier : agence vérifiée, chemin attendu, `sendPrivateFile` (`no-store`) ; lecture tracée par le middleware d'accès. */
export const getCaptureFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const captureId = pathId(req, 'captureId', 'Capture introuvable.');
  sendPrivateFile(res, await getCaptureFile(tenantId, captureId));
});

export const removeCapturePhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const actorUserId = requireUserId(req);
  const captureId = pathId(req, 'captureId', 'Capture introuvable.');
  const body = removeCapturePhotoBodySchema.parse(req.body ?? {});
  const ctx = await resolveStockCallerContext(actorUserId, tenantId);

  res.status(200).json({
    success: true,
    data: await removeCapturePhoto(tenantId, actorUserId, captureId, body.reason, ctx)
  });
});

export const listCountCapturesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const countId = pathId(req, 'countId', 'Inventaire introuvable.');
  res.status(200).json({ success: true, data: await listCountCaptures(tenantId, countId) });
});

// ---------------------------------------------------------------------------
// Conversations (T9, W14-R3)
// ---------------------------------------------------------------------------

export const listSessionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = sessionsQuerySchema.parse(req.query ?? {});
  const { data, nextCursor } = await listSessions(tenantId, query);
  res.status(200).json({ success: true, data, meta: { nextCursor } });
});

export const listSessionMessagesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const sessionId = pathId(req, 'sessionId', 'Session introuvable.');
  res.status(200).json({ success: true, data: await listSessionMessages(tenantId, sessionId) });
});

// ---------------------------------------------------------------------------
// Simulateur (W13)
// ---------------------------------------------------------------------------

function targetOf(value: { registrationId?: string; freePhone?: string }): SimulatorTarget {
  return value.registrationId !== undefined
    ? { registrationId: value.registrationId }
    : { freePhone: value.freePhone as string };
}

export const injectSimulatorMessageHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);

  if (req.file) {
    const fields = simulatorPhotoFieldsSchema.parse(req.body ?? {});
    const caption = fields.caption?.trim() ? fields.caption.trim() : null;
    const result = await injectSimulatorMessage(tenantId, targetOf(fields), {
      kind: 'IMAGE',
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      caption
    });
    res.status(202).json({ success: true, data: result });
    return;
  }

  if (req.is('multipart/form-data')) {
    throw new AppError('Joignez une photo (champ « file »).', 400, ErrorCode.VALIDATION_ERROR);
  }

  const body = simulatorTextOrReplySchema.parse(req.body ?? {});
  const content =
    body.replyId !== undefined
      ? { kind: 'REPLY' as const, replyId: body.replyId, replyTitle: body.replyTitle ?? null }
      : { kind: 'TEXT' as const, text: body.text as string };
  const result = await injectSimulatorMessage(tenantId, targetOf(body), content);
  res.status(202).json({ success: true, data: result });
});

export const getSimulatorConversationHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = simulatorConversationQuerySchema.parse(req.query ?? {});
  const after = query.after ? new Date(query.after) : null;
  res.status(200).json({ success: true, data: await getSimulatorConversation(tenantId, targetOf(query), after) });
});

export const advanceSimulatorClockHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const sessionId = pathId(req, 'sessionId', 'Session introuvable.');
  const body = advanceSimulatorClockBodySchema.parse(req.body ?? {});
  res.status(200).json({ success: true, data: await advanceSimulatorSession(tenantId, sessionId, body.minutes) });
});
