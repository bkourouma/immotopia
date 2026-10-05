import crypto from 'crypto';
import { hashesMatch, hashToken } from '../../secure-links/token';

/**
 * Contrôles du webhook Meta WhatsApp Cloud (lot 041, spec W6-R3, W6-R4).
 *
 * TOUJOURS appliqués, quel que soit `NODE_ENV` : aucun contournement hors
 * production (contrairement au contre-modèle `src/routes/whatsapp.webhook.route.ts`).
 */

const SIGNATURE_HEADER_PATTERN = /^sha256=([0-9a-fA-F]{64})$/;

/**
 * Vérifie `X-Hub-Signature-256: sha256=<hex>` : HMAC-SHA256 du corps BRUT reçu
 * (jamais d'un objet re-sérialisé) avec la clé secrète de l'application,
 * comparé à temps constant sur deux tampons de 32 octets.
 */
export function verifyMetaSignature(
  rawBody: Buffer,
  header: string | undefined,
  appSecret: string | undefined
): boolean {
  if (!appSecret || !Buffer.isBuffer(rawBody) || typeof header !== 'string') return false;
  const match = SIGNATURE_HEADER_PATTERN.exec(header.trim());
  if (!match) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return hashesMatch(expected, match[1].toLowerCase());
}

/**
 * Jeton de vérification d'abonnement (`hub.verify_token`), comparé à temps
 * constant : les deux valeurs sont d'abord hachées, ce qui égalise leurs
 * longueurs (`hashesMatch(hashToken(attendu), hashToken(reçu))`).
 */
export function verifyTokenMatches(expected: string | undefined, received: unknown): boolean {
  if (!expected || typeof received !== 'string' || received.length === 0 || received.length > 256) return false;
  return hashesMatch(hashToken(expected), hashToken(received));
}
