import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import {
  createBudgetAmendmentTx,
  createSiteBudgetTx,
  getValidatedSiteBudget,
  listBudgetAmendments,
  listSiteBudgets,
  validateBudgetAmendmentTx,
  validateSiteBudgetTx
} from '../lib/finance/budgets';
import { prisma } from '../utils/database';
import type { BudgetAmendmentRecord, SiteBudgetRecord } from '../lib/finance/types-lot3';
import {
  createBudgetAmendmentSchema,
  createSiteBudgetSchema,
  uuidPathParamSchema
} from '../lib/finance/schemas-budgets';

/**
 * Contrôleur des sept points d'entrée agence « budget et avenants » du
 * module financier — lot 3, premier volet
 * (`specs/018-finance-budget-pilotage/data-model.md` §5).
 *
 * Modèle : `controllers/finance-suppliers-controller.ts` (lot 2). Chaque
 * handler est enveloppé dans `asyncHandler` et laisse le middleware central
 * (`middleware/error-middleware.ts`) traduire les erreurs — celles du domaine
 * (`lib/finance/budgets.ts`, typées par `lib/errors.ts`) comme celles levées
 * ici (`BadRequestError`, `NotFoundError` de `middleware/error-middleware.ts`).
 * Aucun `try/catch` ne devine de statut HTTP depuis un message.
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

/** Identifiant de chemin (chantier, budget, avenant) : rejeté en 400 s'il n'a pas la forme d'un UUID. */
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
//
// Les deux enregistrements du domaine (`SiteBudgetRecord`,
// `BudgetAmendmentRecord`) sont déjà à la frontière voulue par le contrat :
// montants en `number`, libellés de poste résolus, totaux calculés. Aucune
// conversion supplémentaire n'est nécessaire ici — contrairement au lot 2,
// où deux formes coexistaient (lecture directe en base vs enregistrement du
// domaine), ce lot n'expose aucune lecture qui contournerait `lib/finance/budgets.ts`.
// ---------------------------------------------------------------------------

function toSiteBudgetResponse(budget: SiteBudgetRecord) {
  return { ...budget };
}

function toBudgetAmendmentResponse(amendment: BudgetAmendmentRecord) {
  return { ...amendment };
}

// ---------------------------------------------------------------------------
// A. GET sites/:siteId/budgets — liste, brouillons compris
// ---------------------------------------------------------------------------

export const listSiteBudgetsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');

  const budgets = await listSiteBudgets(tenantId, siteId);

  res.status(200).json({ success: true, data: budgets.map(toSiteBudgetResponse) });
});

// ---------------------------------------------------------------------------
// B. POST sites/:siteId/budgets — création d'un budget brouillon
// ---------------------------------------------------------------------------

export const createSiteBudgetHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');
  const body = createSiteBudgetSchema.parse(req.body ?? {});

  const budget = await prisma.$transaction(tx =>
    createSiteBudgetTx(tx, tenantId, {
      siteId,
      label: body.label,
      lines: body.lines
    })
  );

  res.status(201).json({ success: true, data: toSiteBudgetResponse(budget) });
});

// ---------------------------------------------------------------------------
// C. GET sites/:siteId/budget — le budget validé, ou 404
//
// Distinct de la route ci-dessus par son chemin littéral (`budget`, singulier,
// contre `budgets`) : aucune ambiguïté de déclaration côté routeur, à la
// différence du cas `suppliers/balance` vs `suppliers/:supplierId` du lot 2.
// ---------------------------------------------------------------------------

export const getValidatedSiteBudgetHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');

  const budget = await getValidatedSiteBudget(tenantId, siteId);
  if (!budget) {
    throw new NotFoundError("Ce chantier n'a pas encore de budget validé.");
  }

  res.status(200).json({ success: true, data: toSiteBudgetResponse(budget) });
});

// ---------------------------------------------------------------------------
// D. POST site-budgets/:budgetId/validate
// ---------------------------------------------------------------------------

export const validateSiteBudgetHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const budgetId = requireUuidParam(req, 'budgetId');
  const actorUserId = requireActorUserId(req);

  const budget = await prisma.$transaction(tx => validateSiteBudgetTx(tx, tenantId, budgetId, actorUserId));

  res.status(200).json({ success: true, data: toSiteBudgetResponse(budget) });
});

// ---------------------------------------------------------------------------
// E. GET site-budgets/:budgetId/amendments — liste
// ---------------------------------------------------------------------------

export const listBudgetAmendmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const budgetId = requireUuidParam(req, 'budgetId');

  const amendments = await listBudgetAmendments(tenantId, budgetId);

  res.status(200).json({ success: true, data: amendments.map(toBudgetAmendmentResponse) });
});

// ---------------------------------------------------------------------------
// F. POST site-budgets/:budgetId/amendments — création d'un avenant brouillon
// ---------------------------------------------------------------------------

export const createBudgetAmendmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const budgetId = requireUuidParam(req, 'budgetId');
  const body = createBudgetAmendmentSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const amendment = await prisma.$transaction(tx =>
    createBudgetAmendmentTx(tx, tenantId, {
      budgetId,
      amendmentDate: body.amendmentDate,
      reason: body.reason,
      lines: body.lines,
      createdByUserId: actorUserId
    })
  );

  res.status(201).json({ success: true, data: toBudgetAmendmentResponse(amendment) });
});

// ---------------------------------------------------------------------------
// G. POST budget-amendments/:id/validate
// ---------------------------------------------------------------------------

export const validateBudgetAmendmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const amendmentId = requireUuidParam(req, 'id');
  const actorUserId = requireActorUserId(req);

  const amendment = await prisma.$transaction(tx => validateBudgetAmendmentTx(tx, tenantId, amendmentId, actorUserId));

  res.status(200).json({ success: true, data: toBudgetAmendmentResponse(amendment) });
});
