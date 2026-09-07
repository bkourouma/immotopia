import { PrismaClient } from '@prisma/client';
import { EmailNotificationKey } from '../packages/api/src/constants/email-notification-keys';
import { WhatsappNotificationKey } from '../packages/api/src/constants/whatsapp-notification-keys';

const prisma = new PrismaClient();

export async function notifyChargeCall(chargeCallId: string) {
  // Signature uniquement : la logique détaillée sera implémentée en s’appuyant
  // sur les modules de notifications existants (EmailNotificationConfig, WhatsappNotificationConfig, etc.).
  const _chargeCall = await prisma.chargeCall.findUnique({
    where: { id: chargeCallId },
    include: {
      lot: {
        include: {
          owner: true,
          syndicate: true
        }
      }
    }
  });

  // TODO: Construire le payload et déclencher les notifications:
  // - Email: CHARGE_CALL_ISSUED
  // - WhatsApp: CHARGE_CALL_ISSUED
  const _emailEvent: EmailNotificationKey = 'CHARGE_CALL_ISSUED';
  const _whatsAppEvent: WhatsappNotificationKey = 'CHARGE_CALL_ISSUED';

  return { emailEvent: _emailEvent, whatsappEvent: _whatsAppEvent };
}

export async function notifyMeetingConvocation(meetingId: string) {
  const _meeting = await prisma.generalMeeting.findUnique({
    where: { id: meetingId },
    include: {
      syndicate: {
        include: {
          lots: {
            include: {
              owner: true
            }
          }
        }
      }
    }
  });

  // TODO: Construire le payload et déclencher les notifications:
  // - Email: GENERAL_MEETING_CONVOCATION
  // - WhatsApp: GENERAL_MEETING_CONVOCATION
  const _emailEvent: EmailNotificationKey = 'GENERAL_MEETING_CONVOCATION';
  const _whatsAppEvent: WhatsappNotificationKey = 'GENERAL_MEETING_CONVOCATION';

  return { emailEvent: _emailEvent, whatsappEvent: _whatsAppEvent };
}

