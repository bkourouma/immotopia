/**
 * Personnes d'un ticket de maintenance telles que les portails (locataire,
 * propriétaire) les voient : un nom, jamais d'identifiant de compte ni d'e-mail.
 */
export type StaffRef = { id?: string; email?: string; fullName?: string | null } | null | undefined;
export type ContactRef = { firstName?: string | null; lastName?: string | null } | null | undefined;

/** Membre du personnel de l'agence : son nom seulement. */
export function staffNameOnly(user: StaffRef): { fullName: string } | null {
  return user?.fullName ? { fullName: user.fullName } : null;
}

/** Contact CRM auteur d'un commentaire : prénom et nom seulement. */
export function contactNameOnly(contact: ContactRef): { firstName: string | null; lastName: string | null } | null {
  return contact ? { firstName: contact.firstName ?? null, lastName: contact.lastName ?? null } : null;
}
