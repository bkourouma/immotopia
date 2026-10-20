import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import type { NotifyRecipient } from './types';

export interface ResolvedRecipient {
  userId: string | null;
  contactId: string | null;
  label: string;
  email: string | null;
  phone: string | null;
}

/** Libelle d'un compte. Jamais le User complet : seulement ces trois champs. */
export function userLabel(user: { email: string; fullName: string | null }): string {
  return user.fullName?.trim() || user.email;
}

function contactLabel(c: { firstName: string; lastName: string; legalName: string | null }): string | null {
  const person = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
  return person || c.legalName?.trim() || null;
}

function warn(message: string, meta: Record<string, unknown>, error: unknown): void {
  logger.warn(message, { ...meta, error: error instanceof Error ? error.message : String(error) });
}

/**
 * Complete un destinataire depuis son compte (libelle, e-mail). Ne leve jamais :
 * si le compte est illisible, on garde ce que l'appelant a fourni.
 *
 * Avec `tenantId`, un destinataire sans `userId` est recherche : d'abord son
 * contact CRM (libelle, e-mail, telephone), puis le compte `User` qui porte cet
 * e-mail ET appartient a l'agence (membre ACTIF ou client portail). Ainsi
 * l'envoi apparait dans le centre de notifications de la personne. Select
 * explicite : jamais le User complet.
 */
export async function resolveRecipient(recipient: NotifyRecipient, tenantId?: string): Promise<ResolvedRecipient> {
  let account: { id?: string; email: string; fullName: string | null } | null = null;
  let userId: string | null = recipient.userId ?? null;
  let email: string | null = recipient.email ?? null;
  let phone: string | null = recipient.phone ?? null;
  let contactName: string | null = null;

  if (recipient.userId) {
    try {
      account = await prisma.user.findUnique({
        where: { id: recipient.userId },
        select: { id: true, email: true, fullName: true }
      });
    } catch (error) {
      warn('Notification: compte destinataire illisible', { userId: recipient.userId }, error);
    }
  } else if (tenantId) {
    if (recipient.contactId) {
      try {
        const contact = await prisma.crmContact.findFirst({
          where: { id: recipient.contactId, tenantId },
          select: {
            firstName: true,
            lastName: true,
            legalName: true,
            email: true,
            phonePrimary: true,
            whatsappNumber: true
          }
        });
        if (contact) {
          contactName = contactLabel(contact);
          email = email ?? contact.email ?? null;
          phone = phone ?? contact.whatsappNumber ?? contact.phonePrimary ?? null;
        }
      } catch (error) {
        warn('Notification: contact destinataire illisible', { contactId: recipient.contactId }, error);
      }
    }
    const address = email?.trim();
    if (address) {
      try {
        account = await prisma.user.findFirst({
          where: {
            email: { equals: address, mode: 'insensitive' },
            OR: [{ memberships: { some: { tenantId, status: 'ACTIVE' } } }, { clientProfiles: { some: { tenantId } } }]
          },
          select: { id: true, email: true, fullName: true }
        });
        userId = account?.id ?? null;
      } catch (error) {
        warn('Notification: compte du destinataire introuvable', { tenantId }, error);
      }
    }
  }

  return {
    userId,
    contactId: recipient.contactId ?? null,
    label:
      recipient.label?.trim() ||
      (account ? userLabel(account) : contactName || email?.trim() || 'Destinataire inconnu'),
    email: email ?? account?.email ?? null,
    phone
  };
}
