import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  listStockBalancesForCaller,
  recordStockIssue,
  recordStockReceipt,
  recordStockScrap,
  recordStockSupplierReturn
} from '../lib/finance/stock-mouvements';
import type { StockWriteResponse } from '../lib/finance/stock-mouvements';
import {
  createStockReceiptSchema,
  createStockScrapSchema,
  createStockSupplierReturnSchema,
  listStockBalancesQuerySchema,
  parseStockIssueBody
} from '../lib/finance/schemas-stock-mouvements';
import { resolveStockCallerContext } from '../lib/finance/stock-controles';
import type { StockCallerContext } from '../lib/finance/types-040-controle';

/**
 * Contrôleur des mouvements de stock — lot 5, deuxième sous-lot, étendu par le
 * lot 040 : réceptions, sorties, retours fournisseur, rebuts, soldes.
 *
 * Chaque gestionnaire est enveloppé dans `asyncHandler` et laisse le middleware
 * central traduire les erreurs (`AppError` à code stable, `ZodError`). Aucun
 * `try/catch` ne devine de statut HTTP depuis un message.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess`), jamais du corps. Le contexte de l'appelant
 * (`resolveStockCallerContext`) décide de ce qu'il voit : les réponses sont
 * masquées par le domaine (spec §8.1, §8.2) et portent `meta`.
 *
 * Une écriture répond `201` ; le rejeu idempotent d'une écriture déjà faite
 * (même `clientRequestId`, même corps, même utilisateur) répond `200` avec le
 * résultat d'origine, masqué pour l'appelant (B3-R2).
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

function requireActorUserId(req: Request): string {
  const actorUserId = req.user?.userId;
  if (!actorUserId) {
    throw new BadRequestError('Utilisateur authentifié requis pour cette opération financière.');
  }
  return actorUserId;
}

/** Agence et appelant d'une requête du stock. */
export async function stockRequestContext(req: Request): Promise<{ tenantId: string; ctx: StockCallerContext }> {
  const tenantId = requireTenantId(req);
  const ctx = await resolveStockCallerContext(requireActorUserId(req), tenantId);
  return { tenantId, ctx };
}

/** Envoie la réponse d'une écriture : `201` neuve, `200` rejeu. */
export function sendStockWrite<T>(res: Response, response: StockWriteResponse<T>): void {
  res.status(response.status).json({ success: true, data: response.data, meta: response.meta });
}

// POST /stock/receipts — bon BR, un mouvement par ligne, contrôles A8-R2.
export const createStockReceiptHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createStockReceiptSchema.parse(req.body ?? {});
  const { tenantId, ctx } = await stockRequestContext(req);
  sendStockWrite(res, await recordStockReceipt(tenantId, ctx, body, body));
});

// POST /stock/issues — bon BS, 1 à 50 lignes (ou la forme à un article).
export const createStockIssueHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = parseStockIssueBody(req.body);
  const { tenantId, ctx } = await stockRequestContext(req);
  sendStockWrite(res, await recordStockIssue(tenantId, ctx, body, body));
});

// POST /stock/supplier-returns — retour fournisseur (A6).
export const createStockSupplierReturnHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createStockSupplierReturnSchema.parse(req.body ?? {});
  const { tenantId, ctx } = await stockRequestContext(req);
  sendStockWrite(res, await recordStockSupplierReturn(tenantId, ctx, body, body));
});

// POST /stock/scraps — rebut (A6).
export const createStockScrapHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createStockScrapSchema.parse(req.body ?? {});
  const { tenantId, ctx } = await stockRequestContext(req);
  sendStockWrite(res, await recordStockScrap(tenantId, ctx, body, body));
});

// GET /stock/balances — soldes masqués pour l'appelant ; `data` reste un tableau, `meta` s'ajoute.
export const listStockBalancesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listStockBalancesQuerySchema.parse(req.query ?? {});
  const { tenantId, ctx } = await stockRequestContext(req);
  const { data, meta } = await listStockBalancesForCaller(tenantId, ctx, {
    locationId: query.locationId,
    itemId: query.itemId,
    onlyInStock: query.onlyInStock
  });
  res.status(200).json({ success: true, data, meta });
});

// GET /stock/movements : gestionnaire dans `finance-stock-journal-controller.ts` (territoire API-3).
