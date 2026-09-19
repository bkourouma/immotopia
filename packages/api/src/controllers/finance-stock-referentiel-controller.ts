import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  createStockItemTx,
  createStockLocationTx,
  getStockItem,
  getStockSettings,
  listStockItems,
  listStockLocations,
  setStockValuationMethodTx,
  updateStockItemTx,
  updateStockLocationTx
} from '../lib/finance/stock-referentiel';
import {
  createStockItemSchema,
  createStockLocationSchema,
  listStockItemsQuerySchema,
  listStockLocationsQuerySchema,
  setStockValuationMethodSchema,
  updateStockItemSchema,
  updateStockLocationSchema,
  uuidPathParamSchema
} from '../lib/finance/schemas-stock-referentiel';
import { prisma } from '../utils/database';

/**
 * Contrôleur des neuf points d'entrée du référentiel du stock — lot 5,
 * premier sous-lot (`lib/finance/types-lot5-referentiel.ts`).
 *
 * Modèle : `controllers/finance-salaries-controller.ts` (lot 4). Chaque
 * handler est enveloppé dans `asyncHandler` et laisse le middleware central
 * (`middleware/error-middleware.ts`) traduire les erreurs — celles du domaine
 * (`lib/finance/stock-referentiel.ts`, typées par `lib/errors.ts`) comme
 * celles levées ici (`BadRequestError`). Aucun `try/catch` ne devine de
 * statut HTTP depuis un message.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ou d'une query.
 *
 * `itemId` et `locationId` viennent TOUJOURS du chemin, jamais du corps : les
 * schémas (`schemas-stock-referentiel.ts`) sont `.strict()` et rejetteraient
 * de toute façon un corps qui les répéterait.
 *
 * **Aucune suppression** : ni article ni lieu ne s'effacent — leurs
 * mouvements racontent où la matière est passée. La désactivation passe par
 * `isActive` sur les deux PATCH.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

/** Identifiant de chemin (article, lieu) : rejeté en 400 s'il n'a pas la forme d'un UUID. */
function requireUuidParam(req: Request, name: string): string {
  const parsed = uuidPathParamSchema.safeParse(req.params[name]);
  if (!parsed.success) {
    throw new BadRequestError(`Le paramètre ${name} doit être un identifiant valide.`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// A. POST stock/items — enregistrement d'un article
// ---------------------------------------------------------------------------

export const createStockItemHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createStockItemSchema.parse(req.body ?? {});

  const item = await prisma.$transaction(tx =>
    createStockItemTx(tx, tenantId, {
      reference: body.reference,
      label: body.label,
      unit: body.unit,
      category: body.category ?? null,
      defaultCostCategoryId: body.defaultCostCategoryId ?? null
    })
  );

  res.status(201).json({ success: true, data: item });
});

// ---------------------------------------------------------------------------
// B. PATCH stock/items/:itemId — correction
// ---------------------------------------------------------------------------

export const updateStockItemHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const itemId = requireUuidParam(req, 'itemId');
  const body = updateStockItemSchema.parse(req.body ?? {});

  // Les clés ABSENTES du corps restent absentes des paramètres : `undefined`
  // veut dire « ne touche pas », et `null` veut dire « efface ». Recopier
  // `body.category ?? null` effacerait la famille à chaque correction du seul
  // libellé.
  const item = await prisma.$transaction(tx => updateStockItemTx(tx, tenantId, itemId, body));

  res.status(200).json({ success: true, data: item });
});

// ---------------------------------------------------------------------------
// C. GET stock/items — liste filtrée
// ---------------------------------------------------------------------------

export const listStockItemsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listStockItemsQuerySchema.parse(req.query ?? {});

  const items = await listStockItems(tenantId, { onlyActive: query.onlyActive, search: query.search });

  res.status(200).json({ success: true, data: items });
});

// ---------------------------------------------------------------------------
// D. GET stock/items/:itemId — détail
// ---------------------------------------------------------------------------

export const getStockItemHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const itemId = requireUuidParam(req, 'itemId');

  const item = await getStockItem(tenantId, itemId);

  res.status(200).json({ success: true, data: item });
});

// ---------------------------------------------------------------------------
// E. POST stock/locations — création d'un magasin ou du lieu d'un chantier
// ---------------------------------------------------------------------------

export const createStockLocationHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createStockLocationSchema.parse(req.body ?? {});

  const location = await prisma.$transaction(tx =>
    createStockLocationTx(tx, tenantId, {
      kind: body.kind,
      label: body.label,
      siteId: body.siteId ?? null
    })
  );

  res.status(201).json({ success: true, data: location });
});

// ---------------------------------------------------------------------------
// F. PATCH stock/locations/:locationId — correction (libellé, activité)
// ---------------------------------------------------------------------------

export const updateStockLocationHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const locationId = requireUuidParam(req, 'locationId');
  const body = updateStockLocationSchema.parse(req.body ?? {});

  const location = await prisma.$transaction(tx => updateStockLocationTx(tx, tenantId, locationId, body));

  res.status(200).json({ success: true, data: location });
});

// ---------------------------------------------------------------------------
// G. GET stock/locations — liste filtrée
// ---------------------------------------------------------------------------

export const listStockLocationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listStockLocationsQuerySchema.parse(req.query ?? {});

  const locations = await listStockLocations(tenantId, { onlyActive: query.onlyActive, kind: query.kind });

  res.status(200).json({ success: true, data: locations });
});

// ---------------------------------------------------------------------------
// H. GET stock/settings — la méthode de valorisation de l'agence
// ---------------------------------------------------------------------------

export const getStockSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);

  const settings = await getStockSettings(tenantId);

  res.status(200).json({ success: true, data: settings });
});

// ---------------------------------------------------------------------------
// I. PUT stock/settings — arrêter la méthode, avec son motif
//
// PUT et non PATCH : la décision est remplacée en entier, méthode ET motif
// ensemble. Un motif sans méthode, ou l'inverse, ne serait pas une décision.
// ---------------------------------------------------------------------------

export const setStockValuationMethodHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = setStockValuationMethodSchema.parse(req.body ?? {});

  const settings = await prisma.$transaction(tx =>
    setStockValuationMethodTx(tx, tenantId, {
      valuationMethod: body.valuationMethod,
      decisionNote: body.decisionNote
    })
  );

  res.status(200).json({ success: true, data: settings });
});
