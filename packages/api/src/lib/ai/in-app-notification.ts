import { t, type AssistantLanguage } from '../../i18n';
import type { PrismaTransactionClient } from '../../utils/database';
import type { AssistantOwner } from './conversations';

/** The action and its in-app notification commit together with the caller's transaction. */
export function writeAssistantNotification(
  tx: PrismaTransactionClient,
  owner: AssistantOwner,
  recipient: { id: string; fullName: string | null },
  language: AssistantLanguage,
  notice: {
    senderUserId?: string | null;
    key: `ASSISTANT_${string}`;
    title: string;
    body: string;
    link?: string;
    relatedEntityType: string;
    relatedEntityId: string;
  }
) {
  const now = new Date();
  return tx.userNotification.create({
    data: {
      ...notice,
      tenantId: owner.tenantId,
      senderUserId: notice.senderUserId === undefined ? owner.ownerId : notice.senderUserId,
      recipientUserId: recipient.id,
      recipientLabel: recipient.fullName || t('Collaborateur', undefined, language),
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
