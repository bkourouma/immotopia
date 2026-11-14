import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { prisma } from '../../utils/database';
import type { AssistantOwner } from './conversations';
import { nextReportRun, reportSchedule } from './report-schedule';

const reportInput = z.object({
  conversationId: z.string().uuid(),
  artifactId: z.string().uuid(),
  recipientIds: z.array(z.string().uuid()).min(1).max(20),
  formats: z
    .array(z.enum(['xlsx', 'pdf', 'csv']))
    .min(1)
    .max(3)
});
const scheduledReportInput = reportInput.extend({ schedule: reportSchedule }).strict();
const immediateReportInput = reportInput
  .extend({
    requestId: z.string().uuid(),
    message: z.string().trim().max(2000).optional()
  })
  .strict();
export const assistantReportInput = z.union([scheduledReportInput, immediateReportInput]);

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

export async function queueImmediateReport(
  owner: AssistantOwner,
  scopeKey: string,
  input: z.infer<typeof immediateReportInput>
) {
  const id = randomUUID();
  const recipientIds = [...new Set(input.recipientIds)].sort();
  const formats = [...new Set(input.formats)].sort();
  const message = input.message || null;
  const inserted = await prisma.$executeRaw`
    INSERT INTO assistant_scheduled_reports
      (id, tenant_id, owner_id, conversation_id, artifact_id, immediate_key, message, recipient_ids, formats, active, next_run_at)
    SELECT ${id}, a.tenant_id, a.owner_id, a.conversation_id, a.artifact_id, ${input.requestId}, ${message},
      ${recipientIds}::text[], ${formats}::text[], true, CURRENT_TIMESTAMP
    FROM assistant_saved_analyses a
    JOIN assistant_conversations c ON (c.tenant_id, c.owner_id, c.id) = (a.tenant_id, a.owner_id, a.conversation_id)
    WHERE a.tenant_id = ${owner.tenantId} AND a.owner_id = ${owner.ownerId}
      AND a.conversation_id = ${input.conversationId} AND a.artifact_id = ${input.artifactId}
      AND c.scope_key = ${scopeKey}
    FOR SHARE OF a, c
    ON CONFLICT (tenant_id, owner_id, immediate_key) DO NOTHING
  `;
  if (inserted) return { id };
  const previous = await prisma.assistantScheduledReport.findFirst({
    where: { ...owner, immediateKey: input.requestId, analysis: { conversation: { scopeKey } } }
  });
  if (!previous) throw new NotFoundError();
  if (
    previous.artifactId !== input.artifactId ||
    previous.conversationId !== input.conversationId ||
    previous.message !== message ||
    JSON.stringify(previous.recipientIds) !== JSON.stringify(recipientIds) ||
    JSON.stringify(previous.formats) !== JSON.stringify(formats)
  )
    throw new ConflictError(t('Cette confirmation correspond déjà à un autre envoi.'));
  return { id: previous.id };
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
  await prisma.assistantScheduledReport.deleteMany({ where: { ...owner, id, immediateKey: null } });
}

export async function setScheduledReportActive(owner: AssistantOwner, scopeKey: string, id: string, active: boolean) {
  const where = { ...owner, id, immediateKey: null, analysis: { conversation: { scopeKey } } };
  const report = await prisma.assistantScheduledReport.findFirst({ where });
  if (!report) throw new NotFoundError();
  if (active === report.active) return;
  const nextRunAt = active ? nextReportRun(reportSchedule.parse(report.schedule), new Date()) : null;
  await prisma.assistantScheduledReport.updateMany({
    where: { ...where, active: !active },
    data: { active, nextRunAt }
  });
}
