/**
 * Rognage de caractères de bord en temps linéaire (contre-audit de la PR #205).
 *
 * Les formes `/^x+|x+$/g` et `/x+$/` sont quadratiques en V8 sur une longue
 * suite de `x` qui ne touche PAS la fin du texte (`'-'.repeat(n) + 'a'`) : le
 * moteur repart de chaque `x` jusqu'au bout de la suite avant d'échouer sur
 * `$`. Ces fonctions donnent exactement le même résultat avec deux index.
 */

/** Retire au début ET à la fin les caractères dont le code vérifie `isTrimmed`. */
export function trimCharsLinear(value: string, isTrimmed: (code: number) => boolean): string {
  let start = 0;
  let end = value.length;
  while (start < end && isTrimmed(value.charCodeAt(start))) start += 1;
  while (end > start && isTrimmed(value.charCodeAt(end - 1))) end -= 1;
  return start === 0 && end === value.length ? value : value.slice(start, end);
}

/** Retire à la fin seulement les caractères dont le code vérifie `isTrimmed`. */
export function trimEndCharsLinear(value: string, isTrimmed: (code: number) => boolean): string {
  let end = value.length;
  while (end > 0 && isTrimmed(value.charCodeAt(end - 1))) end -= 1;
  return end === value.length ? value : value.slice(0, end);
}

/** Prédicat « le caractère fait partie de `chars` » (caractères BMP uniquement). */
export function charSet(chars: string): (code: number) => boolean {
  const codes = new Set<number>();
  for (let i = 0; i < chars.length; i += 1) codes.add(chars.charCodeAt(i));
  return code => codes.has(code);
}
