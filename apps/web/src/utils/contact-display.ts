import { t } from '../i18n/t';

/**
 * Forme minimale d'un contact CRM pour l'affichage. Tous les champs sont
 * facultatifs : les contrats du dépôt portent le contact tantôt complet
 * (`CrmContact`), tantôt réduit (`{ firstName, lastName }` d'une visite ou
 * d'une affaire).
 */
export interface ContactNameSource {
  contactType?: 'PERSON' | 'COMPANY' | string | null;
  legalName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

/**
 * Nom sous lequel un contact s'affiche, partout (liste, fiche, sélecteurs,
 * baux, biens).
 *
 * Un contact de type Entreprise s'affiche sous sa raison sociale : le prénom
 * et le nom saisis sont ceux de son représentant, obligatoires à la création
 * mais jamais le nom du contact. Une personne s'affiche « prénom nom ». Repli
 * (raison sociale absente, ou nom vide) : l'autre nom disponible, puis l'e-mail,
 * puis « Contact sans nom » — jamais une chaîne vide, une option de liste vide
 * serait impossible à choisir.
 */
export function contactDisplayName(contact: ContactNameSource | null | undefined): string {
  if (!contact) return t('Contact sans nom');
  const legal = contact.legalName?.trim() || '';
  const person = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  if (contact.contactType === 'COMPANY') return legal || person || contact.email?.trim() || t('Contact sans nom');
  // Une personne ne porte normalement pas de raison sociale ; si elle en a une
  // sans nom, elle sert de repli.
  return person || legal || contact.email?.trim() || t('Contact sans nom');
}

/** « Nom (e-mail) » pour les sélecteurs où l'e-mail lève l'ambiguïté. */
export function contactDisplayNameWithEmail(contact: ContactNameSource | null | undefined): string {
  const name = contactDisplayName(contact);
  const email = contact?.email?.trim();
  return email && email !== name ? `${name} (${email})` : name;
}
