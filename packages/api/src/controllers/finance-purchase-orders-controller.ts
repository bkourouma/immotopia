import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  cancelPurchaseOrderTx,
  createPurchaseOrderTx,
  getPurchaseOrder,
  getSiteEngagement,
  issuePurchaseOrderTx,
  linkInvoiceToPurchaseOrderTx,
  listPurchaseOrders
} from '../lib/finance/purchase-orders';
import type { PurchaseOrderRecord, SiteEngagementRecord } from '../lib/finance/types-lot3';
import {
  cancelPurchaseOrderSchema,
  createPurchaseOrderSchema,
  linkInvoiceToPurchaseOrderSchema,
  listPurchaseOrdersQuerySchema,
  uuidPathParamSchema
} from '../lib/finance/schemas-purchase-orders';
import { prisma } from '../utils/database';

/**
 * Contrôleur des sept points d'entrée agence « bons de commande et engagé » —
 * lot 3, volet achats (`specs/018-finance-budget-pilotage/data-model.md` §5).
 *
 * Modèle : `controllers/finance-suppliers-controller.ts` (lot 2). Chaque
 * handler est enveloppé dans `asyncHandler` et laisse le middleware central
 * (`middleware/error-middleware.ts`) traduire les erreurs — celles du domaine
 * (`lib/finance/purchase-orders.ts`, typées par `lib/errors.ts`) comme celles
 * levées ici (`BadRequestError`). Aucun `try/catch` ne devine de statut HTTP
 * depuis un message.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ou d'une query.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

/** Identifiant de chemin (bon, chantier, facture) : rejeté en 400 s'il n'a pas la forme d'un UUID. */
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

// ---------------------------------------------------------------------------
// Mise en forme des réponses
// ---------------------------------------------------------------------------

interface PurchaseOrderResponseInput {
  id: string;
  siteId: string;
  siteLabel: string;
  supplierId: string;
  supplierLabel: string;
  reference: string;
  orderDate: Date;
  status: string;
  currency: string;
  lines: Array<{
    id: string;
    costCategoryId: string;
    costCategoryLabel: string;
    label: string;
    amount: number;
    /** Facultatifs (20 septembre 2026), `null` pour une ligne en montant direct. */
    quantity: number | null;
    unitPrice: number | null;
  }>;
  totalAmount: number;
  invoicedAmount: number;
  remainingAmount: number;
  invoicingState: string;
}

function serializePurchaseOrder(input: PurchaseOrderResponseInput) {
  return { ...input };
}

/** Sérialise un `PurchaseOrderRecord` du domaine (déjà en `number`, libellés déjà résolus). */
function toPurchaseOrderResponse(order: PurchaseOrderRecord) {
  return serializePurchaseOrder({
    id: order.id,
    siteId: order.siteId,
    siteLabel: order.siteLabel,
    supplierId: order.supplierId,
    supplierLabel: order.supplierLabel,
    reference: order.reference,
    orderDate: order.orderDate,
    status: order.status,
    currency: order.currency,
    lines: order.lines.map(line => ({
      id: line.id,
      costCategoryId: line.costCategoryId,
      costCategoryLabel: line.costCategoryLabel,
      label: line.label,
      amount: line.amount,
      quantity: line.quantity,
      unitPrice: line.unitPrice
    })),
    totalAmount: order.totalAmount,
    invoicedAmount: order.invoicedAmount,
    remainingAmount: order.remainingAmount,
    invoicingState: order.invoicingState
  });
}

function toSiteEngagementResponse(engagement: SiteEngagementRecord) {
  return {
    siteId: engagement.siteId,
    actualCost: engagement.actualCost,
    openCommitments: engagement.openCommitments,
    engagedAmount: engagement.engagedAmount,
    currency: engagement.currency
  };
}

// ---------------------------------------------------------------------------
// A. GET purchase-orders — liste
// ---------------------------------------------------------------------------

export const listPurchaseOrdersHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listPurchaseOrdersQuerySchema.parse(req.query ?? {});

  const orders = await listPurchaseOrders(tenantId, {
    siteId: query.siteId,
    supplierId: query.supplierId,
    status: query.status
  });

  res.status(200).json({ success: true, data: orders.map(toPurchaseOrderResponse) });
});

// ---------------------------------------------------------------------------
// B. POST purchase-orders — création (brouillon)
// ---------------------------------------------------------------------------

export const createPurchaseOrderHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createPurchaseOrderSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const order = await prisma.$transaction(tx =>
    createPurchaseOrderTx(tx, tenantId, {
      siteId: body.siteId,
      supplierId: body.supplierId,
      reference: body.reference,
      orderDate: body.orderDate,
      lines: body.lines,
      createdByUserId: actorUserId
    })
  );

  res.status(201).json({ success: true, data: toPurchaseOrderResponse(order) });
});

// ---------------------------------------------------------------------------
// C. GET purchase-orders/:orderId — détail
// ---------------------------------------------------------------------------

export const getPurchaseOrderHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const orderId = requireUuidParam(req, 'orderId');

  const order = await getPurchaseOrder(tenantId, orderId);

  res.status(200).json({ success: true, data: toPurchaseOrderResponse(order) });
});

// ---------------------------------------------------------------------------
// D. POST purchase-orders/:orderId/issue
//
// Porte le droit de validation (`requireDocumentsValidate`), distinct de la
// création (décision D7) : c'est l'émission qui fait entrer le bon dans
// l'engagé, pas sa saisie.
// ---------------------------------------------------------------------------

export const issuePurchaseOrderHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const orderId = requireUuidParam(req, 'orderId');
  const actorUserId = requireActorUserId(req);

  const order = await prisma.$transaction(tx => issuePurchaseOrderTx(tx, tenantId, orderId, actorUserId));

  res.status(200).json({ success: true, data: toPurchaseOrderResponse(order) });
});

// ---------------------------------------------------------------------------
// E. POST purchase-orders/:orderId/cancel
// ---------------------------------------------------------------------------

export const cancelPurchaseOrderHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const orderId = requireUuidParam(req, 'orderId');
  const body = cancelPurchaseOrderSchema.parse(req.body ?? {});

  const order = await prisma.$transaction(tx => cancelPurchaseOrderTx(tx, tenantId, orderId, body.reason));

  res.status(200).json({ success: true, data: toPurchaseOrderResponse(order) });
});

// ---------------------------------------------------------------------------
// F. POST supplier-invoices/:invoiceId/purchase-order
//
// `purchaseOrderId: null` défait le rapprochement — voir
// `schemas-purchase-orders.ts`. La réponse est alors `data: null`, faute de
// bon à décrire (voir `LinkInvoiceToPurchaseOrderTx`, `types-lot3.ts`).
// ---------------------------------------------------------------------------

export const linkInvoiceToPurchaseOrderHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const invoiceId = requireUuidParam(req, 'invoiceId');
  const body = linkInvoiceToPurchaseOrderSchema.parse(req.body ?? {});

  const order = await prisma.$transaction(tx =>
    linkInvoiceToPurchaseOrderTx(tx, tenantId, invoiceId, body.purchaseOrderId)
  );

  res.status(200).json({ success: true, data: order ? toPurchaseOrderResponse(order) : null });
});

// ---------------------------------------------------------------------------
// G. GET sites/:siteId/engagement
// ---------------------------------------------------------------------------

export const getSiteEngagementHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');

  const engagement = await getSiteEngagement(tenantId, siteId);

  res.status(200).json({ success: true, data: toSiteEngagementResponse(engagement) });
});
