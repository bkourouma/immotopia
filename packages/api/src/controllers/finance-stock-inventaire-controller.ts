import { Request, Response } from 'express';
import type { StockReasonCode } from '@prisma/client';

import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  cancelStockCountTx,
  closeStockCountTx,
  createStockCountTx,
  getStockCountLineView,
  getStockCountView,
  justifyStockCountLineTx,
  listStockCountViews,
  removeStockCountLineTx,
  setAsideStockCountLineTx,
  setAsideUncountedStockCountLinesTx,
  setStockCountLineTx,
  validateStockCountTx
} from '../lib/finance/stock-inventaire';
import type { StockCountWriteOptions } from '../lib/finance/stock-inventaire';
import {
  closeStockCountSchema,
  createStockCountSchema,
  justifyStockCountLineSchema,
  listStockCountsQuerySchema,
  reasonOnlySchema,
  setStockCountLineSchema,
  uuidPathParamSchema,
  validateStockCountSchema
} from '../lib/finance/schemas-stock-inventaire';
import {
  buildStockMeta,
  claimClientRequestTx,
  completeClientRequestTx,
  findClientRequestReplay,
  hashRequestBody,
  isUniqueViolation,
  loadBlindLocationIds,
  resolveStockCallerContext
} from '../lib/finance/stock-controles';
import type { StockCallerContext, StockMeta } from '../lib/finance/types-040-controle';
import { logAuditEvent } from '../services/audit-service';
import type { AuditLogEntry } from '../types/audit-types';
import { prisma } from '../utils/database';
import type { PrismaTransactionClient } from '../utils/database';

/**
 * Contrôleur de l'inventaire physique — lot 5, refondu par le lot 040 (spec
 * A1 à A4, A7 ; contrat `contracts/openapi.yaml` 2.0.0, tag « Inventaires »).
 *
 * Chaque handler est enveloppé dans `asyncHandler` : les erreurs typées du
 * domaine (`AppError` avec code, `lib/finance/stock-inventaire.ts`) passent
 * telles quelles par le middleware central. Aucun `try/catch` ne devine de
 * statut — le seul `catch` est celui du rejeu idempotent concurrent (`P2002`
 * sur la clé, B3-R2), qui relit la clé et renvoie le résultat d'origine.
 *
 * **L'utilisateur vient du jeton** (`req.user.userId`), l'agence de l'URL
 * (posée par `requireTenantAccess`) : le domaine les reçoit en paramètre, et
 * le lot 041 appelle les mêmes fonctions hors requête avec l'utilisateur
 * rattaché au numéro WhatsApp.
 *
 * **Les écritures rendent l'inventaire relu après la transaction**, masqué
 * pour l'appelant (aveugle A2-R2 des routes d'inventaire, valeurs §8.1), avec
 * `meta`. Les événements d'audit non critiques sont écrits après la
 * transaction (`logAuditEvent`, B6-R5) ; les critiques le sont dedans.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

/** Identifiant de chemin : rejeté en 400 s'il n'a pas la forme d'un UUID. */
function requireUuidParam(req: Request, name: string): string {
  const parsed = uuidPathParamSchema.safeParse(req.params[name]);
  if (!parsed.success) {
    throw new BadRequestError(`Le paramètre ${name} doit être un identifiant valide.`);
  }
  return parsed.data;
}

function requireActorUserId(req: Request): string {
  const actorUserId = req.user?.userId;
  if (!actorUserId) {
    throw new BadRequestError('Utilisateur authentifié requis pour cette opération financière.');
  }
  return actorUserId;
}

interface CallerScope {
  tenantId: string;
  userId: string;
  ctx: StockCallerContext;
}

async function resolveCaller(req: Request): Promise<CallerScope> {
  const tenantId = requireTenantId(req);
  const userId = requireActorUserId(req);
  return { tenantId, userId, ctx: await resolveStockCallerContext(userId, tenantId) };
}

async function metaFor(scope: CallerScope): Promise<StockMeta> {
  const blind = await loadBlindLocationIds(prisma, scope.tenantId, scope.ctx);
  return buildStockMeta(scope.ctx, blind);
}

/**
 * Une écriture dans sa transaction, puis les événements non critiques
 * collectés, écrits après le commit (B6-R5) : une transaction annulée n'en
 * laisse aucun.
 */
async function runCountWrite<T>(
  work: (tx: PrismaTransactionClient, options: StockCountWriteOptions) => Promise<T>
): Promise<T> {
  const deferredAudit: AuditLogEntry[] = [];
  const result = await prisma.$transaction(tx => work(tx, { deferredAudit }));
  for (const entry of deferredAudit) {
    logAuditEvent(entry);
  }
  return result;
}

/** Répond l'inventaire relu et masqué pour l'appelant, avec `meta`. */
async function sendCount(res: Response, scope: CallerScope, countId: string, status = 200): Promise<void> {
  const [data, meta] = await Promise.all([getStockCountView(scope.tenantId, countId, scope.ctx), metaFor(scope)]);
  res.status(status).json({ success: true, data, meta });
}

// ---------------------------------------------------------------------------
// POST /stock/counts — ouvrir un inventaire (DRAFT, à l'aveugle)
// ---------------------------------------------------------------------------

export const createStockCountHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createStockCountSchema.parse(req.body ?? {});
  const scope = await resolveCaller(req);

  const created = await runCountWrite((tx, options) =>
    createStockCountTx(
      tx,
      scope.tenantId,
      {
        locationId: body.locationId,
        countedAt: body.countedAt,
        createdByUserId: scope.userId,
        ...(body.kind ? { kind: body.kind } : {})
      },
      options
    )
  );

  await sendCount(res, scope, created.id, 201);
});

// ---------------------------------------------------------------------------
// PUT /stock/counts/:countId/lines — saisir ou ressaisir (idempotent, B3-R2)
//
// La réponse ne contient QUE la ligne saisie, sans attendu ni écart (A2-R2).
// ---------------------------------------------------------------------------

export const setStockCountLineHandler = asyncHandler(async (req: Request, res: Response) => {
  const countId = requireUuidParam(req, 'countId');
  const body = setStockCountLineSchema.parse(req.body ?? {});
  const scope = await resolveCaller(req);
  const clientRequestId = body.clientRequestId;
  const bodyHash = hashRequestBody({ countId, itemId: body.itemId, countedQuantity: body.countedQuantity });

  const replayed = async (): Promise<boolean> => {
    if (!clientRequestId) {
      return false;
    }
    const replay = await findClientRequestReplay(scope.tenantId, clientRequestId, scope.userId, bodyHash);
    if (!replay) {
      return false;
    }
    const line = await getStockCountLineView(scope.tenantId, replay.resultId, scope.ctx);
    res.status(200).json({ success: true, data: line });
    return true;
  };

  if (await replayed()) {
    return;
  }

  try {
    const result = await runCountWrite(async (tx, options) => {
      const keyId = clientRequestId
        ? await claimClientRequestTx(tx, {
            tenantId: scope.tenantId,
            clientRequestId,
            operation: 'COUNT_LINE',
            bodyHash,
            userId: scope.userId
          })
        : null;
      const saved = await setStockCountLineTx(
        tx,
        scope.tenantId,
        countId,
        { itemId: body.itemId, countedQuantity: body.countedQuantity, countedByUserId: scope.userId },
        options
      );
      if (keyId) {
        await completeClientRequestTx(tx, keyId, 'StockCountLine', saved.lineId);
      }
      return saved;
    });
    res.status(200).json({ success: true, data: result.line });
  } catch (error) {
    // Rejeu concurrent : la clé vient d'être réclamée par l'autre envoi.
    if (clientRequestId && isUniqueViolation(error) && (await replayed())) {
      return;
    }
    throw error;
  }
});

// ---------------------------------------------------------------------------
// DELETE /stock/counts/:countId/lines/:itemId — retirer une ligne (DRAFT)
// ---------------------------------------------------------------------------

export const removeStockCountLineHandler = asyncHandler(async (req: Request, res: Response) => {
  const countId = requireUuidParam(req, 'countId');
  const itemId = requireUuidParam(req, 'itemId');
  const scope = await resolveCaller(req);

  await runCountWrite((tx, options) =>
    removeStockCountLineTx(tx, scope.tenantId, countId, itemId, scope.userId, options)
  );

  await sendCount(res, scope, countId);
});

// ---------------------------------------------------------------------------
// POST /stock/counts/:countId/close — clore le comptage (DRAFT → COUNTED)
// ---------------------------------------------------------------------------

export const closeStockCountHandler = asyncHandler(async (req: Request, res: Response) => {
  const countId = requireUuidParam(req, 'countId');
  closeStockCountSchema.parse(req.body ?? {});
  const scope = await resolveCaller(req);

  await runCountWrite(tx => closeStockCountTx(tx, scope.tenantId, countId, scope.userId));

  await sendCount(res, scope, countId);
});

// ---------------------------------------------------------------------------
// PUT /stock/counts/:countId/lines/:itemId/justification (COUNTED)
// ---------------------------------------------------------------------------

export const justifyStockCountLineHandler = asyncHandler(async (req: Request, res: Response) => {
  const countId = requireUuidParam(req, 'countId');
  const itemId = requireUuidParam(req, 'itemId');
  const body = justifyStockCountLineSchema.parse(req.body ?? {});
  const scope = await resolveCaller(req);

  const saved = await runCountWrite((tx, options) =>
    justifyStockCountLineTx(
      tx,
      scope.tenantId,
      countId,
      itemId,
      { reasonCode: body.reasonCode as StockReasonCode, reason: body.reason ?? null, justifiedByUserId: scope.userId },
      options
    )
  );

  const [data, meta] = await Promise.all([
    getStockCountLineView(scope.tenantId, saved.lineId, scope.ctx),
    metaFor(scope)
  ]);
  res.status(200).json({ success: true, data, meta });
});

// ---------------------------------------------------------------------------
// POST /stock/counts/:countId/lines/:itemId/set-aside (COUNTED)
// POST /stock/counts/:countId/set-aside-uncounted (COUNTED)
// ---------------------------------------------------------------------------

export const setAsideStockCountLineHandler = asyncHandler(async (req: Request, res: Response) => {
  const countId = requireUuidParam(req, 'countId');
  const itemId = requireUuidParam(req, 'itemId');
  const body = reasonOnlySchema.parse(req.body ?? {});
  const scope = await resolveCaller(req);

  await runCountWrite(tx =>
    setAsideStockCountLineTx(tx, scope.tenantId, countId, itemId, {
      reason: body.reason,
      setAsideByUserId: scope.userId
    })
  );

  await sendCount(res, scope, countId);
});

export const setAsideUncountedHandler = asyncHandler(async (req: Request, res: Response) => {
  const countId = requireUuidParam(req, 'countId');
  const body = reasonOnlySchema.parse(req.body ?? {});
  const scope = await resolveCaller(req);

  await runCountWrite(tx =>
    setAsideUncountedStockCountLinesTx(tx, scope.tenantId, countId, {
      reason: body.reason,
      setAsideByUserId: scope.userId
    })
  );

  await sendCount(res, scope, countId);
});

// ---------------------------------------------------------------------------
// POST /stock/counts/:countId/validate (COUNTED → VALIDATED)
// ---------------------------------------------------------------------------

export const validateStockCountHandler = asyncHandler(async (req: Request, res: Response) => {
  const countId = requireUuidParam(req, 'countId');
  const body = validateStockCountSchema.parse(req.body ?? {});
  const scope = await resolveCaller(req);

  await runCountWrite(tx =>
    validateStockCountTx(tx, scope.tenantId, countId, scope.userId, {
      selfValidationReason: body.selfValidationReason ?? null
    })
  );

  await sendCount(res, scope, countId);
});

// ---------------------------------------------------------------------------
// POST /stock/counts/:countId/cancel (DRAFT → CANCELLED)
// ---------------------------------------------------------------------------

export const cancelStockCountHandler = asyncHandler(async (req: Request, res: Response) => {
  const countId = requireUuidParam(req, 'countId');
  const body = reasonOnlySchema.parse(req.body ?? {});
  const scope = await resolveCaller(req);

  await runCountWrite(tx =>
    cancelStockCountTx(tx, scope.tenantId, countId, { reason: body.reason, cancelledByUserId: scope.userId })
  );

  await sendCount(res, scope, countId);
});

// ---------------------------------------------------------------------------
// GET /stock/counts — la liste (sans lignes par défaut)
// GET /stock/counts/:countId — le détail
// ---------------------------------------------------------------------------

export const listStockCountsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listStockCountsQuerySchema.parse(req.query ?? {});
  const scope = await resolveCaller(req);

  const [data, meta] = await Promise.all([
    listStockCountViews(scope.tenantId, scope.ctx, {
      locationId: query.locationId,
      status: query.status,
      kind: query.kind,
      withLines: query.withLines
    }),
    metaFor(scope)
  ]);

  res.status(200).json({ success: true, data, meta });
});

export const getStockCountHandler = asyncHandler(async (req: Request, res: Response) => {
  const countId = requireUuidParam(req, 'countId');
  const scope = await resolveCaller(req);

  await sendCount(res, scope, countId);
});
