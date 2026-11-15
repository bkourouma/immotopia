import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../../i18n';
import { BadRequestError } from '../../../middleware/error-middleware';
import { prisma } from '../../../utils/database';
import { propertyTenantWhere } from '../../../utils/property-tenant-guard';
import type { CopilotArtifact, CopilotToolDefinition } from '../contracts';
import { assertToolPermission, outcome } from './tool-utils';

const PERMISSION = 'RENTAL_INSTALLMENTS_VIEW';
const MAX_INSTALLMENTS = 20_000;
export const openInstallmentStatuses = ['DRAFT', 'DUE', 'PARTIAL', 'OVERDUE'] as const;
export const monthPattern = /^(20\d\d)-(0[1-9]|1[0-2])$/;
const inputSchema = z.object({ month: z.string().regex(monthPattern).optional() }).strict();

export function closedMonthBounds(month: string | undefined, now: Date) {
  const firstCurrent = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = month
    ? new Date(`${month}-01T00:00:00.000Z`)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  if (end > firstCurrent) throw new BadRequestError(t('Choisissez un mois terminé.'));
  const lastDay = new Date(end.getTime() - 1).toISOString().slice(0, 10);
  return { start, end, period: start.toISOString().slice(0, 7), firstDay: start.toISOString().slice(0, 10), lastDay };
}

export function grossInstallmentAmount(item: {
  amount_rent: Prisma.Decimal;
  amount_service: Prisma.Decimal;
  amount_other_fees: Prisma.Decimal;
  penalty_amount: Prisma.Decimal;
}): Prisma.Decimal {
  return item.amount_rent.plus(item.amount_service).plus(item.amount_other_fees).plus(item.penalty_amount);
}

export const rentalArrearsTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'rental_arrears',
  description:
    'Calcule le solde restant aujourd’hui sur les échéances dont la date de paiement prévue tombe dans un mois clos (dernier mois clos par défaut). Présente automatiquement le classement des biens par devise dans un tableau avec provenance. Les règlements partiels et les pénalités sont pris en compte. Ne recopie pas le tableau via show_artifact.',
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: { month: { type: 'string', pattern: monthPattern.source, description: 'Mois clos AAAA-MM.' } }
  },
  requiredPermission: PERMISSION,
  feature: 'RENTAL',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, PERMISSION);
    const now = new Date();
    const { start, end, period, firstDay, lastDay } = closedMonthBounds(input.month, now);
    const filters = new URLSearchParams({ dueFrom: firstDay, dueTo: lastDay, overdue: '1' });
    const installments = await prisma.rentalInstallment.findMany({
      where: {
        tenant_id: ctx.tenantId,
        due_date: { gte: start, lt: end },
        status: { in: [...openInstallmentStatuses] },
        lease: { tenant_id: ctx.tenantId, property: propertyTenantWhere(ctx.tenantId) }
      },
      select: {
        currency: true,
        amount_rent: true,
        amount_service: true,
        amount_other_fees: true,
        penalty_amount: true,
        amount_paid: true,
        lease: { select: { property: { select: { id: true, internalReference: true, title: true } } } }
      },
      take: MAX_INSTALLMENTS + 1
    });
    if (installments.length > MAX_INSTALLMENTS) {
      throw new BadRequestError(t('Le volume des échéances dépasse la limite de cette analyse.'));
    }

    const grouped = new Map<
      string,
      { property: string; href: string; currency: string; count: number; balance: Prisma.Decimal }
    >();
    for (const item of installments) {
      const due = grossInstallmentAmount(item);
      const balance = due.minus(item.amount_paid);
      if (balance.lte(0)) continue;
      const property = item.lease.property;
      const currency = item.currency === 'FCFA' ? 'XOF' : item.currency;
      const key = JSON.stringify([property.id, currency]);
      const group = grouped.get(key) ?? {
        property: [property.internalReference, property.title].filter(Boolean).join(' — '),
        href: `/tenant/${encodeURIComponent(ctx.tenantId)}/properties/${encodeURIComponent(property.id)}`,
        currency,
        count: 0,
        balance: new Prisma.Decimal(0)
      };
      group.count++;
      group.balance = group.balance.plus(balance);
      grouped.set(key, group);
    }
    const rows = [...grouped.values()]
      .sort(
        (a, b) =>
          a.currency.localeCompare(b.currency) ||
          b.balance.comparedTo(a.balance) ||
          a.property.localeCompare(b.property)
      )
      .map(row => ({ ...row, balance: row.balance.toNumber() }));
    const artifact: CopilotArtifact = {
      kind: 'table',
      id: randomUUID(),
      title: t('Échéances locatives non soldées'),
      query: { tool: 'rental_arrears', month: period },
      columns: [
        { key: 'property', label: t('Bien'), linkKey: 'href' },
        { key: 'count', label: t('Nombre d’échéances'), type: 'number' },
        { key: 'balance', label: t('Solde restant dû'), type: 'currency' },
        { key: 'currency', label: t('Devise') }
      ],
      rows: rows.slice(0, 500),
      truncated: rows.length > 500,
      provenance: {
        source: t('Échéances locatives'),
        href: `/tenant/${encodeURIComponent(ctx.tenantId)}/rental/installments?${filters}`,
        period,
        calculatedAt: now.toISOString(),
        rules: [
          t('Date d’échéance dans le mois affiché. Échéances annulées et soldées exclues.'),
          t('Solde actuel = loyer + charges + autres frais + pénalités − paiements affectés.'),
          t('Les soldes positifs sont regroupés par bien et par devise.')
        ]
      }
    };
    return outcome(
      {
        artifactId: artifact.id,
        period,
        count: rows.length,
        columns: artifact.columns.map(column => column.key),
        items: rows.slice(0, 8).map(({ href, ...row }) => row)
      },
      { type: 'artifact', artifact }
    );
  }
};
