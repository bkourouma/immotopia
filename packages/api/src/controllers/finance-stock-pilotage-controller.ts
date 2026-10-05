import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, UnauthorizedError } from '../middleware/error-middleware';
import { prisma } from '../utils/database';
import { resolveStockCallerContext } from '../lib/finance/stock-controles';
import {
  acknowledgeStockAlertTx,
  listStockAlerts,
  logStockAlertAcknowledged
} from '../lib/finance/stock-alertes-lecture';
import { getStockIndicators } from '../lib/finance/stock-indicateurs';
import { getStockControls, updateStockControlsTx } from '../lib/finance/stock-reglages';
import {
  acknowledgeStockAlertSchema,
  listStockAlertsQuerySchema,
  stockIndicatorsQuerySchema,
  updateStockControlsSchema,
  uuidPathParamSchema
} from '../lib/finance/schemas-stock-pilotage';

/**
 * Contrôleur du pilotage du stock — lot 040 : alertes (B7-R3, B7-R4),
 * indicateurs (B8), réglages de contrôle (A5-R4, B2-R3, B7, A9).
 *
 * Chaque gestionnaire est enveloppé dans `asyncHandler` ; les erreurs typées
 * (`AppError` et ses codes `STOCK_*`, erreurs Zod) sont traduites par le
 * middleware central. `tenantId` vient toujours du chemin (posé par
 * `requireTenantAccess`), jamais du corps ni de la requête.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

function requireUserId(req: Request): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new UnauthorizedError('Authentification requise.');
  }
  return userId;
}

function requireUuidParam(req: Request, name: string): string {
  const parsed = uuidPathParamSchema.safeParse(req.params[name]);
  if (!parsed.success) {
    throw new BadRequestError(`Le paramètre ${name} doit être un identifiant valide.`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// GET stock/alerts — liste paginée
// ---------------------------------------------------------------------------

export const listStockAlertsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const userId = requireUserId(req);
  const query = listStockAlertsQuerySchema.parse(req.query ?? {});

  const ctx = await resolveStockCallerContext(userId, tenantId);
  const { data, meta } = await listStockAlerts(tenantId, ctx, query);

  res.status(200).json({ success: true, data, meta });
});

// ---------------------------------------------------------------------------
// POST stock/alerts/:alertId/acknowledge — alerte traitée
// ---------------------------------------------------------------------------

export const acknowledgeStockAlertHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const userId = requireUserId(req);
  const alertId = requireUuidParam(req, 'alertId');
  const body = acknowledgeStockAlertSchema.parse(req.body ?? {});

  const ctx = await resolveStockCallerContext(userId, tenantId);
  const view = await prisma.$transaction(tx => acknowledgeStockAlertTx(tx, tenantId, alertId, ctx, body.note ?? null));
  logStockAlertAcknowledged(tenantId, userId, view);

  res.status(200).json({ success: true, data: view });
});

// ---------------------------------------------------------------------------
// GET stock/indicators — par lieu et par mois
// ---------------------------------------------------------------------------

export const getStockIndicatorsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = stockIndicatorsQuerySchema.parse(req.query ?? {});

  const data = await getStockIndicators(tenantId, query);

  res.status(200).json({ success: true, data });
});

// ---------------------------------------------------------------------------
// GET / PATCH stock/settings/controls — réglages de contrôle
// ---------------------------------------------------------------------------

export const getStockControlsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);

  const data = await getStockControls(tenantId);

  res.status(200).json({ success: true, data });
});

export const updateStockControlsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const userId = requireUserId(req);
  const body = updateStockControlsSchema.parse(req.body ?? {});

  const data = await prisma.$transaction(tx => updateStockControlsTx(tx, tenantId, userId, body));

  res.status(200).json({ success: true, data });
});
