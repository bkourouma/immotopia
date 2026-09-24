import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { env } from '../../config/env';
import { BadRequestError } from '../../middleware/error-middleware';

/**
 * Chiffrement des clés API des agrégateurs de paiement (lot 7).
 *
 * AES-256-GCM : IV aléatoire à chaque appel (jamais réutilisé avec la même
 * clé), balise d'authentification vérifiée au déchiffrement — une valeur
 * altérée en base (bit-flip, tronquage) lève plutôt que de rendre un texte
 * corrompu silencieusement.
 *
 * Format versionné, stocké tel quel dans `api_key_encrypted` :
 *
 *   pg1:<iv base64>:<authTag base64>:<ciphertext base64>
 *
 * Le préfixe `pg1` permet de faire évoluer le format plus tard sans casser
 * les valeurs déjà enregistrées.
 */

const ALGORITHM = 'aes-256-gcm';
const FORMAT_PREFIX = 'pg1';
const IV_LENGTH = 12; // recommandé pour GCM

function secretKey(): Buffer | null {
  if (!env.PAYMENT_SECRETS_KEY) return null;
  const key = Buffer.from(env.PAYMENT_SECRETS_KEY, 'base64');
  return key.length === 32 ? key : null;
}

/** `false` quand `PAYMENT_SECRETS_KEY` est absente ou invalide : aucune clé API n'est alors enregistrable. */
export function isEncryptionAvailable(): boolean {
  return secretKey() !== null;
}

function requireKey(): Buffer {
  const key = secretKey();
  if (!key) {
    throw new BadRequestError(
      "Le chiffrement des clés API n'est pas configuré sur ce serveur (PAYMENT_SECRETS_KEY manquante)."
    );
  }
  return key;
}

/** Chiffre une clé API en clair. Jamais journalisé : n'appeler qu'avec une valeur qui ne partira pas dans un log. */
export function encryptSecret(plaintext: string): string {
  const key = requireKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [FORMAT_PREFIX, iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/**
 * Déchiffre une valeur produite par `encryptSecret`.
 *
 * Lève si la clé de chiffrement manque, si le format est inconnu, ou si la
 * balise d'authentification ne correspond pas (valeur altérée ou chiffrée
 * avec une autre clé) — jamais un texte corrompu rendu tel quel.
 */
export function decryptSecret(encrypted: string): string {
  const key = requireKey();
  const parts = encrypted.split(':');
  if (parts.length !== 4 || parts[0] !== FORMAT_PREFIX) {
    throw new BadRequestError('Clé API chiffrée dans un format inconnu.');
  }
  const [, ivB64, authTagB64, ciphertextB64] = parts;

  try {
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    // `crypto` lève des messages techniques ("Unsupported state or unable to
    // authenticate data") qui ne doivent jamais atteindre un client.
    throw new BadRequestError('Impossible de déchiffrer la clé API : valeur altérée ou clé de chiffrement changée.');
  }
}

/** 4 derniers caractères d'une clé API, pour l'affichage (`•••• 1234`). Jamais la clé entière. */
export function last4(plaintext: string): string {
  return plaintext.slice(-4);
}
