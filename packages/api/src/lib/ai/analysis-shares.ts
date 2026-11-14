import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../../middleware/error-middleware';
import { prisma } from '../../utils/database';
import type { AssistantOwner } from './conversations';

const metadata = {
  id: true,
  ownerId: true,
  recipientId: true,
  createdAt: true,
  recipient: { select: { fullName: true } },
  analysis: { select: { title: true, conversation: { select: { owner: { select: { fullName: true } } } } } }
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
      ...(sourceScope ? { analysis: { conversation: { scopeKey: sourceScope } } } : {})
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
      createdAt: row.createdAt,
      colleague: incoming ? row.analysis.conversation.owner.fullName : row.recipient.fullName,
      ...(incoming ? {} : { title: row.analysis.title })
    })),
    nextCursor: rows.length > 50 ? rows[49].id : undefined
  };
}

export async function createAnalysisShare(
  owner: AssistantOwner,
  scopeKey: string,
  reference: {
    conversationId: string;
    artifactId: string;
    recipientId: string;
  }
) {
  const { recipientId, ...location } = reference;
  const where = { ...owner, ...location, recipientId };
  await prisma.$executeRaw`
    INSERT INTO assistant_analysis_shares (id, tenant_id, owner_id, conversation_id, artifact_id, recipient_id)
    SELECT ${randomUUID()}, a.tenant_id, a.owner_id, a.conversation_id, a.artifact_id, m.user_id
    FROM assistant_saved_analyses a
    JOIN assistant_conversations c ON (c.tenant_id, c.owner_id, c.id) = (a.tenant_id, a.owner_id, a.conversation_id)
    JOIN memberships m ON m.tenant_id = a.tenant_id AND m.user_id = ${recipientId} AND m.status = 'ACTIVE'
    WHERE a.tenant_id = ${owner.tenantId} AND a.owner_id = ${owner.ownerId}
      AND a.conversation_id = ${location.conversationId} AND a.artifact_id = ${location.artifactId}
      AND c.scope_key = ${scopeKey}
    FOR SHARE OF a, c, m
    ON CONFLICT (tenant_id, owner_id, conversation_id, artifact_id, recipient_id) DO NOTHING
  `;
  const share = await prisma.assistantAnalysisShare.findFirst({ where, select: { id: true } });
  if (!share) throw new NotFoundError();
  return share;
}

export async function revokeAnalysisShare(owner: AssistantOwner, id: string) {
  await prisma.assistantAnalysisShare.deleteMany({ where: { ...owner, id } });
}
