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
 * 2. Compteur GLOBAL par e-mail (toutes IP confondues) : à chaque tranche de
 *    `LOGIN_THROTTLE_GLOBAL_MAX_FAILURES` (50) échecs dans la fenêtre, un
 *    verrou qui ESCALADE d'un engagement à l'autre (15 s, 30 s, 60 s…,
 *    plafonné à `LOGIN_THROTTLE_GLOBAL_MAX_LOCK_MS`, 5 min), sans prolongation
 *    pendant le verrou, compteur d'échecs remis à zéro en l'engageant. Le rang
 *    d'engagement vit tant que l'attaque continue (fenêtre glissante).
 *    Contre-audit PR #205 : le verrou fixe de 15 s laissait ~200 essais par
 *    minute à une attaque distribuée.
 * 3. EXEMPTION du verrou global pour une paire (e-mail, IP) qui a réussi une
 *    connexion depuis moins de `LOGIN_THROTTLE_TRUSTED_PAIR_MS` (30 jours) :
 *    le titulaire, depuis sa connexion habituelle, n'est pas enfermé par une
 *    attaque distribuée. Le verrou de SA paire continue de s'appliquer.
 *
 * Les tentatives faites PENDANT un verrou ne sont comptées nulle part (une
 * paire exemptée qui échoue pendant le verrou global n'est comptée que sur sa
 * paire). Un succès remet à zéro la paire ET le compteur global de l'e-mail, et
 * marque la paire comme sûre ; une réinitialisation de mot de passe efface
 * tout l'état de l'e-mail, paires sûres comprises (`clearEmailThrottle`). La
 * réponse reste indiscernable d'un échec ordinaire dans tous les cas.
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
 * verrou global escaladant (15 s puis doublé à chaque tranche de 50 échecs,
 * 5 min au plus). Les paires sûres sont aussi en mémoire (redémarrage : le
 * titulaire redevient soumis au verrou global jusqu'à sa prochaine connexion).
 */

export const LOGIN_THROTTLE_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_THROTTLE_MAX_FAILURES = 10;
export const LOGIN_THROTTLE_BASE_LOCK_MS = 15 * 1000;
export const LOGIN_THROTTLE_MAX_LOCK_MS = 15 * 60 * 1000;
export const LOGIN_THROTTLE_GLOBAL_MAX_FAILURES = 50;
export const LOGIN_THROTTLE_GLOBAL_LOCK_MS = 15 * 1000;
export const LOGIN_THROTTLE_GLOBAL_MAX_LOCK_MS = 5 * 60 * 1000;
/** Durée pendant laquelle une paire (e-mail, IP) ayant réussi une connexion échappe au verrou global. */
export const LOGIN_THROTTLE_TRUSTED_PAIR_MS = 30 * 24 * 60 * 60 * 1000;
export const LOGIN_THROTTLE_MAX_ENTRIES = 10_000;
/**
 * Motif interne d'un refus de connexion pendant un verrou (`LoginLockedError.reason`),
 * jamais renvoyé au client : il sert au seul `loginRateLimiter`.
 */
export const LOGIN_LOCKED_REASON = 'LOGIN_LOCKED';
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
  /** Compteur global : nombre de verrous déjà engagés dans la fenêtre (escalade). */
  engagements: number;
}

interface TrustedPair {
  lastSuccessAt: number;
  emailKey: string;
}

const pairs = new Map<string, ThrottleEntry>();
const globals = new Map<string, ThrottleEntry>();
const trustedPairs = new Map<string, TrustedPair>();
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
  for (const [key, trusted] of trustedPairs) {
    if (!isTrustValid(trusted, now)) trustedPairs.delete(key);
  }
}

function isTrustValid(trusted: TrustedPair, now: number): boolean {
  return now - trusted.lastSuccessAt < LOGIN_THROTTLE_TRUSTED_PAIR_MS;
}

/** Réinsère l'entrée en fin de Map (ordre d'ancienneté) et évince les plus anciennes au-delà du plafond. */
function store<T>(map: Map<string, T>, key: string, entry: T): void {
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
    : { failures: 0, lastFailureAt: now, lockedUntil: 0, emailKey, engagements: 0 };
}

/** Vrai quand cette paire a réussi une connexion récemment (exemptée du verrou global). */
function isTrustedPair(pairKey: string, now: number): boolean {
  const trusted = trustedPairs.get(pairKey);
  return !!trusted && isTrustValid(trusted, now);
}

/**
 * Vrai quand la connexion de cet e-mail, depuis cette IP, est actuellement refusée :
 * verrou de la paire, ou verrou global sauf pour une paire sûre.
 */
export function isLoginLocked(email: string, ip?: string, now: number = Date.now()): boolean {
  const pairKey = pairKeyOf(email, ip);
  const pair = pairs.get(pairKey);
  if (pair && pair.lockedUntil > now) return true;
  const global = globals.get(emailKeyOf(email));
  return !!global && global.lockedUntil > now && !isTrustedPair(pairKey, now);
}

/** Durée du n-ième verrou global de la fenêtre (n ≥ 1) : 15 s × 2^(n − 1), 5 min au plus. */
export function globalLockDurationMs(engagement: number): number {
  const exponent = Math.min(Math.max(engagement - 1, 0), 20);
  return Math.min(LOGIN_THROTTLE_GLOBAL_LOCK_MS * 2 ** exponent, LOGIN_THROTTLE_GLOBAL_MAX_LOCK_MS);
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

  // 2. Global par e-mail : verrou escaladant d'un engagement à l'autre, remis à zéro en
  // l'engageant. Pendant le verrou (paire sûre qui échoue), rien n'est compté ni prolongé.
  const global = currentEntry(globals, emailKey, emailKey, now);
  if (global.lockedUntil > now) return;
  global.failures += 1;
  global.lastFailureAt = now;
  if (global.failures >= LOGIN_THROTTLE_GLOBAL_MAX_FAILURES) {
    global.failures = 0;
    global.engagements += 1;
    const lockMs = globalLockDurationMs(global.engagements);
    global.lockedUntil = now + lockMs;
    logger.warn('Login global throttle engaged for an email fingerprint', {
      fingerprint: emailKey.slice(0, 12),
      engagement: global.engagements,
      lockSeconds: Math.round(lockMs / 1000)
    });
  }
  store(globals, emailKey, global);
}

/**
 * Connexion réussie (mot de passe correct) : remet à zéro la paire ET le compteur global
 * de cet e-mail, et marque la paire comme sûre (exemptée du verrou global 30 jours).
 */
export function clearLoginFailures(email: string, ip?: string, now: number = Date.now()): void {
  const emailKey = emailKeyOf(email);
  const pairKey = pairKeyOf(email, ip);
  pairs.delete(pairKey);
  globals.delete(emailKey);
  store(trustedPairs, pairKey, { lastSuccessAt: now, emailKey });
}

/** Efface tout l'état d'un e-mail (toutes IP, paires sûres comprises) : mot de passe réinitialisé par son titulaire. */
export function clearEmailThrottle(email: string): void {
  const emailKey = emailKeyOf(email);
  globals.delete(emailKey);
  for (const [key, entry] of pairs) {
    if (entry.emailKey === emailKey) pairs.delete(key);
  }
  for (const [key, trusted] of trustedPairs) {
    if (trusted.emailKey === emailKey) trustedPairs.delete(key);
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

/** Nombre de paires sûres en mémoire (tests, diagnostic). */
export function loginTrustedPairCount(): number {
  return trustedPairs.size;
}

/** Vide tout l'état (tests). */
export function resetLoginThrottle(): void {
  pairs.clear();
  globals.clear();
  trustedPairs.clear();
  lastPurgeAt = 0;
}
