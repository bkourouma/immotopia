import { Prisma, PropertyStatus, StatementStatus, WorkProgramStatus } from '@prisma/client';
import { activeMandateWhere } from '../owner-portal-scope';
import { badRequest, conflict, notFound } from '../errors';
import { prisma } from '../../utils/database';
import { annualizeRent, remainingLoanMonths, type LoanSchedule, type YieldInput } from './yield';
import { syncWorkProgramCostTx } from '../finance/cost-allocation';
import { logger } from '../../utils/logger';
import { materializeManagementFees } from '../rental-fees/materialize';
import { ownerSharesByProperty } from '../ownership/service';
import { VALUATION_ORDER_BY, compareValuationsDesc } from './valuation-order';
import { computeOwnerStatement, OWNER_STATEMENT_COMPUTATION_VERSION } from './owner-statement-computation';
import { assertTreasuryAccountUsableTx } from '../treasury/accounts';
import { syncDirectExpenseEntryTx } from '../finance/rental-direct-ledger';

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

/**
 * Le contrat JSON (front `apps/web/src/types/patrimoine-types.ts`) nomme la
 * relation `constructionSite`, jamais `site` -- le nom Prisma de la relation
 * -- pour rester lisible independamment du modele physique. `constructionSiteId`
 * est deja un champ scalaire du `WorkProgram`, toujours present tel quel.
 */
function toWorkProgramContract<T extends { site?: { id: string; name: string } | null }>(
  program: T
): Omit<T, 'site'> & { constructionSite: { id: string; name: string } | null } {
  const { site, ...rest } = program;
  return { ...rest, constructionSite: site ? { id: site.id, name: site.name } : null };
}

export async function ensureTenantProperty(
  tenantId: string,
  propertyId: string,
  options: { allowMandated?: boolean } = {}
) {
  let property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId }
  });

  // Bien CLIENT (`tenantId` nul) géré par l'agence : rattaché par un mandat
  // actif (portail propriétaire, BUG-057).
  if (!property && options.allowMandated) {
    const mandate = await prisma.propertyMandate.findFirst({
      where: { ...activeMandateWhere(tenantId), propertyId },
      select: { id: true }
    });
    if (mandate) {
      property = await prisma.property.findFirst({
        where: { id: propertyId, OR: [{ tenantId }, { tenantId: null }] }
      });
    }
  }

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
    orderBy: VALUATION_ORDER_BY
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
    where: { id: valuationId, tenantId },
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
  await prisma.assetValuation.delete({ where: { id: valuationId, tenantId } });
}

type ExpenseRecurrenceValue = 'ONE_OFF' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

/**
 * Coherence de la periodicite d'une depense (plan de tresorerie, spec 030) :
 * une date de fin n'a de sens que pour une depense periodique, et ne peut pas
 * preceder la date de reference `paidAt`. Appelee avec les valeurs EFFECTIVES
 * (corps de la requete completes par la valeur stockee a la mise a jour).
 */
function assertExpenseRecurrence(recurrence: ExpenseRecurrenceValue, paidAt: Date, endDate: Date | null | undefined) {
  // La date saisie est celle d'un paiement REEL (le journal ecrit le montant a `paidAt`) : une depense
  // periodique ne peut pas etre datee dans le futur, les occurrences suivantes sont deduites.
  if (recurrence !== 'ONE_OFF' && paidAt.getTime() > Date.now() + 24 * 3600 * 1000) {
    throw badRequest("La date de la depense periodique doit etre celle d'un paiement deja effectue");
  }
  if (!endDate) return;
  if (recurrence === 'ONE_OFF') {
    throw badRequest("La date de fin n'a de sens que pour une depense periodique");
  }
  // Comparaison par jour UTC : une fin le meme jour que `paidAt` est acceptee.
  const utcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  if (utcDay(endDate) < utcDay(paidAt)) {
    throw badRequest('La date de fin de la periodicite ne peut pas preceder la date de la depense');
  }
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
    /** Lot 10 : moyen de paiement reel. Absent a la creation : caisse par defaut. */
    paymentMethod?: 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'CARD' | 'OTHER' | null;
    treasuryAccountId?: string | null;
    /** Vrai quand l'agence a elle-meme commande le travail et doit la facture. */
    agencyIsBuyer?: boolean;
    supplierName?: string | null;
    /** Plan de tresorerie : periodicite (ONE_OFF par defaut) et date de fin facultative. */
    recurrence?: ExpenseRecurrenceValue;
    recurrenceEndDate?: Date | null;
  }
) {
  await ensureTenantProperty(tenantId, propertyId);

  const recurrence = data.recurrence ?? 'ONE_OFF';
  assertExpenseRecurrence(recurrence, data.paidAt, data.recurrenceEndDate);

  const agencyIsBuyer = data.agencyIsBuyer ?? false;
  if (agencyIsBuyer && !data.supplierName?.trim()) {
    throw badRequest("Le nom du fournisseur est requis quand l'agence est elle-meme l'acheteuse");
  }

  const paymentMethod = data.paymentMethod ?? 'CASH';

  return prisma.$transaction(async tx => {
    await assertTreasuryAccountUsableTx(tx, tenantId, data.treasuryAccountId, paymentMethod);

    const created = await tx.propertyExpense.create({
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
        notes: data.notes,
        paymentMethod,
        treasuryAccountId: data.treasuryAccountId || null,
        agencyIsBuyer,
        supplierName: data.supplierName ?? null,
        recurrence,
        recurrenceEndDate: data.recurrenceEndDate ?? null
      },
      include: { property: true }
    });

    // Bien détenu en propre : la dépense est une charge, écrite au journal
    // dans la même transaction (jamais de dépense sans écriture).
    await syncDirectExpenseEntryTx(tx, tenantId, created.id);

    return created;
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
    /** Lot 10 : moyen de paiement reel. */
    paymentMethod: 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'CARD' | 'OTHER' | null;
    treasuryAccountId: string | null;
    agencyIsBuyer: boolean;
    supplierName: string | null;
    recurrence: ExpenseRecurrenceValue;
    recurrenceEndDate: Date | null;
  }>
) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.propertyExpense.findFirst({
    where: { id: expenseId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Depense introuvable');

  // Passer a ONE_OFF efface la date de fin ; sinon la valeur recue (ou stockee) doit rester coherente.
  const effectiveRecurrence = data.recurrence ?? existing.recurrence;
  let effectiveEndDate = existing.recurrenceEndDate;
  if (data.recurrenceEndDate !== undefined) effectiveEndDate = data.recurrenceEndDate;
  else if (data.recurrence === 'ONE_OFF') effectiveEndDate = null;
  assertExpenseRecurrence(effectiveRecurrence, data.paidAt ?? existing.paidAt, effectiveEndDate);

  const effectiveAgencyIsBuyer = data.agencyIsBuyer ?? existing.agencyIsBuyer;
  const effectiveSupplierName = data.supplierName !== undefined ? data.supplierName : existing.supplierName;
  if (effectiveAgencyIsBuyer && !effectiveSupplierName?.trim()) {
    throw badRequest("Le nom du fournisseur est requis quand l'agence est elle-meme l'acheteuse");
  }

  const treasuryAccountId = data.treasuryAccountId !== undefined ? data.treasuryAccountId : existing.treasuryAccountId;
  const methodForValidation = data.paymentMethod !== undefined ? data.paymentMethod : existing.paymentMethod;

  return prisma.$transaction(async tx => {
    await assertTreasuryAccountUsableTx(tx, tenantId, treasuryAccountId, methodForValidation ?? 'CASH');

    const updated = await tx.propertyExpense.update({
      where: { id: expenseId, tenantId },
      data: {
        category: data.category,
        label: data.label,
        amount: typeof data.amount === 'number' ? new Prisma.Decimal(data.amount) : undefined,
        currency: data.currency,
        paidAt: data.paidAt,
        isCapitalized: data.isCapitalized,
        receiptUrl: data.receiptUrl,
        notes: data.notes,
        paymentMethod: data.paymentMethod,
        treasuryAccountId: data.treasuryAccountId,
        agencyIsBuyer: data.agencyIsBuyer,
        supplierName: data.supplierName,
        recurrence: data.recurrence,
        recurrenceEndDate: effectiveEndDate
      },
      include: { property: true }
    });

    // Montant, catégorie, date ou compte modifiés : l'écriture est contre-passée puis réécrite.
    await syncDirectExpenseEntryTx(tx, tenantId, expenseId);

    return updated;
  });
}

export async function deletePropertyExpense(tenantId: string, propertyId: string, expenseId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.propertyExpense.findFirst({
    where: { id: expenseId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Depense introuvable');
  await prisma.$transaction(async tx => {
    await tx.propertyExpense.delete({ where: { id: expenseId, tenantId } });
    // Dépense supprimée : son écriture éventuelle est contre-passée.
    await syncDirectExpenseEntryTx(tx, tenantId, expenseId);
  });
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
    where: { id: loanId, tenantId },
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
  await prisma.propertyLoan.delete({ where: { id: loanId, tenantId } });
}

export async function listPropertyWorkPrograms(tenantId: string, propertyId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const items = await prisma.workProgram.findMany({
    where: { tenantId, propertyId },
    include: { property: true, site: { select: { id: true, name: true } } },
    orderBy: { plannedDate: 'asc' }
  });
  return items.map(toWorkProgramContract);
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
  options: { status?: WorkProgramStatus; page?: number; limit?: number; upcoming?: boolean } = {}
) {
  const page = Math.max(1, options.page ?? 1);
  // Plafond a 100 : une page plus large signale un appelant qui veut tout
  // charger, precisement ce que cet endpoint remplace.
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));

  // `upcoming=true` (ecran d'accueil du Patrimoine) : seuls les programmes
  // pas encore termines/annules, tries par date prevue croissante, sans
  // pagination -- l'appelant veut la liste complete "a venir", pas une page.
  if (options.upcoming) {
    const where: Prisma.WorkProgramWhereInput = {
      tenantId,
      status: { in: [WorkProgramStatus.PLANNED, WorkProgramStatus.IN_PROGRESS] }
    };
    const items = await prisma.workProgram.findMany({
      where,
      include: {
        property: { select: { id: true, title: true, internalReference: true } },
        site: { select: { id: true, name: true } }
      },
      // `plannedDate` n'est pas nullable dans le schema actuel (aucun
      // programme ne peut donc apparaitre sans date prevue) ; le tri simple
      // ascendant place deja les echeances les plus proches en tete.
      orderBy: [{ plannedDate: 'asc' }],
      // Plafond de securite : "a venir" n'est pas pagine, mais ne doit pas
      // pouvoir ramener un tenant avec des milliers de programmes en une fois.
      take: 200
    });
    const mapped = items.map(toWorkProgramContract);
    return { items: mapped, total: mapped.length, page: 1, limit: mapped.length || 1, totalPages: 1 };
  }

  const where = { tenantId, ...(options.status ? { status: options.status } : {}) };

  const [items, total] = await Promise.all([
    prisma.workProgram.findMany({
      where,
      include: {
        property: { select: { id: true, title: true, internalReference: true } },
        site: { select: { id: true, name: true } }
      },
      orderBy: { plannedDate: 'asc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.workProgram.count({ where })
  ]);

  return {
    items: items.map(toWorkProgramContract),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit))
  };
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
  const created = await prisma.workProgram.create({
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
  // Un programme vient de naitre : il ne peut pas encore etre rattache a un
  // chantier (`constructionSiteId` n'est pas saisissable a la creation).
  return { ...created, constructionSite: null as { id: string; name: string } | null };
}

export async function getPropertyWorkProgramById(tenantId: string, propertyId: string, programId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const program = await prisma.workProgram.findFirst({
    where: { id: programId, tenantId, propertyId },
    include: WORK_PROGRAM_SITE_INCLUDE
  });
  if (!program) throw notFound('Programme de travaux introuvable');
  return toWorkProgramContract(program);
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
  // Le conflit ne vise que l'ECART : renvoyer la meme valeur deja en base
  // (l'ecran peut la reafficher telle quelle dans son formulaire) n'est pas
  // une tentative de l'ecraser et doit rester silencieux.
  const existingActualCost = existing.actualCost !== null ? Number(existing.actualCost) : null;
  if (typeof data.actualCost === 'number' && existing.constructionSiteId && data.actualCost !== existingActualCost) {
    throw conflict(
      'Le cout reel de ce programme est derive du chantier rattache ; il ne peut plus etre saisi manuellement.'
    );
  }

  const updated = await prisma.workProgram.update({
    where: { id: programId, tenantId },
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
  return toWorkProgramContract(updated);
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
      where: { id: workProgramId, tenantId },
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

  return toWorkProgramContract(result.updated);
}

export async function deletePropertyWorkProgram(tenantId: string, propertyId: string, programId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.workProgram.findFirst({
    where: { id: programId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Programme de travaux introuvable');
  await prisma.workProgram.delete({ where: { id: programId, tenantId } });
}

/**
 * Statuts d'un bien qui compte pour le taux d'occupation de l'apercu : un
 * bien encore en brouillon n'est pas encore un actif gere, un bien vendu ou
 * archive ne l'est plus. Nom reel de l'enum `PropertyStatus` (voir
 * schema.prisma) -- l'audit avait signale un ensemble incoherent entre
 * `totalProperties` (TOUS les biens) et `occupiedProperties` (biens loues).
 */
export const OCCUPANCY_EXCLUDED_STATUSES: PropertyStatus[] = [
  PropertyStatus.DRAFT,
  PropertyStatus.SOLD,
  PropertyStatus.ARCHIVED
];

/**
 * Apercu portefeuille de l'agence (US Patrimoine).
 *
 * `totalProperties`/`occupiedProperties`/`occupancyRate` partagent UN SEUL
 * ensemble -- les biens de l'agence hors brouillon, vendu, archive -- pour
 * que le taux reste borne a 100 % : l'ancien calcul comptait tous les biens
 * au denominateur (brouillons et archives compris) mais un bien loue dans un
 * numerateur different, produisant un taux qui pouvait exceder 100 % avec un
 * denominateur trop restreint, ou etre artificiellement bas avec un
 * denominateur trop large.
 */
export async function getPatrimoineOverview(tenantId: string) {
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const yearEnd = new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59, 999));

  const [occupancyProperties, valuations, activeLoans, expensesThisYear, activeLeases] = await Promise.all([
    prisma.property.findMany({
      // Biens DÉTENUS par l'agence : un bien CLIENT saisi par l'assistant porte aussi
      // `tenantId`, mais n'est pas son patrimoine (spec 015 : valeur, dette, loyers).
      where: { tenantId, ownershipType: 'TENANT', status: { notIn: OCCUPANCY_EXCLUDED_STATUSES } },
      select: { id: true }
    }),
    prisma.assetValuation.findMany({
      where: { tenantId },
      orderBy: [{ propertyId: 'asc' }, ...VALUATION_ORDER_BY]
    }),
    prisma.propertyLoan.findMany({ where: { tenantId, status: 'ACTIVE' } }),
    prisma.propertyExpense.findMany({
      where: {
        tenantId,
        paidAt: { gte: yearStart, lte: yearEnd }
      }
    }),
    prisma.rentalLease.findMany({
      where: { tenant_id: tenantId, status: 'ACTIVE' },
      select: { property_id: true, rent_amount: true, billing_frequency: true }
    })
  ]);

  const latestByProperty = new Map<string, number>();
  for (const valuation of valuations) {
    if (!latestByProperty.has(valuation.propertyId)) {
      latestByProperty.set(valuation.propertyId, Number(valuation.estimatedValue));
    }
  }

  const occupancyPropertyIds = new Set(occupancyProperties.map(property => property.id));
  const occupiedPropertyIds = new Set(
    activeLeases.map(lease => lease.property_id).filter(propertyId => occupancyPropertyIds.has(propertyId))
  );

  const totalProperties = occupancyProperties.length;
  const occupiedProperties = occupiedPropertyIds.size;

  return {
    totalProperties,
    occupiedProperties,
    occupancyRate: totalProperties > 0 ? occupiedProperties / totalProperties : 0,
    totalEstimatedValue: [...latestByProperty.values()].reduce((sum, value) => sum + value, 0),
    totalLoanBalance: activeLoans.reduce((sum, loan) => sum + Number(loan.remainingCapital), 0),
    totalExpensesThisYear: expensesThisYear.reduce((sum, expense) => sum + Number(expense.amount), 0),
    totalAnnualRent: activeLeases.reduce(
      (sum, lease) => sum + annualizeRent(Number(lease.rent_amount), lease.billing_frequency),
      0
    )
  };
}

/**
 * Cout d'acquisition retenu pour le rendement d'un bien : la valorisation la
 * PLUS RECENTE dont `acquisitionCost` n'est pas nul -- pas simplement la
 * derniere valorisation, qui peut etre une reevaluation de marche sans
 * cout d'acquisition renseigne (l'ancien calcul perdait alors le cout connu
 * d'une valorisation anterieure).
 */
export function latestAcquisitionCost(
  valuations: Array<{ id: string; valuatedAt: Date; createdAt: Date; acquisitionCost: Prisma.Decimal | null }>
) {
  const withCost = valuations.filter(v => v.acquisitionCost !== null).sort(compareValuationsDesc);
  return withCost.length > 0 ? Number(withCost[0].acquisitionCost) : 0;
}

export async function buildPropertyYieldInput(tenantId: string, propertyId: string): Promise<YieldInput> {
  await ensureTenantProperty(tenantId, propertyId, { allowMandated: true });

  const now = new Date();
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setUTCMonth(twelveMonthsAgo.getUTCMonth() - 12);

  const [activeLeases, valuations, latestValuation, allExpenses, activeLoans] = await Promise.all([
    // Tous les baux ACTIVE du bien, pas seulement le premier trouve : un bien
    // peut porter plusieurs baux actifs (colocation, lots distincts).
    prisma.rentalLease.findMany({
      where: { tenant_id: tenantId, property_id: propertyId, status: 'ACTIVE' },
      select: { rent_amount: true, billing_frequency: true }
    }),
    prisma.assetValuation.findMany({
      where: { tenantId, propertyId },
      select: { id: true, valuatedAt: true, createdAt: true, acquisitionCost: true }
    }),
    prisma.assetValuation.findFirst({
      where: { tenantId, propertyId },
      orderBy: VALUATION_ORDER_BY
    }),
    prisma.propertyExpense.findMany({ where: { tenantId, propertyId } }),
    prisma.propertyLoan.findMany({ where: { tenantId, propertyId, status: 'ACTIVE' } })
  ]);

  const annualRent = activeLeases.reduce(
    (sum, lease) => sum + annualizeRent(Number(lease.rent_amount), lease.billing_frequency),
    0
  );
  const currentValue = latestValuation ? Number(latestValuation.estimatedValue) : 0;
  const acquisitionCost = latestAcquisitionCost(valuations);

  // Charges annuelles du rendement : depenses NON capitalisees payees dans
  // les 12 derniers mois glissants -- une charge capitalisee (renovation
  // lourde) appartient au cout de revient, pas aux charges courantes,
  // et une depense d'il y a trois ans ne doit pas peser sur le rendement
  // courant.
  const annualExpenses = allExpenses
    .filter(expense => !expense.isCapitalized && expense.paidAt >= twelveMonthsAgo && expense.paidAt <= now)
    .reduce((sum, expense) => sum + Number(expense.amount), 0);

  // Cout de revient : cout d'acquisition + TOUTES les depenses capitalisees,
  // sans limite de date -- une renovation capitalisee il y a cinq ans fait
  // toujours partie du cout de revient du bien aujourd'hui.
  const capitalizedExpenses = allExpenses
    .filter(expense => expense.isCapitalized)
    .reduce((sum, expense) => sum + Number(expense.amount), 0);
  const costBasis = acquisitionCost + capitalizedExpenses;

  // Echeanciers des prets actifs : un pret dont la derniere mensualite tombe
  // avant l'horizon de projection cesse d'y peser (`loanPaymentsForYear`,
  // lib/patrimoine/yield.ts).
  const loans: LoanSchedule[] = activeLoans.map(loan => ({
    monthlyPayment: Number(loan.monthlyPayment),
    remainingMonths: remainingLoanMonths(
      {
        endDate: loan.endDate,
        remainingCapital: Number(loan.remainingCapital),
        monthlyPayment: Number(loan.monthlyPayment)
      },
      now
    )
  }));
  const annualLoanPayments = loans.reduce(
    (sum, loan) => sum + loan.monthlyPayment * Math.min(12, loan.remainingMonths),
    0
  );

  return {
    annualRent,
    currentValue,
    costBasis,
    annualExpenses,
    annualLoanPayments,
    loans,
    // Ratios bancaires (DSCR, LTV, cash-on-cash) : prets ACTIFS seulement.
    loanRemainingCapital: activeLoans.reduce((sum, loan) => sum + Number(loan.remainingCapital), 0),
    loanInitialCapital: activeLoans.reduce((sum, loan) => sum + Number(loan.capitalAmount), 0),
    hasActiveLoan: activeLoans.length > 0
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

  // Indivision (lot 4) : le relevé désigne son propriétaire par un contact
  // CRM ; sa quote-part est portée par son TenantClient, relié au contact par
  // `details.crmContactId`. Sans ce lien, le relevé garde les montants entiers.
  const ownerClient = await prisma.tenantClient.findFirst({
    where: { tenantId, details: { path: ['crmContactId'], equals: params.ownerContactId } },
    select: { id: true }
  });
  const shareByProperty = ownerClient ? await ownerSharesByProperty(tenantId, ownerClient.id, propertyIds) : undefined;

  // Les honoraires des encaissements du mois, figés s'ils ne l'étaient pas
  // encore : le relevé et l'état des commissions lisent les mêmes chiffres.
  await materializeManagementFees(tenantId, { from: periodStart, to: periodEnd, propertyIds });

  const [installments, expenses, fees, withholdings, depositMovements] = await Promise.all([
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
    }),
    // Lot 10 : retenue à la source sur loyers, sur les biens du relevé, dans le mois.
    ownerClient
      ? prisma.rentWithholding.findMany({
          where: {
            tenantId,
            ownerClientId: ownerClient.id,
            propertyId: { in: propertyIds },
            collectedAt: { gte: periodStart, lte: periodEnd }
          },
          select: { propertyId: true, amount: true }
        })
      : Promise.resolve([]),
    // Lot 10 : dépôts de garantie conservés dans le mois, sur le compte de
    // tiers OWNER du propriétaire. Rattachés à un bien via leur bail — un
    // mouvement sans bail resolu n'entre dans aucun relevé.
    ownerClient
      ? prisma.thirdPartyMovement.findMany({
          where: {
            tenantId,
            type: 'DEPOSIT_RETAINED',
            movementDate: { gte: periodStart, lte: periodEnd },
            account: { tenantId, kind: 'OWNER', tenantClientId: ownerClient.id }
          },
          select: {
            debit: true,
            credit: true,
            lease: { select: { property_id: true } }
          }
        })
      : Promise.resolve([])
  ]);

  const withholdingsByProperty = withholdings
    .filter(w => propertyIds.includes(w.propertyId))
    .map(w => ({ propertyId: w.propertyId, amount: Number(w.amount) }));

  const depositsRetainedByProperty = depositMovements
    .filter(m => m.lease?.property_id && propertyIds.includes(m.lease.property_id))
    .map(m => ({
      propertyId: m.lease!.property_id,
      // Le sens debit/credit du mouvement n'importe pas ici : une seule des
      // deux colonnes est renseignée par mouvement (voir `appendThirdPartyMovementTx`).
      amount: Number(m.debit ?? 0) + Number(m.credit ?? 0)
    }));

  const computed = computeOwnerStatement({
    periodStart,
    periodEnd,
    propertyIds,
    withholdings: withholdingsByProperty,
    depositsRetained: depositsRetainedByProperty,
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
    })),
    shareByProperty
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
        where: { id: existing.id, tenantId },
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
      where: { id: statementId, tenantId },
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
    where: { id: statementId, tenantId },
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
