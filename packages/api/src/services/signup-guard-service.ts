import { createHmac, hkdfSync } from 'node:crypto';
import { isIPv6 } from 'node:net';
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
 *   la dernière heure. Il est monté APRÈS la validation du corps
 *   (routes/auth-routes.ts) : une requête invalide ne consomme pas de quota.
 *   Seules les tentatives admises sont enregistrées, un refus ne prolonge donc
 *   pas le blocage.
 * - Une adresse IPv6 est regroupée par préfixe /64 (l'allocation usuelle d'un
 *   abonné) avant hachage : sinon un abonné IPv6 change d'adresse à volonté et
 *   contourne le plafond. Une IPv4 mappée en IPv6 (`::ffff:a.b.c.d`) est
 *   ramenée à son IPv4.
 * - L'IP n'est jamais stockée ni journalisée en clair : HMAC-SHA256 avec une
 *   clé dérivée de `JWT_SECRET` par HKDF (même méthode que
 *   `lib/ai/proposal-token.ts`, contexte distinct).
 * - Une requête SQL unique compte la fenêtre et enregistre la tentative si
 *   elle est admise. La purge des lignes de plus de 24 h est une requête à
 *   part, lancée au plus une fois par minute et par processus (et non à chaque
 *   inscription).
 * - Panne de base : fail-open avec un avertissement (une panne ne doit pas
 *   bloquer les inscriptions légitimes).
 *
 * Limites connues : le compte et l'insertion se font dans une seule requête
 * mais sans verrou ; deux requêtes strictement simultanées d'une même IP
 * peuvent toutes deux passer et dépasser le plafond de quelques unités. L'IP
 * vient de `req.ip` (`trust proxy` = 1 dans app.ts) : la topologie de proxys
 * doit être vérifiée au déploiement, et des visiteurs derrière une même IP
 * (CGNAT, agence) partagent un compteur — voir docs/workflows/RUNBOOK.md.
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

/** Hextets d'une adresse IPv6 (forme compressée, zone et IPv4 finale acceptées), ou `null` si illisible. */
function expandIpv6(address: string): number[] | null {
  let text = address.split('%')[0].toLowerCase();
  const v4 = text.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    if (octets.some(o => o > 255)) return null;
    text =
      text.slice(0, text.length - v4[0].length) +
      `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string): number[] => (part === '' ? [] : part.split(':').map(h => parseInt(h, 16)));
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...new Array<number>(halves.length === 2 ? missing : 0).fill(0), ...tail];
  return groups.length === 8 && groups.every(g => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

/**
 * Clé de regroupement d'une adresse : l'IPv4 telle quelle, une IPv4 mappée en
 * IPv6 ramenée à son IPv4, une IPv6 réduite à son préfixe /64.
 */
export function normalizeSignupIp(ip: string | undefined): string {
  if (!ip) return 'inconnue';
  if (!isIPv6(ip.split('%')[0])) return ip;
  const groups = expandIpv6(ip);
  if (!groups) return ip;
  if (groups.slice(0, 5).every(g => g === 0) && groups[5] === 0xffff) {
    return `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`;
  }
  return `${groups
    .slice(0, 4)
    .map(g => g.toString(16))
    .join(':')}::/64`;
}

/** Empreinte non réversible d'une adresse IP (hex, 64 caractères), IPv6 regroupée par /64. */
export function hashSignupIp(ip: string | undefined): string {
  return createHmac('sha256', hashKey()).update(normalizeSignupIp(ip)).digest('hex');
}

/** Intervalle minimal entre deux purges, par processus. */
export const SIGNUP_PURGE_INTERVAL_MS = 60 * 1000;
let lastPurgeAt = 0;

/** Remet à zéro la cadence de purge (tests). */
export function resetSignupPurgeThrottle(): void {
  lastPurgeAt = 0;
}

async function purgeOldAttempts(now: Date): Promise<void> {
  const nowMs = now.getTime();
  // Horloge reculée (tests, correction NTP) : on purge aussi.
  if (nowMs >= lastPurgeAt && nowMs - lastPurgeAt < SIGNUP_PURGE_INTERVAL_MS) return;
  lastPurgeAt = nowMs;
  const purgeBefore = new Date(nowMs - SIGNUP_RETENTION_MS);
  try {
    await prisma.$executeRaw`DELETE FROM "signup_attempts" WHERE "created_at" < ${purgeBefore}::timestamp`;
  } catch (error) {
    logger.warn('Signup guard purge failed', { error: error instanceof Error ? error.message : String(error) });
  }
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
  await purgeOldAttempts(now);

  let recent: number;
  try {
    const rows = await prisma.$queryRaw<Array<{ recent: number }>>`
      WITH counted AS (
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
