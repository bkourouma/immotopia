import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  attachSiteToLandLeaseTx,
  createLandLeasePaymentTx,
  createLandLeaseTx,
  getLandLease,
  listLandLeaseAccruals,
  listLandLeasePayments,
  listLandLeases,
  recordLandLeaseAccrualTx,
  validateLandLeasePaymentTx
} from '../lib/finance/land-leases';
import {
  attachSiteToLandLeaseSchema,
  createLandLeasePaymentSchema,
  createLandLeaseSchema,
  listLandLeasesQuerySchema,
  recordLandLeaseAccrualSchema,
  uuidPathParamSchema
} from '../lib/finance/schemas-land-leases';
import { prisma } from '../utils/database';

/**
 * Contrôleur des neuf points d'entrée des baux de terrain — lot 4, premier
 * sous-lot (`specs/019-finance-baux-terrain/data-model.md` §5).
 *
 * Modèle : `controllers/finance-suppliers-controller.ts` (lot 2). Chaque
 * handler est enveloppé dans `asyncHandler` et laisse le middleware central
 * (`middleware/error-middleware.ts`) traduire les erreurs — celles du domaine
 * (`lib/finance/land-leases.ts`, typées par `lib/errors.ts`) comme celles
 * levées ici (`BadRequestError`). Aucun `try/catch` ne devine de statut HTTP
 * depuis un message.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ou d'une query.
 *
 * La constatation programmée (`RunMonthlyLandLeaseAccruals`) n'a pas de
 * route : le contrat la réserve au travail programmé du 1er du mois
 * (`src/jobs/`), hors du territoire de cet agent (voir le rapport de fin de
 * tâche). Seule la constatation manuelle d'UN bail et d'UN mois (route I,
 * `documents.validate`) est exposée ici.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

/** Identifiant de chemin (bail, paiement, chantier) : rejeté en 400 s'il n'a pas la forme d'un UUID. */
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
// A. GET land-leases — liste
// ---------------------------------------------------------------------------

export const listLandLeasesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listLandLeasesQuerySchema.parse(req.query ?? {});

  const leases = await listLandLeases(tenantId, { onlyActive: query.onlyActive });

  res.status(200).json({ success: true, data: leases });
});

// ---------------------------------------------------------------------------
// B. POST land-leases — enregistrement
// ---------------------------------------------------------------------------

export const createLandLeaseHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createLandLeaseSchema.parse(req.body ?? {});

  const lease = await prisma.$transaction(tx =>
    createLandLeaseTx(tx, tenantId, {
      landlordName: body.landlordName,
      landLabel: body.landLabel,
      annualAmount: body.annualAmount,
      costCategoryId: body.costCategoryId,
      startDate: body.startDate,
      endDate: body.endDate ?? null
    })
  );

  res.status(201).json({ success: true, data: lease });
});

// ---------------------------------------------------------------------------
// C. GET land-leases/:landLeaseId — détail
// ---------------------------------------------------------------------------

export const getLandLeaseHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const landLeaseId = requireUuidParam(req, 'landLeaseId');

  const lease = await getLandLease(tenantId, landLeaseId);

  res.status(200).json({ success: true, data: lease });
});

// ---------------------------------------------------------------------------
// D. PUT sites/:siteId/land-lease — rattachement (ou détachement)
// ---------------------------------------------------------------------------

export const attachSiteToLandLeaseHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');
  const body = attachSiteToLandLeaseSchema.parse(req.body ?? {});

  const lease = await prisma.$transaction(tx => attachSiteToLandLeaseTx(tx, tenantId, siteId, body.landLeaseId));

  res.status(200).json({ success: true, data: lease });
});

// ---------------------------------------------------------------------------
// E. GET land-leases/:landLeaseId/payments — liste
// ---------------------------------------------------------------------------

export const listLandLeasePaymentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const landLeaseId = requireUuidParam(req, 'landLeaseId');

  const payments = await listLandLeasePayments(tenantId, landLeaseId);

  res.status(200).json({ success: true, data: payments });
});

// ---------------------------------------------------------------------------
// F. POST land-leases/:landLeaseId/payments — saisie en brouillon
// ---------------------------------------------------------------------------

export const createLandLeasePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const landLeaseId = requireUuidParam(req, 'landLeaseId');
  const body = createLandLeasePaymentSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const payment = await prisma.$transaction(tx =>
    createLandLeasePaymentTx(tx, tenantId, {
      landLeaseId,
      paymentDate: body.paymentDate,
      amount: body.amount,
      coverageStartDate: body.coverageStartDate,
      coverageEndDate: body.coverageEndDate,
      createdByUserId: actorUserId
    })
  );

  res.status(201).json({ success: true, data: payment });
});

// ---------------------------------------------------------------------------
// G. POST land-lease-payments/:paymentId/validate
//
// Porte le droit de validation (`requireDocumentsValidate`), distinct de la
// création (décision D7, comme au lot 2) : plusieurs saisisseurs, un
// validateur.
// ---------------------------------------------------------------------------

export const validateLandLeasePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const paymentId = requireUuidParam(req, 'paymentId');
  const actorUserId = requireActorUserId(req);

  const payment = await prisma.$transaction(tx => validateLandLeasePaymentTx(tx, tenantId, paymentId, actorUserId));

  res.status(200).json({ success: true, data: payment });
});

// ---------------------------------------------------------------------------
// H. GET land-leases/:landLeaseId/accruals — liste
// ---------------------------------------------------------------------------

export const listLandLeaseAccrualsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const landLeaseId = requireUuidParam(req, 'landLeaseId');

  const accruals = await listLandLeaseAccruals(tenantId, landLeaseId);

  res.status(200).json({ success: true, data: accruals });
});

// ---------------------------------------------------------------------------
// I. POST land-leases/:landLeaseId/accruals — constatation manuelle
//
// Rattrapage à la main d'un mois précis, quand le travail programmé n'a pas
// tourné. Idempotente comme lui (même fonction de domaine) : rejouer la même
// période renvoie 201 avec la constatation déjà existante, jamais une erreur
// — même convention que `createBillingRunHandler` (lot 1) pour une raison
// identique (`controllers/finance-controller.ts`).
// ---------------------------------------------------------------------------

export const recordLandLeaseAccrualHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const landLeaseId = requireUuidParam(req, 'landLeaseId');
  const body = recordLandLeaseAccrualSchema.parse(req.body ?? {});

  const accrual = await prisma.$transaction(tx =>
    recordLandLeaseAccrualTx(tx, tenantId, {
      landLeaseId,
      periodYear: body.periodYear,
      periodMonth: body.periodMonth
    })
  );

  res.status(201).json({ success: true, data: accrual });
});
