import { randomBytes } from 'crypto';

/**
 * References de paiement (`codePaiement`) donnees a PaySecureHub.
 *
 * - `IMT-` : loyer paye par un locataire sur le compte de son agence (lot 7).
 * - `IMP-` : facture d'abonnement payee par une agence sur le compte
 *   d'ImmoTopia (vague 3 des abonnements).
 * - `IMS-` : appels de charges d'une copropriete payes par un coproprietaire
 *   sur le compte marchand de LA copropriete (spec 042).
 *
 * Le prefixe discrimine la page du simulateur et le rapprochement ; les deux
 * restent imprevisibles (20 caracteres aleatoires).
 */
export const RENTAL_CODE_PREFIX = 'IMT-';
export const PLATFORM_CODE_PREFIX = 'IMP-';
export const SYNDIC_CODE_PREFIX = 'IMS-';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function generatePlatformCodePaiement(): string {
  return `${PLATFORM_CODE_PREFIX}${randomCode(20)}`;
}

export function isPlatformCodePaiement(code: string | null | undefined): boolean {
  return typeof code === 'string' && code.startsWith(PLATFORM_CODE_PREFIX);
}

/** « IMS- » + 20 caractères aléatoires, imprévisible — spec 042, R12. */
export function generateSyndicCodePaiement(): string {
  return `${SYNDIC_CODE_PREFIX}${randomCode(20)}`;
}

const SYNDIC_CODE_PATTERN = /^IMS-[A-Za-z0-9]{20}$/;

/** Format strict : sert d'aiguillage (IPN, simulateur, tâche) vers le moteur Syndic. */
export function isSyndicCodePaiement(code: string | null | undefined): boolean {
  return typeof code === 'string' && SYNDIC_CODE_PATTERN.test(code);
}
