import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { NotFoundError } from '../../middleware/error-middleware';
import { prisma } from '../../utils/database';
import type { AssistantOwner } from './conversations';
import { nextReportRun, reportSchedule } from './report-schedule';

export const scheduledReportInput = z
  .object({
    conversationId: z.string().uuid(),
    artifactId: z.string().uuid(),
    schedule: reportSchedule,
    recipientIds: z.array(z.string().uuid()).min(1).max(20),
    formats: z
      .array(z.enum(['xlsx', 'pdf', 'csv']))
      .min(1)
      .max(3)
  })
  .strict();

export async function createScheduledReportDraft(
  owner: AssistantOwner,
  scopeKey: string,
  input: z.infer<typeof scheduledReportInput>
) {
  const id = randomUUID();
  const result = await prisma.$executeRaw`
    INSERT INTO assistant_scheduled_reports (id, tenant_id, owner_id, conversation_id, artifact_id, schedule, recipient_ids, formats)
    SELECT ${id}, a.tenant_id, a.owner_id, a.conversation_id, a.artifact_id, ${JSON.stringify(input.schedule)}::jsonb,
      ${[...new Set(input.recipientIds)]}::text[], ${[...new Set(input.formats)]}::text[]
    FROM assistant_saved_analyses a
    JOIN assistant_conversations c ON (c.tenant_id, c.owner_id, c.id) = (a.tenant_id, a.owner_id, a.conversation_id)
    WHERE a.tenant_id = ${owner.tenantId} AND a.owner_id = ${owner.ownerId}
      AND a.conversation_id = ${input.conversationId} AND a.artifact_id = ${input.artifactId}
      AND c.scope_key = ${scopeKey}
    FOR SHARE OF a, c
  `;
  if (!result) throw new NotFoundError();
  return { id, previewRunAt: nextReportRun(input.schedule, new Date()) };
}

export async function listScheduledReports(owner: AssistantOwner, scopeKey: string, cursor?: string) {
  const where = { ...owner, analysis: { conversation: { scopeKey } } };
  if (
    cursor &&
    !(await prisma.assistantScheduledReport.findFirst({ where: { ...where, id: cursor }, select: { id: true } }))
  ) {
    throw new NotFoundError();
  }
  const reports = await prisma.assistantScheduledReport.findMany({
    where,
    select: {
      id: true,
      schedule: true,
      recipientIds: true,
      formats: true,
      active: true,
      nextRunAt: true,
      lastRunAt: true,
      lastStatus: true,
      analysis: { select: { title: true } }
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 51,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  return {
    items: reports.slice(0, 50),
    nextCursor: reports.length > 50 ? reports[49].id : undefined
  };
}

export async function removeScheduledReport(owner: AssistantOwner, id: string) {
  await prisma.assistantScheduledReport.deleteMany({ where: { ...owner, id } });
}
