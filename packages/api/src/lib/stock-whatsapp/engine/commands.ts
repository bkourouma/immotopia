/**
 * Lecture des textes du chef (lot 041, spec W4-R6, W4-R7, W3-R7, W5-R4).
 *
 * Fonctions pures : aucune base, aucun journal. Les commandes françaises et
 * anglaises sont reconnues quelle que soit la langue du chef (spec §8.5).
 */

export type BotCommand = 'FIN' | 'AIDE' | 'CHANTIER';

/** Majuscules, sans accents, espaces réduits et retirés autour. */
export function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

const COMMANDS: Record<string, BotCommand> = {
  FIN: 'FIN',
  END: 'FIN',
  AIDE: 'AIDE',
  HELP: 'AIDE',
  CHANTIER: 'CHANTIER',
  SITE: 'CHANTIER'
};

/** `FIN` / `END`, `AIDE` / `HELP`, `CHANTIER` / `SITE` (casse, accents et espaces autour ignorés). */
export function parseCommand(value: string): BotCommand | null {
  const normalized = normalizeForMatch(value).replace(/[.!?]+$/, '');
  return COMMANDS[normalized] ?? null;
}

/** Quantité maximale acceptée d'un message (W4-R7). */
export const MAX_TYPED_QUANTITY = 1_000_000;

export type QuantityAnswer = { kind: 'ACCEPT' } | { kind: 'CANCEL' } | { kind: 'NUMBER'; value: number };

/**
 * Réponse à une proposition (W4-R7) : `1` valide, `0` annule, un nombre
 * strictement positif corrige (virgule ou point décimal, 4 décimales au plus,
 * 1 000 000 au plus, unité facultative après le nombre : « 84 », « 84,5 »,
 * « 84 sacs »). Toute autre forme : `null` (M17).
 *
 * « 1 » seul vaut validation ; « 1 sac » est une quantité corrigée à 1.
 */
export function parseQuantityAnswer(value: string): QuantityAnswer | null {
  const match = /^\s*(\d{1,7})(?:[.,](\d{1,4}))?(?:\s*([^\d\s.,][^\d]*))?\s*$/u.exec(value);
  if (!match) return null;
  const [, whole, decimals, unit] = match;
  const number = Number(`${whole}.${decimals ?? '0'}`);
  if (!Number.isFinite(number)) return null;
  if (number === 0) return { kind: 'CANCEL' };
  if (number === 1 && decimals === undefined && unit === undefined) return { kind: 'ACCEPT' };
  if (number > MAX_TYPED_QUANTITY) return null;
  return { kind: 'NUMBER', value: number };
}

/** Réponse à M30 (W5-R4) : `1` additionner, `2` remplacer, `0` annuler. */
export function parseMergeAnswer(value: string): 'ADD' | 'REPLACE' | 'CANCEL' | null {
  const normalized = value.trim();
  if (normalized === '1') return 'ADD';
  if (normalized === '2') return 'REPLACE';
  if (normalized === '0') return 'CANCEL';
  return null;
}

/** Vrai pour « 0 » seul (annulation d'une question en attente). */
export function isZero(value: string): boolean {
  return /^\s*0+(?:[.,]0+)?\s*$/.test(value);
}

/**
 * Chiffres d'un message d'activation (W3-R7) : « 482 913 », « Code 482913 »
 * → `'482913'`. `null` si le message ne contient aucun chiffre (M05).
 */
export function extractActivationDigits(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}
