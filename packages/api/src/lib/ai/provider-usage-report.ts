import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../i18n';
import { BadRequestError } from '../../middleware/error-middleware';
import { prisma } from '../../utils/database';
import { usageModes, usageProviders } from './provider-usage';

export const usageReportQuery = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    tenantId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    provider: z.enum(usageProviders).optional(),
    model: z.string().trim().min(1).max(200).optional(),
    mode: z.enum(usageModes).optional(),
    status: z.enum(['ok', 'error', 'aborted', 'refused', 'truncated']).optional(),
    offset: z.coerce.number().int().min(0).max(100_000).default(0)
  })
  .strict();

const dayMs = 86_400_000;

export async function assistantUsageReport(
  query: z.infer<typeof usageReportQuery>,
  limit: number,
  offset: number,
  now = new Date()
) {
  const today = now.toISOString().slice(0, 10);
  const to = query.to ?? today;
  const toDate = new Date(to + 'T00:00:00Z');
  const from = query.from ?? new Date(toDate.getTime() - 29 * dayMs).toISOString().slice(0, 10);
  if (from > to) throw new BadRequestError(t('La période demandée est invalide.'));
  const fromDate = new Date(from + 'T00:00:00Z');
  const where: Prisma.AssistantProviderUsageWhereInput = {
    createdAt: { gte: fromDate, lt: new Date(toDate.getTime() + dayMs) },
    tenantId: query.tenantId,
    userId: query.userId,
    provider: query.provider,
    model: query.model,
    mode: query.mode,
    status: query.status
  };
  const result = await prisma.assistantProviderUsage.groupBy({
    where,
    by: ['tenantId', 'userId', 'provider', 'model', 'mode', 'status'],
    orderBy: [
      { _count: { id: 'desc' } },
      { tenantId: 'asc' },
      { userId: 'asc' },
      { provider: 'asc' },
      { model: 'asc' },
      { mode: 'asc' },
      { status: 'asc' }
    ],
    _count: { id: true, costUsd: true },
    _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true, costUsd: true },
    _avg: { durationMs: true },
    skip: offset,
    take: limit + 1
  });
  const groups = result.slice(0, limit);
  const tenantIds = [...new Set(groups.map(row => row.tenantId))];
  const userIds = [...new Set(groups.flatMap(row => (row.userId ? [row.userId] : [])))];
  const [tenants, users] = await Promise.all([
    tenantIds.length
      ? prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } })
      : [],
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : []
  ]);
  const tenantNames = new Map(tenants.map(tenant => [tenant.id, tenant.name]));
  const userNames = new Map(users.map(user => [user.id, user.fullName]));
  return {
    from,
    to,
    hasNext: result.length > limit,
    items: groups.map(({ _count, _sum, _avg, ...group }) => ({
      ...group,
      agency: tenantNames.get(group.tenantId) ?? null,
      account: group.userId ? (userNames.get(group.userId) ?? null) : null,
      calls: _count.id,
      ..._sum,
      costUsd: _sum.costUsd?.toString() ?? null,
      unknownCosts: _count.id - _count.costUsd,
      averageDurationMs: _avg.durationMs === null ? null : Math.round(_avg.durationMs)
    }))
  };
}

export function assistantUsageCsv(report: Awaited<ReturnType<typeof assistantUsageReport>>) {
  const header = [
    t('Début UTC'),
    t('Fin UTC'),
    t('Agence'),
    t('Compte'),
    t('Fournisseur'),
    t('Modèle'),
    t('Mode'),
    t('Résultat'),
    t('Appels'),
    t('Jetons en entrée'),
    t('Jetons en sortie'),
    t('Jetons lus du cache'),
    t('Jetons écrits dans le cache'),
    t('Coût communiqué (USD)'),
    t('Appels sans coût communiqué'),
    t('Durée moyenne (ms)')
  ];
  const rows = report.items.map(row => [
    report.from,
    report.to,
    row.agency,
    row.account,
    row.provider,
    row.model,
    row.mode,
    row.status,
    row.calls,
    row.inputTokens,
    row.outputTokens,
    row.cacheReadTokens,
    row.cacheWriteTokens,
    row.costUsd,
    row.unknownCosts,
    row.averageDurationMs
  ]);
  const csvCell = (value: string | number | null) => {
    if (typeof value === 'number') return String(value);
    const field = value ?? '';
    const safe = /^[\s\uFEFF]*[=+\-@]/u.test(field) ? "'" + field : field;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  return '\uFEFF' + [header, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n');
}
