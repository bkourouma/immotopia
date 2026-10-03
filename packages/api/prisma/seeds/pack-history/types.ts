/**
 * Contrat commun des générateurs d'historique des agences de test (staging).
 *
 * Chaque module (agence, syndic, promoteur, patrimoine) exporte UN générateur
 * `(ctx) => Promise<void>`. Le profil dit combien d'histoire reconstituer :
 * 6 mois de gestion (petit parc, jeune) ou 3 ans (36 mois, parc plus large,
 * cycles annuels répétés, impayés anciens, budgets qui évoluent).
 *
 * Règles communes :
 *  - dates RELATIVES à `ctx.end` (maintenant) : le jeu reste « frais » quel que soit le jour du seed ;
 *  - hasard SEEDÉ (`ctx.rng`) : deux exécutions donnent les mêmes données ;
 *  - idempotent : si le module porte déjà des données sur ce tenant, on s'arrête sans rien dupliquer ;
 *  - aucun envoi sortant (e-mail, SMS, Mobile Money) : appeler `neutralizeOutbound()` avant d'importer un service ;
 *  - jamais `include: { user: true }` sans `select` ; toujours `tenantId`.
 */
import type { PrismaClient } from '@prisma/client';

export type HistoryProfile = '6m' | '3y';

export interface HistoryContext {
  prisma: PrismaClient;
  tenantId: string;
  /** Administrateur du tenant (auteur par défaut des écritures). */
  adminUserId: string;
  profile: HistoryProfile;
  /** 6 ou 36. */
  months: number;
  /** Début de l'histoire (= end − months mois, au 1er du mois). */
  start: Date;
  /** Maintenant. */
  end: Date;
  /** Générateur pseudo-aléatoire déterministe, [0,1[. */
  rng: () => number;
  log: (message: string) => void;
}

export type HistorySeeder = (ctx: HistoryContext) => Promise<void>;

export const PROFILE_MONTHS: Record<HistoryProfile, number> = { '6m': 6, '3y': 36 };

/** mulberry32 : petit PRNG déterministe. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Graine stable à partir d'un texte (nom du tenant + module). */
export function seedFromString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function monthsAgo(from: Date, months: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth() - months, 1, 9, 0, 0, 0);
  return d;
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

export function between(rng: () => number, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}

export function buildContext(
  base: Pick<HistoryContext, 'prisma' | 'tenantId' | 'adminUserId' | 'profile' | 'log'>,
  seedText: string,
  now: Date = new Date()
): HistoryContext {
  const months = PROFILE_MONTHS[base.profile];
  return {
    ...base,
    months,
    end: now,
    start: monthsAgo(now, months),
    rng: createRng(seedFromString(`${seedText}:${base.profile}`))
  };
}

/**
 * Coupe tout envoi sortant AVANT d'importer un service qui pourrait écrire à de
 * vraies personnes (comptes de test en `.test`, jamais de message réel).
 */
export function neutralizeOutbound(): void {
  for (const key of [
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_PASSWORD',
    'ORANGE_SMS_CLIENT_ID',
    'ORANGE_SMS_CLIENT_SECRET',
    'SMS_PROVIDER'
  ]) {
    delete process.env[key];
  }
  // L'EmailService retombe sur smtp.hostinger.com sans variable : le pointer sur un port fermé local.
  process.env.EMAIL_SMTP_HOST = '127.0.0.1';
  process.env.EMAIL_SMTP_PORT = '9';
  process.env.EMAIL_SMTP_USER = '';
  process.env.EMAIL_SMTP_PASS = '';
  delete process.env.EMAIL_SERVICE_API_KEY;
  delete process.env.SENDGRID_API_KEY;
  delete process.env.TWILIO_AUTH_TOKEN;
}
