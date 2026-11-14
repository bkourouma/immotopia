import { randomUUID } from 'node:crypto';
import { isLanguage, t } from '../../i18n';
import { NotFoundError } from '../../middleware/error-middleware';
import { prisma, type PrismaTransactionClient } from '../../utils/database';
import type { AssistantOwner } from './conversations';

const metadata = {
  message: true,
  pinnedAt: true,
  id: true,
  ownerId: true,
  recipientId: true,
  createdAt: true,
  recipient: { select: { fullName: true } },
  analysis: { select: { title: true } },
  conversation: { select: { title: true, owner: { select: { fullName: true } } } }
} as const;

export async function assertAnalysisCollaborator(tenantId: string, userId: string) {
  const member = await prisma.membership.findFirst({
    where: {
      tenantId,
      userId,
      status: 'ACTIVE',
      user: {
        isActive: true,
        globalRole: { not: 'SUPER_ADMIN' },
        userRoles: { some: { tenantId, role: { scope: 'TENANT' } } }
      }
    },
    select: { id: true }
  });
  if (!member) throw new NotFoundError();
}

export function readAnalysisShare(tenantId: string, recipientId: string, id: string, sourceScope?: string) {
  return prisma.assistantAnalysisShare.findFirst({
    where: {
      tenantId,
      recipientId,
      id,
      ...(sourceScope ? { conversation: { scopeKey: sourceScope } } : {})
    },
    select: { ownerId: true, conversationId: true, artifactId: true, analysis: { select: { original: true } } }
  });
}

export async function listAnalysisShares(owner: AssistantOwner, incoming: boolean, cursor?: string) {
  const where = {
    tenantId: owner.tenantId,
    ...(incoming ? { recipientId: owner.ownerId } : { ownerId: owner.ownerId })
  };
  if (
    cursor &&
    !(await prisma.assistantAnalysisShare.findFirst({ where: { ...where, id: cursor }, select: { id: true } }))
  ) {
    throw new NotFoundError();
  }
  const rows = await prisma.assistantAnalysisShare.findMany({
    where,
    select: metadata,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 51,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  return {
    items: rows.slice(0, 50).map(row => ({
      id: row.id,
      pinned: incoming && row.pinnedAt !== null,
      createdAt: row.createdAt,
      message: row.message,
      colleague: incoming ? row.conversation.owner.fullName : row.recipient.fullName,
      kind: row.analysis ? 'artifact' : 'conversation',
      ...(incoming ? {} : { title: row.analysis?.title ?? row.conversation.title })
    })),
    nextCursor: rows.length > 50 ? rows[49].id : undefined
  };
}

type AnalysisShareReference = {
  conversationId: string;
  artifactId?: string;
  recipientIds: string[];
  message?: string;
};

export function createAnalysisShares(owner: AssistantOwner, scopeKey: string, reference: AnalysisShareReference) {
  return prisma.$transaction(tx => createAnalysisSharesInTransaction(tx, owner, scopeKey, reference));
}

export async function createAnalysisSharesInTransaction(
  tx: PrismaTransactionClient,
  owner: AssistantOwner,
  scopeKey: string,
  reference: AnalysisShareReference,
  notifyRecipient = true
) {
  const { recipientIds, message, ...location } = reference;
  const shares = new Map<string, { id: string; recipientId: string }>();
  // Concurrent requests acquire their share rows in the same order.
  for (const recipientId of [...recipientIds].sort()) {
    const where = {
      ...owner,
      conversationId: location.conversationId,
      artifactId: location.artifactId ?? null,
      recipientId
    };
    const id = randomUUID();
    const created = await tx.$executeRaw`
    INSERT INTO assistant_analysis_shares (id, tenant_id, owner_id, conversation_id, artifact_id, recipient_id, message)
    SELECT ${id}::text, c.tenant_id, c.owner_id, c.id, ${location.artifactId ?? null}::text, m.user_id, ${message ?? null}::text
    FROM assistant_conversations c
    JOIN memberships m ON m.tenant_id = c.tenant_id AND m.user_id = ${recipientId} AND m.status = 'ACTIVE'
    WHERE c.tenant_id = ${owner.tenantId} AND c.owner_id = ${owner.ownerId}
      AND c.id = ${location.conversationId}
      AND c.scope_key = ${scopeKey}
      AND (${location.artifactId ?? null}::text IS NULL OR EXISTS (
        SELECT 1 FROM assistant_saved_analyses a
        WHERE (a.tenant_id, a.owner_id, a.conversation_id) = (c.tenant_id, c.owner_id, c.id)
          AND a.artifact_id = ${location.artifactId ?? null}
        FOR SHARE
      ))
    FOR SHARE OF c, m
    ON CONFLICT DO NOTHING
  `;
    const share = await tx.assistantAnalysisShare.findFirst({
      where: {
        ...where,
        conversation: { scopeKey },
        recipient: {
          isActive: true,
          globalRole: { not: 'SUPER_ADMIN' },
          memberships: { some: { tenantId: owner.tenantId, status: 'ACTIVE' } },
          userRoles: { some: { tenantId: owner.tenantId, role: { scope: 'TENANT' } } }
        }
      },
      select: { id: true, recipient: { select: { fullName: true, preferredLanguage: true } } }
    });
    if (!share) throw new NotFoundError();
    // The notification and its in-app delivery commit with the new share. An
    // idempotent retry returns the existing share without notifying again.
    if (created && notifyRecipient) {
      const preferred = share.recipient.preferredLanguage;
      const language = isLanguage(preferred) ? preferred : 'fr';
      const now = new Date();
      await tx.userNotification.create({
        data: {
          tenantId: owner.tenantId,
          recipientUserId: recipientId,
          recipientLabel: share.recipient.fullName || t('Collaborateur', undefined, language),
          senderUserId: owner.ownerId,
          key: 'ASSISTANT_ANALYSIS_SHARED',
          title: location.artifactId
            ? t('Une analyse vous a été partagée', undefined, language)
            : t('Une conversation vous a été partagée', undefined, language),
          body: t('Ouvrez l’assistant pour consulter ce partage.', undefined, language),
          link: `/tenant/${encodeURIComponent(owner.tenantId)}/assistant?partage=${share.id}`,
          relatedEntityType: 'AssistantAnalysisShare',
          relatedEntityId: share.id,
          status: 'SENT',
          sentAt: now,
          deliveries: {
            create: {
              tenantId: owner.tenantId,
              channel: 'IN_APP',
              status: 'SENT',
              attempts: 1,
              sentAt: now,
              lastAttemptAt: now
            }
          }
        },
        select: { id: true }
      });
    }
    shares.set(recipientId, { id: share.id, recipientId });
  }
  return recipientIds.map(recipientId => shares.get(recipientId)!);
}

export async function revokeAnalysisShare(owner: AssistantOwner, id: string) {
  await prisma.assistantAnalysisShare.deleteMany({
    where: {
      tenantId: owner.tenantId,
      id,
      OR: [{ ownerId: owner.ownerId }, { recipientId: owner.ownerId }]
    }
  });
}

export async function setAnalysisSharePin(tenantId: string, recipientId: string, id: string, pinned: boolean) {
  const result = await prisma.assistantAnalysisShare.updateMany({
    where: { tenantId, recipientId, id },
    data: { pinnedAt: pinned ? new Date() : null }
  });
  if (pinned && !result.count) throw new NotFoundError();
}

export function listAnalysisSharePins(tenantId: string, recipientId: string) {
  return prisma.assistantAnalysisShare.findMany({
    where: { tenantId, recipientId, pinnedAt: { not: null } },
    select: { id: true },
    orderBy: [{ pinnedAt: 'desc' }, { id: 'asc' }]
  });
}
