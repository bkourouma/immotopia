/**
 * Cible de redirection sûre (anti « open redirect », constat FRI-03).
 *
 * Une cible reçue dans l'URL (`?redirect=`) ou d'un appelant n'est suivie que
 * si c'est un chemin interne de l'application. Sont refusés : tout ce qui ne
 * commence pas par « / » seul (`//evil.com`, `https://…`, `javascript:…`),
 * toute barre oblique inverse (`/\evil.com`, que les navigateurs lisent comme
 * `//evil.com`), sa forme encodée (`%5C`), les caractères de contrôle
 * (tabulation, retour à la ligne… que le parseur d'URL supprime avant
 * d'analyser) et tout chemin dont l'origine résolue diffère de celle de la page.
 */

/** Chemin interne : un « / » qui n'est suivi ni d'un autre « / » ni d'un « \ ». */
const INTERNAL_PATH = /^\/(?![/\\])/;
// eslint-disable-next-line no-control-regex -- on cherche précisément ces caractères
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;
const ENCODED_BACKSLASH = /%5c/i;

/** Le chemin résolu reste interne, tel quel comme une fois décodé. Décodage impossible : refusé. */
function isInternalPathname(pathname: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  return [pathname, decoded].every(path => INTERNAL_PATH.test(path) && !path.includes('\\'));
}

function currentOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
}

/**
 * Renvoie `chemin + requête + ancre` si `target` est un chemin interne sûr,
 * sinon `fallback`.
 */
export function getSafeRedirectPath<T extends string | null>(
  target: string | null | undefined,
  fallback: T,
  origin: string = currentOrigin()
): string | T {
  if (!target) return fallback;
  if (CONTROL_CHARACTERS.test(target) || ENCODED_BACKSLASH.test(target) || target.includes('\\')) return fallback;
  if (!INTERNAL_PATH.test(target)) return fallback;
  try {
    const url = new URL(target, origin);
    if (url.origin !== origin) return fallback;
    // Le contrôle ci-dessus porte sur la chaîne brute, mais c'est le chemin
    // NORMALISÉ par `new URL` qui est renvoyé : `/.//evil.com`,
    // `/a/..//evil.com` ou `/%2e%2e//evil.com` deviennent `//evil.com`, que
    // le navigateur lirait comme une autre origine. On revérifie donc le
    // résultat lui-même, brut puis décodé (`/%2f%2fevil.com` deviendrait
    // `//evil.com` chez un appelant qui décode le chemin).
    if (!isInternalPathname(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
