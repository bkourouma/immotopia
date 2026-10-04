import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, UnauthorizedError } from '../middleware/error-middleware';
import { prisma } from '../utils/database';
import { logAuditEvent } from '../services/audit-service';
import { AuditActionKey } from '../types/audit-types';
import { uuidPathParamSchema } from '../lib/finance/schemas';
import { resolveStockCallerContext } from '../lib/finance/stock-controles';
import {
  exportStockMovementsCsv,
  listStockMovementAuthors,
  listStockMovementsPage
} from '../lib/finance/stock-journal';
import type { StockMovementFilters } from '../lib/finance/stock-journal';
import { getInvoiceReceipts, getStockFieldContext, searchReceivableInvoices } from '../lib/finance/stock-terrain';
import { createStockTakerTx, listStockTakers, updateStockTakerTx } from '../lib/finance/stock-preneurs';
import {
  exportStockMovementsQuerySchema,
  listReceivableInvoicesQuerySchema,
  listStockMovementsQuerySchema
} from '../lib/finance/schemas-stock-journal';
import {
  createStockTakerSchema,
  listStockTakersQuerySchema,
  updateStockTakerSchema
} from '../lib/finance/schemas-stock-preneurs';

/**
 * Contrôleur du journal, du terrain et du carnet des preneurs — lot 040,
 * territoire API-3 (spec A5, A8-R1, B2, B3-R1).
 *
 * Enveloppé dans `asyncHandler` : le middleware central traduit les erreurs
 * (`AppError` typées des services). Isolation multi-tenant : `tenantId` vient
 * toujours de l'URL (posé par `requireTenantAccess` en amont), jamais du corps
 * ni d'une query. Le contexte de l'appelant (`resolveStockCallerContext`)
 * décide de ce qui est masqué (§8.1, §8.2) et rendu (B2-R6).
 *
 * Les événements d'audit du carnet (`STOCK_TAKER_CREATED`,
 * `STOCK_TAKER_UPDATED`) ne sont pas critiques : écrits APRÈS la transaction
 * par `logAuditEvent` (B6-R2, B6-R5), `phone` masqué par le catalogue.
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
    throw new UnauthorizedError();
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

async function callerContext(req: Request) {
  const tenantId = requireTenantId(req);
  const ctx = await resolveStockCallerContext(requireUserId(req), tenantId);
  return { tenantId, ctx };
}

function toFilters(query: StockMovementFilters): StockMovementFilters {
  return {
    itemId: query.itemId,
    locationId: query.locationId,
    siteId: query.siteId,
    type: query.type,
    slipId: query.slipId,
    movementId: query.movementId,
    takerId: query.takerId,
    createdByUserId: query.createdByUserId,
    requestedBy: query.requestedBy,
    from: query.from,
    to: query.to
  };
}

// ---------------------------------------------------------------------------
// GET /stock/movements — le journal paginé (A5-R1, A5-R2)
// ---------------------------------------------------------------------------

export const listStockMovementsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, ctx } = await callerContext(req);
  const query = listStockMovementsQuerySchema.parse(req.query ?? {});

  const page = await listStockMovementsPage(tenantId, ctx, toFilters(query), {
    cursor: query.cursor,
    limit: query.limit
  });

  res.status(200).json({ success: true, data: page.movements, meta: page.meta });
});

// ---------------------------------------------------------------------------
// GET /stock/movements/export.csv — l'export (A5-R3)
// ---------------------------------------------------------------------------

export const exportStockMovementsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, ctx } = await callerContext(req);
  const query = exportStockMovementsQuerySchema.parse(req.query ?? {});

  const csv = await exportStockMovementsCsv(tenantId, ctx, toFilters(query));
  const fileName = `journal-stock-${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.status(200).send(csv);
});

// ---------------------------------------------------------------------------
// GET /stock/movements/authors — le filtre « Saisi par » (STOCK_VALUES_VIEW)
// ---------------------------------------------------------------------------

export const listStockMovementAuthorsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const authors = await listStockMovementAuthors(tenantId);
  res.status(200).json({ success: true, data: authors });
});

// ---------------------------------------------------------------------------
// GET /stock/field-context — le contexte terrain (B3-R1)
// ---------------------------------------------------------------------------

export const getStockFieldContextHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, ctx } = await callerContext(req);
  const { context, meta } = await getStockFieldContext(tenantId, ctx);
  res.status(200).json({ success: true, data: context, meta });
});

// ---------------------------------------------------------------------------
// GET /stock/receivable-invoices — la recherche au-delà des 50 (Q9)
// ---------------------------------------------------------------------------

export const listReceivableInvoicesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, ctx } = await callerContext(req);
  const query = listReceivableInvoicesQuerySchema.parse(req.query ?? {});
  const { invoices, meta } = await searchReceivableInvoices(tenantId, ctx, {
    search: query.search || undefined,
    cursor: query.cursor,
    limit: query.limit
  });
  res.status(200).json({ success: true, data: invoices, meta });
});

// ---------------------------------------------------------------------------
// GET /stock/supplier-invoices/:invoiceId/receipts — réceptions d'une facture (A8-R1)
// ---------------------------------------------------------------------------

export const getInvoiceReceiptsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, ctx } = await callerContext(req);
  const invoiceId = requireUuidParam(req, 'invoiceId');
  const { view, meta } = await getInvoiceReceipts(tenantId, ctx, invoiceId);
  res.status(200).json({ success: true, data: view, meta });
});

// ---------------------------------------------------------------------------
// Le carnet des preneurs (B2)
// ---------------------------------------------------------------------------

export const listStockTakersHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, ctx } = await callerContext(req);
  const query = listStockTakersQuerySchema.parse(req.query ?? {});
  const takers = await listStockTakers(tenantId, ctx, {
    onlyActive: query.onlyActive,
    search: query.search || undefined
  });
  res.status(200).json({ success: true, data: takers });
});

export const createStockTakerHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, ctx } = await callerContext(req);
  const body = createStockTakerSchema.parse(req.body ?? {});

  const result = await prisma.$transaction(tx =>
    createStockTakerTx(
      tx,
      tenantId,
      {
        fullName: body.fullName,
        teamOrCompany: body.teamOrCompany ?? null,
        phone: body.phone ?? null,
        employeeId: body.employeeId ?? null,
        contractorId: body.contractorId ?? null,
        createdByUserId: ctx.userId
      },
      ctx
    )
  );

  logAuditEvent({
    tenantId,
    actorUserId: ctx.userId,
    actionKey: AuditActionKey.STOCK_TAKER_CREATED,
    entityType: 'StockTaker',
    entityId: result.taker.id,
    payload: { ...result.snapshot }
  });

  res.status(201).json({ success: true, data: result.taker });
});

export const updateStockTakerHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, ctx } = await callerContext(req);
  const takerId = requireUuidParam(req, 'takerId');
  const body = updateStockTakerSchema.parse(req.body ?? {});

  // Les clés ABSENTES du corps restent absentes : `undefined` veut dire « ne
  // touche pas », `null` veut dire « efface » (le téléphone, un lien).
  const result = await prisma.$transaction(tx => updateStockTakerTx(tx, tenantId, takerId, body, ctx));

  if (Object.keys(result.changes).length > 0) {
    logAuditEvent({
      tenantId,
      actorUserId: ctx.userId,
      actionKey: AuditActionKey.STOCK_TAKER_UPDATED,
      entityType: 'StockTaker',
      entityId: result.taker.id,
      payload: { fullName: result.snapshot.fullName, isActive: result.snapshot.isActive },
      changes: result.changes
    });
  }

  res.status(200).json({ success: true, data: result.taker });
});
