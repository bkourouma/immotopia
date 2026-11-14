import { randomUUID } from 'node:crypto';
import { Prisma, RentalInstallmentStatus } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../../i18n';
import { AppError, BadRequestError } from '../../../middleware/error-middleware';
import { prisma } from '../../../utils/database';
import { propertyTenantWhere } from '../../../utils/property-tenant-guard';
import type { AnalysisTable, CopilotToolDefinition, CopilotToolOutcome } from '../contracts';
import { leasePortfolioTool } from './portfolio';
import { closedMonthBounds, grossInstallmentAmount, monthPattern, openInstallmentStatuses } from './rental-arrears';
import { rentalReceiptsTool } from './rental-receipts';
import { assertToolPermission, outcome } from './tool-utils';

const PERMISSION = 'RENTAL_INSTALLMENTS_VIEW';
const MAX_INSTALLMENTS_PER_MONTH = 20_000;
const openStatuses = new Set<RentalInstallmentStatus>(openInstallmentStatuses);
const inputSchema = z.object({ month: z.string().regex(monthPattern).optional() }).strict();
const jsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { month: { type: 'string', pattern: monthPattern.source, description: 'Mois clos AAAA-MM.' } }
};

async function sumInstallments(tenantId: string, start: Date, end: Date) {
  const rows = await prisma.rentalInstallment.findMany({
    where: {
      tenant_id: tenantId,
      due_date: { gte: start, lt: end },
      status: { not: 'CANCELED' },
      lease: { tenant_id: tenantId, property: propertyTenantWhere(tenantId) }
    },
    select: {
      currency: true,
      status: true,
      amount_rent: true,
      amount_service: true,
      amount_other_fees: true,
      penalty_amount: true,
      amount_paid: true
    },
    take: MAX_INSTALLMENTS_PER_MONTH + 1
  });
  if (rows.length > MAX_INSTALLMENTS_PER_MONTH) {
    throw new BadRequestError(t('Le volume des échéances dépasse la limite de cette analyse.'));
  }
  const totals = new Map<
    string,
    { expected: Prisma.Decimal; allocated: Prisma.Decimal; overdue: Prisma.Decimal; overdueCount: number }
  >();
  for (const row of rows) {
    const currency = row.currency === 'FCFA' ? 'XOF' : row.currency;
    const subtotal = totals.get(currency) ?? {
      expected: new Prisma.Decimal(0),
      allocated: new Prisma.Decimal(0),
      overdue: new Prisma.Decimal(0),
      overdueCount: 0
    };
    const gross = grossInstallmentAmount(row);
    subtotal.expected = subtotal.expected.plus(gross);
    subtotal.allocated = subtotal.allocated.plus(row.amount_paid);
    const balance = gross.minus(row.amount_paid);
    if (openStatuses.has(row.status) && balance.gt(0)) {
      subtotal.overdue = subtotal.overdue.plus(balance);
      subtotal.overdueCount++;
    }
    totals.set(currency, subtotal);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, values]) => ({
      period: start.toISOString().slice(0, 7),
      currency,
      expected: values.expected.toNumber(),
      allocated: values.allocated.toNumber(),
      overdue: values.overdue.toNumber(),
      overdueCount: values.overdueCount
    }));
}

export const rentalDueComparisonTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'rental_due_comparison',
  description:
    'Compare les échéances locatives attendues, paiements affectés et soldes en retard du mois clos choisi et du même mois N-1, par devise. Les soldes et affectations sont ceux enregistrés à la date du calcul.',
  inputSchema,
  jsonSchema,
  requiredPermission: PERMISSION,
  feature: 'RENTAL',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, PERMISSION);
    const now = new Date();
    const { start, end, period } = closedMonthBounds(input.month, now);
    const previous = new Date(start);
    previous.setUTCFullYear(start.getUTCFullYear() - 1);
    const previousEnd = new Date(end);
    previousEnd.setUTCFullYear(end.getUTCFullYear() - 1);
    const previousPeriod = previous.toISOString().slice(0, 7);
    const data = await Promise.all([
      sumInstallments(ctx.tenantId, start, end),
      sumInstallments(ctx.tenantId, previous, previousEnd)
    ]);
    const rows = data.flat();
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: t('Échéances du mois et de l’année précédente'),
      query: { tool: 'rental_due_comparison', month: period },
      columns: [
        { key: 'period', label: t('Période') },
        { key: 'currency', label: t('Devise') },
        { key: 'expected', label: t('Montant attendu'), type: 'currency' },
        { key: 'allocated', label: t('Paiements affectés'), type: 'currency' },
        { key: 'overdue', label: t('Solde restant dû'), type: 'currency' },
        { key: 'overdueCount', label: t('Nombre d’échéances en retard'), type: 'number' }
      ],
      rows: rows.slice(0, 500),
      truncated: rows.length > 500,
      provenance: {
        source: t('Échéances locatives'),
        href: `/tenant/${encodeURIComponent(ctx.tenantId)}/rental/installments`,
        period: `${period} / ${previousPeriod}`,
        calculatedAt: now.toISOString(),
        rules: [
          t(
            'Le montant attendu comprend les loyers, charges, autres frais et pénalités des échéances non annulées, selon leur date d’échéance.'
          ),
          t(
            'Les paiements affectés et les soldes reflètent la situation à la date du calcul, y compris pour le mois de l’année précédente.'
          ),
          t(
            'Le retard inclut les soldes positifs des échéances non soldées. Un mois sans échéance pour une devise n’a pas de ligne.'
          )
        ]
      }
    };
    return outcome(
      { artifactId: artifact.id, periods: [period, previousPeriod], items: rows.slice(0, 15) },
      { type: 'artifact', artifact }
    );
  }
};

function extractTable(result: CopilotToolOutcome): AnalysisTable {
  if (result.uiEvent?.type === 'artifact' && result.uiEvent.artifact.kind === 'table') return result.uiEvent.artifact;
  throw new AppError(t('Cette analyse ne peut pas être recalculée.'), 422);
}

const reviewPermissions = [
  ...new Set([
    rentalReceiptsTool.requiredPermission,
    leasePortfolioTool.requiredPermission,
    ...(leasePortfolioTool.additionalPermissions ?? [])
  ])
];

export const rentalMonthlyReviewTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'rental_monthly_review',
  description:
    'Prépare un rapport du mois locatif clos dans le panneau des résultats. Combine les échéances attendues et en retard, les encaissements par date de paiement, la comparaison N-1 par devise et les baux actifs à surveiller dans les 30 prochains jours. À utiliser directement pour le bilan ou la revue du mois.',
  inputSchema,
  jsonSchema,
  requiredPermission: PERMISSION,
  additionalPermissions: reviewPermissions,
  feature: 'RENTAL',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, PERMISSION);
    for (const permission of reviewPermissions) assertToolPermission(ctx, permission);
    const { period } = closedMonthBounds(input.month, new Date());
    const [dues, receipts, leases] = await Promise.all([
      rentalDueComparisonTool.execute({ month: period }, ctx),
      rentalReceiptsTool.execute({ month: period }, ctx),
      leasePortfolioTool.execute({ onlyEnding: true }, ctx)
    ]);
    const tables = [dues, receipts, leases].map(extractTable);
    const id = randomUUID();
    return outcome(
      {
        artifactId: id,
        period,
        sourceIds: tables.map(table => table.id),
        dues: dues.modelResult,
        receipts: receipts.modelResult,
        leases: leases.modelResult
      },
      {
        type: 'artifact',
        artifact: {
          kind: 'document',
          id,
          title: t('Bilan locatif du mois {{month}}', { month: period }),
          blocks: [
            ...tables.map(table => ({ kind: 'table' as const, table })),
            {
              kind: 'text',
              content: t(
                'Vérifiez les échéances non soldées avant toute relance. Pour les baux arrivant à terme, contrôlez les préavis et préparez une alerte si nécessaire.'
              )
            }
          ]
        }
      }
    );
  }
};
