import { t } from '../../i18n';

/**
 * IBAN et RIB ivoiriens (spec 042, data-model §2).
 *
 * Fonctions pures : aucune base, aucun chiffrement. Les messages sont traduits
 * au moment de l'appel (langue de la requête en cours).
 *
 * - IBAN `CI` : 28 caractères, `CI` + 2 chiffres de contrôle + 24 caractères
 *   de RIB, clé ISO 13616 (reste modulo 97 égal à 1).
 * - RIB UEMOA : 24 caractères = banque (5) + guichet (5) + compte (12) + clé (2).
 *   Converti en IBAN `CI` par calcul des chiffres de contrôle.
 * - Clé RIB : lettres remplacées par la table française, puis
 *   clé = 97 - ((banque·guichet·compte concaténés × 100) mod 97). Les poids
 *   89/15/3 de la formule française ne valent que pour un compte de 11
 *   caractères ; le compte UEMOA en a 12. N'est qu'un avertissement tant que
 *   la banque pilote n'a pas confirmé le calcul.
 */

export const IBAN_LENGTH = 28;
export const RIB_LENGTH = 24;

export interface IbanParsed {
  /** IBAN `CI` normalisé, 28 caractères. Ne sort jamais dans une réponse d'API. */
  iban: string;
  /** Caractères 5 à 9 de l'IBAN. */
  bankCode: string;
  /** 4 derniers caractères de l'IBAN. */
  last4: string;
  /** `CI•• •••• •••• •••• •••• 0589`. */
  masked: string;
  /** Vrai quand la saisie était un RIB converti. */
  fromRib: boolean;
  warnings: string[];
}

export type IbanParseResult = ({ ok: true } & IbanParsed) | { ok: false; error: string };

/** Majuscules, espaces et tirets retirés. */
export function normalizeIban(raw: string): string {
  return raw.replace(/[\s\u00A0\u202F-]+/g, '').toUpperCase();
}

/** Lettres → 10..35, chiffres inchangés. */
function toDigits(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    out += code >= 65 && code <= 90 ? String(code - 55) : char;
  }
  return out;
}

/** Reste modulo 97 d'une très grande suite de chiffres (par tranches, sans BigInt). */
function mod97(digits: string): number {
  let remainder = 0;
  for (let i = 0; i < digits.length; i += 7) {
    remainder = Number(`${remainder}${digits.slice(i, i + 7)}`) % 97;
  }
  return remainder;
}

/** Clé ISO 13616 : vrai quand le reste modulo 97 vaut 1. */
export function isIbanChecksumValid(iban: string): boolean {
  if (!/^[A-Z0-9]+$/.test(iban) || iban.length < 5) return false;
  return mod97(toDigits(iban.slice(4) + iban.slice(0, 4))) === 1;
}

/** Chiffres de contrôle (2 caractères) d'un IBAN `CI` construit sur ce RIB. */
export function computeIbanCheckDigits(rib: string): string {
  const check = 98 - mod97(toDigits(`${rib}CI00`));
  return String(check).padStart(2, '0');
}

const FRENCH_LETTER_TABLE: Record<string, string> = {
  A: '1',
  J: '1',
  B: '2',
  K: '2',
  S: '2',
  C: '3',
  L: '3',
  T: '3',
  D: '4',
  M: '4',
  U: '4',
  E: '5',
  N: '5',
  V: '5',
  F: '6',
  O: '6',
  W: '6',
  G: '7',
  P: '7',
  X: '7',
  H: '8',
  Q: '8',
  Y: '8',
  I: '9',
  R: '9',
  Z: '9'
};

function ribDigits(text: string): string {
  return text.replace(/[A-Z]/g, letter => FRENCH_LETTER_TABLE[letter] ?? '0');
}

/** Clé RIB attendue (2 chiffres) pour les 22 premiers caractères d'un RIB. */
export function expectedRibKey(rib: string): string {
  const body = BigInt(ribDigits(rib.slice(0, 22)));
  const key = 97n - ((body * 100n) % 97n);
  return String(key).padStart(2, '0');
}

/** Vrai quand la clé (2 derniers caractères) d'un RIB de 24 caractères suit le calcul habituel. */
export function isRibKeyConsistent(rib: string): boolean {
  return rib.length === RIB_LENGTH && expectedRibKey(rib) === rib.slice(22);
}

/** Masque d'affichage : aucun chiffre de contrôle visible, seulement les 4 derniers caractères. */
export function maskIban(last4: string): string {
  return `CI•• •••• •••• •••• •••• ${last4}`;
}

/** IBAN en groupes de 4, pour l'autorisation imprimée. */
export function formatIbanGroups(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

/** Normalise puis contrôle une saisie : IBAN `CI` de 28 caractères ou RIB de 24 caractères. */
export function parseIbanInput(raw: string): IbanParseResult {
  const normalized = normalizeIban(raw ?? '');
  if (!normalized) {
    return { ok: false, error: t('Saisissez un IBAN ou un RIB.') };
  }
  if (!/^[A-Z0-9]+$/.test(normalized)) {
    return { ok: false, error: t("L'IBAN ne doit contenir que des lettres et des chiffres.") };
  }

  const warnings: string[] = [];
  let iban: string;
  let fromRib = false;

  if (normalized.length === RIB_LENGTH) {
    fromRib = true;
    iban = `CI${computeIbanCheckDigits(normalized)}${normalized}`;
    if (!isRibKeyConsistent(normalized)) {
      warnings.push(t('La clé RIB ne correspond pas au calcul habituel : vérifiez le RIB auprès du titulaire.'));
    }
  } else {
    if (/^[A-Z]{2}/.test(normalized) && !normalized.startsWith('CI')) {
      return { ok: false, error: t("Seuls les IBAN de Côte d'Ivoire (CI) sont acceptés.") };
    }
    if (normalized.length !== IBAN_LENGTH) {
      return {
        ok: false,
        error: t('Un IBAN ivoirien compte {{iban}} caractères et un RIB {{rib}} ; vous en avez saisi {{count}}.', {
          iban: IBAN_LENGTH,
          rib: RIB_LENGTH,
          count: normalized.length
        })
      };
    }
    if (!/^CI\d{2}[A-Z0-9]{24}$/.test(normalized)) {
      return { ok: false, error: t("Le format de l'IBAN ivoirien est incorrect (CI, 2 chiffres, 24 caractères).") };
    }
    if (!isIbanChecksumValid(normalized)) {
      return { ok: false, error: t("La clé de contrôle de l'IBAN est incorrecte.") };
    }
    iban = normalized;
    // Un IBAN valide porte aussi un RIB : sa clé reste contrôlée, pour avertir seulement.
    if (!isRibKeyConsistent(iban.slice(4))) {
      warnings.push(t('La clé RIB ne correspond pas au calcul habituel : vérifiez le RIB auprès du titulaire.'));
    }
  }

  const last4 = iban.slice(-4);
  return { ok: true, iban, bankCode: iban.slice(4, 9), last4, masked: maskIban(last4), fromRib, warnings };
}
