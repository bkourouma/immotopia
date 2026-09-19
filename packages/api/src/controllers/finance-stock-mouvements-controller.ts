import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  listStockBalances,
  listStockMovements,
  recordStockIssueTx,
  recordStockReceiptTx
} from '../lib/finance/stock-mouvements';
import {
  createStockIssueSchema,
  createStockReceiptSchema,
  listStockBalancesQuerySchema,
  listStockMovementsQuerySchema
} from '../lib/finance/schemas-stock-mouvements';
import { prisma } from '../utils/database';

/**
 * Contrôleur des quatre points d'entrée des mouvements de stock — lot 5,
 * deuxième sous-lot (`lib/finance/types-lot5-mouvements.ts`).
 *
 * Modèle : `controllers/finance-retentions-controller.ts` (lot 4, sous-lot 5).
 * Chaque handler est enveloppé dans `asyncHandler` et laisse le middleware
 * central (`middleware/error-middleware.ts`) traduire les erreurs — celles du
 * domaine (`lib/finance/stock-mouvements.ts`, typées par `lib/errors.ts`)
 * comme celles levées ici (`BadRequestError`). Aucun `try/catch` ne devine de
 * statut HTTP depuis un message.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ni d'une query.
 *
 * **Une seule transaction par écriture.** La réception comme la sortie
 * passent par `prisma.$transaction` : la sortie écrit un mouvement, une
 * écriture, une imputation, une resynchronisation de programme et un solde —
 * cinq gestes qui n'ont de sens qu'ensemble. Une sortie à moitié écrite
 * laisserait un stock diminué sans que le chantier en porte le coût.
 *
 * **Aucun libellé comptable ne sort d'ici** (principe P-1 du PRD) : les mots
 * « débit » et « crédit » n'apparaissent dans aucun message ni aucun champ
 * renvoyé. Le passage du 311 au compte de charge est une mécanique interne ;
 * l'écran ne voit qu'une quantité, une valeur et un chantier.
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

// ---------------------------------------------------------------------------
// A. POST /stock/receipts — enregistrer une réception
//
// Un mouvement PAR LIGNE est renvoyé, jamais un objet unique : le coût moyen
// se recalcule article par article, et l'écran a besoin de voir chacun.
// ---------------------------------------------------------------------------

export const createStockReceiptHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createStockReceiptSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const movements = await prisma.$transaction(tx =>
    recordStockReceiptTx(tx, tenantId, {
      locationId: body.locationId,
      supplierInvoiceId: body.supplierInvoiceId,
      receiptDate: body.receiptDate,
      lines: body.lines.map(line => ({
        itemId: line.itemId,
        quantity: line.quantity,
        unitCost: line.unitCost
      })),
      createdByUserId: actorUserId
    })
  );

  res.status(201).json({ success: true, data: movements });
});

// ---------------------------------------------------------------------------
// B. POST /stock/issues — sortir vers un chantier
//
// AUCUN PRIX n'est transmis au domaine, parce qu'aucun n'est reçu : il se
// dérive du coût moyen du lieu AVANT la sortie (principe P-4). Le schéma est
// `.strict()`, un corps qui porterait `unitCost` a déjà échoué en 400.
// ---------------------------------------------------------------------------

export const createStockIssueHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createStockIssueSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const movement = await prisma.$transaction(tx =>
    recordStockIssueTx(tx, tenantId, {
      locationId: body.locationId,
      itemId: body.itemId,
      quantity: body.quantity,
      siteId: body.siteId,
      costCategoryId: body.costCategoryId,
      requestedBy: body.requestedBy,
      issueDate: body.issueDate,
      createdByUserId: actorUserId
    })
  );

  res.status(201).json({ success: true, data: movement });
});

// ---------------------------------------------------------------------------
// C. GET /stock/balances — ce qu'il reste, et ce que ça vaut (besoin S4)
// ---------------------------------------------------------------------------

export const listStockBalancesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listStockBalancesQuerySchema.parse(req.query ?? {});

  const balances = await listStockBalances(tenantId, {
    locationId: query.locationId,
    itemId: query.itemId,
    onlyInStock: query.onlyInStock
  });

  res.status(200).json({ success: true, data: balances });
});

// ---------------------------------------------------------------------------
// D. GET /stock/movements — le journal des mouvements
// ---------------------------------------------------------------------------

export const listStockMovementsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listStockMovementsQuerySchema.parse(req.query ?? {});

  const movements = await listStockMovements(tenantId, {
    itemId: query.itemId,
    locationId: query.locationId,
    siteId: query.siteId,
    type: query.type,
    from: query.from,
    to: query.to
  });

  res.status(200).json({ success: true, data: movements });
});
