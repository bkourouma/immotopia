import { prisma } from '../../utils/database';
import { getPropertyForTenant } from '../../utils/property-tenant-guard';
import { logger } from '../../utils/logger';
import { applyShare } from './tax/engine';
import { getPropertyTaxEstimate } from './tax/service';
import type { PropertyTaxEstimate } from './entities/dto';
import {
  buildCashPlan,
  classifyProperties,
  taxEstimateRequests,
  type CashPlanData,
  type CashPlanExpenseInput,
  type CashPlanTaxEstimateInput
} from './cash-plan';
import type { CashPlanQuery, CashPlanSettingsInput } from './cash-plan-schemas';

/**
 * Chargement des données du plan de trésorerie prévisionnel (spec 030, lot A2)
 * et assemblage de `CashPlanData`. Le calcul lui-même est pur : voir `cash-plan.ts`.
 *
 * Toute lecture est filtrée par `tenantId`. Le moteur fiscal n'est appelé que
 * si l'agence a renseigné la date d'exigibilité de la taxe foncière.
 */

/** Appels simultanés maximum au moteur fiscal (chaque appel fait plusieurs lectures). */
const TAX_BATCH_SIZE = 5;

const num = (value: { toString(): string } | number | null | undefined): number =>
  value === null || value === undefined ? 0 : Number(value);

/** Total des taxes foncières applicables d'une estimation : parts de tous les détenteurs, jamais la taxe sur revenus locatifs. */
export function propertyTaxAmountOf(estimate: PropertyTaxEstimate): number {
  return estimate.holders.reduce(
    (sum, holder) => sum + applyShare(holder.taxes, holder.sharePercent).amountShareByKind.PROPERTY_TAX,
    0
  );
}

/**
 * Les paramètres sont-ils tous validés pour la taxe foncière ? Seules les taxes PROPERTY_TAX applicables
 * des détenteurs comptent : le drapeau global de l'estimation inclut aussi la taxe sur revenus locatifs.
 */
export function propertyTaxParametersValidated(estimate: PropertyTaxEstimate): boolean {
  return estimate.holders.every(holder =>
    holder.taxes
      .filter(tax => tax.taxKind === 'PROPERTY_TAX' && tax.applicable)
      .every(tax => tax.allParametersValidated)
  );
}

async function loadTaxEstimates(
  tenantId: string,
  requests: Array<{ propertyId: string; year: number }>
): Promise<CashPlanTaxEstimateInput[]> {
  const estimates: CashPlanTaxEstimateInput[] = [];
  for (let i = 0; i < requests.length; i += TAX_BATCH_SIZE) {
    const batch = requests.slice(i, i + TAX_BATCH_SIZE);
    // Une estimation en échec ne fait pas échouer le plan : le couple est traité comme non estimable.
    const results = await Promise.all(
      batch.map(async request => {
        try {
          return await getPropertyTaxEstimate(tenantId, request.propertyId, { year: request.year });
        } catch (error) {
          logger.warn('Cash plan: property tax estimate failed, treated as not estimable', {
            tenantId,
            propertyId: request.propertyId,
            year: request.year,
            error: error instanceof Error ? error.message : String(error)
          });
          return null;
        }
      })
    );
    results.forEach((estimate, index) =>
      estimates.push({
        propertyId: batch[index].propertyId,
        year: batch[index].year,
        amount: estimate ? propertyTaxAmountOf(estimate) : 0,
        allParametersValidated: estimate ? propertyTaxParametersValidated(estimate) : true
      })
    );
  }
  return estimates;
}

async function loadPlanRows(tenantId: string, retainedIds: string[], startYear: number, startMonth: number) {
  return Promise.all([
    prisma.patrimonyCashPlanSettings.findUnique({
      where: { tenantId },
      select: { propertyTaxDueMonth: true, propertyTaxDueDay: true }
    }),
    prisma.rentalLease.findMany({
      where: { tenant_id: tenantId, property_id: { in: retainedIds }, status: 'ACTIVE' },
      select: {
        id: true,
        tenant_id: true,
        property_id: true,
        start_date: true,
        end_date: true,
        billing_frequency: true,
        due_day_of_month: true,
        currency: true,
        rent_amount: true,
        service_charge_amount: true
      }
    }),
    prisma.rentalInstallment.findMany({
      where: {
        tenant_id: tenantId,
        lease: { tenant_id: tenantId, property_id: { in: retainedIds }, status: { notIn: ['DRAFT', 'CANCELED'] } },
        // Période (année, mois) ≥ mois courant UTC : indépendant du fuseau du serveur.
        OR: [
          { status: { notIn: ['PAID', 'CANCELED'] } },
          { period_year: { gt: startYear } },
          { period_year: startYear, period_month: { gte: startMonth } }
        ]
      },
      select: {
        id: true,
        lease_id: true,
        period_year: true,
        period_month: true,
        due_date: true,
        status: true,
        currency: true,
        amount_rent: true,
        amount_service: true,
        amount_other_fees: true,
        penalty_amount: true,
        amount_paid: true,
        lease: { select: { property_id: true } }
      }
    }),
    prisma.propertyLoan.findMany({ where: { tenantId, propertyId: { in: retainedIds }, status: 'ACTIVE' } }),
    prisma.workProgram.findMany({
      where: { tenantId, propertyId: { in: retainedIds }, status: { in: ['PLANNED', 'IN_PROGRESS'] } }
    }),
    prisma.propertyExpense.findMany({
      where: { tenantId, propertyId: { in: retainedIds }, recurrence: { not: 'ONE_OFF' } },
      select: {
        id: true,
        propertyId: true,
        category: true,
        label: true,
        amount: true,
        currency: true,
        paidAt: true,
        recurrence: true,
        recurrenceEndDate: true
      }
    })
  ]);
}

export async function getCashPlan(
  tenantId: string,
  query: CashPlanQuery,
  today: Date = new Date()
): Promise<CashPlanData> {
  // Un bien d'une autre agence lève la même 404 qu'un bien inexistant.
  if (query.propertyId) await getPropertyForTenant(query.propertyId, tenantId);

  const propertyRows = await prisma.property.findMany({
    where: { tenantId, ownershipType: 'TENANT', ...(query.propertyId ? { id: query.propertyId } : {}) },
    select: { id: true, title: true, status: true, transactionModes: true }
  });
  const properties = propertyRows.map(row => ({
    id: row.id,
    title: row.title,
    status: row.status,
    transactionModes: row.transactionModes
  }));
  const retainedIds = classifyProperties(properties, query.propertyId).retained.map(property => property.id);

  const [settingsRow, leases, installments, loans, works, expenses] = await loadPlanRows(
    tenantId,
    retainedIds,
    today.getUTCFullYear(),
    today.getUTCMonth() + 1
  );

  const settings = {
    propertyTaxDueMonth: settingsRow?.propertyTaxDueMonth ?? null,
    propertyTaxDueDay: settingsRow?.propertyTaxDueDay ?? null
  };
  const expenseInputs: CashPlanExpenseInput[] = expenses.map(row => ({
    id: row.id,
    propertyId: row.propertyId,
    category: row.category,
    label: row.label,
    amount: num(row.amount),
    currency: row.currency,
    paidAt: row.paidAt,
    recurrence: row.recurrence,
    recurrenceEndDate: row.recurrenceEndDate
  }));

  // Aucune date d'exigibilité : `taxEstimateRequests` est vide, le moteur fiscal n'est pas appelé.
  const requests = taxEstimateRequests({
    today,
    months: query.months,
    propertyId: query.propertyId,
    properties,
    expenses: expenseInputs,
    settings
  });
  const taxEstimates = await loadTaxEstimates(tenantId, requests);

  return buildCashPlan({
    today,
    months: query.months as 12 | 24,
    openingBalance: query.openingBalance ?? null,
    propertyId: query.propertyId ?? null,
    properties,
    installments: installments.map(row => ({
      id: row.id,
      leaseId: row.lease_id,
      propertyId: row.lease.property_id,
      periodYear: row.period_year,
      periodMonth: row.period_month,
      dueDate: row.due_date,
      status: row.status,
      currency: row.currency,
      amountRent: num(row.amount_rent),
      amountService: num(row.amount_service),
      amountOtherFees: num(row.amount_other_fees),
      penaltyAmount: num(row.penalty_amount),
      amountPaid: num(row.amount_paid)
    })),
    leases: leases.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      propertyId: row.property_id,
      startDate: row.start_date,
      endDate: row.end_date,
      billingFrequency: row.billing_frequency,
      dueDayOfMonth: row.due_day_of_month,
      currency: row.currency,
      rentAmount: num(row.rent_amount),
      serviceChargeAmount: num(row.service_charge_amount)
    })),
    loans: loans.map(row => ({
      id: row.id,
      propertyId: row.propertyId,
      lender: row.lender,
      monthlyPayment: num(row.monthlyPayment),
      currency: row.currency,
      startDate: row.startDate,
      endDate: row.endDate,
      status: row.status
    })),
    works: works.map(row => ({
      id: row.id,
      propertyId: row.propertyId,
      title: row.title,
      estimatedCost: num(row.estimatedCost),
      actualCost: row.actualCost === null ? null : num(row.actualCost),
      currency: row.currency,
      plannedDate: row.plannedDate,
      status: row.status
    })),
    expenses: expenseInputs,
    settings,
    taxEstimates
  });
}

export async function updateCashPlanSettings(
  tenantId: string,
  userId: string | undefined,
  input: CashPlanSettingsInput
) {
  return prisma.patrimonyCashPlanSettings.upsert({
    where: { tenantId },
    create: {
      tenantId,
      propertyTaxDueMonth: input.propertyTaxDueMonth,
      propertyTaxDueDay: input.propertyTaxDueDay,
      updatedByUserId: userId ?? null
    },
    update: {
      propertyTaxDueMonth: input.propertyTaxDueMonth,
      propertyTaxDueDay: input.propertyTaxDueDay,
      updatedByUserId: userId ?? null
    },
    select: { propertyTaxDueMonth: true, propertyTaxDueDay: true, updatedAt: true }
  });
}
