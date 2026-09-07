/**
 * Résout un CrmContact par tenant + email pour l'envoi WhatsApp.
 * Retourne l'id du contact si trouvé avec consent_whatsapp et un numéro (whatsapp_number ou phone_primary).
 */
import { prisma } from '../utils/database';

export async function getCrmContactIdForWhatsApp(tenantId: string, email: string): Promise<string | null> {
  if (!email?.trim()) return null;
  const contact = await prisma.crmContact.findFirst({
    where: {
      tenantId,
      email: { equals: email.trim(), mode: 'insensitive' },
      consentWhatsapp: true
    },
    select: {
      id: true,
      whatsappNumber: true,
      phonePrimary: true
    }
  });
  if (!contact) return null;
  const hasPhone = (contact.whatsappNumber?.trim() || contact.phonePrimary?.trim()) ?? '';
  return hasPhone ? contact.id : null;
}
