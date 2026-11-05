/**
 * Lecture validée des paramètres de liste du CRM (affaires, activités, contacts).
 *
 * Fine couche au-dessus des briques partagées `list-query-schemas.ts` (recherche,
 * liste d'énumération, jour, montant, identifiant) : elle garde la signature
 * `parseXxxParam(raw, name)` des contrôleurs et traduit toute erreur Zod en
 * `BadRequestError` (400, message « Paramètre invalide : … »), jamais en erreur
 * Prisma (500). Absent ou vide : `undefined`.
 *
 * Reste local : la liste d'identifiants (`a,b`, aucun helper partagé) et les
 * horodatages ISO complets pour les dates (`zDay` n'accepte que `aaaa-mm-jj`).
 */
import type { z } from 'zod';
import { BadRequestError } from '../middleware/error-middleware';
import { t } from '../i18n';
import { dayEnd, dayStart, zAmount, zCsvEnum, zDay, zId, zSearch } from './list-query-schemas';

/** Longueur maximale d'un texte de recherche libre. */
export const MAX_SEARCH_LENGTH = 100;
/** Longueur maximale d'un identifiant reçu en filtre. */
const MAX_ID_LENGTH = 64;

function invalid(name: string, detail: string): BadRequestError {
  return new BadRequestError(t('Paramètre invalide : {{name}}.', { name }), [{ field: name, message: detail }]);
}

/** Applique un schéma partagé ; toute erreur Zod devient un 400 nommant le paramètre. */
function run<Out>(schema: z.ZodType<Out, z.ZodTypeDef, unknown>, raw: unknown, name: string): Out {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw invalid(name, parsed.error.issues[0]?.message ?? t('Valeur non reconnue.'));
  return parsed.data;
}

const searchSchema = zSearch(MAX_SEARCH_LENGTH);

/** Texte de recherche libre : une seule valeur, rognée, bornée à 100 caractères. */
export function parseSearchParam(raw: unknown, name = 'search'): string | undefined {
  return run(searchSchema, raw, name);
}

/** Identifiant reçu en filtre (contact, collaborateur…) : une seule valeur non vide, bornée. */
export function parseIdParam(raw: unknown, name: string): string | undefined {
  return run(zId, raw, name);
}

/** Liste d'identifiants séparés par des virgules (`a,b,c`) ou répétés, vides ignorés, sans doublon. */
export function parseIdListParam(raw: unknown, name: string, maxItems = 50): string[] | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const text = Array.isArray(raw) && raw.every(item => typeof item === 'string') ? raw.join(',') : raw;
  if (typeof text !== 'string') throw invalid(name, t('Une seule valeur est attendue.'));
  const items = Array.from(
    new Set(
      text
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
    )
  );
  if (items.length === 0) return undefined;
  if (items.length > maxItems || items.some(item => item.length > MAX_ID_LENGTH)) {
    throw invalid(name, t('Valeur non reconnue.'));
  }
  return items;
}

/**
 * Une ou plusieurs valeurs d'une énumération séparées par des virgules
 * (`NEW,VISIT`) ou répétées. Une valeur hors liste : 400. Absent : `undefined`.
 */
export function parseEnumListParam<T extends string>(
  raw: unknown,
  allowed: Readonly<Record<string, T>> | readonly T[],
  name: string
): T[] | undefined {
  const values = (Array.isArray(allowed) ? allowed : Object.values(allowed as Record<string, T>)) as T[];
  if (values.length === 0) return undefined;
  const joined = Array.isArray(raw) && raw.every(item => typeof item === 'string') ? raw.join(',') : raw;
  return run(zCsvEnum(values as unknown as readonly [string, ...string[]]), joined, name) as T[] | undefined;
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T/;

/**
 * Date d'un filtre de période : `aaaa-mm-jj` RÉEL (`2026-02-31` refusé), ou un
 * horodatage ISO complet (conservé localement). Renvoie la chaîne rognée, à
 * passer à `periodStart` / `periodEnd`. Autre chose : 400.
 */
export function parseDateParam(raw: unknown, name: string): string | undefined {
  if (typeof raw === 'string' && ISO_DATETIME.test(raw.trim())) {
    const text = raw.trim();
    if (Number.isNaN(new Date(text).getTime())) throw invalid(name, t('Date invalide (AAAA-MM-JJ).'));
    return text;
  }
  return run(zDay, raw, name);
}

/** Montant : nombre fini, négatif accepté. */
export function parseAmountParam(raw: unknown, name: string): number | undefined {
  return run(zAmount(), raw, name);
}

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Début d'une période : un `aaaa-mm-jj` vaut minuit UTC de ce jour. */
export function periodStart(value: string): Date {
  return DAY_ONLY.test(value) ? dayStart(value) : new Date(value);
}

/** Fin d'une période : un `aaaa-mm-jj` inclut le jour entier (23:59:59.999 UTC). */
export function periodEnd(value: string): Date {
  return DAY_ONLY.test(value) ? dayEnd(value) : new Date(value);
}
