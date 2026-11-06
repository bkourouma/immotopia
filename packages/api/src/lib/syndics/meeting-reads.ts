import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { containsFoldedSql, searchWordsSql } from '../../utils/sql-text-search';
import { dayEnd, dayStart } from '../../utils/list-query-schemas';
import { t } from '../../i18n';
import { assertSyndicateTenantOwnership } from './queries';
import type { z } from 'zod';
import type { meetingsListQuerySchema } from './schemas';

export type MeetingsQuery = z.infer<typeof meetingsListQuerySchema>;
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();

function meetingWhere(tenantId: string, syndicateId: string, query: MeetingsQuery): Prisma.Sql {
  const parts = [Prisma.sql`s.tenant_id = ${tenantId}`, Prisma.sql`m.syndicate_id = ${syndicateId}::uuid`];
  if (query.status?.length) parts.push(Prisma.sql`m.status::text IN (${Prisma.join(query.status)})`);
  if (query.type?.length) parts.push(Prisma.sql`m.meeting_type::text IN (${Prisma.join(query.type)})`);
  if (query.from) parts.push(Prisma.sql`m.scheduled_at >= ${dayStart(query.from)}`);
  if (query.to) parts.push(Prisma.sql`m.scheduled_at <= ${dayEnd(query.to)}`);
  if (query.search) {
    parts.push(
      searchWordsSql(query.search, word => {
        const needle = normalize(word);
        const statuses = Object.entries({
          PLANNED: t('Planifiée'),
          IN_PROGRESS: t('En cours'),
          COMPLETED: t('Clôturée'),
          CANCELLED: t('Annulée')
        })
          .filter(([key, label]) => normalize(`${key} ${label}`).includes(needle))
          .map(([key]) => key);
        const types = Object.entries({ ORDINARY: t('Ordinaire'), EXTRAORDINARY: t('Extraordinaire') })
          .filter(([key, label]) => normalize(`${key} ${label}`).includes(needle))
          .map(([key]) => key);
        const matches = [containsFoldedSql(Prisma.sql`m.location`, word)];
        if (statuses.length) matches.push(Prisma.sql`m.status::text IN (${Prisma.join(statuses)})`);
        if (types.length) matches.push(Prisma.sql`m.meeting_type::text IN (${Prisma.join(types)})`);
        return Prisma.sql`(${Prisma.join(matches, ' OR ')})`;
      })
    );
  }
  return Prisma.join(parts, ' AND ');
}

/** Le filtrage et le compte portent sur toute la copropriete, avant LIMIT/OFFSET. */
export async function listMeetingsPage(tenantId: string, syndicateId: string, query: MeetingsQuery) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const where = meetingWhere(tenantId, syndicateId, query);
  const from = Prisma.sql`FROM general_meetings m JOIN syndicates s ON s.id = m.syndicate_id WHERE ${where}`;
  const totals = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT count(*) AS total ${from}`);
  const ids = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT m.id ${from} ORDER BY m.scheduled_at DESC, m.created_at DESC, m.id ASC
    LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`);
  const items = ids.length
    ? await prisma.generalMeeting.findMany({
        where: { id: { in: ids.map(row => row.id) }, syndicateId, syndicate: { tenantId } },
        include: {
          agendaItems: { orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }] },
          resolutions: true,
          proxies: true
        },
        orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }]
      })
    : [];
  const total = Number(totals[0]?.total ?? 0);
  return {
    items,
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) }
  };
}
