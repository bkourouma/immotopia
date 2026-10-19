/**
 * Realise d'un budget de copropriete.
 *
 * Realise d'un poste = `amountActual` (factures prestataires non annulees
 * rattachees au poste, valeur stockee, inchangee) + imputations de cout
 * d'incident rattachees au poste (quelle que soit leur date : le rattachement
 * fait foi), pas encore liees a une ecriture/facture (`journalEntryId` nul :
 * sinon elles seraient comptees deux fois). Le filtre par exercice ne vaut que
 * pour les imputations et factures NON rattachees (`unattached`). Les ecritures manuelles ne comptent pas.
 *
 * Nombre de requetes FIXE (au plus 3), jamais une par poste.
 */

import { prisma } from '../../utils/database';
import { roundMoney } from './finance-utils';

export interface BudgetActualsInputLine {
  id: string;
  amountActual: unknown;
}

export interface BudgetActualsInput {
  id: string;
  fiscalYear: number;
  lines?: BudgetActualsInputLine[] | null;
}

export interface BudgetLineActuals {
  actualIncidents: number;
  actualTotal: number;
}

export interface BudgetUnattachedActuals {
  invoicesCount: number;
  invoicesAmount: number;
  imputationsCount: number;
  imputationsAmount: number;
}

export interface BudgetActuals {
  actualTotal: number;
  unattached: BudgetUnattachedActuals;
  lines: Record<string, BudgetLineActuals>;
}

export type BudgetActualsResult = Record<string, BudgetActuals>;

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const yearStart = (year: number): Date => new Date(Date.UTC(year, 0, 1));

const inFiscalYear = (date: Date | string | null | undefined, year: number): boolean => {
  if (!date) return false;
  const time = new Date(date).getTime();
  return time >= yearStart(year).getTime() && time < yearStart(year + 1).getTime();
};

export async function computeBudgetActuals(
  tenantId: string,
  syndicateId: string,
  budgets: BudgetActualsInput[]
): Promise<BudgetActualsResult> {
  if (budgets.length === 0) return {};

  const years = budgets.map(b => b.fiscalYear);
  const from = yearStart(Math.min(...years));
  const to = yearStart(Math.max(...years) + 1);
  const range = { gte: from, lt: to };
  const incidentScope = { syndicateId, syndicate: { tenantId } };

  const lineIds = budgets.flatMap(b => (b.lines ?? []).map(l => l.id));

  const [attached, loose, invoices] = await Promise.all([
    lineIds.length > 0
      ? prisma.incidentCostImputation.findMany({
          where: {
            budgetLineId: { in: lineIds },
            journalEntryId: null,
            incident: incidentScope
          },
          select: { budgetLineId: true, amount: true, journalEntryId: true }
        })
      : Promise.resolve([]),
    prisma.incidentCostImputation.findMany({
      where: { budgetLineId: null, journalEntryId: null, createdAt: range, incident: incidentScope },
      select: { amount: true, createdAt: true, budgetLineId: true, journalEntryId: true }
    }),
    prisma.syndicProviderInvoice.findMany({
      where: {
        tenantId,
        syndicateId,
        budgetLineItemId: null,
        status: { not: 'CANCELLED' },
        invoiceDate: range
      },
      select: { amountTTC: true, invoiceDate: true, budgetLineItemId: true, status: true }
    })
  ]);

  const result: BudgetActualsResult = {};
  for (const budget of budgets) {
    const lines = budget.lines ?? [];
    const lineActuals: Record<string, BudgetLineActuals> = {};
    let total = 0;
    for (const line of lines) {
      // Le rattachement fait foi (quelle que soit la date) ; jamais d'imputation deja liee a une ecriture.
      const incidents = (attached as Array<any>)
        .filter(i => i.budgetLineId === line.id && !i.journalEntryId)
        .reduce((sum, i) => sum + toNumber(i.amount), 0);
      const actualIncidents = roundMoney(incidents);
      const actualTotal = roundMoney(toNumber(line.amountActual) + actualIncidents);
      lineActuals[line.id] = { actualIncidents, actualTotal };
      total += actualTotal;
    }

    const looseInYear = (loose as Array<any>).filter(
      i => !i.budgetLineId && !i.journalEntryId && inFiscalYear(i.createdAt, budget.fiscalYear)
    );
    const invoicesInYear = (invoices as Array<any>).filter(
      i => !i.budgetLineItemId && i.status !== 'CANCELLED' && inFiscalYear(i.invoiceDate, budget.fiscalYear)
    );

    result[budget.id] = {
      actualTotal: roundMoney(total),
      unattached: {
        invoicesCount: invoicesInYear.length,
        invoicesAmount: roundMoney(invoicesInYear.reduce((s, i) => s + toNumber(i.amountTTC), 0)),
        imputationsCount: looseInYear.length,
        imputationsAmount: roundMoney(looseInYear.reduce((s, i) => s + toNumber(i.amount), 0))
      },
      lines: lineActuals
    };
  }
  return result;
}

type AttachInput = {
  id: string;
  fiscalYear: number;
  lines?: Array<{ id: string; amountActual: unknown }>;
};

export type WithBudgetActuals<T extends AttachInput> = Omit<T, 'lines'> & {
  actualTotal: number;
  unattached: BudgetUnattachedActuals;
  lines?: Array<NonNullable<T['lines']>[number] & BudgetLineActuals>;
};

export async function attachBudgetActuals<T extends AttachInput>(
  tenantId: string,
  syndicateId: string,
  budgets: T[]
): Promise<Array<WithBudgetActuals<T>>> {
  if (budgets.length === 0) return [];
  const actuals = await computeBudgetActuals(tenantId, syndicateId, budgets);
  return budgets.map(budget => {
    const a = actuals[budget.id];
    const enriched: any = { ...budget, actualTotal: a.actualTotal, unattached: a.unattached };
    if (budget.lines) {
      enriched.lines = budget.lines.map(line => ({ ...line, ...a.lines[line.id] }));
    }
    return enriched;
  });
}
