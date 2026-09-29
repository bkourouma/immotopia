/**
 * Propriétaire par défaut d'un nouveau bail (BUG-2026-09-28-021).
 *
 * Règle : le propriétaire vient du bien, jamais d'un rapprochement flou.
 * - bien de l'agence (ownershipType TENANT) : aucun propriétaire par défaut ;
 * - bien d'un propriétaire enregistré : le contact dont l'e-mail (principal ou
 *   secondaire) est EXACTEMENT celui du propriétaire du bien ;
 * - sinon : vide, l'utilisateur choisit.
 */
export interface LeaseOwnerCandidate {
  id: string;
  email?: string | null;
  emailSecondary?: string | null;
}

export interface LeaseOwnerProperty {
  ownershipType?: string | null;
  owner?: { email?: string | null } | null;
}

const normalizeEmail = (value?: string | null): string => (value || '').toLowerCase().trim();

export function findLeaseOwnerContactId(
  property: LeaseOwnerProperty | undefined | null,
  contacts: LeaseOwnerCandidate[]
): string | null {
  if (!property || property.ownershipType === 'TENANT') return null;
  const ownerEmail = normalizeEmail(property.owner?.email);
  if (!ownerEmail) return null;
  const match = contacts.find(
    contact => normalizeEmail(contact.email) === ownerEmail || normalizeEmail(contact.emailSecondary) === ownerEmail
  );
  return match ? match.id : null;
}
