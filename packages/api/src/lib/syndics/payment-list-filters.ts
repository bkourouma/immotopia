import { z } from 'zod';
import { t } from '../../i18n';
import { escapeLike } from '../../utils/like-escape';
import { isoDaySchema } from './charge-allocation-schemas';

/**
 * Lot SYN-A : briques communes des critères de recherche serveur des listes
 * de paiement des copropriétés (quittances, paiements déclarés, paiement en
 * ligne, prélèvement). Toute valeur invalide répond 400 (ZodError).
 */

/** Paramètre optionnel : une chaîne vide est traitée comme absente. */
export const optionalQuery = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(raw => {
    const value = Array.isArray(raw) ? raw.join(',') : raw;
    return typeof value === 'string' && value.trim() === '' ? undefined : value;
  }, schema.optional());

/** Recherche libre : rognée, 1 à 100 caractères. */
export const searchQuery = optionalQuery(z.string().trim().min(1).max(100));

/** Date de début / de fin (AAAA-MM-JJ) ; une chaîne vide est absente. */
export const optionalDayQuery = optionalQuery(isoDaySchema);

/** Booléen `true` / `false` ; autre valeur : 400. */
export const optionalBooleanQuery = optionalQuery(z.enum(['true', 'false']).transform(value => value === 'true'));

const DAY_MS = 24 * 60 * 60 * 1000;

/** Début ≤ fin lorsque les deux bornes sont données. */
export function checkDayRange(value: { from?: Date; to?: Date }, ctx: z.RefinementCtx) {
  if (value.from && value.to && value.from.getTime() > value.to.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: t('La date de début doit être antérieure ou égale à la date de fin.'),
      path: ['to']
    });
  }
}

/** Bornes d'un horodatage : de 00:00 du jour `from` jusqu'à la fin du jour `to` (exclu le lendemain). */
export function timestampRange(from?: Date, to?: Date): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lt: new Date(to.getTime() + DAY_MS) } : {})
  };
}

/** Filtre insensible à la casse « contient » (Prisma). */
export const insensitiveContains = (value: string) => ({ contains: escapeLike(value), mode: 'insensitive' as const });

/** Nom et e-mail d'un contact CRM, en `OR` insensible à la casse. */
export function contactSearchOr(value: string) {
  const contains = insensitiveContains(value);
  return [{ firstName: contains }, { lastName: contains }, { legalName: contains }, { email: contains }];
}
