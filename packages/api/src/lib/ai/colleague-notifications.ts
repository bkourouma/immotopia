import { z } from 'zod';
import { isLanguage, t } from '../../i18n';
import { ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { prisma, type PrismaTransactionClient } from '../../utils/database';
import { createAnalysisSharesInTransaction } from './analysis-shares';
import type { AssistantOwner } from './conversations';
import { writeAssistantNotification } from './in-app-notification';
import { sha256Hex } from './plan-hash';

export const colleagueNotificationInput = z
  .object({
    requestId: z.string().uuid(),
    recipientIds: z.array(z.string().uuid()).min(1).max(20),
    message: z.string().trim().min(1).max(1000),
    analysis: z.object({ conversationId: z.string().uuid(), artifactId: z.string().uuid() }).strict().optional(),
    share: z.literal(true).optional()
  })
  .strict();

export async function notifyAssistantColleagues(
  owner: AssistantOwner,
  scopeKey: string | undefined,
  input: z.infer<typeof colleagueNotificationInput>
) {
  return prisma.$transaction(tx => notifyAssistantColleaguesInTransaction(tx, owner, scopeKey, input));
}

export async function notifyAssistantColleaguesInTransaction(
  tx: PrismaTransactionClient,
  owner: AssistantOwner,
  scopeKey: string | undefined,
  input: z.infer<typeof colleagueNotificationInput>
) {
  const recipientIds = [...new Set(input.recipientIds)].sort();
  const peers = recipientIds.filter(id => id !== owner.ownerId);
  const { tenantId, ownerId: senderId } = owner;
  const { analysis, message, requestId } = input;
  if (analysis && !scopeKey) throw new NotFoundError();
  if (analysis && peers.length && !input.share) {
    throw new ConflictError(t('Confirmez le partage de l’analyse pour envoyer la notification.'));
  }
  const requested = { tenantId, senderId, requestId };
  const inputHash = sha256Hex(JSON.stringify([recipientIds, message, analysis?.conversationId, analysis?.artifactId]));
  const inserted = await tx.assistantNotificationRequest.createMany({
    data: { ...requested, inputHash },
    skipDuplicates: true
  });
  if (!inserted.count) {
    const previous = await tx.assistantNotificationRequest.findFirst({
      where: requested,
      select: { inputHash: true }
    });
    if (previous?.inputHash !== inputHash)
      throw new ConflictError(t('Cette confirmation correspond déjà à une autre notification.'));
    return;
  }
  const accounts = await tx.membership.findMany({
    where: {
      tenantId,
      userId: { in: recipientIds },
      status: 'ACTIVE',
      user: {
        isActive: true,
        globalRole: { not: 'SUPER_ADMIN' },
        userRoles: { some: { tenantId, role: { scope: 'TENANT' } } }
      }
    },
    select: { user: { select: { id: true, fullName: true, preferredLanguage: true } } }
  });
  if (accounts.length !== recipientIds.length) throw new NotFoundError();
  if (
    analysis &&
    !(await tx.assistantSavedAnalysis.findFirst({
      where: { ...owner, ...analysis, conversation: { scopeKey } },
      select: { artifactId: true }
    }))
  )
    throw new NotFoundError();
  const shares =
    analysis && scopeKey
      ? await createAnalysisSharesInTransaction(tx, owner, scopeKey, { ...analysis, recipientIds: peers }, false)
      : [];
  const base = `/tenant/${encodeURIComponent(tenantId)}/assistant`;
  for (const { user } of accounts) {
    const language = isLanguage(user.preferredLanguage) ? user.preferredLanguage : 'fr';
    const shareId = shares.find(share => share.recipientId === user.id)?.id;
    const link = shareId
      ? `${base}?partage=${shareId}`
      : analysis && user.id === senderId
        ? `${base}?${new URLSearchParams({ fil: analysis.conversationId, analyse: analysis.artifactId })}`
        : undefined;
    await writeAssistantNotification(tx, owner, user, language, {
      key: 'ASSISTANT_COLLEAGUE_NOTIFICATION',
      title: t('Un message de votre équipe', undefined, language),
      body: message,
      link,
      relatedEntityType: 'AssistantNotificationRequest',
      relatedEntityId: requestId
    });
  }
}
