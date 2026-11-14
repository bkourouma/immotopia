import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isLanguage, t } from '../../i18n';
import { ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { prisma } from '../../utils/database';
import { createAnalysisSharesInTransaction } from './analysis-shares';
import type { AssistantOwner } from './conversations';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= '0001-01-01';
  });

export const assistantTaskInput = z
  .object({
    requestId: z.string().uuid(),
    assigneeId: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).optional(),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
    dueDate: date.optional(),
    analysis: z
      .object({
        conversationId: z.string().uuid(),
        artifactId: z.string().uuid()
      })
      .strict()
      .optional(),
    share: z.literal(true).optional()
  })
  .strict();

export async function createAssistantTask(
  owner: AssistantOwner,
  scopeKey: string | undefined,
  input: z.infer<typeof assistantTaskInput>
) {
  const { tenantId, ownerId: creatorId } = owner;
  const { requestId, assigneeId, title, priority, analysis } = input;
  const description = input.description || null;
  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  const conversationId = analysis?.conversationId ?? null;
  const artifactId = analysis?.artifactId ?? null;
  if (analysis && !scopeKey) throw new NotFoundError();
  if (analysis && assigneeId !== creatorId && !input.share) {
    throw new ConflictError(t('Confirmez le partage de l’analyse pour créer la tâche.'));
  }
  return prisma.$transaction(async tx => {
    const member = await tx.membership.findFirst({
      where: {
        tenantId,
        userId: assigneeId,
        status: 'ACTIVE',
        user: {
          isActive: true,
          globalRole: { not: 'SUPER_ADMIN' },
          userRoles: { some: { tenantId, role: { scope: 'TENANT' } } }
        }
      },
      select: { user: { select: { fullName: true, preferredLanguage: true } } }
    });
    if (!member) throw new NotFoundError();
    if (
      analysis &&
      !(await tx.assistantSavedAnalysis.findFirst({
        where: { tenantId, ownerId: creatorId, ...analysis, conversation: { scopeKey } },
        select: { artifactId: true }
      }))
    )
      throw new NotFoundError();
    const requested = { tenantId, creatorId, requestId };
    const id = randomUUID();
    const inserted = await tx.assistantTask.createMany({
      data: { id, ...requested, assigneeId, title, description, priority, dueDate, conversationId, artifactId },
      skipDuplicates: true
    });
    if (!inserted.count) {
      const old = await tx.assistantTask.findFirst({ where: requested });
      if (
        !old ||
        old.assigneeId !== assigneeId ||
        old.title !== title ||
        old.description !== description ||
        old.priority !== priority ||
        old.dueDate?.getTime() !== dueDate?.getTime() ||
        old.conversationId !== conversationId ||
        old.artifactId !== artifactId
      ) {
        throw new ConflictError(t('Cette confirmation correspond déjà à une autre tâche.'));
      }
      return { id: old.id };
    }
    if (analysis && scopeKey && assigneeId !== creatorId) {
      const [share] = await createAnalysisSharesInTransaction(
        tx,
        owner,
        scopeKey,
        {
          ...analysis,
          recipientIds: [assigneeId]
        },
        false
      );
      await tx.assistantTask.updateMany({ where: { ...requested, id }, data: { shareId: share.id } });
    }
    const language = isLanguage(member.user.preferredLanguage) ? member.user.preferredLanguage : 'fr';
    const now = new Date();
    await tx.userNotification.create({
      data: {
        tenantId,
        recipientUserId: assigneeId,
        recipientLabel: member.user.fullName || t('Collaborateur', undefined, language),
        senderUserId: creatorId,
        key: 'ASSISTANT_TASK_ASSIGNED',
        title: t('Une tâche vous a été assignée', undefined, language),
        body: t('Ouvrez les tâches de l’assistant pour la consulter.', undefined, language),
        link: `/tenant/${encodeURIComponent(tenantId)}/assistant?tache=${id}`,
        relatedEntityType: 'AssistantTask',
        relatedEntityId: id,
        status: 'SENT',
        sentAt: now,
        deliveries: {
          create: { tenantId, channel: 'IN_APP', status: 'SENT', attempts: 1, sentAt: now, lastAttemptAt: now }
        }
      },
      select: { id: true }
    });
    return { id };
  });
}

export async function listAssistantTasks(owner: AssistantOwner, scopeKey?: string, cursor?: string, focus?: string) {
  const { tenantId, ownerId } = owner;
  const where = { tenantId, OR: [{ creatorId: ownerId }, { assigneeId: ownerId }] };
  if (cursor && !(await prisma.assistantTask.findFirst({ where: { ...where, id: cursor }, select: { id: true } }))) {
    throw new NotFoundError();
  }
  const select = {
    id: true,
    title: true,
    description: true,
    priority: true,
    dueDate: true,
    completedAt: true,
    createdAt: true,
    creatorId: true,
    assigneeId: true,
    conversationId: true,
    artifactId: true,
    shareId: true,
    creator: { select: { fullName: true } },
    assignee: { select: { fullName: true } }
  } as const;
  const rows = await prisma.assistantTask.findMany({
    where,
    select,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 51,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  const page = rows.slice(0, 50);
  if (focus && !cursor && !page.some(task => task.id === focus)) {
    const focused = await prisma.assistantTask.findFirst({ where: { ...where, id: focus }, select });
    if (focused) page.unshift(focused);
  }
  const links = page.flatMap(row =>
    row.creatorId === ownerId && row.conversationId && row.artifactId
      ? [{ conversationId: row.conversationId, artifactId: row.artifactId }]
      : []
  );
  const shareIds = page.flatMap(row => (row.assigneeId === ownerId && row.shareId ? [row.shareId] : []));
  const [analyses, shares] = await Promise.all([
    scopeKey && links.length
      ? prisma.assistantSavedAnalysis.findMany({
          where: { ...owner, conversation: { scopeKey }, OR: links },
          select: { conversationId: true, artifactId: true }
        })
      : [],
    shareIds.length
      ? prisma.assistantAnalysisShare.findMany({
          where: { tenantId, recipientId: ownerId, id: { in: shareIds } },
          select: { id: true }
        })
      : []
  ]);
  return {
    items: page.map(({ creatorId, assigneeId, conversationId, artifactId, shareId, dueDate, ...task }) => {
      const analysis =
        creatorId === ownerId && analyses.find(a => a.conversationId === conversationId && a.artifactId === artifactId);
      return {
        ...task,
        dueDate: dueDate?.toISOString().slice(0, 10) ?? null,
        canComplete: assigneeId === ownerId,
        ...(analysis ? { analysis } : shareId && shares.some(share => share.id === shareId) ? { shareId } : {})
      };
    }),
    nextCursor: rows.length > 50 ? rows[49].id : undefined
  };
}

export async function setAssistantTaskCompleted(owner: AssistantOwner, id: string, completed: boolean) {
  const where = { tenantId: owner.tenantId, assigneeId: owner.ownerId, id };
  const result = await prisma.assistantTask.updateMany({
    where: { ...where, completedAt: completed ? null : { not: null } },
    data: { completedAt: completed ? new Date() : null }
  });
  if (!result.count && !(await prisma.assistantTask.findFirst({ where, select: { id: true } }))) {
    throw new NotFoundError();
  }
}
