/**
 * Chemins dont un segment est un jeton secret : à masquer avant tout journal.
 * Aujourd'hui : `/api/public/signatures/:token[/...]` (signature électronique,
 * spec 043), où le jeton fait partie du chemin.
 */
const TOKEN_PATH = /^(\/api\/public\/signatures\/)[^/?#]+/;
const MASK = '[masqué]';

/** Remplace le jeton d'un chemin ou d'une URL sensible ; renvoie le reste tel quel. */
export function maskSensitivePath(pathOrUrl: string): string {
  return pathOrUrl.replace(TOKEN_PATH, `$1${MASK}`);
}
