import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { env, parseKeyList } from '../../config/env';
import { t } from '../../i18n';
import { BadRequestError } from '../../middleware/error-middleware';
import { decryptSecret } from '../payment-gateway/crypto';

/**
 * Chiffrement des IBAN des mandats de prélèvement (spec 042, PB2-R4).
 *
 * Clé DÉDIÉE (`DIRECT_DEBIT_IBAN_KEY`), distincte de `PAYMENT_SECRETS_KEY`, et
 * versionnée : chaque valeur porte l'identifiant de la clé qui l'a chiffrée,
 * ce qui permet une rotation (`DIRECT_DEBIT_IBAN_PREVIOUS_KEYS`) puis un
 * rechiffrement (`iban-reencryption.ts`).
 *
 * Format stocké dans `DirectDebitMandate.ibanEncrypted` :
 *
 *   ddk1:<keyId>:<iv base64>:<authTag base64>:<ciphertext base64>
 *
 * AES-256-GCM, IV aléatoire de 12 octets. L'identifiant de clé est lié à la
 * valeur par les données associées (`ddk1:<keyId>`) : le modifier la rend
 * illisible. Lecture héritée : une valeur `pg1:` (ancien format, chiffrée avec
 * `PAYMENT_SECRETS_KEY`) reste lisible, mais on n'écrit plus jamais en `pg1`.
 *
 * Aucun message, journal ou exception ne contient l'IBAN, le texte chiffré ou
 * une clé.
 */

const ALGORITHM = 'aes-256-gcm';
const FORMAT_PREFIX = 'ddk1';
const LEGACY_PREFIX = 'pg1';
const IV_LENGTH = 12;
const KEY_ID_SEED = 'immotopia:direct-debit-iban:key-id:';

export type IbanCiphertextKind = 'CURRENT' | 'PREVIOUS_KEY' | 'LEGACY_PAYMENT_KEY' | 'UNKNOWN_KEY' | 'INVALID';

const encryptionUnavailable = () =>
  new BadRequestError(t("Le chiffrement des coordonnées bancaires n'est pas configuré sur ce serveur."));
const unreadable = () => new BadRequestError(t('Les coordonnées bancaires de ce mandat ne peuvent pas être lues.'));

function keyIdOf(key: Buffer): string {
  return createHash('sha256')
    .update(Buffer.concat([Buffer.from(KEY_ID_SEED, 'utf8'), key]))
    .digest('hex')
    .slice(0, 16);
}

function parseKey(value: string | undefined): Buffer | null {
  if (!value) return null;
  const key = Buffer.from(value.trim(), 'base64');
  return key.length === 32 ? key : null;
}

function currentKey(): { key: Buffer; keyId: string } | null {
  const key = parseKey(env.DIRECT_DEBIT_IBAN_KEY);
  return key ? { key, keyId: keyIdOf(key) } : null;
}

/** Trousseau de déchiffrement : clé courante puis anciennes clés, indexées par identifiant. */
function keyring(): Map<string, Buffer> {
  const ring = new Map<string, Buffer>();
  for (const raw of parseKeyList(env.DIRECT_DEBIT_IBAN_PREVIOUS_KEYS)) {
    const key = parseKey(raw);
    if (key) ring.set(keyIdOf(key), key);
  }
  const current = currentKey();
  if (current) ring.set(current.keyId, current.key);
  return ring;
}

/** `true` quand une clé courante valide est configurée : sinon aucun IBAN n'est enregistrable. */
export function isIbanEncryptionAvailable(): boolean {
  return currentKey() !== null;
}

/** Identifiant de la clé courante, ou `null` si elle est absente. */
export function currentIbanKeyId(): string | null {
  return currentKey()?.keyId ?? null;
}

/** Chiffre un IBAN avec la clé courante. Lève si elle est absente. */
export function encryptIban(plain: string): string {
  const current = currentKey();
  if (!current) throw encryptionUnavailable();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, current.key, iv);
  cipher.setAAD(Buffer.from(`${FORMAT_PREFIX}:${current.keyId}`, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    FORMAT_PREFIX,
    current.keyId,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64')
  ].join(':');
}

/**
 * Déchiffre un IBAN (clé courante, ancienne clé, ou ancien format `pg1`).
 * Toute défaillance — clé inconnue, altération, format inconnu, clé héritée
 * absente — lève la même erreur, sans détail technique.
 */
export function decryptIban(encrypted: string): string {
  try {
    const parts = encrypted.split(':');
    if (parts[0] === LEGACY_PREFIX) return decryptSecret(encrypted);
    if (parts.length !== 5 || parts[0] !== FORMAT_PREFIX) throw new Error('format');
    const [, keyId, ivB64, tagB64, ctB64] = parts;
    const key = keyring().get(keyId);
    if (!key) throw new Error('key');
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
    decipher.setAAD(Buffer.from(`${FORMAT_PREFIX}:${keyId}`, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // Les messages de `crypto` ne doivent jamais atteindre un client.
    throw unreadable();
  }
}

/** Classe une valeur chiffrée sans la déchiffrer. */
export function describeIbanCiphertext(encrypted: string): { kind: IbanCiphertextKind; keyId: string | null } {
  const parts = typeof encrypted === 'string' ? encrypted.split(':') : [];
  if (parts[0] === LEGACY_PREFIX && parts.length === 4) return { kind: 'LEGACY_PAYMENT_KEY', keyId: null };
  if (parts[0] !== FORMAT_PREFIX || parts.length !== 5 || !parts[1]) return { kind: 'INVALID', keyId: null };
  const keyId = parts[1];
  if (keyId === currentIbanKeyId()) return { kind: 'CURRENT', keyId };
  if (keyring().has(keyId)) return { kind: 'PREVIOUS_KEY', keyId };
  return { kind: 'UNKNOWN_KEY', keyId };
}

/** `true` quand la valeur n'est pas chiffrée avec la clé courante. */
export function needsIbanReencryption(encrypted: string): boolean {
  return describeIbanCiphertext(encrypted).kind !== 'CURRENT';
}
