import crypto from 'crypto';
import { env } from '../../config/env';
import { hashesMatch } from './token';

/**
 * Code à usage unique (spec 044, SG-R4). Même schéma que l'activation de
 * l'inventaire WhatsApp (`lib/stock-whatsapp/registrations/activation.ts`) :
 * 6 chiffres, HMAC-SHA256 à clé serveur dérivée de `JWT_SECRET`, comparaison à
 * temps constant, essais réservés AVANT la comparaison. Limites (essais, renvois,
 * validité, délai entre envois) : `SIGNATURE_OTP_*` de `config/env.ts`.
 * Le code n'est jamais journalisé.
 */

export const OTP_LENGTH = 6;

export function otpLimits() {
  return {
    ttlMs: env.SIGNATURE_OTP_TTL_MINUTES * 60 * 1000,
    maxAttempts: env.SIGNATURE_OTP_MAX_ATTEMPTS,
    /** Envois au total : le premier plus les renvois. */
    maxSends: 1 + env.SIGNATURE_OTP_MAX_RESENDS,
    resendDelayMs: env.SIGNATURE_OTP_RESEND_DELAY_SECONDS * 1000
  };
}

/** Code de 6 chiffres, tiré uniformément (zéros de tête conservés). */
export function generateOtpCode(): string {
  return String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

function otpKey(): Buffer {
  return crypto.createHmac('sha256', env.JWT_SECRET).update('immotopia:signature:otp:v1').digest();
}

/** Empreinte stockée : HMAC-SHA256 hexadécimal lié au signataire. */
export function otpHash(code: string, signerId: string): string {
  return crypto.createHmac('sha256', otpKey()).update(`${code}:${signerId}`, 'utf8').digest('hex');
}

/** Normalise un code saisi (espaces, tirets) ; `null` s'il n'a pas la forme attendue. */
export function normalizeOtpInput(input: string | undefined | null): string | null {
  const digits = String(input ?? '').replace(/[\s-]/g, '');
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(digits) ? digits : null;
}

/** Comparaison à temps constant du code saisi à l'empreinte stockée. */
export function otpMatches(storedHash: string, code: string, signerId: string): boolean {
  return hashesMatch(storedHash, otpHash(code, signerId));
}
