import { Request, Response } from 'express';

import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  capitalizeSiteLotTx,
  closeSiteTx,
  createSiteLotTx,
  deleteSiteLotTx,
  getSiteClosureBlockersForCaller,
  getSiteCostBreakdown,
  listSiteLots,
  reopenSiteTx,
  setLotAllocationMethodTx,
  updateSiteLotTx
} from '../lib/finance/site-closing';
import {
  capitalizeSiteLotSchema,
  closeSiteSchema,
  createSiteLotSchema,
  reopenSiteSchema,
  setLotAllocationMethodSchema,
  updateSiteLotSchema,
  uuidPathParamSchema
} from '../lib/finance/schemas-site-closing';
import { resolveStockCallerContext } from '../lib/finance/stock-controles';
import { prisma } from '../utils/database';

/**
 * Contrôleur des dix points d'entrée des lots, du coût de revient et de la
 * clôture — lot 4, sixième et dernier sous-lot
 * (`lib/finance/types-lot4-closing.ts`).
 *
 * Modèle : `controllers/finance-salaries-controller.ts` (sous-lot précédent).
 * Chaque handler est enveloppé dans `asyncHandler` et laisse le middleware
 * central (`middleware/error-middleware.ts`) traduire les erreurs — celles du
 * domaine (`lib/finance/site-closing.ts`, typées par `lib/errors.ts`) comme
 * celles levées ici (`BadRequestError`, `ZodError`). Aucun `try/catch` ne
 * devine de statut HTTP depuis un message.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ni d'une query.
 *
 * `siteId` et `lotId` viennent TOUJOURS du chemin, jamais du corps : les
 * schémas (`schemas-site-closing.ts`) sont `.strict()` et rejetteraient de
 * toute façon un corps qui les répéterait — c'est exactement ce qui avait fait
 * échouer quatre créations en 400 contre le vrai serveur au lot 3.
 *
 * `closedByUserId` vient du jeton d'authentification, jamais du corps : un
 * corps qui le porterait permettrait de clôturer au nom de quelqu'un d'autre.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

/** Identifiant de chemin (chantier, lot) : rejeté en 400 s'il n'a pas la forme d'un UUID. */
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
// A. POST sites/:siteId/lots — ajout d'un lot
// ---------------------------------------------------------------------------

export const createSiteLotHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');
  const body = createSiteLotSchema.parse(req.body ?? {});

  const lot = await prisma.$transaction(tx =>
    createSiteLotTx(tx, tenantId, {
      siteId,
      name: body.name,
      surfaceArea: body.surfaceArea ?? null,
      manualSharePercent: body.manualSharePercent ?? null
    })
  );

  res.status(201).json({ success: true, data: lot });
});

// ---------------------------------------------------------------------------
// B. PATCH sites/:siteId/lots/:lotId — correction d'un lot
// ---------------------------------------------------------------------------

export const updateSiteLotHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  requireUuidParam(req, 'siteId');
  const lotId = requireUuidParam(req, 'lotId');
  const body = updateSiteLotSchema.parse(req.body ?? {});

  // Les clés ABSENTES du corps restent absentes des paramètres : le domaine
  // distingue « ne touche pas à la surface » de « efface la surface »
  // (`'surfaceArea' in params`), et recopier `undefined` effacerait ce que
  // l'appelant n'a pas nommé.
  const params: { name?: string; surfaceArea?: number | null; manualSharePercent?: number | null } = {};
  if (body.name !== undefined) {
    params.name = body.name;
  }
  if ('surfaceArea' in body) {
    params.surfaceArea = body.surfaceArea ?? null;
  }
  if ('manualSharePercent' in body) {
    params.manualSharePercent = body.manualSharePercent ?? null;
  }

  const lot = await prisma.$transaction(tx => updateSiteLotTx(tx, tenantId, lotId, params));

  res.status(200).json({ success: true, data: lot });
});

// ---------------------------------------------------------------------------
// C. DELETE sites/:siteId/lots/:lotId — suppression d'un lot
// ---------------------------------------------------------------------------

export const deleteSiteLotHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  requireUuidParam(req, 'siteId');
  const lotId = requireUuidParam(req, 'lotId');

  await prisma.$transaction(tx => deleteSiteLotTx(tx, tenantId, lotId));

  res.status(200).json({ success: true, data: { id: lotId } });
});

// ---------------------------------------------------------------------------
// D. PUT sites/:siteId/lot-allocation-method — la clé de répartition
// ---------------------------------------------------------------------------

export const setLotAllocationMethodHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');
  const body = setLotAllocationMethodSchema.parse(req.body ?? {});

  const lots = await prisma.$transaction(tx => setLotAllocationMethodTx(tx, tenantId, siteId, body.method));

  res.status(200).json({ success: true, data: lots });
});

// ---------------------------------------------------------------------------
// E. GET sites/:siteId/lots — liste
// ---------------------------------------------------------------------------

export const listSiteLotsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');

  const lots = await listSiteLots(tenantId, siteId);

  res.status(200).json({ success: true, data: lots });
});

// ---------------------------------------------------------------------------
// F. GET sites/:siteId/cost-breakdown — le coût de revient, vu du chantier
// ---------------------------------------------------------------------------

export const getSiteCostBreakdownHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');

  const breakdown = await getSiteCostBreakdown(tenantId, siteId);

  res.status(200).json({ success: true, data: breakdown });
});

// ---------------------------------------------------------------------------
// G. GET sites/:siteId/closure-blockers — ce qui empêche de clôturer
//
// Renvoie 200 avec un tableau, éventuellement vide : l'absence de bloqueur est
// une réponse, pas une erreur. L'écran l'affiche AVANT que l'utilisateur ne
// clique, plutôt que de le laisser se heurter à un refus sec.
// ---------------------------------------------------------------------------

export const getSiteClosureBlockersHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');

  // Lot 040 (§8.2) : le nombre d'articles restant sur un lieu en comptage
  // aveugle n'est pas rendu à un compteur sans STOCK_COUNT_VALIDATE.
  const ctx = await resolveStockCallerContext(requireActorUserId(req), tenantId);
  const blockers = await getSiteClosureBlockersForCaller(tenantId, siteId, ctx);

  res.status(200).json({ success: true, data: blockers });
});

// ---------------------------------------------------------------------------
// H. POST sites/:siteId/close — la clôture
// ---------------------------------------------------------------------------

export const closeSiteHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');
  closeSiteSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const closure = await prisma.$transaction(tx => closeSiteTx(tx, tenantId, siteId, { closedByUserId: actorUserId }));

  res.status(200).json({ success: true, data: closure });
});

// ---------------------------------------------------------------------------
// I. POST sites/:siteId/reopen — la réouverture
// ---------------------------------------------------------------------------

export const reopenSiteHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');
  reopenSiteSchema.parse(req.body ?? {});

  const closure = await prisma.$transaction(tx => reopenSiteTx(tx, tenantId, siteId));

  res.status(200).json({ success: true, data: closure });
});

// ---------------------------------------------------------------------------
// J. POST sites/:siteId/lots/:lotId/capitalize — la bascule au patrimoine
// ---------------------------------------------------------------------------

export const capitalizeSiteLotHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  requireUuidParam(req, 'siteId');
  const lotId = requireUuidParam(req, 'lotId');
  const body = capitalizeSiteLotSchema.parse(req.body ?? {});

  const capitalized = await prisma.$transaction(tx =>
    capitalizeSiteLotTx(tx, tenantId, lotId, {
      internalReference: body.internalReference,
      propertyType: body.propertyType,
      ownershipType: body.ownershipType,
      title: body.title,
      description: body.description,
      address: body.address,
      acquisitionDate: body.acquisitionDate
    })
  );

  res.status(201).json({ success: true, data: capitalized });
});
