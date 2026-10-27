/**
 * Garde d'acces : participant NON parti d'une conversation DU tenant.
 * Sinon NotFoundError (jamais 403) : ne confirme pas l'existence. Aucun
 * contournement administrateur ni super-admin sur le contenu.
 */
import { prisma } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import type { MessagingActor } from './types';

export interface ParticipantRow {
  id: string;
  conversationId: string;
  lastReadAt: Date | null;
  joinedAt: Date;
  conversation: { id: string; kind: 'DIRECT' | 'GROUP'; title: string | null };
}

export async function requireParticipant(actor: MessagingActor, conversationId: string): Promise<ParticipantRow> {
  const row = await prisma.conversationParticipant.findFirst({
    where: {
      conversationId,
      tenantId: actor.tenantId,
      userId: actor.userId,
      leftAt: null,
      conversation: { tenantId: actor.tenantId }
    },
    select: {
      id: true,
      conversationId: true,
      lastReadAt: true,
      joinedAt: true,
      conversation: { select: { id: true, kind: true, title: true } }
    }
  });
  if (!row) throw new NotFoundError(t('Conversation introuvable.'));
  return row as ParticipantRow;
}
