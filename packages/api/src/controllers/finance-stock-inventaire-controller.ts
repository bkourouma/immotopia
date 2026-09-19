import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  createStockCountTx,
  getStockCount,
  listStockCounts,
  recordStockTransferTx,
  removeStockCountLineTx,
  setStockCountLineTx,
  validateStockCountTx
} from '../lib/finance/stock-inventaire';
import {
  createStockCountSchema,
  createStockTransferSchema,
  listStockCountsQuerySchema,
  setStockCountLineSchema,
  uuidPathParamSchema,
  validateStockCountSchema
} from '../lib/finance/schemas-stock-inventaire';
import { prisma } from '../utils/database';

/**
 * Contrôleur des sept points d'entrée des transferts et de l'inventaire
 * physique — lot 5, troisième sous-lot (`lib/finance/types-lot5-inventaire.ts`).
 *
 * Modèle : `controllers/finance-stock-mouvements-controller.ts` (sous-lot 2).
 * Chaque handler est enveloppé dans `asyncHandler` et laisse le middleware
 * central (`middleware/error-middleware.ts`) traduire les erreurs — celles du
 * domaine (`lib/finance/stock-inventaire.ts`, typées par `lib/errors.ts`)
 * comme celles levées ici (`BadRequestError`). Aucun `try/catch` ne devine de
 * statut HTTP depuis un message.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ni d'une query. `countId` et
 * `itemId` viennent toujours du chemin, pour les mêmes raisons.
 *
 * **Une seule transaction par écriture.** Le transfert écrit deux mouvements
 * et deux soldes ; sans la transaction, une panne entre les deux ferait
 * disparaître de la matière. La validation d'un inventaire écrit un mouvement,
 * une écriture et un solde par ligne en écart, puis change l'état du comptage :
 * un inventaire à moitié validé laisserait des écarts ajustés dans un comptage
 * encore en brouillon, qu'une seconde validation rejouerait.
 *
 * **Aucun libellé comptable ne sort d'ici** (principe P-1 du PRD) : les mots
 * « débit » et « crédit » n'apparaissent dans aucun message ni aucun champ
 * renvoyé. Le passage du 603 au 311 est une mécanique interne ; l'écran ne voit
 * qu'une quantité attendue, une quantité comptée et un motif.
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

// ---------------------------------------------------------------------------
// A. POST /stock/transfers — déplacer d'un lieu vers un autre
//
// AUCUN PRIX n'est transmis au domaine, parce qu'aucun n'est reçu : la valeur
// part au coût moyen du lieu d'origine (principe P-4). Le schéma est
// `.strict()`, un corps qui porterait `unitCost` a déjà échoué en 400.
//
// Le transfert n'écrit aucune écriture comptable et n'impute aucun chantier :
// déplacer n'est pas consommer. Le contrôleur n'a donc rien de particulier à
// faire — c'est précisément ce qu'il ne fait PAS qui compte.
// ---------------------------------------------------------------------------

export const createStockTransferHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createStockTransferSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const transfer = await prisma.$transaction(tx =>
    recordStockTransferTx(tx, tenantId, {
      fromLocationId: body.fromLocationId,
      toLocationId: body.toLocationId,
      itemId: body.itemId,
      quantity: body.quantity,
      transferDate: body.transferDate,
      createdByUserId: actorUserId
    })
  );

  res.status(201).json({ success: true, data: transfer });
});

// ---------------------------------------------------------------------------
// B. POST /stock/counts — ouvrir un inventaire, en brouillon et sans ligne
// ---------------------------------------------------------------------------

export const createStockCountHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createStockCountSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const count = await prisma.$transaction(tx =>
    createStockCountTx(tx, tenantId, {
      locationId: body.locationId,
      countedAt: body.countedAt,
      createdByUserId: actorUserId
    })
  );

  res.status(201).json({ success: true, data: count });
});

// ---------------------------------------------------------------------------
// C. PUT /stock/counts/:countId/lines — saisir ou corriger un comptage
//
// PUT, et non POST : rappeler le même article REMPLACE son comptage (contrat).
// On se reprend en comptant, et une seconde ligne pour le même article rendrait
// l'écart ambigu.
//
// `expectedQuantity` n'est pas reçue et n'est donc pas transmise : le service
// la lit dans le stock au moment de la saisie et la fige (principe P-4).
// ---------------------------------------------------------------------------

export const setStockCountLineHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const countId = requireUuidParam(req, 'countId');
  const body = setStockCountLineSchema.parse(req.body ?? {});

  const count = await prisma.$transaction(tx =>
    setStockCountLineTx(tx, tenantId, countId, {
      itemId: body.itemId,
      countedQuantity: body.countedQuantity,
      reason: body.reason ?? null
    })
  );

  res.status(200).json({ success: true, data: count });
});

// ---------------------------------------------------------------------------
// D. DELETE /stock/counts/:countId/lines/:itemId — retirer une ligne
//
// Les deux identifiants viennent du CHEMIN, et aucun corps n'est lu : une
// suppression n'a rien à négocier.
// ---------------------------------------------------------------------------

export const removeStockCountLineHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const countId = requireUuidParam(req, 'countId');
  const itemId = requireUuidParam(req, 'itemId');

  const count = await prisma.$transaction(tx => removeStockCountLineTx(tx, tenantId, countId, itemId));

  res.status(200).json({ success: true, data: count });
});

// ---------------------------------------------------------------------------
// E. POST /stock/counts/:countId/validate — les écarts deviennent des ajustements
//
// Porte le droit de VALIDATION (`requireDocumentsValidate`), distinct de la
// création (décision D7, comme depuis le lot 2) : acter une perte est la
// décision de quelqu'un, pas une saisie courante.
// ---------------------------------------------------------------------------

export const validateStockCountHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const countId = requireUuidParam(req, 'countId');
  // Parsé bien qu'attendu vide : c'est ce qui refuse un corps qui répéterait
  // `countId`, plutôt que de le jeter en silence.
  validateStockCountSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const count = await prisma.$transaction(tx => validateStockCountTx(tx, tenantId, countId, actorUserId));

  res.status(200).json({ success: true, data: count });
});

// ---------------------------------------------------------------------------
// F. GET /stock/counts — la liste des comptages
// ---------------------------------------------------------------------------

export const listStockCountsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listStockCountsQuerySchema.parse(req.query ?? {});

  const counts = await listStockCounts(tenantId, {
    locationId: query.locationId,
    status: query.status
  });

  res.status(200).json({ success: true, data: counts });
});

// ---------------------------------------------------------------------------
// G. GET /stock/counts/:countId — le détail d'un comptage
// ---------------------------------------------------------------------------

export const getStockCountHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const countId = requireUuidParam(req, 'countId');

  const count = await getStockCount(tenantId, countId);

  res.status(200).json({ success: true, data: count });
});
