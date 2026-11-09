import { createHmac, hkdfSync } from 'node:crypto';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { normalizeSignupIp } from './signup-guard-service';

/**
 * Verrou temporaire des connexions (audit AUTH-01).
 *
 * Complète le limiteur par IP (`loginRateLimiter`) : un attaquant qui change
 * d'IP ne peut plus essayer des mots de passe sans fin sur un même compte.
 *
 * DEUX compteurs, pour ne pas offrir à un tiers le moyen d'enfermer un compte :
 *
 * 1. Verrou DUR par PAIRE (e-mail, IP) : à partir de
 *    `LOGIN_THROTTLE_MAX_FAILURES` (10) échecs dans la fenêtre, verrou
 *    `15 s × 2^(n − 10)` plafonné à 15 min. L'IP est normalisée comme à
 *    l'inscription (`normalizeSignupIp` : IPv6 regroupée par /64, IPv4 mappée
 *    ramenée à son IPv4 ; sans IP, la clé « inconnue »). Un tiers qui martèle
 *    un compte depuis SA connexion ne verrouille que sa propre paire : le
 *    titulaire, depuis la sienne, n'est pas touché.
 * 2. Compteur GLOBAL par e-mail (toutes IP confondues) : au-delà de
 *    `LOGIN_THROTTLE_GLOBAL_MAX_FAILURES` (50) échecs dans la fenêtre, un
 *    verrou COURT et FIXE de `LOGIN_THROTTLE_GLOBAL_LOCK_MS` (15 s) — jamais
 *    d'escalade, pas de prolongation pendant le verrou, compteur remis à zéro
 *    en l'engageant. Il freine une attaque distribuée sans permettre un
 *    verrouillage durable.
 *
 * Les tentatives faites PENDANT un verrou ne sont comptées nulle part. Un
 * succès remet à zéro la paire ET le compteur global de l'e-mail ; une
 * réinitialisation de mot de passe efface les deux (`clearEmailThrottle`).
 * Les échecs sont comptés pour TOUT e-mail, connu ou non : la réponse ne
 * trahit pas l'existence du compte.
 *
 * Clés : HMAC-SHA256 (e-mail normalisé par trim + minuscules, et IP normalisée
 * pour la paire) avec une clé dérivée de `JWT_SECRET` par HKDF (même méthode que
 * `signup-guard-service.ts`, contexte distinct). Ni e-mail ni IP en clair dans
 * les Maps ou les journaux.
 *
 * LIMITES CONNUES : l'état est en MÉMOIRE, par processus (comme les limiteurs
 * `express-rate-limit` du dépôt) : perdu au redémarrage, NON partagé entre
 * instances (avec N instances les plafonds effectifs sont multipliés par N).
 * Chaque Map est bornée (`LOGIN_THROTTLE_MAX_ENTRIES`, éviction des plus
 * anciennes). Derrière un CGNAT ou une agence, des utilisateurs partagent une
 * IP donc une paire par e-mail seulement : pas d'effet croisé entre comptes.
 * Une attaque distribuée sur de très nombreuses IP n'est freinée que par le
 * verrou global court (15 s par tranche de 50 échecs).
 */

export const LOGIN_THROTTLE_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_THROTTLE_MAX_FAILURES = 10;
export const LOGIN_THROTTLE_BASE_LOCK_MS = 15 * 1000;
export const LOGIN_THROTTLE_MAX_LOCK_MS = 15 * 60 * 1000;
export const LOGIN_THROTTLE_GLOBAL_MAX_FAILURES = 50;
export const LOGIN_THROTTLE_GLOBAL_LOCK_MS = 15 * 1000;
export const LOGIN_THROTTLE_MAX_ENTRIES = 10_000;
/** Intervalle minimal entre deux purges des entrées expirées (nettoyage opportuniste à l'écriture). */
const PURGE_INTERVAL_MS = 60 * 1000;

const HKDF_SALT = 'immotopia/login-throttle';
const HKDF_INFO = 'email-hash/v1';

interface ThrottleEntry {
  failures: number;
  lastFailureAt: number;
  lockedUntil: number;
  /** Empreinte de l'e-mail (pour effacer toutes les paires d'un e-mail). */
  emailKey: string;
}

const pairs = new Map<string, ThrottleEntry>();
const globals = new Map<string, ThrottleEntry>();
let lastPurgeAt = 0;
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

function hmac(value: string): string {
  return createHmac('sha256', hashKey()).update(value).digest('hex');
}

/** Empreinte de l'e-mail normalisé (trim + minuscules). */
function emailKeyOf(email: string): string {
  return hmac(`email\n${email.trim().toLowerCase()}`);
}

/** Empreinte de la paire (e-mail normalisé, IP normalisée /64). */
function pairKeyOf(email: string, ip: string | undefined): string {
  return hmac(`pair\n${email.trim().toLowerCase()}\n${normalizeSignupIp(ip)}`);
}

/** Vrai quand l'entrée ne porte plus d'information utile (fenêtre écoulée et verrou levé). */
function isExpired(entry: ThrottleEntry, now: number): boolean {
  return entry.lockedUntil <= now && now - entry.lastFailureAt > LOGIN_THROTTLE_WINDOW_MS;
}

function purgeExpired(now: number): void {
  if (now - lastPurgeAt < PURGE_INTERVAL_MS) return;
  lastPurgeAt = now;
  for (const map of [pairs, globals]) {
    for (const [key, entry] of map) {
      if (isExpired(entry, now)) map.delete(key);
    }
  }
}

/** Réinsère l'entrée en fin de Map (ordre d'ancienneté) et évince les plus anciennes au-delà du plafond. */
function store(map: Map<string, ThrottleEntry>, key: string, entry: ThrottleEntry): void {
  map.delete(key);
  map.set(key, entry);
  while (map.size > LOGIN_THROTTLE_MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function currentEntry(map: Map<string, ThrottleEntry>, key: string, emailKey: string, now: number): ThrottleEntry {
  const previous = map.get(key);
  return previous && !isExpired(previous, now)
    ? previous
    : { failures: 0, lastFailureAt: now, lockedUntil: 0, emailKey };
}

/** Vrai quand la connexion de cet e-mail, depuis cette IP, est actuellement refusée (verrou de paire ou global). */
export function isLoginLocked(email: string, ip?: string, now: number = Date.now()): boolean {
  const pair = pairs.get(pairKeyOf(email, ip));
  if (pair && pair.lockedUntil > now) return true;
  const global = globals.get(emailKeyOf(email));
  return !!global && global.lockedUntil > now;
}

/** Enregistre un échec de mot de passe (compte connu ou non). */
export function recordLoginFailure(email: string, ip?: string, now: number = Date.now()): void {
  purgeExpired(now);
  const emailKey = emailKeyOf(email);

  // 1. Paire (e-mail, IP) : verrou dur avec backoff exponentiel.
  const pairKey = pairKeyOf(email, ip);
  const pair = currentEntry(pairs, pairKey, emailKey, now);
  pair.failures += 1;
  pair.lastFailureAt = now;
  if (pair.failures >= LOGIN_THROTTLE_MAX_FAILURES) {
    const exponent = Math.min(pair.failures - LOGIN_THROTTLE_MAX_FAILURES, 20);
    const lockMs = Math.min(LOGIN_THROTTLE_BASE_LOCK_MS * 2 ** exponent, LOGIN_THROTTLE_MAX_LOCK_MS);
    pair.lockedUntil = now + lockMs;
    logger.warn('Login throttle engaged for an email/IP pair', {
      fingerprint: pairKey.slice(0, 12),
      failures: pair.failures,
      lockSeconds: Math.round(lockMs / 1000)
    });
  }
  store(pairs, pairKey, pair);

  // 2. Global par e-mail : verrou court et fixe, non escaladant, remis à zéro en l'engageant.
  const global = currentEntry(globals, emailKey, emailKey, now);
  global.failures += 1;
  global.lastFailureAt = now;
  if (global.failures >= LOGIN_THROTTLE_GLOBAL_MAX_FAILURES) {
    global.failures = 0;
    global.lockedUntil = now + LOGIN_THROTTLE_GLOBAL_LOCK_MS;
    logger.warn('Login global throttle engaged for an email fingerprint', {
      fingerprint: emailKey.slice(0, 12),
      lockSeconds: Math.round(LOGIN_THROTTLE_GLOBAL_LOCK_MS / 1000)
    });
  }
  store(globals, emailKey, global);
}

/** Connexion réussie : remet à zéro la paire ET le compteur global de cet e-mail. */
export function clearLoginFailures(email: string, ip?: string): void {
  pairs.delete(pairKeyOf(email, ip));
  globals.delete(emailKeyOf(email));
}

/** Efface tout l'état d'un e-mail (toutes IP) : mot de passe réinitialisé par son titulaire. */
export function clearEmailThrottle(email: string): void {
  const emailKey = emailKeyOf(email);
  globals.delete(emailKey);
  for (const [key, entry] of pairs) {
    if (entry.emailKey === emailKey) pairs.delete(key);
  }
}

/** Nombre de paires (e-mail, IP) en mémoire (tests, diagnostic). */
export function loginThrottleSize(): number {
  return pairs.size;
}

/** Nombre d'e-mails suivis par le compteur global (tests, diagnostic). */
export function loginThrottleEmailCount(): number {
  return globals.size;
}

/** Vide tout l'état (tests). */
export function resetLoginThrottle(): void {
  pairs.clear();
  globals.clear();
  lastPurgeAt = 0;
}
