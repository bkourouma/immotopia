/**
 * Chemins et paramètres dont la valeur est un jeton secret : à masquer avant
 * tout journal.
 *
 * - Chemin : `/api/public/signatures/:token[/...]` (signature électronique,
 *   spec 044), où le jeton fait partie du chemin.
 * - Query string, sur TOUS les chemins : `token` (vérification d'e-mail,
 *   confirmation et désinscription newsletter…), et les paramètres de
 *   vérification d'abonnement du webhook Meta WhatsApp (`hub.verify_token`,
 *   `hub.challenge`, spec 041 W6-R3).
 */
const TOKEN_PATH = /^(\/api\/public\/signatures\/)[^/?#]+/;
const MASK = '[masqué]';

/** Paramètres de requête dont la valeur n'est jamais écrite en clair dans un journal. */
const MASKED_QUERY_PARAMS = new Set(['token', 'hub.verify_token', 'hub.challenge']);

/** Nom de paramètre décodé (tolérant : `%74oken`, `+`), en minuscules. */
function normalizeParamName(rawName: string): string {
  let name = rawName;
  try {
    name = decodeURIComponent(rawName.replace(/\+/g, ' '));
  } catch {
    // Nom mal encodé : comparé tel quel.
  }
  return name.toLowerCase();
}

/**
 * Remplace par `[masqué]` la valeur des paramètres sensibles de la chaîne de
 * requête d'un chemin ou d'une URL ; renvoie le reste tel quel (le fragment
 * `#...` n'est pas touché). Réutilisable par tout code qui journalise une URL.
 */
export function maskSensitiveQuery(pathOrUrl: string): string {
  const queryStart = pathOrUrl.indexOf('?');
  if (queryStart < 0) return pathOrUrl;
  const fragmentStart = pathOrUrl.indexOf('#', queryStart);
  const queryEnd = fragmentStart < 0 ? pathOrUrl.length : fragmentStart;
  const masked = pathOrUrl
    .slice(queryStart + 1, queryEnd)
    .split('&')
    .map(pair => {
      const separator = pair.indexOf('=');
      const rawName = separator < 0 ? pair : pair.slice(0, separator);
      return MASKED_QUERY_PARAMS.has(normalizeParamName(rawName)) ? `${rawName}=${MASK}` : pair;
    })
    .join('&');
  return `${pathOrUrl.slice(0, queryStart + 1)}${masked}${pathOrUrl.slice(queryEnd)}`;
}

/** Remplace le jeton d'un chemin ou d'une URL sensible (chemin ET query string) ; renvoie le reste tel quel. */
export function maskSensitivePath(pathOrUrl: string): string {
  return maskSensitiveQuery(pathOrUrl.replace(TOKEN_PATH, `$1${MASK}`));
}
