import { createHmac, hkdfSync } from 'node:crypto';
import { env } from '../config/env';
import { AppError } from '../middleware/error-middleware';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';

/**
 * Limiteur d'inscription par adresse IP, résistant au redémarrage et aux
 * instances multiples : l'état vit dans PostgreSQL (`signup_attempts`) et non
 * dans la mémoire du processus (le dépôt n'a ni Redis ni magasin partagé pour
 * `express-rate-limit`).
 *
 * - Fenêtre GLISSANTE : au plus `SIGNUP_MAX_PER_WINDOW` inscriptions par IP sur
 *   la dernière heure. Seules les tentatives acceptées sont enregistrées, un
 *   refus ne prolonge donc pas le blocage.
 * - L'IP n'est jamais stockée ni journalisée en clair : HMAC-SHA256 avec une
 *   clé dérivée de `JWT_SECRET` par HKDF (même méthode que
 *   `lib/ai/proposal-token.ts`, contexte distinct).
 * - Une requête SQL unique purge les lignes de plus de 24 h, compte la fenêtre
 *   et enregistre la tentative si elle est admise.
 * - Panne de base : fail-open avec un avertissement (une panne ne doit pas
 *   bloquer les inscriptions légitimes).
 *
 * Limite connue : le compte et l'insertion se font dans une seule requête mais
 * sans verrou ; deux requêtes strictement simultanées d'une même IP peuvent
 * toutes deux passer et dépasser le plafond de quelques unités. L'IP vient de
 * `req.ip` (`trust proxy` = 1 dans app.ts) : derrière un proxy mal configuré,
 * tous les visiteurs partageraient un compteur.
 */

export const SIGNUP_MAX_PER_WINDOW = 3;
export const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
export const SIGNUP_RETENTION_MS = 24 * 60 * 60 * 1000;

const HKDF_SALT = 'immotopia/signup-guard';
const HKDF_INFO = 'ip-hash/v1';

let cachedKey: Buffer | null = null;
let cachedKeySource: string | null = null;

function hashKey(): Buffer {
  const secret = env.JWT_SECRET;
  if (!cachedKey || cachedKeySource !== secret) {
    cachedKey = Buffer.from(hkdfSync('sha256', secret, HKDF_SALT, HKDF_INFO, 32));
    cachedKeySource = secret;
  }
  return cachedKey;
}

/** Empreinte non réversible d'une adresse IP (hex, 64 caractères). */
export function hashSignupIp(ip: string | undefined): string {
  return createHmac('sha256', hashKey())
    .update(ip || 'inconnue')
    .digest('hex');
}

export class SignupRateLimitedError extends AppError {
  constructor() {
    super("Trop de tentatives d'inscription. Veuillez réessayer dans une heure.", 429, 'SIGNUP_RATE_LIMITED');
  }
}

/**
 * Enregistre une tentative d'inscription depuis `ip` et lève
 * `SignupRateLimitedError` (429) si le plafond de l'heure écoulée est atteint.
 */
export async function assertSignupAllowed(ip: string | undefined, now: Date = new Date()): Promise<void> {
  const ipHash = hashSignupIp(ip);
  const windowStart = new Date(now.getTime() - SIGNUP_WINDOW_MS);
  const purgeBefore = new Date(now.getTime() - SIGNUP_RETENTION_MS);

  let recent: number;
  try {
    const rows = await prisma.$queryRaw<Array<{ recent: number }>>`
      WITH purged AS (
        DELETE FROM "signup_attempts" WHERE "created_at" < ${purgeBefore}::timestamp
      ),
      counted AS (
        SELECT COUNT(*)::int AS recent
        FROM "signup_attempts"
        WHERE "ip_hash" = ${ipHash} AND "created_at" >= ${windowStart}::timestamp
      ),
      inserted AS (
        INSERT INTO "signup_attempts" ("ip_hash", "created_at")
        SELECT ${ipHash}, ${now}::timestamp FROM counted WHERE recent < ${SIGNUP_MAX_PER_WINDOW}
        RETURNING 1
      )
      SELECT recent FROM counted`;
    recent = Number(rows[0]?.recent ?? 0);
  } catch (error) {
    logger.warn('Signup guard unavailable, request allowed (fail-open)', {
      error: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  if (recent >= SIGNUP_MAX_PER_WINDOW) {
    logger.warn('Signup rate limit reached', { ipHash: ipHash.slice(0, 12) });
    throw new SignupRateLimitedError();
  }
}
