/**
 * Numéros de téléphone ivoiriens pour le paiement mobile money déclaré
 * (spec 047, contracts §0).
 *
 * Depuis la réforme de 2021, un numéro national compte 10 chiffres. Règle
 * retenue pour un numéro de RÉCEPTION ou de PAYEUR mobile money :
 *
 * - formats libres acceptés : `0707070707`, `07 07 07 07 07`,
 *   `+225 07 07 07 07 07`, `00225…`, `225…`, avec espaces, points, tirets
 *   ou parenthèses comme séparateurs ;
 * - indicatif pays `225` (précédé de `+` ou `00`, ou nu) suivi des 10 chiffres
 *   nationaux ; un numéro national de 10 chiffres est accepté sans indicatif.
 *   Un numéro de 8 chiffres (ancien format) est REFUSÉ : on ne devine pas le
 *   préfixe que l'opérateur lui aurait donné ;
 * - préfixes MOBILES acceptés : `01` (Moov), `05` (MTN), `07` (Orange) ;
 * - préfixes refusés : `02`, `03`, `25`, `27` (fixes) et tout autre, car on
 *   ne peut pas recevoir un paiement mobile money sur une ligne fixe ;
 * - le résultat est toujours `+225` suivi des 10 chiffres, sans espace.
 */

/** Préfixes (deux premiers chiffres nationaux) des lignes mobiles. */
const MOBILE_PREFIXES = new Set(['01', '05', '07']);

/**
 * Normalise un numéro ivoirien en E.164 (`+225XXXXXXXXXX`), ou `null` s'il
 * n'est pas un numéro mobile ivoirien exploitable.
 */
export function normalizeIvorianMsisdn(input: string): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Seuls les séparateurs usuels et un `+` en tête sont tolérés ; toute lettre refuse.
  if (!/^\+?[\d\s.\-()]+$/.test(trimmed)) return null;

  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    if (!digits.startsWith('225')) return null;
    digits = digits.slice(3);
  } else if (digits.startsWith('00225')) {
    digits = digits.slice(5);
  } else if (digits.startsWith('225') && digits.length === 13) {
    digits = digits.slice(3);
  }

  if (!/^\d{10}$/.test(digits)) return null;
  if (!MOBILE_PREFIXES.has(digits.slice(0, 2))) return null;
  return `+225${digits}`;
}

/** Rendu masqué sûr pour une entrée inexploitable. */
const MASKED_FALLBACK = '•• •• •• •• ••';

/**
 * Masque un numéro E.164 pour l'affichage : `+2250707070712` devient
 * `07 •• •• •• 12` (deux premiers et deux derniers chiffres nationaux).
 * Une entrée invalide donne une chaîne entièrement masquée, sans erreur.
 */
export function maskPhone(e164: string): string {
  const match = typeof e164 === 'string' ? /^\+225(\d{10})$/.exec(e164.trim()) : null;
  if (!match) return MASKED_FALLBACK;
  const national = match[1];
  return `${national.slice(0, 2)} •• •• •• ${national.slice(-2)}`;
}
