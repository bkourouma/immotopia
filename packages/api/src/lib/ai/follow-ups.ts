import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { t } from '../../i18n';
import { AppError, ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { listAssignableMembers } from '../../services/membership-service';
import { prisma, type PrismaTransactionClient } from '../../utils/database';
import { assertAnalysisCollaborator } from './analysis-shares';
import { colleagueNotificationInput, notifyAssistantColleaguesInTransaction } from './colleague-notifications';
import type { CopilotArtifact, FollowUpProposal } from './contracts';
import type { AssistantOwner } from './conversations';
import { reportScheduleInput } from './report-schedule';
import {
  createScheduledReportDraft,
  immediateReportInput,
  queueImmediateReportInTransaction,
  resolveReportSchedule,
  scheduledReportInput,
  setScheduledReportActiveInTransaction
} from './scheduled-reports';
import { assistantTaskInput, createAssistantTaskInTransaction } from './tasks';

const recipients = z.array(z.string().trim().min(1).max(160)).min(1).max(20);
const artifactId = z.string().uuid();
const formats = z
  .array(z.enum(['pdf', 'xlsx', 'csv']))
  .min(1)
  .max(3);
export const followUpInput = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('notify'),
      recipients,
      artifactId: artifactId.optional(),
      message: z.string().trim().min(1).max(1000)
    })
    .strict(),
  z
    .object({
      kind: z.literal('task'),
      recipients: recipients.length(1),
      artifactId: artifactId.optional(),
      title: z.string().trim().min(1).max(120),
      message: z.string().trim().max(2000).optional(),
      dueDate: assistantTaskInput.shape.dueDate,
      priority: assistantTaskInput.shape.priority
    })
    .strict(),
  z
    .object({
      kind: z.literal('email'),
      recipients,
      artifactId,
      formats,
      message: z.string().trim().max(2000).optional()
    })
    .strict(),
  z.object({ kind: z.literal('schedule'), recipients, artifactId, formats, schedule: reportScheduleInput }).strict()
]);
export type FollowUpInput = z.infer<typeof followUpInput>;
const storedInput = z
  .object({ action: followUpInput, recipientIds: z.array(z.string().uuid()).min(1).max(20) })
  .strict();

const fold = (name: string) => name.normalize('NFKC').trim().toLowerCase();

export async function proposeFollowUp(
  owner: AssistantOwner,
  turnId: string,
  requested: FollowUpInput,
  artifact?: CopilotArtifact
): Promise<FollowUpProposal> {
  if (requested.artifactId && artifact?.id !== requested.artifactId) throw new NotFoundError();
  const input =
    requested.kind === 'schedule'
      ? { ...requested, schedule: await resolveReportSchedule(owner.tenantId, requested.schedule) }
      : requested;
  const available = (await listAssignableMembers(owner.tenantId)).filter(member => member.roles.length);
  const recipients = new Map<string, string>();
  for (const name of input.recipients) {
    const key = fold(name);
    const matches = available.filter(member =>
      key === '@me' ? member.userId === owner.ownerId : fold(member.displayName) === key
    );
    if (matches.length !== 1) throw new AppError(t('Destinataire inconnu ou ambigu. Précisez son nom complet.'), 422);
    const member = matches[0];
    await assertAnalysisCollaborator(owner.tenantId, member.userId);
    recipients.set(member.userId, member.displayName);
  }
  const display = {
    recipients: [...recipients.values()],
    ...(artifact
      ? { artifactTitle: artifact.title, sharesAnalysis: [...recipients.keys()].some(id => id !== owner.ownerId) }
      : {}),
    ...('message' in input && input.message ? { message: input.message } : {}),
    ...(input.kind === 'task'
      ? { title: input.title, priority: input.priority, ...(input.dueDate ? { dueDate: input.dueDate } : {}) }
      : {}),
    ...('formats' in input ? { formats: [...new Set(input.formats)] } : {}),
    ...(input.kind === 'schedule' ? { schedule: input.schedule } : {})
  };
  const id = randomUUID();
  const result = await prisma.$executeRaw`
    INSERT INTO assistant_follow_ups (id, tenant_id, owner_id, turn_id, kind, payload, display)
    SELECT ${id}, tenant_id, owner_id, id, ${input.kind},
      ${JSON.stringify({ action: input, recipientIds: [...recipients.keys()] })}::jsonb, ${JSON.stringify(display)}::jsonb
    FROM assistant_turns
    WHERE tenant_id = ${owner.tenantId} AND owner_id = ${owner.ownerId} AND id = ${turnId} AND outcome IS NULL
    FOR SHARE
  `;
  if (!result) throw new NotFoundError();
  return { id, kind: input.kind, status: 'PENDING', display };
}

const followUpWhere = (owner: AssistantOwner, scopeKey: string, id: string) => ({
  ...owner,
  id,
  turn: { conversation: { scopeKey } }
});

export async function getFollowUp(owner: AssistantOwner, scopeKey: string, id: string) {
  const row = await prisma.assistantFollowUp.findFirst({
    where: followUpWhere(owner, scopeKey, id),
    select: { status: true, payload: true, turn: { select: { outcome: true, conversationId: true } } }
  });
  if (!row) throw new NotFoundError();
  if (!row.turn.outcome) throw new ConflictError(t('Attendez la fin de la réponse avant de confirmer cette action.'));
  return { ...row, ...storedInput.parse(row.payload) };
}

export async function decideFollowUp(
  owner: AssistantOwner,
  scopeKey: string,
  id: string,
  status: 'CONFIRMED' | 'DECLINED' | 'FAILED',
  execute?: (tx: PrismaTransactionClient) => Promise<void>
) {
  const where = followUpWhere(owner, scopeKey, id);
  return prisma.$transaction(
    async tx => {
      const updated = await tx.assistantFollowUp.updateMany({
        where: { ...where, status: 'PENDING', turn: { outcome: { not: null }, conversation: { scopeKey } } },
        data: { status }
      });
      if (updated.count) {
        if (execute) await execute(tx);
        return status;
      }
      const row = await tx.assistantFollowUp.findFirst({ where, select: { status: true } });
      if (!row) throw new NotFoundError();
      return row.status;
    },
    { timeout: 15_000 }
  );
}

export async function executeFollowUp(
  tx: PrismaTransactionClient,
  owner: AssistantOwner,
  scopeKey: string,
  id: string,
  { action, recipientIds, turn }: Awaited<ReturnType<typeof getFollowUp>>
) {
  const analysis = action.artifactId
    ? { artifactId: action.artifactId, conversationId: turn.conversationId }
    : undefined;
  const common = { requestId: id, recipientIds, analysis, share: true };
  switch (action.kind) {
    case 'notify':
      await notifyAssistantColleaguesInTransaction(
        tx,
        owner,
        scopeKey,
        colleagueNotificationInput.parse({ ...common, message: action.message })
      );
      break;
    case 'task':
      await createAssistantTaskInTransaction(
        tx,
        owner,
        scopeKey,
        assistantTaskInput.parse({
          requestId: id,
          analysis,
          share: true,
          assigneeId: recipientIds[0],
          title: action.title,
          description: action.message,
          priority: action.priority,
          dueDate: action.dueDate
        })
      );
      break;
    case 'email':
      await queueImmediateReportInTransaction(
        tx,
        owner,
        scopeKey,
        immediateReportInput.parse({
          ...analysis,
          requestId: id,
          share: true,
          recipientIds,
          formats: action.formats,
          message: action.message
        })
      );
      break;
    case 'schedule': {
      const report = await createScheduledReportDraft(
        owner,
        scopeKey,
        scheduledReportInput.parse({
          ...analysis,
          recipientIds,
          formats: action.formats,
          schedule: action.schedule
        }),
        tx
      );
      await setScheduledReportActiveInTransaction(tx, owner, scopeKey, report.id, true, true);
      break;
    }
  }
}
