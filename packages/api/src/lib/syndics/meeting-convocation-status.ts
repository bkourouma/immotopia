import { prisma } from '../../utils/database';
import { MARKER_KIND } from '../notification-markers';

/**
 * Vrai si la convocation de l'AG a deja ete envoyee au moins une fois : le journal
 * par copropriétaire (`NotificationMarker`, meme source que `loadConvocationDeliveries`
 * de `notifications.ts`) contient au moins une ligne pour cette assemblee. Filtre
 * agence ; une AG d'une autre agence ne renvoie jamais vrai.
 */
export async function hasMeetingConvocationBeenSent(tenantId: string, meetingId: string): Promise<boolean> {
  const marker = await prisma.notificationMarker.findFirst({
    where: {
      tenantId,
      kind: MARKER_KIND.convocationDelivery,
      entityType: 'GeneralMeeting',
      entityId: meetingId
    },
    select: { id: true }
  });
  return marker !== null;
}
