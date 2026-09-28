import { Request, Response } from 'express';
import {
  createExpenseSchema,
  createLoanSchema,
  createValuationSchema,
  createWorkProgramSchema,
  linkWorkProgramConstructionSiteSchema,
  listTenantWorkProgramsQuerySchema,
  projectionQuerySchema,
  updateExpenseSchema,
  updateLoanSchema,
  updateValuationSchema,
  updateWorkProgramSchema
} from '../lib/patrimoine/schemas';
import {
  buildPropertyYieldInput,
  createPropertyExpense,
  deletePropertyExpense,
  deletePropertyLoan,
  deletePropertyValuation,
  deletePropertyWorkProgram,
  getPropertyExpenseById,
  getPropertyLoanById,
  getPropertyValuationById,
  getPropertyWorkProgramById,
  createPropertyLoan,
  createPropertyValuation,
  createPropertyWorkProgram,
  getPatrimoineOverview,
  linkWorkProgramConstructionSite,
  listPropertyExpenses,
  listPropertyLoans,
  listPropertyValuations,
  listPropertyWorkPrograms,
  listTenantWorkPrograms,
  updatePropertyExpense,
  updatePropertyLoan,
  updatePropertyValuation,
  updatePropertyWorkProgram
} from '../lib/patrimoine/queries';
import {
  grossYield,
  latentCapitalGain,
  netNetYield,
  netYield,
  projectedYieldAtHorizon,
  projectYield
} from '../lib/patrimoine/yield';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';

function resolveTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError('TenantId manquant');
  return tenantId;
}

function resolvePropertyId(req: Request): string {
  const propertyId = req.params.propertyId;
  if (!propertyId) throw new BadRequestError('PropertyId manquant');
  return propertyId;
}

function resolveResourceId(req: Request, key: string, label: string): string {
  const value = req.params[key];
  if (!value) throw new BadRequestError(`${label} manquant`);
  return value;
}

export const getPatrimoineOverviewHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const data = await getPatrimoineOverview(tenantId);
  res.json({ success: true, data });
});

/**
 * Programmes de travaux de toute l'agence, pagines et filtres cote serveur.
 * Remplace le N+1 decrit au §8.4 : une requete au lieu de 101.
 * `upcoming=true` (ecran d'accueil) ignore la pagination : voir
 * `listTenantWorkPrograms` (lib/patrimoine/queries.ts).
 */
export const listTenantWorkProgramsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const query = listTenantWorkProgramsQuerySchema.parse(req.query);
  const data = await listTenantWorkPrograms(tenantId, {
    status: query.status,
    page: query.page,
    limit: query.limit,
    upcoming: query.upcoming
  });
  res.json({ success: true, data });
});

export const getPatrimoinePerformanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const propertyId = req.query.propertyId as string | undefined;
  if (!propertyId) {
    const overview = await getPatrimoineOverview(tenantId);
    res.json({ success: true, data: { portfolio: overview, properties: [] } });
    return;
  }

  const input = await buildPropertyYieldInput(tenantId, propertyId);
  const assumptions = projectionQuerySchema.parse(req.query);

  const data = {
    propertyId,
    grossYield: grossYield(input),
    netYield: netYield(input),
    netNetYield: netNetYield(input),
    latentCapitalGain: latentCapitalGain(input),
    projectedAtHorizon: projectedYieldAtHorizon(input, assumptions.years, assumptions),
    projection: projectYield(input, assumptions.years, assumptions)
  };

  res.json({ success: true, data });
});

export const listPropertyValuationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await listPropertyValuations(resolveTenantId(req), resolvePropertyId(req));
  res.json({ success: true, data });
});

export const createPropertyValuationHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createValuationSchema.parse(req.body);
  const data = await createPropertyValuation(resolveTenantId(req), resolvePropertyId(req), parsed);
  res.status(201).json({ success: true, data });
});

export const getPropertyValuationHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getPropertyValuationById(
    resolveTenantId(req),
    resolvePropertyId(req),
    resolveResourceId(req, 'valuationId', 'ValuationId')
  );
  res.json({ success: true, data });
});

export const updatePropertyValuationHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateValuationSchema.parse(req.body);
  const data = await updatePropertyValuation(
    resolveTenantId(req),
    resolvePropertyId(req),
    resolveResourceId(req, 'valuationId', 'ValuationId'),
    parsed
  );
  res.json({ success: true, data });
});

export const deletePropertyValuationHandler = asyncHandler(async (req: Request, res: Response) => {
  await deletePropertyValuation(
    resolveTenantId(req),
    resolvePropertyId(req),
    resolveResourceId(req, 'valuationId', 'ValuationId')
  );
  res.status(204).send();
});

export const listPropertyExpensesHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await listPropertyExpenses(resolveTenantId(req), resolvePropertyId(req));
  res.json({ success: true, data });
});

export const createPropertyExpenseHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createExpenseSchema.parse(req.body);
  const data = await createPropertyExpense(resolveTenantId(req), resolvePropertyId(req), parsed);
  res.status(201).json({ success: true, data });
});

export const getPropertyExpenseHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getPropertyExpenseById(
    resolveTenantId(req),
    resolvePropertyId(req),
    resolveResourceId(req, 'expenseId', 'ExpenseId')
  );
  res.json({ success: true, data });
});

export const updatePropertyExpenseHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateExpenseSchema.parse(req.body);
  const data = await updatePropertyExpense(
    resolveTenantId(req),
    resolvePropertyId(req),
    resolveResourceId(req, 'expenseId', 'ExpenseId'),
    parsed
  );
  res.json({ success: true, data });
});

export const deletePropertyExpenseHandler = asyncHandler(async (req: Request, res: Response) => {
  await deletePropertyExpense(
    resolveTenantId(req),
    resolvePropertyId(req),
    resolveResourceId(req, 'expenseId', 'ExpenseId')
  );
  res.status(204).send();
});

export const listPropertyLoansHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await listPropertyLoans(resolveTenantId(req), resolvePropertyId(req));
  res.json({ success: true, data });
});

export const createPropertyLoanHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createLoanSchema.parse(req.body);
  const data = await createPropertyLoan(resolveTenantId(req), resolvePropertyId(req), parsed);
  res.status(201).json({ success: true, data });
});

export const getPropertyLoanHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getPropertyLoanById(
    resolveTenantId(req),
    resolvePropertyId(req),
    resolveResourceId(req, 'loanId', 'LoanId')
  );
  res.json({ success: true, data });
});

export const updatePropertyLoanHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateLoanSchema.parse(req.body);
  const data = await updatePropertyLoan(
    resolveTenantId(req),
    resolvePropertyId(req),
    resolveResourceId(req, 'loanId', 'LoanId'),
    parsed
  );
  res.json({ success: true, data });
});

export const deletePropertyLoanHandler = asyncHandler(async (req: Request, res: Response) => {
  await deletePropertyLoan(resolveTenantId(req), resolvePropertyId(req), resolveResourceId(req, 'loanId', 'LoanId'));
  res.status(204).send();
});

export const listPropertyWorkProgramsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await listPropertyWorkPrograms(resolveTenantId(req), resolvePropertyId(req));
  res.json({ success: true, data });
});

export const createPropertyWorkProgramHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createWorkProgramSchema.parse(req.body);
  const data = await createPropertyWorkProgram(resolveTenantId(req), resolvePropertyId(req), parsed);
  res.status(201).json({ success: true, data });
});

export const getPropertyWorkProgramHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getPropertyWorkProgramById(
    resolveTenantId(req),
    resolvePropertyId(req),
    resolveResourceId(req, 'programId', 'ProgramId')
  );
  res.json({ success: true, data });
});

export const updatePropertyWorkProgramHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateWorkProgramSchema.parse(req.body);
  const data = await updatePropertyWorkProgram(
    resolveTenantId(req),
    resolvePropertyId(req),
    resolveResourceId(req, 'programId', 'ProgramId'),
    parsed
  );
  res.json({ success: true, data });
});

/**
 * Rattache (ou detache, `constructionSiteId: null`) un programme de travaux
 * a un chantier financier. Voir spec.md US12, FR-024 et
 * `contracts/openapi.yaml` (`PATCH .../work-programs/{id}/construction-site`).
 * Garde : `requireSitesManage` (posee en route, cote finance-rbac-middleware),
 * pas `requirePropertyPermission` -- ce geste est un acte de gestion
 * financiere du chantier, pas une simple edition de fiche bien.
 */
export const linkWorkProgramConstructionSiteHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = linkWorkProgramConstructionSiteSchema.parse(req.body);
  const data = await linkWorkProgramConstructionSite(
    resolveTenantId(req),
    resolveResourceId(req, 'workProgramId', 'WorkProgramId'),
    parsed.constructionSiteId,
    req.user?.userId
  );
  res.json({ success: true, data });
});

export const deletePropertyWorkProgramHandler = asyncHandler(async (req: Request, res: Response) => {
  await deletePropertyWorkProgram(
    resolveTenantId(req),
    resolvePropertyId(req),
    resolveResourceId(req, 'programId', 'ProgramId')
  );
  res.status(204).send();
});

export const getPropertyYieldHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const propertyId = resolvePropertyId(req);
  const assumptions = projectionQuerySchema.parse(req.query);
  const input = await buildPropertyYieldInput(tenantId, propertyId);

  const data = {
    grossYield: grossYield(input),
    netYield: netYield(input),
    netNetYield: netNetYield(input),
    latentCapitalGain: latentCapitalGain(input),
    projectedAtHorizon: projectedYieldAtHorizon(input, assumptions.years, assumptions),
    projection: projectYield(input, assumptions.years, assumptions)
  };

  res.json({ success: true, data });
});
