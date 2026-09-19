import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  addPartnershipShareTx,
  attachPropertyToPartnershipTx,
  createPartnershipTx,
  getPartnership,
  getPartnerStatement,
  listPartnerships,
  removePartnershipShareTx
} from '../lib/finance/partnerships';
import {
  addPartnershipShareSchema,
  attachPropertyToPartnershipSchema,
  createPartnershipSchema,
  getPartnerStatementQuerySchema,
  listPartnershipsQuerySchema,
  uuidPathParamSchema
} from '../lib/finance/schemas-partnerships';
import { prisma } from '../utils/database';

/**
 * Contrôleur des sept points d'entrée des associations — lot 4, deuxième
 * sous-lot (`lib/finance/types-lot4-partnerships.ts`, contrat gelé).
 *
 * Modèle : `controllers/finance-land-leases-controller.ts` (sous-lot
 * précédent). Chaque handler est enveloppé dans `asyncHandler` et laisse le
 * middleware central (`middleware/error-middleware.ts`) traduire les erreurs
 * — celles du domaine (`lib/finance/partnerships.ts`, typées par
 * `lib/errors.ts`) comme celles levées ici (`BadRequestError`). Aucun
 * `try/catch` ne devine de statut HTTP depuis un message.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ou d'une query.
 *
 * **AUCUN IDENTIFIANT DE CHEMIN N'EST REPRIS DEPUIS LE CORPS.** `partnershipId`
 * (route des parts) et `propertyId` (route de rattachement) viennent tous les
 * deux de `req.params`, jamais de `req.body` : les schémas Zod stricts
 * correspondants (`schemas-partnerships.ts`) ne les acceptent d'ailleurs pas
 * en entrée. Voir l'en-tête de ce fichier de schémas pour le défaut que cette
 * règle évite de reproduire.
 *
 * `DistributeInstallmentToPartnersTx` (huitième fonction du contrat) n'a pas
 * de route : elle est appelée par la campagne de facturation
 * (`billing-run.ts`), dans SA transaction, hors du territoire de cet agent.
 * Voir la rubrique « HYPOTHÈSES » du rapport de fin de tâche : le tableau des
 * routes fourni n'en listait que sept alors que la consigne en annonçait huit.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

/** Identifiant de chemin (association, part, bien) : rejeté en 400 s'il n'a pas la forme d'un UUID. */
function requireUuidParam(req: Request, name: string): string {
  const parsed = uuidPathParamSchema.safeParse(req.params[name]);
  if (!parsed.success) {
    throw new BadRequestError(`Le paramètre ${name} doit être un identifiant valide.`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// A. GET partnerships — liste
// ---------------------------------------------------------------------------

export const listPartnershipsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listPartnershipsQuerySchema.parse(req.query ?? {});

  const partnerships = await listPartnerships(tenantId, { onlyActive: query.onlyActive });

  res.status(200).json({ success: true, data: partnerships });
});

// ---------------------------------------------------------------------------
// B. POST partnerships — création, sans associé
// ---------------------------------------------------------------------------

export const createPartnershipHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createPartnershipSchema.parse(req.body ?? {});

  const partnership = await prisma.$transaction(tx => createPartnershipTx(tx, tenantId, { label: body.label }));

  res.status(201).json({ success: true, data: partnership });
});

// ---------------------------------------------------------------------------
// C. GET partnerships/:partnershipId — détail
// ---------------------------------------------------------------------------

export const getPartnershipHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const partnershipId = requireUuidParam(req, 'partnershipId');

  const partnership = await getPartnership(tenantId, partnershipId);

  res.status(200).json({ success: true, data: partnership });
});

// ---------------------------------------------------------------------------
// D. POST partnerships/:partnershipId/shares — ajout d'un associé
//
// `partnershipId` vient du chemin : le corps ne porte que ce que le chemin ne
// porte pas déjà (`partnerName`, `sharePercent`).
// ---------------------------------------------------------------------------

export const addPartnershipShareHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const partnershipId = requireUuidParam(req, 'partnershipId');
  const body = addPartnershipShareSchema.parse(req.body ?? {});

  const partnership = await prisma.$transaction(tx =>
    addPartnershipShareTx(tx, tenantId, {
      partnershipId,
      partnerName: body.partnerName,
      sharePercent: body.sharePercent
    })
  );

  res.status(201).json({ success: true, data: partnership });
});

// ---------------------------------------------------------------------------
// E. DELETE partnership-shares/:shareId — retrait d'un associé
// ---------------------------------------------------------------------------

export const removePartnershipShareHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const shareId = requireUuidParam(req, 'shareId');

  const partnership = await prisma.$transaction(tx => removePartnershipShareTx(tx, tenantId, shareId));

  res.status(200).json({ success: true, data: partnership });
});

// ---------------------------------------------------------------------------
// F. PUT properties/:propertyId/partnership — rattachement (ou détachement)
// ---------------------------------------------------------------------------

export const attachPropertyToPartnershipHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const propertyId = requireUuidParam(req, 'propertyId');
  const body = attachPropertyToPartnershipSchema.parse(req.body ?? {});

  const partnership = await prisma.$transaction(tx =>
    attachPropertyToPartnershipTx(tx, tenantId, propertyId, body.partnershipId)
  );

  res.status(200).json({ success: true, data: partnership });
});

// ---------------------------------------------------------------------------
// G. GET partnership-shares/:shareId/statement — état de quote-part
// ---------------------------------------------------------------------------

export const getPartnerStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const shareId = requireUuidParam(req, 'shareId');
  const query = getPartnerStatementQuerySchema.parse(req.query ?? {});
  const range = query.from || query.to ? { from: query.from, to: query.to } : undefined;

  const statement = await getPartnerStatement(tenantId, shareId, range);

  res.status(200).json({ success: true, data: statement });
});
