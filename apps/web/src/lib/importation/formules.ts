/**
 * Protection contre l'injection de formules (CSV et Excel).
 *
 * Même logique que `packages/api/src/lib/csv.ts`, reprise côté web sans
 * importer le paquet API. Un texte venu d'un fichier utilisateur qui commence
 * par `=`, `+`, `-` ou `@` serait exécuté comme une formule par un tableur.
 */

const NOMBRE_PUR = /^[-+]?\d+([.,]\d+)?$/;
const DEBUT_FORMULE = /^[\t\r]|^\s*[=+\-@＝＋－＠]/;
const DEBUT_REFUSE = /^[\t\r]|^\s*[=@＝＠]/;

/** Vrai si un tableur exécuterait ce texte comme une formule. */
export function commenceParUneFormule(texte: string): boolean {
  if (!DEBUT_FORMULE.test(texte)) return false;
  if (texte.trim() === '-') return false;
  return !NOMBRE_PUR.test(texte);
}

/** Préfixe d'une apostrophe toute chaîne qui commence par une formule. */
export function neutraliserFormule<T extends string | number | null | undefined>(valeur: T): T | string {
  if (valeur === null || valeur === undefined) return '';
  if (typeof valeur !== 'string') return valeur;
  return commenceParUneFormule(valeur) ? `'${valeur}` : valeur;
}

/**
 * Règle stricte appliquée par les descripteurs à l'import : `=` et `@`
 * (et tabulation / retour chariot) en tête sont refusés ; « - » et « + »
 * restent admis (un titre peut commencer par un tiret, un numéro par +225).
 */
export function estUneFormuleRefusee(texte: string): boolean {
  return DEBUT_REFUSE.test(texte);
}
