import type { DbClient } from '../dto';
import type { DebtorRecipient } from '../recipient';

/**
 * Destinataire de l'avis de prélèvement d'un copropriétaire (spec 042, P4) :
 * l'e-mail de sa fiche contact CRM, dans la même agence. Les adresses
 * complètes ne quittent jamais ce module vers une réponse d'API.
 */
export async function resolveContactRecipients(
  db: DbClient,
  tenantId: string,
  contactIds: string[]
): Promise<Map<string, DebtorRecipient | null>> {
  const result = new Map<string, DebtorRecipient | null>();
  const ids = [...new Set(contactIds)];
  for (const id of ids) result.set(id, null);
  if (ids.length === 0) return result;
  const contacts = await db.crmContact.findMany({
    // `tenantId` dans le filtre : un contact d'une autre agence ne résout aucune adresse.
    where: { id: { in: ids }, tenantId },
    select: { id: true, email: true }
  });
  for (const contact of contacts) {
    const email = contact.email?.trim();
    if (email) result.set(contact.id, { email, source: 'CONTACT' });
  }
  return result;
}
