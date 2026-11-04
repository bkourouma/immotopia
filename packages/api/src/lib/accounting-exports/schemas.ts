import { z } from 'zod';
import { UNASSIGNED_OWNER } from './types';

/**
 * Paramètres de requête de l'API comptable. `parsePeriod` / `parseAsOfDate`
 * restent l'autorité sur la sémantique des dates (bornes, ordre) : ici,
 * seulement la forme.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');
const format = z.enum(['json', 'csv', 'xlsx']).default('json');
const page = z.coerce.number().int().min(1).max(1_000_000).default(1);
const search = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform(value => (value ? value : undefined));
const journal = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9_-]+$/);
const account = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9]+$/);
const bool = z.enum(['true', 'false']).transform(value => value === 'true');
const limit = (max: number) => z.coerce.number().int().min(1).max(max);

const period = { from: isoDate.optional(), to: isoDate.optional() };

export const metaQuerySchema = z.object({ format: z.string().optional() }).strict();

export const accountsQuerySchema = z
  .object({
    search,
    withMovements: bool.optional(),
    ...period,
    // Le client JSON ajoute toujours `format=json` : seul ce format a un sens ici.
    format: z.literal('json').optional(),
    limit: limit(50).default(20)
  })
  .strict();

export const journalQuerySchema = z
  .object({
    ...period,
    format,
    page,
    limit: limit(100).default(50),
    journal: journal.optional(),
    account: account.optional(),
    search
  })
  .strict();

export const generalLedgerQuerySchema = z
  .object({
    ...period,
    format,
    page,
    limit: limit(100).optional(),
    account: account.optional(),
    search,
    journal: journal.optional()
  })
  .strict()
  .transform(query => ({ ...query, limit: query.limit ?? (query.account ? 100 : 50) }));

export const trialBalanceQuerySchema = z
  .object({
    ...period,
    format,
    class: z.coerce.number().int().min(1).max(9).optional(),
    hideZero: bool.optional(),
    search
  })
  .strict();

const owner = z.union([z.literal(UNASSIGNED_OWNER), z.string().uuid()]);

export const mandantSubledgerQuerySchema = z
  .object({
    ...period,
    format,
    page,
    limit: limit(100).optional(),
    owner: owner.optional(),
    nature: z.enum(['CURRENT', 'DEPOSIT', 'UNALLOCATED']).optional(),
    search
  })
  .strict()
  .transform(query => ({ ...query, limit: query.limit ?? (query.owner ? 100 : 50) }));

export const mandantTrialBalanceQuerySchema = z
  .object({
    date: isoDate.optional(),
    format,
    page,
    limit: limit(100).default(50),
    search
  })
  .strict();
