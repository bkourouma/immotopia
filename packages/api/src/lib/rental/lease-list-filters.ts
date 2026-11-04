/**
 * Filtres de recherche des listes Baux et Échéances (module locatif).
 *
 * Tout est ici pour garder les contrôleurs et services existants intacts :
 * ils appellent une ou deux lignes de ce module.
 *
 * - Baux : `search` couvre le n° de bail, le bien (titre, adresse, référence)
 *   et le locataire principal (nom, e-mail).
 * - Échéances : `search` couvre les mêmes colonnes ; `dueFrom` / `dueTo`
 *   bornent la date d'échéance (jours inclus).
 *
 * Les conditions sont combinées dans `where.AND` : un `where.OR` existant
 * (statut effectif d'une échéance) n'est jamais écrasé.
 */
import type { Request } from 'express';
import { z } from 'zod';
import { BadRequestError } from '../../middleware/error-middleware';
import { dayOrderRefinement, dayRange, zDay, zSearch } from '../../utils/list-query-schemas';
import { t } from '../../i18n';
import { escapeLike } from '../../utils/like-escape';

const leaseExtrasSchema = z.object({ search: zSearch() });

const installmentExtrasSchema = z
  .object({ search: zSearch(), dueFrom: zDay, dueTo: zDay })
  .superRefine(dayOrderRefinement('dueFrom', 'dueTo'));

export interface LeaseListExtras {
  search?: string;
}

export interface InstallmentListExtras {
  search?: string;
  dueFrom?: string;
  dueTo?: string;
}

function parseOrThrow<S extends z.ZodTypeAny>(schema: S, query: Request['query']): z.output<S> {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestError(
      t('Paramètres de recherche invalides.'),
      parsed.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message }))
    );
  }
  return parsed.data;
}

/** Valide `search` d'une liste de baux (400 si invalide). */
export function parseLeaseListExtras(query: Request['query']): LeaseListExtras {
  return parseOrThrow(leaseExtrasSchema, query);
}

/** Valide `search`, `dueFrom` et `dueTo` d'une liste d'échéances (400 si invalide). */
export function parseInstallmentListExtras(query: Request['query']): InstallmentListExtras {
  return parseOrThrow(installmentExtrasSchema, query);
}

function addAnd(where: any, condition: unknown): void {
  where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), condition];
}

const contains = (value: string) => ({ contains: escapeLike(value), mode: 'insensitive' as const });

/** Colonnes d'un bail cherchées par `search` (relation `property` / `primaryRenter` du bail). */
function leaseColumns(search: string) {
  return [
    { property: { title: contains(search) } },
    { property: { address: contains(search) } },
    { property: { internalReference: contains(search) } },
    { primaryRenter: { user: { fullName: contains(search) } } },
    { primaryRenter: { user: { email: contains(search) } } }
  ];
}

/** Ajoute la recherche libre au `where` d'une liste de baux (tenant_id déjà posé par l'appelant). */
export function applyLeaseSearch(where: any, search?: string): void {
  if (!search) return;
  addAnd(where, { OR: [{ lease_number: contains(search) }, ...leaseColumns(search)] });
}

/** Ajoute recherche libre et période d'échéance au `where` d'une liste d'échéances. */
export function applyInstallmentListExtras(where: any, extras?: InstallmentListExtras): void {
  if (!extras) return;
  if (extras.search) {
    addAnd(where, {
      OR: [
        { lease: { lease_number: contains(extras.search) } },
        ...leaseColumns(extras.search).map(c => ({ lease: c }))
      ]
    });
  }
  const range = dayRange(extras.dueFrom, extras.dueTo);
  if (range) addAnd(where, { due_date: range });
}
