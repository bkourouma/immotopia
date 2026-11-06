/**
 * Nom d'une personne lue dans une réponse du portail propriétaire.
 *
 * L'API renvoie un `User` sous la forme `{ fullName, email }` et un contact sous
 * la forme `{ firstName, lastName, email }` : lire `firstName`/`lastName` sur un
 * utilisateur affichait « undefined undefined » (BUG-2026-11-04-007). Cette
 * fonction accepte les deux formes et retombe sur l'e-mail, puis sur `null`.
 */
export interface PortalPerson {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export function portalPersonName(person: PortalPerson | null | undefined): string | null {
  if (!person) return null;
  const full = person.fullName?.trim();
  if (full) return full;
  const composed = [person.firstName, person.lastName]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(' ');
  if (composed) return composed;
  return person.email?.trim() || null;
}
