/**
 * Noms affichés du module locatif — une seule règle pour trois écrans.
 *
 * Baux, Échéances et Paiements désignent tous les trois un bail, un bien et un
 * locataire. Tant que chacun appliquait sa propre règle de repli, la même ligne
 * pouvait s'appeler « Villa Riviera » ici et « REF-0042 » là — et on croyait
 * lire deux choses différentes.
 *
 * L'ordre de repli est celui de l'écran Baux, qui faisait déjà autorité :
 * le titre d'abord, l'adresse ensuite, la référence interne en dernier recours.
 * Une référence interne ne dit rien à personne ; elle ne vaut que comme filet.
 */

/** Ce qu'on affiche quand la donnée manque. Un tiret cadratin, jamais vide. */
export const ABSENT = '—';

interface BienNommable {
  title?: string | null;
  address?: string | null;
  internalReference?: string | null;
}

interface PersonneNommable {
  fullName?: string | null;
  email?: string | null;
}

/**
 * Devise affichée d'un paiement : le franc CFA s'écrit « FCFA » partout, quelle
 * que soit la façon dont la ligne l'a enregistré (« CFA », « XOF », « F CFA »).
 */
export function deviseAffichee(devise?: string | null): string {
  const code = (devise ?? '').replace(/s/g, '').toUpperCase();
  return !code || code === 'CFA' || code === 'XOF' || code === 'FCFA' ? 'FCFA' : (devise as string);
}

/** Code ISO pour `Intl.NumberFormat` : le franc CFA d'Afrique de l'Ouest est XOF. */
export function codeDeviseIntl(devise?: string | null): string {
  const affichee = deviseAffichee(devise);
  return affichee === 'FCFA' ? 'XOF' : affichee;
}

/**
 * Nom d'un bien.
 *
 * L'e-mail sert de repli pour une personne, pas pour un bien : un bien sans
 * titre ni adresse n'a que sa référence.
 */
export function nomDuBien(bien?: BienNommable | null): string {
  return bien?.title?.trim() || bien?.address?.trim() || bien?.internalReference?.trim() || ABSENT;
}

/**
 * Nom d'une personne — locataire, propriétaire, payeur.
 *
 * L'adresse électronique prend le relais d'un nom absent : elle identifie
 * toujours quelqu'un, là où un tiret n'identifie personne.
 */
export function nomDeLaPersonne(personne?: PersonneNommable | null): string {
  return personne?.fullName?.trim() || personne?.email?.trim() || ABSENT;
}

/**
 * Options d'un filtre « locataire », dérivées des baux.
 *
 * On ne propose que les locataires qui ont effectivement un bail : un filtre
 * qui ne ramène jamais rien est pire qu'un filtre absent. Le tri suit l'ordre
 * alphabétique français, accents compris.
 */
export function optionsLocatairesDesBaux(
  baux: { primaryRenter?: { id?: string | null; user?: PersonneNommable | null } | null }[] | undefined
): { value: string; label: string }[] {
  const parClient = new Map<string, { value: string; label: string }>();
  for (const bail of baux ?? []) {
    const client = bail.primaryRenter;
    if (!client?.id || parClient.has(client.id)) continue;
    parClient.set(client.id, { value: client.id, label: nomDeLaPersonne(client.user) });
  }
  return [...parClient.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}
