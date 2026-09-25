/**
 * Normalisation des numéros ivoiriens en E.164 — lot SMS-1.
 *
 * Depuis 2021, un numéro local compte 10 chiffres (`0X XX XX XX XX`), et le
 * `0` initial fait partie de ces 10 chiffres : il est conservé, pas retiré,
 * lors du passage en E.164 (`0102030405` -> `+2250102030405`).
 *
 * Accepté : `0102030405`, `01 02 03 04 05` (espaces), `+2250102030405`,
 * `002250102030405`, `2250102030405`.
 * Rejeté (retourne `null`) : ancien format à 8 chiffres, un autre indicatif
 * pays, tout caractère non numérique.
 */
export function normalizeCiPhone(input: string | null | undefined): string | null {
  if (!input) return null;

  const cleaned = input.replace(/[\s.\-]/g, '').trim();
  if (!cleaned) return null;
  // Seuls des chiffres et un éventuel '+' en tête sont acceptés — rejette
  // toute lettre ou caractère spécial restant.
  if (!/^\+?\d+$/.test(cleaned)) return null;

  let local: string;

  if (cleaned.startsWith('+225')) {
    local = cleaned.slice(4);
  } else if (cleaned.startsWith('00225')) {
    local = cleaned.slice(5);
  } else if (cleaned.startsWith('225') && cleaned.length === 13) {
    local = cleaned.slice(3);
  } else if (cleaned.startsWith('+')) {
    // Un autre indicatif pays explicite : jamais deviné.
    return null;
  } else {
    local = cleaned;
  }

  // Format local actuel (post-2021) : exactement 10 chiffres, `0` initial
  // compris. Un numéro à 8 chiffres (ancien format) est rejeté, pas complété.
  if (!/^0\d{9}$/.test(local)) return null;

  return `+225${local}`;
}
