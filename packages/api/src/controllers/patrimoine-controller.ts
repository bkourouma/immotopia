import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
  createDocumentSchema,
  createExpenseSchema,
  createLoanSchema,
  createValuationSchema,
  createWorkProgramSchema,
  linkWorkProgramConstructionSiteSchema,
  projectionQuerySchema,
  updateExpenseSchema,
  updateLoanSchema,
  updateValuationSchema,
  updateWorkProgramSchema
} from '../lib/patrimoine/schemas';
import {
  buildPropertyYieldInput,
  createPropertyDocument,
  createPropertyExpense,
  deletePropertyDocument,
  deletePropertyExpense,
  deletePropertyLoan,
  deletePropertyValuation,
  deletePropertyWorkProgram,
  getPropertyDocumentById,
  getPropertyExpenseById,
  getPropertyLoanById,
  getPropertyValuationById,
  getPropertyWorkProgramById,
  createPropertyLoan,
  createPropertyValuation,
  createPropertyWorkProgram,
  getPatrimoineOverview,
  linkWorkProgramConstructionSite,
  listPropertyDocuments,
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
import { badRequest } from '../lib/errors';

function resolveTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw badRequest('TenantId manquant');
  return tenantId;
}

function resolvePropertyId(req: Request): string {
  const propertyId = req.params.propertyId;
  if (!propertyId) throw badRequest('PropertyId manquant');
  return propertyId;
}

function resolveResourceId(req: Request, key: string, label: string): string {
  const value = req.params[key];
  if (!value) throw badRequest(`${label} manquant`);
  return value;
}

export async function getPatrimoineOverviewHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req);
    const data = await getPatrimoineOverview(tenantId);
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error getting patrimoine overview', { error });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 500).json({ success: false, error: typed.message || 'Echec de l apercu patrimoine' });
  }
}

/**
 * Programmes de travaux de toute l'agence, pagines et filtres cote serveur.
 * Remplace le N+1 decrit au §8.4 : une requete au lieu de 101.
 */
export async function listTenantWorkProgramsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req);
    const rawStatus = req.query.status as string | undefined;
    const allowed = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (rawStatus && !allowed.includes(rawStatus)) {
      res.status(400).json({ success: false, error: 'Statut de programme de travaux inconnu' });
      return;
    }
    const data = await listTenantWorkPrograms(tenantId, {
      status: rawStatus as never,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined
    });
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error listing tenant work programs', { error });
    const typed = error as { status?: number; message?: string };
    res
      .status(typed.status || 500)
      .json({ success: false, error: typed.message || 'Echec du chargement des programmes de travaux' });
  }
}

export async function getPatrimoinePerformanceHandler(req: Request, res: Response): Promise<void> {
  try {
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
  } catch (error: unknown) {
    logger.error('Error getting patrimoine performance', { error });
    const typed = error as { status?: number; message?: string };
    res
      .status(typed.status || 500)
      .json({ success: false, error: typed.message || 'Echec de la performance patrimoine' });
  }
}

export async function listPropertyValuationsHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await listPropertyValuations(resolveTenantId(req), resolvePropertyId(req));
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error listing property valuations', { error });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 500).json({ success: false, error: typed.message || 'Echec liste valorisations' });
  }
}

export async function createPropertyValuationHandler(req: Request, res: Response): Promise<void> {
  try {
    const parsed = createValuationSchema.parse(req.body);
    const data = await createPropertyValuation(resolveTenantId(req), resolvePropertyId(req), parsed);
    res.status(201).json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error creating property valuation', { error, body: req.body });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 400).json({ success: false, error: typed.message || 'Echec creation valorisation' });
  }
}

export async function getPropertyValuationHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await getPropertyValuationById(
      resolveTenantId(req),
      resolvePropertyId(req),
      resolveResourceId(req, 'valuationId', 'ValuationId')
    );
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error getting property valuation', { error });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 500).json({ success: false, error: typed.message || 'Echec detail valorisation' });
  }
}

export async function updatePropertyValuationHandler(req: Request, res: Response): Promise<void> {
  try {
    const parsed = updateValuationSchema.parse(req.body);
    const data = await updatePropertyValuation(
      resolveTenantId(req),
      resolvePropertyId(req),
      resolveResourceId(req, 'valuationId', 'ValuationId'),
      parsed
    );
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error updating property valuation', { error, body: req.body });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 400).json({ success: false, error: typed.message || 'Echec mise a jour valorisation' });
  }
}

export async function deletePropertyValuationHandler(req: Request, res: Response): Promise<void> {
  try {
    await deletePropertyValuation(
      resolveTenantId(req),
      resolvePropertyId(req),
      resolveResourceId(req, 'valuationId', 'ValuationId')
    );
    res.status(204).send();
  } catch (error: unknown) {
    logger.error('Error deleting property valuation', { error });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 400).json({ success: false, error: typed.message || 'Echec suppression valorisation' });
  }
}

export async function listPropertyExpensesHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await listPropertyExpenses(resolveTenantId(req), resolvePropertyId(req));
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error listing property expenses', { error });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 500).json({ success: false, error: typed.message || 'Echec liste depenses' });
  }
}

export async function createPropertyExpenseHandler(req: Request, res: Response): Promise<void> {
  try {
    const parsed = createExpenseSchema.parse(req.body);
    const data = await createPropertyExpense(resolveTenantId(req), resolvePropertyId(req), parsed);
    res.status(201).json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error creating property expense', { error, body: req.body });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 400).json({ success: false, error: typed.message || 'Echec creation depense' });
  }
}

export async function getPropertyExpenseHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await getPropertyExpenseById(
      resolveTenantId(req),
      resolvePropertyId(req),
      resolveResourceId(req, 'expenseId', 'ExpenseId')
    );
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error getting property expense', { error });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 500).json({ success: false, error: typed.message || 'Echec detail depense' });
  }
}

export async function updatePropertyExpenseHandler(req: Request, res: Response): Promise<void> {
  try {
    const parsed = updateExpenseSchema.parse(req.body);
    const data = await updatePropertyExpense(
      resolveTenantId(req),
      resolvePropertyId(req),
      resolveResourceId(req, 'expenseId', 'ExpenseId'),
      parsed
    );
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error updating property expense', { error, body: req.body });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 400).json({ success: false, error: typed.message || 'Echec mise a jour depense' });
  }
}

export async function deletePropertyExpenseHandler(req: Request, res: Response): Promise<void> {
  try {
    await deletePropertyExpense(
      resolveTenantId(req),
      resolvePropertyId(req),
      resolveResourceId(req, 'expenseId', 'ExpenseId')
    );
    res.status(204).send();
  } catch (error: unknown) {
    logger.error('Error deleting property expense', { error });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 400).json({ success: false, error: typed.message || 'Echec suppression depense' });
  }
}

export async function listPropertyLoansHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await listPropertyLoans(resolveTenantId(req), resolvePropertyId(req));
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error listing property loans', { error });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 500).json({ success: false, error: typed.message || 'Echec liste prets' });
  }
}

export async function createPropertyLoanHandler(req: Request, res: Response): Promise<void> {
  try {
    const parsed = createLoanSchema.parse(req.body);
    const data = await createPropertyLoan(resolveTenantId(req), resolvePropertyId(req), parsed);
    res.status(201).json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error creating property loan', { error, body: req.body });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 400).json({ success: false, error: typed.message || 'Echec creation pret' });
  }
}

export async function getPropertyLoanHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await getPropertyLoanById(
      resolveTenantId(req),
      resolvePropertyId(req),
      resolveResourceId(req, 'loanId', 'LoanId')
    );
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error getting property loan', { error });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 500).json({ success: false, error: typed.message || 'Echec detail pret' });
  }
}

export async function updatePropertyLoanHandler(req: Request, res: Response): Promise<void> {
  try {
    const parsed = updateLoanSchema.parse(req.body);
    const data = await updatePropertyLoan(
      resolveTenantId(req),
      resolvePropertyId(req),
      resolveResourceId(req, 'loanId', 'LoanId'),
      parsed
    );
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error updating property loan', { error, body: req.body });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 400).json({ success: false, error: typed.message || 'Echec mise a jour pret' });
  }
}

export async function deletePropertyLoanHandler(req: Request, res: Response): Promise<void> {
  try {
    await deletePropertyLoan(resolveTenantId(req), resolvePropertyId(req), resolveResourceId(req, 'loanId', 'LoanId'));
    res.status(204).send();
  } catch (error: unknown) {
    logger.error('Error deleting property loan', { error });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 400).json({ success: false, error: typed.message || 'Echec suppression pret' });
  }
}

export async function listPropertyWorkProgramsHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await listPropertyWorkPrograms(resolveTenantId(req), resolvePropertyId(req));
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error listing property work programs', { error });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 500).json({ success: false, error: typed.message || 'Echec liste travaux' });
  }
}

export async function createPropertyWorkProgramHandler(req: Request, res: Response): Promise<void> {
  try {
    const parsed = createWorkProgramSchema.parse(req.body);
    const data = await createPropertyWorkProgram(resolveTenantId(req), resolvePropertyId(req), parsed);
    res.status(201).json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error creating property work program', { error, body: req.body });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 400).json({ success: false, error: typed.message || 'Echec creation travaux' });
  }
}

export async function getPropertyWorkProgramHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await getPropertyWorkProgramById(
      resolveTenantId(req),
      resolvePropertyId(req),
      resolveResourceId(req, 'programId', 'ProgramId')
    );
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error getting property work program', { error });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 500).json({ success: false, error: typed.message || 'Echec detail programme travaux' });
  }
}

export async function updatePropertyWorkProgramHandler(req: Request, res: Response): Promise<void> {
  try {
    const parsed = updateWorkProgramSchema.parse(req.body);
    const data = await updatePropertyWorkProgram(
      resolveTenantId(req),
      resolvePropertyId(req),
      resolveResourceId(req, 'programId', 'ProgramId'),
      parsed
    );
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error updating property work program', { error, body: req.body });
    const typed = error as { status?: number; message?: string };
    res
      .status(typed.status || 400)
      .json({ success: false, error: typed.message || 'Echec mise a jour programme travaux' });
  }
}

/**
 * Rattache (ou detache, `constructionSiteId: null`) un programme de travaux
 * a un chantier financier. Voir spec.md US12, FR-024 et
 * `contracts/openapi.yaml` (`PATCH .../work-programs/{id}/construction-site`).
 * Garde : `requireSitesManage` (pose en route, cote finance-rbac-middleware),
 * pas `requirePropertyPermission` -- ce geste est un acte de gestion
 * financiere du chantier, pas une simple edition de fiche bien.
 */
export async function linkWorkProgramConstructionSiteHandler(req: Request, res: Response): Promise<void> {
  try {
    const parsed = linkWorkProgramConstructionSiteSchema.parse(req.body);
    const data = await linkWorkProgramConstructionSite(
      resolveTenantId(req),
      resolveResourceId(req, 'workProgramId', 'WorkProgramId'),
      parsed.constructionSiteId,
      req.user?.userId
    );
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error linking work program to construction site', { error, body: req.body });
    const typed = error as { status?: number; message?: string };
    res
      .status(typed.status || 400)
      .json({ success: false, error: typed.message || 'Echec du rattachement au chantier' });
  }
}

export async function deletePropertyWorkProgramHandler(req: Request, res: Response): Promise<void> {
  try {
    await deletePropertyWorkProgram(
      resolveTenantId(req),
      resolvePropertyId(req),
      resolveResourceId(req, 'programId', 'ProgramId')
    );
    res.status(204).send();
  } catch (error: unknown) {
    logger.error('Error deleting property work program', { error });
    const typed = error as { status?: number; message?: string };
    res
      .status(typed.status || 400)
      .json({ success: false, error: typed.message || 'Echec suppression programme travaux' });
  }
}

export async function listPropertyDocumentsHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await listPropertyDocuments(resolveTenantId(req), resolvePropertyId(req));
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error listing property documents', { error });
    const typed = error as { status?: number; message?: string };
    res
      .status(typed.status || 500)
      .json({ success: false, error: typed.message || 'Echec liste documents patrimoine' });
  }
}

export async function createPropertyDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
    const parsed = createDocumentSchema.parse(req.body);
    const data = await createPropertyDocument(resolveTenantId(req), resolvePropertyId(req), parsed);
    res.status(201).json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error creating property patrimony document', { error, body: req.body });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 400).json({ success: false, error: typed.message || 'Echec creation document' });
  }
}

export async function getPropertyDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await getPropertyDocumentById(
      resolveTenantId(req),
      resolvePropertyId(req),
      resolveResourceId(req, 'documentId', 'DocumentId')
    );
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error getting property document', { error });
    const typed = error as { status?: number; message?: string };
    res
      .status(typed.status || 500)
      .json({ success: false, error: typed.message || 'Echec detail document patrimoine' });
  }
}

export async function deletePropertyDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
    await deletePropertyDocument(
      resolveTenantId(req),
      resolvePropertyId(req),
      resolveResourceId(req, 'documentId', 'DocumentId')
    );
    res.status(204).send();
  } catch (error: unknown) {
    logger.error('Error deleting property document', { error });
    const typed = error as { status?: number; message?: string };
    res
      .status(typed.status || 400)
      .json({ success: false, error: typed.message || 'Echec suppression document patrimoine' });
  }
}

export async function getPropertyYieldHandler(req: Request, res: Response): Promise<void> {
  try {
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
  } catch (error: unknown) {
    logger.error('Error getting property yield', { error });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 500).json({ success: false, error: typed.message || 'Echec calcul rendement' });
  }
}
