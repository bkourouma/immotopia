/**
 * Données personnelles gardées dans `localStorage` et purgées à la déconnexion
 * (constat FRI-11) : sur un poste partagé, le compte suivant ne doit retrouver
 * ni les brouillons d'états des lieux, ni le téléphone d'un payeur, ni les
 * hypothèses de rendement d'un autre.
 *
 * Ce module ne dépend que de `active-tenant.ts` (lui-même sans dépendance) :
 * il peut être importé par `AuthContext` et `api-client` sans charger les
 * écrans ni créer de cycle. Chaque module de stockage y prend sa clé (ou son
 * préfixe) et c'est ici que la purge les retrouve : une clé ajoutée ailleurs
 * sans passer par ce fichier ne serait pas purgée.
 *
 * Purge déclenchée (contre-audit A4) : déconnexion explicite
 * (`AuthContext.logout`), session expirée (`api-client.redirectToLogin`, aussi
 * appelé par `event-stream.ts`), et connexion d'un compte différent du dernier
 * connecté sur ce navigateur (`purgeIfAccountChanged`).
 *
 * Ne sont volontairement PAS listées ici : la préférence de langue (voir
 * `AuthContext.logout`, qui la traite à part) et les préférences non
 * personnelles (type d'agence, dernière copropriété, lieu de magasin...).
 */

import { ACTIVE_TENANT_STORAGE_KEY } from './active-tenant';

/** Brouillons d'états des lieux : une clé par état des lieux. */
export const INSPECTION_DRAFT_KEY_PREFIX = 'immotopia:inspection-draft:';

/** Hypothèses de rendement : une clé par agence et par bien. */
export const YIELD_ASSUMPTIONS_KEY_PREFIX = 'patrimoine:performance:assumptions:';

/** Téléphone mobile money du payeur, portail copropriétaire. */
export const COOWNER_PAYER_PHONE_KEY = 'coowner-portal:payer-phone';

const PERSONAL_KEY_PREFIXES: readonly string[] = [INSPECTION_DRAFT_KEY_PREFIX, YIELD_ASSUMPTIONS_KEY_PREFIX];
/**
 * Empreinte opaque du dernier compte connecté sur ce navigateur : sert
 * seulement à voir qu'un AUTRE compte se connecte. Jamais l'identifiant en
 * clair ni une donnée personnelle ; volontairement hors de la purge, sinon le
 * changement de compte ne serait plus détectable après une déconnexion.
 */
export const LAST_ACCOUNT_KEY = 'immotopia:last-account';

const PERSONAL_EXACT_KEYS: readonly string[] = [COOWNER_PAYER_PHONE_KEY, ACTIVE_TENANT_STORAGE_KEY];

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

/**
 * Empreinte non réversible d'un identifiant (hachage 53 bits « cyrb53 »).
 * Pas un secret : elle n'a qu'à différer d'un compte à l'autre.
 */
function opaqueAccountId(userId: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < userId.length; i += 1) {
    const ch = userId.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * À appeler quand un compte est établi (connexion, reprise de session).
 * Si le dernier compte connecté sur ce navigateur était un AUTRE compte, purge
 * ses données personnelles locales ; mémorise ensuite l'empreinte du compte
 * courant. Sans empreinte antérieure (premier passage), rien n'est purgé :
 * on ne sait pas à qui appartiennent les données, on les garde.
 *
 * Renvoie vrai si une purge a eu lieu. Ne lève jamais.
 */
export function purgeIfAccountChanged(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const current = opaqueAccountId(userId);
  let purged = false;
  try {
    const previous = window.localStorage.getItem(LAST_ACCOUNT_KEY);
    if (previous !== null && previous !== current) {
      purgePersonalLocalData();
      purged = true;
    }
    window.localStorage.setItem(LAST_ACCOUNT_KEY, current);
  } catch {
    // Stockage indisponible ou refusé : rien de mémorisé, rien à purger.
  }
  return purged;
}
