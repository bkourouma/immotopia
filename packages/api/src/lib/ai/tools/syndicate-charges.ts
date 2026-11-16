import { randomUUID } from 'node:crypto';
import { BatchType } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../../i18n';
import { assertLotOfSyndicate, assertSyndicateOfTenant, paidFromAllocations } from '../../syndics/charge-allocation';
import { fromCents, toCents } from '../../syndics/charge-allocation-plan';
import { computeOutstanding, deriveChargeCallStatus } from '../../syndics/finance-utils';
import { BadRequestError } from '../../../middleware/error-middleware';
import { prisma } from '../../../utils/database';
import type { AnalysisTable, CopilotToolDefinition } from '../contracts';
import { assertToolPermission, outcome } from './tool-utils';

const permission = 'SYNDIC_VIEW';
const maxCalls = 20_000;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const inputSchema = z
  .object({
    syndicateId: z.string().uuid(),
    lotId: z.string().uuid().optional(),
    year: z.number().int().min(1900).max(9998),
    month: z.string().regex(monthPattern).optional(),
    batchType: z.nativeEnum(BatchType).optional()
  })
  .strict();

export const syndicateChargesTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'syndicate_charges',
  description:
    'Analyse les appels de charges d’une copropriété par lot et devise : appelé, réglé par affectation, solde et retard actuels. Sélection par année ou mois de la date d’échéance, et éventuellement par lot et type de campagne. Cherche les identifiants de copropriété et de lot dans ImmoTopia.',
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['syndicateId', 'year'],
    properties: {
      syndicateId: { type: 'string', format: 'uuid' },
      lotId: { type: 'string', format: 'uuid' },
      year: { type: 'integer', minimum: 1900, maximum: 9998 },
      month: { type: 'string', pattern: monthPattern.source },
      batchType: { type: 'string', enum: Object.values(BatchType) }
    }
  },
  requiredPermission: permission,
  feature: 'SYNDIC',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, permission);
    const { syndicateId, lotId, year, month, batchType } = input;
    if (month && Number(month.slice(0, 4)) !== year) {
      throw new BadRequestError(t('Le mois doit appartenir à l’année sélectionnée.'));
    }
    await assertSyndicateOfTenant(prisma, ctx.tenantId, syndicateId);
    if (lotId) await assertLotOfSyndicate(prisma, ctx.tenantId, syndicateId, lotId);
    const now = new Date();
    const monthIndex = month ? Number(month.slice(5)) - 1 : 0;
    const calls = await prisma.chargeCall.findMany({
      where: {
        syndicateId,
        syndicate: { tenantId: ctx.tenantId },
        lotId,
        lot: { syndicateId },
        dueDate: {
          gte: new Date(Date.UTC(year, monthIndex, 1)),
          lt: new Date(Date.UTC(year, month ? monthIndex + 1 : 12, 1))
        },
        ...(batchType ? { batch: { syndicateId, batchType } } : {})
      },
      select: {
        lotId: true,
        lot: { select: { lotNumber: true } },
        amount: true,
        currency: true,
        dueDate: true,
        status: true,
        allocations: {
          where: { payment: { lot: { syndicateId, syndicate: { tenantId: ctx.tenantId } } } },
          select: { amount: true }
        }
      },
      take: maxCalls + 1
    });
    if (calls.length > maxCalls) {
      throw new BadRequestError(t('Trop d’appels de charges. Précisez un mois ou un lot.'));
    }

    const totals = new Map<
      string,
      {
        lot: string;
        currency: string;
        count: number;
        called: number;
        paid: number;
        outstanding: number;
        overdue: number;
      }
    >();
    for (const call of calls) {
      const currency = call.currency === 'FCFA' ? 'XOF' : call.currency;
      const key = JSON.stringify([call.lotId, currency]);
      const row = totals.get(key) ?? {
        lot: call.lot.lotNumber,
        currency,
        count: 0,
        called: 0,
        paid: 0,
        outstanding: 0,
        overdue: 0
      };
      const paid = paidFromAllocations(call.allocations);
      const remaining = computeOutstanding(Number(call.amount), paid);
      row.count += 1;
      row.called += toCents(call.amount);
      row.paid += toCents(paid);
      row.outstanding += toCents(remaining);
      if (deriveChargeCallStatus(call.status, call.dueDate, now) === 'OVERDUE') row.overdue += toCents(remaining);
      totals.set(key, row);
    }
    const rows = [...totals.values()]
      .sort((a, b) => a.currency.localeCompare(b.currency) || b.overdue - a.overdue || a.lot.localeCompare(b.lot))
      .map(row => ({
        ...row,
        called: fromCents(row.called),
        paid: fromCents(row.paid),
        outstanding: fromCents(row.outstanding),
        overdue: fromCents(row.overdue)
      }));
    const period = month ?? String(year);
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: t('Analyse des charges de copropriété'),
      query: { tool: 'syndicate_charges', ...input },
      columns: [
        { key: 'lot', label: t('Lot') },
        { key: 'currency', label: t('Devise') },
        { key: 'count', label: t('Nombre d’appels'), type: 'number' },
        { key: 'called', label: t('Montant appelé'), type: 'currency' },
        { key: 'paid', label: t('Montant réglé'), type: 'currency' },
        { key: 'outstanding', label: t('Reste à payer'), type: 'currency' },
        { key: 'overdue', label: t('Montant en retard'), type: 'currency' }
      ],
      rows: rows.slice(0, 500),
      truncated: rows.length > 500,
      provenance: {
        source: t('Appels de charges'),
        href: `/tenant/${encodeURIComponent(ctx.tenantId)}/syndics/${syndicateId}/charges`,
        period,
        calculatedAt: now.toISOString(),
        rules: [
          t(
            'La période sélectionne la date d’échéance. Les règlements affectés et le retard sont calculés à la date de consultation.'
          ),
          t('Le reste à payer de chaque appel vaut zéro en cas de trop-perçu. Les montants sont séparés par devise.')
        ]
      }
    };
    return outcome({ artifactId: artifact.id, period, items: rows.slice(0, 25) }, { type: 'artifact', artifact });
  }
};
