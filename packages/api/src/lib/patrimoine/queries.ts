import { Prisma, StatementStatus, WorkProgramStatus } from '@prisma/client';
import { badRequest, conflict, notFound } from '../errors';
import { prisma } from '../../utils/database';
import type { YieldInput } from './yield';
import { syncWorkProgramCostTx } from '../finance/cost-allocation';
import { logger } from '../../utils/logger';
import { materializeManagementFees } from '../rental-fees/materialize';
import { computeOwnerStatement, OWNER_STATEMENT_COMPUTATION_VERSION } from './owner-statement-computation';

// `services/audit-service.ts` n'est PAS importe ici bien que la specification
// (edge case US12) demande une trace d'audit du remplacement d'un cout saisi
// a la main : ce service a une erreur TypeScript preexistante
// (`AuditLogCreateManyInput`/`payload` nullable, l'une des 102 erreurs deja
// connues du backend) que `tsc --noEmit` tolere en mode projet complet, mais
// que `ts-jest` refuse des qu'un fichier de test compile ce module dans son
// graphe -- `patrimoine.work-programs.test.ts` echouait a la compilation des
// que `queries.ts` importait `audit-service.ts`, alors que cette suite ne
// doit pas etre modifiee. Un `logger.warn` structure trace le remplacement
// dans les journaux applicatifs en attendant qu'un futur correctif
// d'`audit-service.ts` permette d'y brancher une vraie ecriture `AuditLog`.

/**
 * Un `WorkProgram` rattaché à un chantier porte sa relation dans chaque
 * réponse : c'est la seule information, côté serveur, qui permette à l'écran
 * de distinguer un programme piloté par la Finance (coût dérivé, lecture
 * seule) d'un programme resté un objet du Patrimoine (coût saisi à la main).
 * Voir le rapport de fin de tâche pour la recommandation d'affichage.
 */
const WORK_PROGRAM_SITE_INCLUDE = {
  property: true,
  site: { select: { id: true, name: true, status: true } }
} as const;

export async function ensureTenantProperty(tenantId: string, propertyId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId }
  });

  if (!property) {
    throw notFound('Bien introuvable ou inaccessible pour ce tenant');
  }

  return property;
}

function toDecimal(value: number | undefined): Prisma.Decimal | undefined {
  if (typeof value === 'number') {
    return new Prisma.Decimal(value);
  }
  return undefined;
}

export async function listPropertyValuations(tenantId: string, propertyId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.assetValuation.findMany({
    where: { tenantId, propertyId },
    include: { property: true },
    orderBy: { valuatedAt: 'desc' }
  });
}

export async function createPropertyValuation(
  tenantId: string,
  propertyId: string,
  data: {
    valuatedAt: Date;
    estimatedValue: number;
    currency: string;
    acquisitionCost?: number;
    acquisitionDate?: Date;
    method: 'MANUAL' | 'MARKET_ESTIMATE' | 'EXPERT_APPRAISAL';
    notes?: string;
  }
) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.assetValuation.create({
    data: {
      tenantId,
      propertyId,
      valuatedAt: data.valuatedAt,
      estimatedValue: new Prisma.Decimal(data.estimatedValue),
      currency: data.currency,
      acquisitionCost: toDecimal(data.acquisitionCost),
      acquisitionDate: data.acquisitionDate,
      method: data.method,
      notes: data.notes
    },
    include: { property: true }
  });
}

export async function updatePropertyValuation(
  tenantId: string,
  propertyId: string,
  valuationId: string,
  data: Partial<{
    valuatedAt: Date;
    estimatedValue: number;
    currency: string;
    acquisitionCost: number;
    acquisitionDate: Date;
    method: 'MANUAL' | 'MARKET_ESTIMATE' | 'EXPERT_APPRAISAL';
    notes: string;
  }>
) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.assetValuation.findFirst({
    where: { id: valuationId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Valorisation introuvable');

  return prisma.assetValuation.update({
    where: { id: valuationId },
    data: {
      valuatedAt: data.valuatedAt,
      estimatedValue: typeof data.estimatedValue === 'number' ? new Prisma.Decimal(data.estimatedValue) : undefined,
      currency: data.currency,
      acquisitionCost: toDecimal(data.acquisitionCost),
      acquisitionDate: data.acquisitionDate,
      method: data.method,
      notes: data.notes
    },
    include: { property: true }
  });
}

export async function getPropertyValuationById(tenantId: string, propertyId: string, valuationId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const valuation = await prisma.assetValuation.findFirst({
    where: { id: valuationId, tenantId, propertyId },
    include: { property: true }
  });
  if (!valuation) throw notFound('Valorisation introuvable');
  return valuation;
}

export async function deletePropertyValuation(tenantId: string, propertyId: string, valuationId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.assetValuation.findFirst({
    where: { id: valuationId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Valorisation introuvable');
  await prisma.assetValuation.delete({ where: { id: valuationId } });
}

export async function listPropertyExpenses(tenantId: string, propertyId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.propertyExpense.findMany({
    where: { tenantId, propertyId },
    include: { property: true },
    orderBy: { paidAt: 'desc' }
  });
}

export async function createPropertyExpense(
  tenantId: string,
  propertyId: string,
  data: {
    category:
      | 'PROPERTY_TAX'
      | 'CONDO_FEES'
      | 'INSURANCE'
      | 'ROUTINE_MAINTENANCE'
      | 'RENOVATION'
      | 'MANAGEMENT_FEES'
      | 'UTILITIES'
      | 'OTHER';
    label: string;
    amount: number;
    currency: string;
    paidAt: Date;
    isCapitalized: boolean;
    receiptUrl?: string;
    notes?: string;
  }
) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.propertyExpense.create({
    data: {
      tenantId,
      propertyId,
      category: data.category,
      label: data.label,
      amount: new Prisma.Decimal(data.amount),
      currency: data.currency,
      paidAt: data.paidAt,
      isCapitalized: data.isCapitalized,
      receiptUrl: data.receiptUrl,
      notes: data.notes
    },
    include: { property: true }
  });
}

export async function getPropertyExpenseById(tenantId: string, propertyId: string, expenseId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const expense = await prisma.propertyExpense.findFirst({
    where: { id: expenseId, tenantId, propertyId },
    include: { property: true }
  });
  if (!expense) throw notFound('Depense introuvable');
  return expense;
}

export async function updatePropertyExpense(
  tenantId: string,
  propertyId: string,
  expenseId: string,
  data: Partial<{
    category:
      | 'PROPERTY_TAX'
      | 'CONDO_FEES'
      | 'INSURANCE'
      | 'ROUTINE_MAINTENANCE'
      | 'RENOVATION'
      | 'MANAGEMENT_FEES'
      | 'UTILITIES'
      | 'OTHER';
    label: string;
    amount: number;
    currency: string;
    paidAt: Date;
    isCapitalized: boolean;
    receiptUrl: string;
    notes: string;
  }>
) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.propertyExpense.findFirst({
    where: { id: expenseId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Depense introuvable');

  return prisma.propertyExpense.update({
    where: { id: expenseId },
    data: {
      category: data.category,
      label: data.label,
      amount: typeof data.amount === 'number' ? new Prisma.Decimal(data.amount) : undefined,
      currency: data.currency,
      paidAt: data.paidAt,
      isCapitalized: data.isCapitalized,
      receiptUrl: data.receiptUrl,
      notes: data.notes
    },
    include: { property: true }
  });
}

export async function deletePropertyExpense(tenantId: string, propertyId: string, expenseId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.propertyExpense.findFirst({
    where: { id: expenseId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Depense introuvable');
  await prisma.propertyExpense.delete({ where: { id: expenseId } });
}

export async function listPropertyLoans(tenantId: string, propertyId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.propertyLoan.findMany({
    where: { tenantId, propertyId },
    include: { property: true },
    orderBy: { createdAt: 'desc' }
  });
}

export async function createPropertyLoan(
  tenantId: string,
  propertyId: string,
  data: {
    lender: string;
    capitalAmount: number;
    remainingCapital: number;
    interestRate: number;
    monthlyPayment: number;
    currency: string;
    startDate: Date;
    endDate: Date;
  }
) {
  await ensureTenantProperty(tenantId, propertyId);
  if (data.endDate <= data.startDate) {
    throw badRequest('La date de fin du pret doit etre posterieure a la date de debut');
  }
  return prisma.propertyLoan.create({
    data: {
      tenantId,
      propertyId,
      lender: data.lender,
      capitalAmount: new Prisma.Decimal(data.capitalAmount),
      remainingCapital: new Prisma.Decimal(data.remainingCapital),
      interestRate: new Prisma.Decimal(data.interestRate),
      monthlyPayment: new Prisma.Decimal(data.monthlyPayment),
      currency: data.currency,
      startDate: data.startDate,
      endDate: data.endDate
    },
    include: { property: true }
  });
}

export async function getPropertyLoanById(tenantId: string, propertyId: string, loanId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const loan = await prisma.propertyLoan.findFirst({
    where: { id: loanId, tenantId, propertyId },
    include: { property: true }
  });
  if (!loan) throw notFound('Pret introuvable');
  return loan;
}

export async function updatePropertyLoan(
  tenantId: string,
  propertyId: string,
  loanId: string,
  data: Partial<{
    lender: string;
    capitalAmount: number;
    remainingCapital: number;
    interestRate: number;
    monthlyPayment: number;
    currency: string;
    startDate: Date;
    endDate: Date;
    status: 'ACTIVE' | 'CLOSED' | 'DEFAULTED';
  }>
) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.propertyLoan.findFirst({
    where: { id: loanId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Pret introuvable');

  if (data.startDate && data.endDate && data.endDate <= data.startDate) {
    throw badRequest('La date de fin du pret doit etre posterieure a la date de debut');
  }

  return prisma.propertyLoan.update({
    where: { id: loanId },
    data: {
      lender: data.lender,
      capitalAmount: typeof data.capitalAmount === 'number' ? new Prisma.Decimal(data.capitalAmount) : undefined,
      remainingCapital:
        typeof data.remainingCapital === 'number' ? new Prisma.Decimal(data.remainingCapital) : undefined,
      interestRate: typeof data.interestRate === 'number' ? new Prisma.Decimal(data.interestRate) : undefined,
      monthlyPayment: typeof data.monthlyPayment === 'number' ? new Prisma.Decimal(data.monthlyPayment) : undefined,
      currency: data.currency,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status
    },
    include: { property: true }
  });
}

export async function deletePropertyLoan(tenantId: string, propertyId: string, loanId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.propertyLoan.findFirst({
    where: { id: loanId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Pret introuvable');
  await prisma.propertyLoan.delete({ where: { id: loanId } });
}

export async function listPropertyWorkPrograms(tenantId: string, propertyId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.workProgram.findMany({
    where: { tenantId, propertyId },
    include: { property: true },
    orderBy: { plannedDate: 'asc' }
  });
}

/**
 * Programmes de travaux d'une AGENCE entiere, pagines et filtres cote serveur.
 *
 * Corrige le N+1 du §8.4 : `PatrimoineOverviewPage` chargeait jusqu'a 100
 * biens puis lancait une requete `listPropertyWorkPrograms` PAR BIEN — jusqu'a
 * 101 requetes au montage. `WorkProgramsPage` faisait de meme, puis filtrait
 * par statut en memoire APRES avoir tout telecharge.
 *
 * Ajout non rupturant : `listPropertyWorkPrograms` reste en place et repond a
 * l'identique. L'index `@@index([tenantId, propertyId, status])` couvre ce
 * filtre.
 */
export async function listTenantWorkPrograms(
  tenantId: string,
  options: { status?: WorkProgramStatus; page?: number; limit?: number } = {}
) {
  const page = Math.max(1, options.page ?? 1);
  // Plafond a 100 : une page plus large signale un appelant qui veut tout
  // charger, precisement ce que cet endpoint remplace.
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));
  const where = { tenantId, ...(options.status ? { status: options.status } : {}) };

  const [items, total] = await Promise.all([
    prisma.workProgram.findMany({
      where,
      include: { property: { select: { id: true, title: true, internalReference: true } } },
      orderBy: { plannedDate: 'asc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.workProgram.count({ where })
  ]);

  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function createPropertyWorkProgram(
  tenantId: string,
  propertyId: string,
  data: {
    title: string;
    description?: string;
    estimatedCost: number;
    currency: string;
    plannedDate: Date;
    isCapitalized: boolean;
  }
) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.workProgram.create({
    data: {
      tenantId,
      propertyId,
      title: data.title,
      description: data.description,
      estimatedCost: new Prisma.Decimal(data.estimatedCost),
      currency: data.currency,
      plannedDate: data.plannedDate,
      isCapitalized: data.isCapitalized
    },
    include: { property: true }
  });
}

export async function getPropertyWorkProgramById(tenantId: string, propertyId: string, programId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const program = await prisma.workProgram.findFirst({
    where: { id: programId, tenantId, propertyId },
    include: WORK_PROGRAM_SITE_INCLUDE
  });
  if (!program) throw notFound('Programme de travaux introuvable');
  return program;
}

export async function updatePropertyWorkProgram(
  tenantId: string,
  propertyId: string,
  programId: string,
  data: Partial<{
    title: string;
    description: string;
    estimatedCost: number;
    actualCost: number;
    currency: string;
    plannedDate: Date;
    completedDate: Date;
    status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    isCapitalized: boolean;
  }>
) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.workProgram.findFirst({
    where: { id: programId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Programme de travaux introuvable');

  // FR-024 : des qu'un chantier est rattache (`constructionSiteId` non nul),
  // le cout reel devient derive des imputations validees de ce chantier
  // (`syncWorkProgramCostTx`, lib/finance/cost-allocation.ts) et cesse
  // d'etre saisissable ici. Verifie en base, pas seulement au niveau du
  // schema Zod statique (`updateWorkProgramSchema`) qui ne connait pas
  // l'etat existant de cet enregistrement precis (voir data-model.md §4).
  // C'est un conflit d'etat (409), pas une entree malformee (400) : la
  // requete est syntaxiquement valide, seul l'etat du programme vise
  // l'interdit.
  if (typeof data.actualCost === 'number' && existing.constructionSiteId) {
    throw conflict(
      'Le cout reel de ce programme est derive du chantier rattache ; il ne peut plus etre saisi manuellement.'
    );
  }

  return prisma.workProgram.update({
    where: { id: programId },
    data: {
      title: data.title,
      description: data.description,
      estimatedCost: typeof data.estimatedCost === 'number' ? new Prisma.Decimal(data.estimatedCost) : undefined,
      actualCost: typeof data.actualCost === 'number' ? new Prisma.Decimal(data.actualCost) : undefined,
      currency: data.currency,
      plannedDate: data.plannedDate,
      completedDate: data.completedDate,
      status: data.status,
      isCapitalized: data.isCapitalized
    },
    include: WORK_PROGRAM_SITE_INCLUDE
  });
}

/**
 * Pose ou retire le lien entre un programme de travaux et un chantier
 * financier (US12, FR-024, contrat `openapi.yaml` —
 * `PATCH /work-programs/{workProgramId}/construction-site`).
 *
 * Pas de `propertyId` dans la route : contrairement aux autres routes de
 * programme de travaux, celle-ci est scopee par tenant seul (elle sert
 * depuis l'ecran du Patrimoine sans redemander le bien).
 *
 * Le lien et la synchronisation immediate du cout derive se font dans la
 * MEME transaction (US12 scenario 1) : sinon le programme afficherait son
 * ancien cout -- saisi a la main ou derive d'un chantier precedent -- jusqu'a
 * la prochaine imputation validee sur le nouveau chantier. Le calcul du cout
 * lui-meme reste dans `lib/finance/cost-allocation.ts`, jamais ici : ce
 * fichier ne connait que le resultat, jamais le detail d'une imputation
 * (regle de couture de `plan.md`).
 */
export async function linkWorkProgramConstructionSite(
  tenantId: string,
  workProgramId: string,
  constructionSiteId: string | null,
  actorUserId?: string
) {
  const result = await prisma.$transaction(async tx => {
    const existing = await tx.workProgram.findFirst({ where: { id: workProgramId, tenantId } });
    if (!existing) {
      throw notFound('Programme de travaux introuvable');
    }

    if (constructionSiteId) {
      const site = await tx.constructionSite.findFirst({ where: { id: constructionSiteId, tenantId } });
      if (!site) {
        throw notFound('Chantier introuvable pour ce tenant');
      }
    }

    // Edge case spec.md (US12) : un cout deja saisi a la main disparaitrait
    // silencieusement au rattachement -- on le trace avant de l'ecraser,
    // pour qu'aucune valeur ne disparaisse sans laisser de trace.
    const overwritesManualCost =
      constructionSiteId !== null && constructionSiteId !== existing.constructionSiteId && existing.actualCost !== null;
    const previousActualCost = existing.actualCost !== null ? Number(existing.actualCost) : null;

    await tx.workProgram.update({
      where: { id: workProgramId },
      data: { constructionSiteId }
    });

    if (constructionSiteId) {
      // Synchronisation immediate : sans elle, le programme resterait sur son
      // ancienne valeur jusqu'a la prochaine imputation validee (US12 sc.1).
      await syncWorkProgramCostTx(tx, tenantId, constructionSiteId);
    }

    const updated = await tx.workProgram.findFirst({
      where: { id: workProgramId, tenantId },
      include: WORK_PROGRAM_SITE_INCLUDE
    });

    return { updated: updated!, overwritesManualCost, previousActualCost };
  });

  if (result.overwritesManualCost) {
    // Trace du remplacement (edge case spec.md US12) : voir la note en tete
    // de fichier sur l'absence d'import d'`audit-service.ts` ici.
    logger.warn('WorkProgram.actualCost saisi a la main ecrase par le cout derive du chantier', {
      actionKey: 'PATRIMOINE_WORK_PROGRAM_COST_OVERRIDDEN',
      tenantId,
      actorUserId,
      workProgramId,
      constructionSiteId,
      previousActualCost: result.previousActualCost
    });
  }

  return result.updated;
}

export async function deletePropertyWorkProgram(tenantId: string, propertyId: string, programId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.workProgram.findFirst({
    where: { id: programId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Programme de travaux introuvable');
  await prisma.workProgram.delete({ where: { id: programId } });
}

export async function listPropertyDocuments(tenantId: string, propertyId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.patrimonyDocument.findMany({
    where: { tenantId, propertyId },
    include: { property: true, owner: true },
    orderBy: { createdAt: 'desc' }
  });
}

export async function createPropertyDocument(
  tenantId: string,
  propertyId: string,
  data: {
    title: string;
    type:
      | 'TITLE_DEED'
      | 'NOTARIAL_DEED'
      | 'TAX_DOCUMENT'
      | 'INSURANCE'
      | 'TECHNICAL_DIAGNOSIS'
      | 'FLOOR_PLAN'
      | 'BUILDING_PERMIT'
      | 'OTHER';
    fileUrl: string;
    expiresAt?: Date;
    ownerContactId?: string;
  }
) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.patrimonyDocument.create({
    data: {
      tenantId,
      propertyId,
      ownerContactId: data.ownerContactId,
      title: data.title,
      type: data.type,
      fileUrl: data.fileUrl,
      expiresAt: data.expiresAt
    },
    include: { property: true, owner: true }
  });
}

export async function getPropertyDocumentById(tenantId: string, propertyId: string, documentId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const document = await prisma.patrimonyDocument.findFirst({
    where: { id: documentId, tenantId, propertyId },
    include: { property: true, owner: true }
  });
  if (!document) throw notFound('Document patrimoine introuvable');
  return document;
}

export async function deletePropertyDocument(tenantId: string, propertyId: string, documentId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.patrimonyDocument.findFirst({
    where: { id: documentId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Document patrimoine introuvable');
  await prisma.patrimonyDocument.delete({ where: { id: documentId } });
}

export async function getPatrimoineOverview(tenantId: string) {
  const now = new Date();
  const year = now.getFullYear();

  const [properties, valuations, activeLoans, expensesThisYear, activeLeases] = await Promise.all([
    prisma.property.findMany({ where: { tenantId }, select: { id: true } }),
    prisma.assetValuation.findMany({
      where: { tenantId },
      orderBy: [{ propertyId: 'asc' }, { valuatedAt: 'desc' }]
    }),
    prisma.propertyLoan.findMany({ where: { tenantId, status: 'ACTIVE' } }),
    prisma.propertyExpense.findMany({
      where: {
        tenantId,
        paidAt: {
          gte: new Date(year, 0, 1),
          lte: new Date(year, 11, 31, 23, 59, 59, 999)
        }
      }
    }),
    prisma.rentalLease.findMany({
      where: { tenant_id: tenantId, status: 'ACTIVE' },
      select: { property_id: true, rent_amount: true }
    })
  ]);

  const latestByProperty = new Map<string, number>();
  for (const valuation of valuations) {
    if (!latestByProperty.has(valuation.propertyId)) {
      latestByProperty.set(valuation.propertyId, Number(valuation.estimatedValue));
    }
  }

  const occupiedPropertyCount = new Set(activeLeases.map(lease => lease.property_id)).size;

  return {
    totalProperties: properties.length,
    occupiedProperties: occupiedPropertyCount,
    occupancyRate: properties.length > 0 ? occupiedPropertyCount / properties.length : 0,
    totalEstimatedValue: [...latestByProperty.values()].reduce((sum, value) => sum + value, 0),
    totalLoanBalance: activeLoans.reduce((sum, loan) => sum + Number(loan.remainingCapital), 0),
    totalExpensesThisYear: expensesThisYear.reduce((sum, expense) => sum + Number(expense.amount), 0),
    totalAnnualRent: activeLeases.reduce((sum, lease) => sum + Number(lease.rent_amount) * 12, 0)
  };
}

export async function buildPropertyYieldInput(tenantId: string, propertyId: string): Promise<YieldInput> {
  await ensureTenantProperty(tenantId, propertyId);
  const [lease, latestValuation, expenses, loans] = await Promise.all([
    prisma.rentalLease.findFirst({
      where: { tenant_id: tenantId, property_id: propertyId, status: 'ACTIVE' },
      orderBy: { created_at: 'desc' }
    }),
    prisma.assetValuation.findFirst({
      where: { tenantId, propertyId },
      orderBy: { valuatedAt: 'desc' }
    }),
    prisma.propertyExpense.findMany({ where: { tenantId, propertyId } }),
    prisma.propertyLoan.findMany({ where: { tenantId, propertyId, status: 'ACTIVE' } })
  ]);

  const annualRent = lease ? Number(lease.rent_amount) * 12 : 0;
  const currentValue = latestValuation ? Number(latestValuation.estimatedValue) : 0;
  const acquisitionCost = latestValuation?.acquisitionCost ? Number(latestValuation.acquisitionCost) : 0;
  const annualExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const annualLoanPayments = loans.reduce((sum, loan) => sum + Number(loan.monthlyPayment) * 12, 0);

  return {
    annualRent,
    currentValue,
    acquisitionCost,
    annualExpenses,
    annualLoanPayments
  };
}

export async function listOwnerStatements(
  tenantId: string,
  filters?: {
    ownerContactId?: string;
    period?: string;
  }
) {
  return prisma.ownerStatement.findMany({
    where: {
      tenantId,
      ownerContactId: filters?.ownerContactId,
      period: filters?.period
    },
    include: {
      owner: true,
      items: {
        include: { property: true }
      }
    },
    orderBy: [{ period: 'desc' }, { createdAt: 'desc' }]
  });
}

export async function getOwnerStatementById(tenantId: string, statementId: string) {
  const statement = await prisma.ownerStatement.findFirst({
    where: { tenantId, id: statementId },
    include: {
      owner: true,
      items: { include: { property: true } }
    }
  });
  if (!statement) throw notFound('Releve introuvable');
  return statement;
}

const STATEMENT_INCLUDE = {
  owner: true,
  items: { include: { property: true } }
} as const;

/** Premier et dernier instant du mois, en UTC (Abidjan vit à UTC+0). */
function periodBounds(period: string): { periodStart: Date; periodEnd: Date } {
  const [yearStr, monthStr] = period.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month || month < 1 || month > 12) {
    throw badRequest('Periode invalide, format attendu YYYY-MM');
  }
  return {
    periodStart: new Date(Date.UTC(year, month - 1, 1)),
    periodEnd: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  };
}

/**
 * Génère — ou recalcule — le relevé d'un propriétaire pour un mois.
 *
 * Un relevé existant pour le même propriétaire et le même mois est recalculé
 * en place s'il est encore en brouillon, ou s'il date de l'ancien calcul
 * (`computationVersion` 1) sans avoir été réglé : il repasse alors en
 * brouillon, à renvoyer. Un relevé du nouveau calcul déjà envoyé, ou un relevé
 * déjà réglé, ne se recalcule pas : ce que le propriétaire a reçu ou touché ne
 * se réécrit pas en silence.
 */
export async function generateOwnerStatement(
  tenantId: string,
  params: {
    ownerContactId: string;
    period: string;
    propertyIds: string[];
  }
) {
  const owner = await prisma.crmContact.findFirst({
    where: { id: params.ownerContactId, tenantId }
  });
  if (!owner) throw notFound('Contact proprietaire introuvable');

  const { periodStart, periodEnd } = periodBounds(params.period);
  const propertyIds = Array.from(new Set(params.propertyIds));

  const properties = await prisma.property.findMany({
    where: { tenantId, id: { in: propertyIds } },
    select: { id: true }
  });
  if (properties.length !== propertyIds.length) {
    throw badRequest('Un ou plusieurs biens sont introuvables ou hors tenant');
  }

  const existing = await prisma.ownerStatement.findUnique({
    where: {
      tenantId_ownerContactId_period: {
        tenantId,
        ownerContactId: params.ownerContactId,
        period: params.period
      }
    }
  });
  if (existing) {
    if (existing.status === StatementStatus.PAID) {
      throw conflict(
        'Ce releve est deja regle : il ne peut plus etre recalcule. Un ecart eventuel se regularise sur le releve suivant.'
      );
    }
    if (
      existing.status === StatementStatus.SENT &&
      existing.computationVersion >= OWNER_STATEMENT_COMPUTATION_VERSION
    ) {
      throw conflict('Ce releve a deja ete envoye au proprietaire : il ne peut plus etre recalcule.');
    }
  }

  // Tous les baux des biens, quel que soit leur statut : un bail resilie en
  // aout peut encore encaisser un arriere en septembre.
  const leases = await prisma.rentalLease.findMany({
    where: { tenant_id: tenantId, property_id: { in: propertyIds } },
    select: { id: true }
  });
  const leaseIds = leases.map(lease => lease.id);

  const paidInPeriod: Prisma.RentalPaymentWhereInput = {
    status: 'SUCCESS',
    OR: [
      { succeeded_at: { gte: periodStart, lte: periodEnd } },
      { succeeded_at: null, initiated_at: { gte: periodStart, lte: periodEnd } }
    ]
  };

  // Les honoraires des encaissements du mois, figés s'ils ne l'étaient pas
  // encore : le relevé et l'état des commissions lisent les mêmes chiffres.
  await materializeManagementFees(tenantId, { from: periodStart, to: periodEnd, propertyIds });

  const [installments, expenses, fees] = await Promise.all([
    leaseIds.length === 0
      ? Promise.resolve([])
      : prisma.rentalInstallment.findMany({
          where: {
            tenant_id: tenantId,
            lease_id: { in: leaseIds },
            status: { not: 'CANCELED' },
            OR: [{ due_date: { lte: periodEnd } }, { payments: { some: { payment: paidInPeriod } } }]
          },
          select: {
            status: true,
            due_date: true,
            amount_rent: true,
            amount_service: true,
            amount_other_fees: true,
            penalty_amount: true,
            lease: { select: { property_id: true } },
            payments: {
              where: { payment: { status: 'SUCCESS' } },
              select: {
                amount: true,
                payment: { select: { succeeded_at: true, initiated_at: true } }
              }
            }
          }
        }),
    prisma.propertyExpense.findMany({
      where: {
        tenantId,
        propertyId: { in: propertyIds },
        paidAt: { gte: periodStart, lte: periodEnd }
      },
      select: { propertyId: true, label: true, amount: true, category: true }
    }),
    prisma.managementFee.findMany({
      where: { tenantId, propertyId: { in: propertyIds }, collectedAt: { gte: periodStart, lte: periodEnd } },
      select: {
        propertyId: true,
        feeAmount: true,
        vatAmount: true,
        mode: true,
        rate: true,
        feeBase: true,
        vatRate: true
      }
    })
  ]);

  const computed = computeOwnerStatement({
    periodStart,
    periodEnd,
    propertyIds,
    installments: installments.map(inst => ({
      propertyId: inst.lease.property_id,
      dueDate: inst.due_date,
      // Une echeance en brouillon n'est pas encore appelee : elle ne compte ni
      // dans l'appele ni dans l'impaye, mais un reglement qui la solde reste un
      // encaissement.
      countsAsDue: inst.status !== 'DRAFT',
      amountRent: Number(inst.amount_rent),
      amountService: Number(inst.amount_service),
      amountOtherFees: Number(inst.amount_other_fees),
      penaltyAmount: Number(inst.penalty_amount),
      allocations: inst.payments.map(allocation => ({
        amount: Number(allocation.amount),
        paidAt: allocation.payment.succeeded_at ?? allocation.payment.initiated_at
      }))
    })),
    expenses: expenses.map(expense => ({
      propertyId: expense.propertyId,
      label: expense.label,
      amount: Number(expense.amount),
      category: expense.category
    })),
    fees: fees.map(fee => ({
      propertyId: fee.propertyId,
      feeAmount: Number(fee.feeAmount),
      vatAmount: Number(fee.vatAmount),
      mode: fee.mode,
      rate: fee.rate === null ? null : Number(fee.rate),
      feeBase: fee.feeBase,
      vatRate: fee.vatRate === null ? null : Number(fee.vatRate)
    }))
  });

  const decimal = (value: number) => new Prisma.Decimal(value);
  const statementData = {
    totalRevenue: decimal(computed.totalRevenue),
    totalExpenses: decimal(computed.totalExpenses),
    netAmount: decimal(computed.netAmount),
    totalRentDue: decimal(computed.totalRentDue),
    totalArrears: decimal(computed.totalArrears),
    totalManagementFees: decimal(computed.totalManagementFees),
    totalManagementFeesVat: decimal(computed.totalManagementFeesVat),
    managementFeeRate: computed.appliedFeeRate === null ? null : decimal(computed.appliedFeeRate),
    managementFeeBase: computed.appliedFeeBase,
    vatRate: computed.appliedVatRate === null ? null : decimal(computed.appliedVatRate),
    propertyIds,
    computationVersion: OWNER_STATEMENT_COMPUTATION_VERSION
  };

  return prisma.$transaction(async tx => {
    let statementId: string;
    if (existing) {
      await tx.ownerStatementItem.deleteMany({ where: { statementId: existing.id } });
      await tx.ownerStatement.update({
        where: { id: existing.id },
        data: { ...statementData, status: StatementStatus.DRAFT }
      });
      statementId = existing.id;
    } else {
      const created = await tx.ownerStatement.create({
        data: {
          tenantId,
          ownerContactId: params.ownerContactId,
          period: params.period,
          status: StatementStatus.DRAFT,
          ...statementData
        }
      });
      statementId = created.id;
    }

    if (computed.items.length > 0) {
      await tx.ownerStatementItem.createMany({
        data: computed.items.map(item => ({
          statementId,
          propertyId: item.propertyId,
          label: item.label,
          type: item.type,
          amount: decimal(item.amount)
        }))
      });
    }

    return tx.ownerStatement.findUnique({
      where: { id: statementId },
      include: STATEMENT_INCLUDE
    });
  });
}

/**
 * Recalcule un relevé existant avec ses propres paramètres : même
 * propriétaire, même mois, mêmes biens.
 *
 * Les relevés de l'ancien calcul n'ont pas mémorisé leurs biens ; on reprend
 * alors ceux qui figurent sur leurs lignes.
 */
export async function recomputeOwnerStatement(tenantId: string, statementId: string) {
  const statement = await prisma.ownerStatement.findFirst({
    where: { tenantId, id: statementId },
    include: { items: { select: { propertyId: true } } }
  });
  if (!statement) throw notFound('Releve introuvable');

  const propertyIds =
    statement.propertyIds.length > 0
      ? statement.propertyIds
      : Array.from(new Set(statement.items.map(item => item.propertyId)));
  if (propertyIds.length === 0) {
    throw badRequest('Ce releve ne porte sur aucun bien : generez-en un nouveau en choisissant les biens.');
  }

  return generateOwnerStatement(tenantId, {
    ownerContactId: statement.ownerContactId,
    period: statement.period,
    propertyIds
  });
}

export async function updateOwnerStatement(
  tenantId: string,
  statementId: string,
  data: {
    status?: 'DRAFT' | 'SENT' | 'PAID';
    paidAt?: Date;
  }
) {
  const existing = await prisma.ownerStatement.findFirst({
    where: { id: statementId, tenantId }
  });
  if (!existing) throw notFound('Releve introuvable');

  return prisma.ownerStatement.update({
    where: { id: statementId },
    data: {
      status: data.status,
      paidAt: data.paidAt
    },
    include: {
      owner: true,
      items: { include: { property: true } }
    }
  });
}
