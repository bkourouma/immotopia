import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../../i18n';
import { prisma } from '../../../utils/database';
import type { CopilotArtifact, CopilotToolDefinition } from '../contracts';
import { assertToolPermission, outcome } from './tool-utils';
import { closedMonthBounds, monthPattern } from './rental-arrears';

const PERMISSION = 'RENTAL_PAYMENTS_VIEW';
const inputSchema = z.object({ month: z.string().regex(monthPattern).optional() }).strict();

export const rentalReceiptsTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'rental_receipts',
  description:
    'Compare les paiements locatifs encaissés du mois clos choisi, du mois précédent et du même mois N-1, séparés par devise. La date retenue est la date de succès du paiement. Le serveur publie le tableau.',
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: { month: { type: 'string', pattern: monthPattern.source } }
  },
  requiredPermission: PERMISSION,
  feature: 'RENTAL',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, PERMISSION);
    const now = new Date();
    const { start, end, period } = closedMonthBounds(input.month, now);
    const previous = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
    const lastYear = new Date(Date.UTC(start.getUTCFullYear() - 1, start.getUTCMonth(), 1));
    const lastYearEnd = new Date(Date.UTC(start.getUTCFullYear() - 1, start.getUTCMonth() + 1, 1));
    const bounds = [
      [start, end],
      [previous, start],
      [lastYear, lastYearEnd]
    ];
    const results = await Promise.all(
      bounds.map(([gte, lt]) =>
        prisma.rentalPayment.groupBy({
          by: ['currency'],
          where: { tenant_id: ctx.tenantId, status: 'SUCCESS', succeeded_at: { gte, lt } },
          _sum: { amount: true },
          _count: { _all: true }
        })
      )
    );
    const rows = results.flatMap((entries, index) => {
      const currencies = new Map<string, { amount: Prisma.Decimal; count: number }>();
      for (const entry of entries) {
        const currency = entry.currency === 'FCFA' ? 'XOF' : entry.currency;
        const subtotal = currencies.get(currency) ?? { amount: new Prisma.Decimal(0), count: 0 };
        if (entry._sum.amount !== null) subtotal.amount = subtotal.amount.plus(entry._sum.amount);
        subtotal.count += entry._count._all;
        currencies.set(currency, subtotal);
      }
      return [...currencies]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, subtotal]) => ({
          period: bounds[index][0].toISOString().slice(0, 7),
          currency,
          amount: subtotal.amount.toNumber(),
          count: subtotal.count
        }));
    });
    const artifact: CopilotArtifact = {
      kind: 'table',
      id: randomUUID(),
      title: t('Encaissements locatifs'),
      columns: [
        { key: 'period', label: t('Période') },
        { key: 'currency', label: t('Devise') },
        { key: 'amount', label: t('Montant encaissé'), type: 'currency' },
        { key: 'count', label: t('Nombre de paiements'), type: 'number' }
      ],
      rows: rows.slice(0, 500),
      truncated: rows.length > 500,
      provenance: {
        source: t('Paiements locatifs'),
        href: `/tenant/${encodeURIComponent(ctx.tenantId)}/rental/payments`,
        period,
        calculatedAt: now.toISOString(),
        rules: [
          t('Seuls les paiements au statut réussi sont inclus, selon la date effective d’encaissement.'),
          t('Les montants sont regroupés par devise. Un mois sans paiement pour une devise n’a pas de ligne.')
        ]
      }
    };
    return outcome(
      {
        artifactId: artifact.id,
        periods: bounds.map(([date]) => date.toISOString().slice(0, 7)),
        items: rows.slice(0, 30)
      },
      { type: 'artifact', artifact }
    );
  }
};
