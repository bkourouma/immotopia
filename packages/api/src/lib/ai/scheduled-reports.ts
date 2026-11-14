import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { prisma, type PrismaTransactionClient } from '../../utils/database';
import type { AssistantOwner } from './conversations';
import { nextReportRun, reportSchedule } from './report-schedule';
import { createAnalysisSharesInTransaction } from './analysis-shares';

const reportInput = z.object({
  conversationId: z.string().uuid(),
  artifactId: z.string().uuid(),
  recipientIds: z.array(z.string().uuid()).min(1).max(20),
  formats: z
    .array(z.enum(['xlsx', 'pdf', 'csv']))
    .min(1)
    .max(3)
});
export const scheduledReportInput = reportInput.extend({ schedule: reportSchedule }).strict();
export const immediateReportInput = reportInput
  .extend({
    requestId: z.string().uuid(),
    share: z.literal(true),
    message: z.string().trim().max(2000).optional()
  })
  .strict();
export const assistantReportInput = z.union([scheduledReportInput, immediateReportInput]);

export async function createScheduledReportDraft(
  owner: AssistantOwner,
  scopeKey: string,
  input: z.infer<typeof scheduledReportInput>,
  db: PrismaTransactionClient = prisma
) {
  const id = randomUUID();
  const result = await db.$executeRaw`
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
  return prisma.$transaction(tx => queueImmediateReportInTransaction(tx, owner, scopeKey, input));
}

export async function queueImmediateReportInTransaction(
  tx: PrismaTransactionClient,
  owner: AssistantOwner,
  scopeKey: string,
  input: z.infer<typeof immediateReportInput>
) {
  const id = randomUUID();
  const recipientIds = [...new Set(input.recipientIds)].sort();
  const formats = [...new Set(input.formats)].sort();
  const message = input.message || null;
  const inserted = await tx.$executeRaw`
    INSERT INTO assistant_scheduled_reports
      (id, tenant_id, owner_id, conversation_id, artifact_id, immediate_key, message, recipient_ids, formats, active, next_run_at, shares_created)
    SELECT ${id}, a.tenant_id, a.owner_id, a.conversation_id, a.artifact_id, ${input.requestId}, ${message},
      ${recipientIds}::text[], ${formats}::text[], true, CURRENT_TIMESTAMP, true
    FROM assistant_saved_analyses a
    JOIN assistant_conversations c ON (c.tenant_id, c.owner_id, c.id) = (a.tenant_id, a.owner_id, a.conversation_id)
    WHERE a.tenant_id = ${owner.tenantId} AND a.owner_id = ${owner.ownerId}
      AND a.conversation_id = ${input.conversationId} AND a.artifact_id = ${input.artifactId}
      AND c.scope_key = ${scopeKey}
    FOR SHARE OF a, c
    ON CONFLICT (tenant_id, owner_id, immediate_key) DO NOTHING
  `;
  if (inserted) {
    await createAnalysisSharesInTransaction(tx, owner, scopeKey, {
      conversationId: input.conversationId,
      artifactId: input.artifactId,
      recipientIds: recipientIds.filter(recipientId => recipientId !== owner.ownerId)
    });
    return { id };
  }
  const previous = await tx.assistantScheduledReport.findFirst({
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
      sharesCreated: true,
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

export function findScheduledReport(owner: AssistantOwner, scopeKey: string, id: string) {
  return prisma.assistantScheduledReport.findFirst({
    where: { ...owner, id, immediateKey: null, analysis: { conversation: { scopeKey } } }
  });
}

export async function setScheduledReportActive(
  owner: AssistantOwner,
  scopeKey: string,
  id: string,
  active: boolean,
  share?: true
) {
  return prisma.$transaction(tx => setScheduledReportActiveInTransaction(tx, owner, scopeKey, id, active, share));
}

export async function setScheduledReportActiveInTransaction(
  tx: PrismaTransactionClient,
  owner: AssistantOwner,
  scopeKey: string,
  id: string,
  active: boolean,
  share?: true
) {
  const where = { ...owner, id, immediateKey: null, analysis: { conversation: { scopeKey } } };
  const report = await tx.assistantScheduledReport.findFirst({ where });
  if (!report) throw new NotFoundError();
  if (active === report.active) return;
  const recipients = report.recipientIds.filter(recipientId => recipientId !== owner.ownerId);
  if (active && !report.sharesCreated && recipients.length && !share) {
    throw new ConflictError(t('Confirmez le partage de l’analyse pour activer ce rapport.'));
  }
  const nextRunAt = active ? nextReportRun(reportSchedule.parse(report.schedule), new Date()) : null;
  const updated = await tx.assistantScheduledReport.updateMany({
    where: { ...where, active: !active, sharesCreated: report.sharesCreated },
    data: { active, nextRunAt, ...(active ? { sharesCreated: true } : {}) }
  });
  if (updated.count && active && !report.sharesCreated) {
    await createAnalysisSharesInTransaction(tx, owner, scopeKey, {
      conversationId: report.conversationId,
      artifactId: report.artifactId,
      recipientIds: recipients
    });
  }
}
