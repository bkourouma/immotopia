/**
 * Filtres des listes du portail propriétaire : validation des paramètres de
 * requête (400 si invalides), clauses Prisma de recherche, périmètre et
 * pagination en mémoire. Le périmètre (`propertyIds`, `tenantId`) vient de la
 * session et reste posé par le service : tout identifiant reçu reste à
 * l'intérieur, hors périmètre la liste est vide.
 */
import { escapeLike } from '../../utils/like-escape';
import type { Request } from 'express';
import { z } from 'zod';
import {
  MaintenanceTicketCategory,
  MaintenanceTicketPriority,
  MaintenanceTicketStatus,
  RentalDocumentType,
  RentalInstallmentStatus,
  RentalLeaseStatus,
  RentalPaymentMethod
} from '@prisma/client';
import { BadRequestError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { emptyToUndefined, zCsvEnum, zId, zSearch } from '../../utils/list-query-schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Pagination d'une liste du portail propriétaire (tranche servie + total filtré). */
export interface OwnerPortalPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Recherche libre et pagination optionnelle communes aux listes du portail propriétaire. */
export interface OwnerPortalListOptions {
  search?: string;
  page?: number;
  limit?: number;
}

/** Une ou plusieurs valeurs d'enum (CSV côté route). */
export type OneOrMany<T> = T | T[];

/** Réponse d'une liste, avec sa pagination. */
export type WithOwnerPagination<T> = T & { pagination?: OwnerPortalPagination };

// ---------------------------------------------------------------------------
// Paramètres de requête
// ---------------------------------------------------------------------------

const searchParam = zSearch();
const idParam = zId;
const pageParam = z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).optional());
const limitParam = z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).optional());

const enumValues = <T extends string>(values: Record<string, T>) =>
  Object.values(values) as unknown as readonly [T, ...T[]];

/**
 * Jour `aaaa-mm-jj` ou date ISO complète, valide : rendue en `Date`.
 * Un jour seul couvre la journée entière (UTC, soit l'heure d'Abidjan) : début à 00:00:00.000Z,
 * fin (`endOfDay`) à 23:59:59.999Z, pour que le dernier jour choisi reste inclus dans la plage.
 * Une date ISO complète reste telle quelle.
 */
const dateParam = (endOfDay: boolean) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}([T ].+)?$/)
      .refine(value => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return false;
        // Un jour inexistant (2026-02-31) se « corrige » en mars : on le refuse.
        return value.length > 10 || date.toISOString().slice(0, 10) === value;
      })
      .transform(value =>
        value.length === 10 ? new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`) : new Date(value)
      )
      .optional()
  );
const startDateParam = dateParam(false);
const endDateParam = dateParam(true);

const pagination = { page: pageParam, limit: limitParam };

export const ownerPortalInstallmentsQuerySchema = z.object({
  search: searchParam,
  status: zCsvEnum(enumValues(RentalInstallmentStatus)),
  propertyId: idParam,
  startDate: startDateParam,
  endDate: endDateParam,
  ...pagination
});

export const ownerPortalPaymentsQuerySchema = z.object({
  search: searchParam,
  method: zCsvEnum(enumValues(RentalPaymentMethod)),
  propertyId: idParam,
  startDate: startDateParam,
  endDate: endDateParam,
  ...pagination
});

export const ownerPortalMaintenanceQuerySchema = z.object({
  search: searchParam,
  status: zCsvEnum(enumValues(MaintenanceTicketStatus)),
  category: zCsvEnum(enumValues(MaintenanceTicketCategory)),
  priority: zCsvEnum(enumValues(MaintenanceTicketPriority)),
  propertyId: idParam,
  ...pagination
});

export const ownerPortalDocumentsQuerySchema = z.object({
  search: searchParam,
  documentType: zCsvEnum(enumValues(RentalDocumentType)),
  propertyId: idParam,
  leaseId: idParam,
  ...pagination
});

export const ownerPortalLeasesQuerySchema = z.object({
  search: searchParam,
  status: zCsvEnum(enumValues(RentalLeaseStatus)),
  propertyId: idParam,
  ...pagination
});

/** Valide les paramètres ; toute valeur invalide lève une `BadRequestError` (400). Seules les clés renseignées sont rendues. */
function parseWith<S extends z.ZodTypeAny>(schema: S, query: Request['query']): z.output<S> {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestError(
      t('Paramètres de recherche invalides.'),
      parsed.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message }))
    );
  }
  return Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined)) as z.output<S>;
}

export const parseOwnerPortalInstallmentsQuery = (query: Request['query']) =>
  parseWith(ownerPortalInstallmentsQuerySchema, query);
export const parseOwnerPortalPaymentsQuery = (query: Request['query']) =>
  parseWith(ownerPortalPaymentsQuerySchema, query);
export const parseOwnerPortalMaintenanceQuery = (query: Request['query']) =>
  parseWith(ownerPortalMaintenanceQuerySchema, query);
export const parseOwnerPortalDocumentsQuery = (query: Request['query']) =>
  parseWith(ownerPortalDocumentsQuerySchema, query);
export const parseOwnerPortalLeasesQuery = (query: Request['query']) => parseWith(ownerPortalLeasesQuerySchema, query);

// ---------------------------------------------------------------------------
// Périmètre
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Vrai quand la liste est forcément vide, sans appel à la base : aucun bien, un bien reçu hors du
 * périmètre du propriétaire (jamais d'élargissement), ou un bail mal formé (colonne `lease_id` uuid).
 */
export function isOwnerListOutOfScope(
  propertyIds: string[],
  filters?: { propertyId?: string; leaseId?: string }
): boolean {
  if (propertyIds.length === 0) return true;
  if (filters?.propertyId && !propertyIds.includes(filters.propertyId)) return true;
  return Boolean(filters?.leaseId && !UUID_RE.test(filters.leaseId));
}

// ---------------------------------------------------------------------------
// Clauses Prisma
// ---------------------------------------------------------------------------

/** `contains` insensible à la casse. */
const containsInsensitive = (value: string) => ({ contains: escapeLike(value), mode: 'insensitive' as const });

/** Valeur seule ou liste : une liste devient `{ in: [...] }`, une liste vide ne filtre rien. */
export function ownerEnumClause<T>(value: OneOrMany<T> | undefined): T | { in: T[] } | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return value;
  return value.length > 0 ? { in: value } : undefined;
}

type SearchClause = { AND?: Array<{ OR: object[] }> };

const searchOr = (search: string | undefined, clauses: (term: string) => object[]): SearchClause =>
  search ? { AND: [{ OR: clauses(search) }] } : {};

const propertyClauses = (term: string) => [
  { lease: { property: { title: containsInsensitive(term) } } },
  { lease: { property: { address: containsInsensitive(term) } } },
  { lease: { property: { internalReference: containsInsensitive(term) } } },
  { lease: { primaryRenter: { user: { fullName: containsInsensitive(term) } } } }
];

/** Recherche des baux, à fusionner dans le `where` (`AND`). */
export const buildOwnerLeasesSearch = (search?: string) =>
  searchOr(search, term => [
    { property: { address: containsInsensitive(term) } },
    { property: { title: containsInsensitive(term) } },
    { primaryRenter: { user: { fullName: containsInsensitive(term) } } }
  ]);

/** Recherche des échéances, à fusionner dans le `where` (`AND`). */
export const buildOwnerInstallmentsSearch = (search?: string) => searchOr(search, propertyClauses);

/** Recherche des paiements : `where.OR` porte déjà l'intervalle de dates, la recherche passe par `AND`. */
export const buildOwnerPaymentsSearch = (search?: string) =>
  searchOr(search, term => [
    ...propertyClauses(term),
    { psp_reference: containsInsensitive(term) },
    { psp_transaction_id: containsInsensitive(term) }
  ]);

/** Recherche des tickets de maintenance, à fusionner dans le `where` (`AND`). */
export const buildOwnerTicketsSearch = (search?: string) =>
  searchOr(search, term => [
    { title: containsInsensitive(term) },
    { property: { address: containsInsensitive(term) } },
    { property: { title: containsInsensitive(term) } }
  ]);

/** Recherche des documents : `where.OR` porte le périmètre, la recherche passe par `AND` sans l'écraser. */
export const buildOwnerDocumentsSearch = (search?: string) =>
  searchOr(search, term => [{ title: containsInsensitive(term) }, { document_number: containsInsensitive(term) }]);

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** Pagination d'une réponse vide (aucun résultat). */
export function emptyOwnerPagination(options?: OwnerPortalListOptions): OwnerPortalPagination {
  return { page: options?.limit ? options.page || 1 : 1, limit: options?.limit ?? 0, total: 0, totalPages: 0 };
}

/**
 * Tranche une liste déjà filtrée et ordonnée. Sans `limit`, la liste entière
 * est rendue (rétrocompatibilité) et `limit` vaut le total.
 */
export function paginateOwnerList<T>(
  items: T[],
  options?: OwnerPortalListOptions
): { items: T[]; pagination: OwnerPortalPagination } {
  const total = items.length;
  if (!options?.limit) {
    return { items, pagination: { page: 1, limit: total, total, totalPages: total > 0 ? 1 : 0 } };
  }
  const limit = options.limit;
  const page = options.page || 1;
  return {
    items: items.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}
