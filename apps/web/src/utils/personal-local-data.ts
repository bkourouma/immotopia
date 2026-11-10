/**
 * Données personnelles gardées dans `localStorage` et purgées à la déconnexion
 * (constat FRI-11) : sur un poste partagé, le compte suivant ne doit retrouver
 * ni les brouillons d'états des lieux, ni le téléphone d'un payeur, ni les
 * hypothèses de rendement d'un autre.
 *
 * Ce module ne dépend de rien : il peut être importé par `AuthContext` sans
 * charger les écrans. Chaque module de stockage y prend sa clé (ou son préfixe)
 * et c'est ici que la purge les retrouve : une clé ajoutée ailleurs sans passer
 * par ce fichier ne serait pas purgée.
 *
 * La préférence de langue n'est volontairement pas listée ici (voir
 * `AuthContext.logout`, qui la traite à part).
 */

/** Brouillons d'états des lieux : une clé par état des lieux. */
export const INSPECTION_DRAFT_KEY_PREFIX = 'immotopia:inspection-draft:';

/** Hypothèses de rendement : une clé par agence et par bien. */
export const YIELD_ASSUMPTIONS_KEY_PREFIX = 'patrimoine:performance:assumptions:';

/** Téléphone mobile money du payeur, portail copropriétaire. */
export const COOWNER_PAYER_PHONE_KEY = 'coowner-portal:payer-phone';

const PERSONAL_KEY_PREFIXES: readonly string[] = [INSPECTION_DRAFT_KEY_PREFIX, YIELD_ASSUMPTIONS_KEY_PREFIX];
const PERSONAL_EXACT_KEYS: readonly string[] = [COOWNER_PAYER_PHONE_KEY];

function isPersonalKey(key: string): boolean {
  return PERSONAL_EXACT_KEYS.includes(key) || PERSONAL_KEY_PREFIXES.some(prefix => key.startsWith(prefix));
}

/** Supprime toutes les clés personnelles. Ne lève jamais (stockage refusé : rien à purger). */
export function purgePersonalLocalData(): void {
  try {
    const storage = window.localStorage;
    // Clés relevées d'abord : supprimer pendant le parcours décalerait les index.
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key !== null && isPersonalKey(key)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Stockage indisponible ou refusé : rien à nettoyer.
  }
}
