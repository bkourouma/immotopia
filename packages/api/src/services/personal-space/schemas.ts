import { z } from 'zod';

/**
 * Corps de `POST /api/personal-space` (lot 4B, specs/026-particuliers-libre-service).
 * `.strict()` : un champ non prevu (`userId`, `tenantId`, `type`...) est rejete,
 * jamais ignore. L'utilisateur vient du jeton, pas du corps.
 */

/** Pays de l'UEMOA acceptes, avec leur indicatif telephonique. */
export const UEMOA_COUNTRY_DIAL_CODES = {
  CI: '225',
  SN: '221',
  BF: '226',
  ML: '223',
  NE: '227',
  TG: '228',
  BJ: '229',
  GW: '245'
} as const;

export type UemoaCountry = keyof typeof UEMOA_COUNTRY_DIAL_CODES;

export const UEMOA_COUNTRIES = Object.keys(UEMOA_COUNTRY_DIAL_CODES) as [UemoaCountry, ...UemoaCountry[]];

const DIAL_CODES = Object.values(UEMOA_COUNTRY_DIAL_CODES);
const PHONE_MIN_DIGITS = 8;
const PHONE_MAX_DIGITS = 15;

/** `+225 07 12 34 56 78` -> `+2250712345678` (espaces, points, tirets et parentheses tolerés). */
export function normalizeUemoaPhone(raw: string): string {
  return raw.trim().replace(/[\s.\-()]/g, '');
}

/** Numero international a indicatif UEMOA, 8 a 15 chiffres au total (indicatif compris). */
export function isValidUemoaPhone(normalized: string): boolean {
  if (!/^\+\d+$/.test(normalized)) return false;
  const digits = normalized.slice(1);
  if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) return false;
  return DIAL_CODES.some(code => digits.startsWith(code));
}

export const createPersonalSpaceSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, 'Le nom est obligatoire.')
      .max(120, 'Le nom ne doit pas dépasser 120 caractères.')
      .refine(value => !value.includes('\u0000'), 'Le nom contient un caractère interdit.'),
    country: z.enum(UEMOA_COUNTRIES, { errorMap: () => ({ message: 'Pays non pris en charge.' }) }),
    phone: z
      .string()
      .max(40)
      .transform(normalizeUemoaPhone)
      .refine(isValidUemoaPhone, 'Numéro de téléphone invalide (format international, ex. +2250712345678).')
      .optional()
  })
  .strict();

export type CreatePersonalSpaceInput = z.infer<typeof createPersonalSpaceSchema>;
