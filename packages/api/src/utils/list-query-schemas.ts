/**
 * Briques Zod partagées pour les paramètres de requête des listes filtrables
 * (recherche, statuts multiples, jours, montants, identifiants).
 *
 * Un paramètre absent ou vide (`''`, espaces) vaut `undefined`. Un tableau
 * (`?x=a&x=b`) est refusé. Un jour impossible (`2026-02-31`, `2026-13-45`)
 * est refusé ici, donc jamais transmis à Prisma (pas de `Invalid Date`, pas
 * de 500).
 *
 * Exemple :
 *
 * ```ts
 * const STATUSES = ['DRAFT', 'PAID'] as const;
 * const listQuerySchema = z
 *   .object({
 *     search: zSearch(),
 *     status: zCsvEnum(STATUSES),
 *     from: zDay,
 *     to: zDay,
 *     minAmount: zAmount({ min: 0 }),
 *     propertyId: zId
 *   })
 *   .superRefine(dayOrderRefinement('from', 'to'));
 *
 * function parseListQuery(query: Request['query']) {
 *   const parsed = listQuerySchema.safeParse(query);
 *   if (!parsed.success) {
 *     throw new BadRequestError(
 *       t('Paramètres de recherche invalides.'),
 *       parsed.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message }))
 *     );
 *   }
 *   return parsed.data;
 * }
 * // where.createdAt = dayRange(q.from, q.to);
 * ```
 */
import { z } from 'zod';
import { t } from '../i18n';

/** Jokers `%` / `_` d'une saisie neutralisés avant `contains` / `startsWith` / `endsWith` (Prisma n'échappe pas). */
export { escapeLike } from './like-escape';

/** Schéma d'un paramètre de requête : entrée brute (`unknown`), sortie typée. */
type QueryParamSchema<Out> = z.ZodType<Out, z.ZodTypeDef, unknown>;

/** '' / espaces → undefined (pour les paramètres de requête facultatifs). */
export const emptyToUndefined = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/** Recherche libre : trim, vide → undefined, longueur max (défaut 200). */
export function zSearch(max = 200): QueryParamSchema<string | undefined> {
  return z.preprocess(emptyToUndefined, z.string().trim().max(max).optional()) as QueryParamSchema<string | undefined>;
}

/**
 * Liste CSV de valeurs d'un enum : `'A,B'` → `['A','B']`, doublons et espaces
 * ignorés, vide → undefined ; valeur inconnue → erreur Zod.
 */
export function zCsvEnum<T extends readonly [string, ...string[]]>(
  values: T
): QueryParamSchema<T[number][] | undefined> {
  return z.preprocess(
    emptyToUndefined,
    z
      .string()
      .transform(value =>
        Array.from(
          new Set(
            value
              .split(',')
              .map(item => item.trim())
              .filter(item => item.length > 0)
          )
        )
      )
      .pipe(z.array(z.enum(values as unknown as [string, ...string[]])))
      .transform(list => (list.length > 0 ? list : undefined))
      .optional()
  ) as QueryParamSchema<T[number][] | undefined>;
}

const DAY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

function isRealDay(day: string): boolean {
  if (!DAY_FORMAT.test(day)) return false;
  const date = new Date(`${day}T00:00:00.000Z`);
  // Contrôle aller-retour : 2026-02-31 devient 2026-03-03, donc différent.
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

/** Jour aaaa-mm-jj RÉEL (2026-02-31 et 2026-13-45 refusés), vide → undefined. Sortie : la chaîne. */
export const zDay: QueryParamSchema<string | undefined> = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .refine(isRealDay, { message: t('Date invalide (format attendu : aaaa-mm-jj).') })
    .optional()
) as QueryParamSchema<string | undefined>;

/** Début du jour en UTC (00:00:00.000). */
export function dayStart(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** Fin du jour en UTC, INCLUSIVE (23:59:59.999). */
export function dayEnd(day: string): Date {
  return new Date(`${day}T23:59:59.999Z`);
}

/** Intervalle Prisma `{ gte?, lte? }` (bornes incluses), ou undefined si aucune borne. */
export function dayRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: dayStart(from) } : {}),
    ...(to ? { lte: dayEnd(to) } : {})
  };
}

/**
 * Raffinement « début <= fin » pour `schema.superRefine(...)` : l'erreur est
 * portée par le champ de fin. Les jours aaaa-mm-jj se comparent comme du texte.
 */
export function dayOrderRefinement(fromKey: string, toKey: string) {
  return (data: Record<string, unknown>, ctx: z.RefinementCtx): void => {
    const from = data[fromKey];
    const to = data[toKey];
    if (typeof from === 'string' && typeof to === 'string' && from > to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [toKey],
        message: t('La date de fin doit être postérieure ou égale à la date de début.')
      });
    }
  };
}

/**
 * Montant : nombre fini (`'12'`, `'-3.5'`), vide → undefined. Négatif ACCEPTÉ
 * (avoirs, soldes) ; passer `{ min: 0 }` pour l'interdire.
 */
export function zAmount(options: { min?: number; max?: number } = {}): QueryParamSchema<number | undefined> {
  let number = z.number().finite();
  if (options.min !== undefined) number = number.min(options.min);
  if (options.max !== undefined) number = number.max(options.max);
  return z.preprocess(value => {
    const raw = emptyToUndefined(value);
    return typeof raw === 'string' && /^-?\d+(\.\d+)?$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  }, number.optional()) as QueryParamSchema<number | undefined>;
}

/** Identifiant reçu en filtre : trim, 1..64 caractères, vide → undefined. */
export const zId: QueryParamSchema<string | undefined> = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).max(64).optional()
) as QueryParamSchema<string | undefined>;
