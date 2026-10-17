import type { DbClient } from './dto';

/**
 * Destinataire de l'avis de prélèvement d'un débiteur (spec 042 P2/P3).
 *
 * Règle (identique à celle de l'envoi) : l'e-mail du compte portail du
 * débiteur s'il existe, sinon celui de sa fiche contact CRM de la même agence
 * (`details.crmContactId`). Les adresses complètes ne quittent jamais ce
 * module vers une réponse d'API : seule `maskEmail` produit ce qui s'affiche.
 */

export type RecipientSource = 'ACCOUNT' | 'CONTACT';
export interface DebtorRecipient {
  email: string;
  source: RecipientSource;
}

const MASK = '•••';
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@.]+$/;

/** `awa.gogoua@example.ci` -> `a•••@ex•••.ci` ; adresse invalide -> `•••`. */
export function maskEmail(email: string | null | undefined): string {
  const value = (email ?? '').trim();
  if (!EMAIL_SHAPE.test(value)) return MASK;
  const at = value.lastIndexOf('@');
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const host = domain.slice(0, dot);
  const extension = domain.slice(dot + 1);
  return `${Array.from(local)[0]}${MASK}@${Array.from(host).slice(0, 2).join('')}${MASK}.${extension}`;
}

/**
 * Destinataire de chaque débiteur (clients de l'agence), `null` sans adresse.
 * Un identifiant d'une autre agence ou inconnu donne `null`.
 */
export async function resolveDebtorRecipients(
  db: DbClient,
  tenantId: string,
  debtorClientIds: string[]
): Promise<Map<string, DebtorRecipient | null>> {
  const result = new Map<string, DebtorRecipient | null>();
  const ids = [...new Set(debtorClientIds)];
  for (const id of ids) result.set(id, null);
  if (ids.length === 0) return result;

  const debtors = await db.tenantClient.findMany({
    where: { id: { in: ids }, tenantId },
    select: { id: true, details: true, user: { select: { email: true } } }
  });
  const missing: Array<{ id: string; contactId: string }> = [];
  for (const debtor of debtors) {
    const own = debtor.user?.email?.trim();
    if (own) {
      result.set(debtor.id, { email: own, source: 'ACCOUNT' });
      continue;
    }
    const contactId = (debtor.details as { crmContactId?: unknown } | null)?.crmContactId;
    if (typeof contactId === 'string' && contactId) missing.push({ id: debtor.id, contactId });
  }
  if (missing.length > 0) {
    const contacts = await db.crmContact.findMany({
      // `tenantId` dans le filtre : un contact copié d'une autre agence ne résout aucune adresse.
      where: { id: { in: [...new Set(missing.map(entry => entry.contactId))] }, tenantId },
      select: { id: true, email: true }
    });
    const byId = new Map(contacts.map(contact => [contact.id, contact.email?.trim() || null]));
    for (const entry of missing) {
      const email = byId.get(entry.contactId);
      if (email) result.set(entry.id, { email, source: 'CONTACT' });
    }
  }
  return result;
}
