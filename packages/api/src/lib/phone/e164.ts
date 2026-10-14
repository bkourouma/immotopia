import { UEMOA_COUNTRY_DIAL_CODES } from '../../services/personal-space/schemas';

/**
 * Numéros de téléphone au format E.164 — inventaire de chantier par WhatsApp
 * (lot 041, spec W3-R3).
 *
 * UNE seule normalisation pour le lot : les quatre `normalizePhone` historiques
 * du dépôt (indicatif 33 par défaut) ne sont ni utilisées ni modifiées.
 *
 * Fonctions pures : aucun accès réseau ni base, aucune journalisation (un
 * numéro n'apparaît jamais en clair dans un journal).
 */

/** Indicatif par défaut : Côte d'Ivoire. */
export const DEFAULT_DIAL_CODE = UEMOA_COUNTRY_DIAL_CODES.CI;

/** `+` puis 8 à 15 chiffres (indicatif compris). Même règle que le CHECK SQL. */
export const E164_PATTERN = /^\+[0-9]{8,15}$/;

const UEMOA_DIAL_CODES: readonly string[] = Object.values(UEMOA_COUNTRY_DIAL_CODES);

/** Séparateurs tolérés à la saisie : espaces, points, tirets, parenthèses, barres obliques. */
const SEPARATORS = /[\s.\-()/]/g;

/**
 * Longueur minimale d'un numéro saisi SANS « + » pour être lu comme déjà
 * international quand il commence par un indicatif UEMOA (indicatif de 3
 * chiffres + 8 chiffres au moins). Un numéro national ivoirien fait 10
 * chiffres et commence par 0 : il n'est jamais lu ainsi.
 */
const INTERNATIONAL_WITHOUT_PLUS_MIN_DIGITS = 11;

/**
 * Normalise un numéro saisi en E.164, ou `null` s'il est invalide.
 *
 * - retire espaces, points, tirets et parenthèses ;
 * - `00` initial → `+` ;
 * - sans `+` : préfixe l'indicatif par défaut (`225`), sauf si le numéro
 *   commence déjà par un indicatif UEMOA et compte au moins 11 chiffres
 *   (`2250712345678`, forme `wa_id`) : il est alors lu comme international ;
 * - exige `+` puis 8 à 15 chiffres.
 *
 * `07 12 34 56 78` → `+2250712345678` ; `+225 07 12 34 56 78` → idem ;
 * `00225 0712345678` → idem ; `12` → `null`.
 */
export function normalizePhoneE164(raw: string, defaultDialCode: string = DEFAULT_DIAL_CODE): string | null {
  if (typeof raw !== 'string') return null;
  if (!/^[0-9]{1,4}$/.test(defaultDialCode)) return null;
  let cleaned = raw.trim().replace(SEPARATORS, '');
  if (cleaned.length === 0 || cleaned.length > 40) return null;

  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`;
  }

  let candidate: string;
  if (cleaned.startsWith('+')) {
    candidate = cleaned;
  } else if (/^[0-9]+$/.test(cleaned)) {
    const alreadyInternational =
      cleaned.length >= INTERNATIONAL_WITHOUT_PLUS_MIN_DIGITS &&
      UEMOA_DIAL_CODES.some(code => cleaned.startsWith(code));
    candidate = alreadyInternational ? `+${cleaned}` : `+${defaultDialCode}${cleaned}`;
  } else {
    return null;
  }

  return E164_PATTERN.test(candidate) ? candidate : null;
}

/**
 * Identifiant WhatsApp (`messages[].from`, `wa_id` : chiffres sans « + »)
 * vers E.164, ou `null` s'il n'en a pas la forme. Aucun indicatif par défaut :
 * Meta rend toujours le numéro international.
 *
 * `2250712345678` → `+2250712345678`.
 */
export function waIdToE164(waId: string): string | null {
  if (typeof waId !== 'string') return null;
  const digits = waId.trim();
  if (!/^[0-9]{8,15}$/.test(digits)) return null;
  return `+${digits}`;
}

/**
 * Numéro masqué pour l'affichage et les journaux : indicatif, deux premiers
 * et deux derniers chiffres du numéro national, le reste en `••`.
 *
 * `+2250712345678` → `+225 07 •• •• •• 78`. Une valeur qui n'est pas en E.164
 * ne révèle rien : `•• •• ••`.
 */
export function maskPhone(e164: string): string {
  if (typeof e164 !== 'string' || !E164_PATTERN.test(e164)) return '•• •• ••';
  const digits = e164.slice(1);
  const dialCode =
    UEMOA_DIAL_CODES.find(code => digits.startsWith(code)) ?? digits.slice(0, Math.min(3, digits.length - 6));
  const national = digits.slice(dialCode.length);
  if (national.length < 6) {
    // Numéro national trop court pour garder quatre chiffres visibles.
    return `+${dialCode} •• ${national.slice(-2)}`;
  }
  const head = national.slice(0, 2);
  const tail = national.slice(-2);
  const hiddenCount = national.length - 4;
  const groups: string[] = [];
  for (let remaining = hiddenCount; remaining > 0; remaining -= 2) {
    groups.push(remaining >= 2 ? '••' : '•');
  }
  return `+${dialCode} ${head} ${groups.join(' ')} ${tail}`;
}
