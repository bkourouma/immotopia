/**
 * Filtres des listes du portail locataire : validation des paramètres de
 * requête (400 si invalides) et construction des clauses Prisma de recherche.
 * Le périmètre (bail, locataire) vient de la session et reste posé par le
 * service : rien de ce qui est construit ici ne le remplace ni ne l'élargit.
 */
import type { Request } from 'express';
import { z } from 'zod';
import {
  MaintenanceTicketCategory,
  MaintenanceTicketPriority,
  MaintenanceTicketStatus,
  RentalInstallmentStatus,
  RentalPaymentMethod,
  type Prisma
} from '@prisma/client';
import { BadRequestError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { zCsvEnum, zDay, zSearch } from '../../utils/list-query-schemas';

const search = zSearch();

const enumValues = <T extends string>(values: Record<string, T>) =>
  Object.values(values) as unknown as readonly [T, ...T[]];

/**
 * Jour `aaaa-mm-jj` réel, rendu en chaîne ISO que le service passe à `new Date(...)` :
 * début de journée à 00:00:00.000Z, fin de journée (`endOfDay`) à 23:59:59.999Z
 * pour que le dernier jour choisi reste inclus.
 */
const dayParam = (endOfDay: boolean) =>
  zDay.transform(value => (value ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : undefined));
const startDay = dayParam(false);
const endDay = dayParam(true);

export const tenantPortalInstallmentsQuerySchema = z.object({
  search,
  status: zCsvEnum(enumValues(RentalInstallmentStatus)),
  startDate: startDay,
  endDate: endDay
});

export const tenantPortalPaymentsQuerySchema = z.object({
  search,
  method: zCsvEnum(enumValues(RentalPaymentMethod)),
  startDate: startDay,
  endDate: endDay
});

export const tenantPortalMaintenanceQuerySchema = z.object({
  search,
  status: zCsvEnum(enumValues(MaintenanceTicketStatus)),
  category: zCsvEnum(enumValues(MaintenanceTicketCategory)),
  priority: zCsvEnum(enumValues(MaintenanceTicketPriority))
});

/** Valide les paramètres ; valeur invalide : `BadRequestError` (400). */
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

/** Retire les clés non renseignées : le service reçoit des filtres minimaux. */
export function definedOnly<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<T>;
}

/** Paramètres de `GET /installments`. */
export function parseTenantPortalInstallmentsQuery(query: Request['query']) {
  return parseOrThrow(tenantPortalInstallmentsQuerySchema, query);
}

/** Paramètres de `GET /payments`. */
export function parseTenantPortalPaymentsQuery(query: Request['query']) {
  return parseOrThrow(tenantPortalPaymentsQuerySchema, query);
}

/** Paramètres de `GET /maintenance`. */
export function parseTenantPortalMaintenanceQuery(query: Request['query']) {
  return parseOrThrow(tenantPortalMaintenanceQuerySchema, query);
}

/** Une valeur seule ou une liste devient `{ in: [...] }` ; une liste vide ne filtre rien. */
export function tenantEnumClause<T>(value: T | T[] | undefined): { in: T[] } | undefined {
  if (value === undefined) return undefined;
  const list = Array.isArray(value) ? value : [value];
  return list.length > 0 ? { in: list } : undefined;
}

const FRENCH_MONTHS = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre'
];

/**
 * Recherche libre sur les échéances. Une échéance se lit par sa période
 * (« 2026-10 ») et par le libellé de ses lignes (loyer, charges…) ; la période
 * est stockée en entiers (année, mois), donc on reconnaît `2026`, `2026-10`,
 * `10` ou un nom de mois français plutôt qu'un `contains`.
 */
export function buildInstallmentSearchClauses(search?: string): Prisma.RentalInstallmentWhereInput[] {
  const term = search?.trim();
  if (!term) return [];

  const clauses: Prisma.RentalInstallmentWhereInput[] = [
    { items: { some: { label: { contains: term, mode: 'insensitive' } } } }
  ];

  const yearMonth = /^(\d{4})[-/](\d{1,2})$/.exec(term);
  if (yearMonth) {
    clauses.push({ period_year: Number(yearMonth[1]), period_month: Number(yearMonth[2]) });
  } else if (/^\d{4}$/.test(term)) {
    clauses.push({ period_year: Number(term) });
  } else if (/^\d{1,2}$/.test(term)) {
    clauses.push({ period_month: Number(term) });
  }

  const normalized = term.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nameAndYear = /^([a-z]+)(?:\s+(\d{4}))?$/.exec(normalized);
  if (nameAndYear && nameAndYear[1].length >= 3) {
    FRENCH_MONTHS.forEach((name, index) => {
      if (name.startsWith(nameAndYear[1])) {
        clauses.push(
          nameAndYear[2]
            ? { period_month: index + 1, period_year: Number(nameAndYear[2]) }
            : { period_month: index + 1 }
        );
      }
    });
  }

  return clauses;
}

/** Recherche des échéances, à fusionner dans le `where` (`AND`). */
export function buildTenantInstallmentsSearch(search?: string): { AND?: Prisma.RentalInstallmentWhereInput[] } {
  const clauses = buildInstallmentSearchClauses(search);
  return clauses.length > 0 ? { AND: [{ OR: clauses }] } : {};
}

const contains = (term: string) => ({ contains: term, mode: 'insensitive' as const });

/** Recherche des paiements (références PSP), à fusionner dans le `where`. */
export function buildTenantPaymentsSearch(search?: string): { AND?: Prisma.RentalPaymentWhereInput[] } {
  const term = search?.trim();
  return term ? { AND: [{ OR: [{ psp_reference: contains(term) }, { psp_transaction_id: contains(term) }] }] } : {};
}

/** Même recherche sur les déclarations de paiement, appliquée avant la fusion avec les paiements. */
export function buildTenantDeclarationsSearch(search?: string): { AND?: Prisma.RentalPaymentDeclarationWhereInput[] } {
  const term = search?.trim();
  return term ? { AND: [{ OR: [{ reference: contains(term) }, { notes: contains(term) }] }] } : {};
}

export interface TenantDeclarationsFilters {
  method?: string | string[];
  startDate?: string | Date;
  endDate?: string | Date;
  search?: string;
}

/**
 * Filtres de l'historique appliqués aussi aux déclarations de paiement : recherche,
 * méthode (`payment_method`, même enum `RentalPaymentMethod` que `method` des paiements)
 * et période (`payment_date`, mêmes bornes que `succeeded_at` des paiements).
 * Sans cela une déclaration resterait affichée malgré le filtre.
 */
export function buildTenantDeclarationsFilters(
  filters?: TenantDeclarationsFilters
): Prisma.RentalPaymentDeclarationWhereInput {
  const where: Prisma.RentalPaymentDeclarationWhereInput = { ...buildTenantDeclarationsSearch(filters?.search) };
  const method = tenantEnumClause(filters?.method as RentalPaymentMethod | RentalPaymentMethod[] | undefined);
  if (method) where.payment_method = method;
  if (filters?.startDate || filters?.endDate) {
    where.payment_date = {
      ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
      ...(filters.endDate ? { lte: new Date(filters.endDate) } : {})
    };
  }
  return where;
}

export interface TenantTicketsFilters {
  status?: string | string[];
  category?: string[];
  priority?: string[];
  search?: string;
}

/**
 * La visibilité reste toujours la première condition d'un `AND` : aucun filtre
 * reçu ne la remplace ; un `OR` de recherche est combiné, jamais écrasé.
 */
export function buildTenantTicketsWhere(
  visibility: Prisma.MaintenanceTicketWhereInput,
  filters?: TenantTicketsFilters
): Prisma.MaintenanceTicketWhereInput {
  const conditions: Prisma.MaintenanceTicketWhereInput[] = [];
  const statuses = filters?.status ? (Array.isArray(filters.status) ? filters.status : [filters.status]) : [];
  if (statuses.length > 0) {
    conditions.push({ status: { in: statuses as MaintenanceTicketStatus[] } });
  }
  if (filters?.category && filters.category.length > 0) {
    conditions.push({ category: { in: filters.category as MaintenanceTicketCategory[] } });
  }
  if (filters?.priority && filters.priority.length > 0) {
    conditions.push({ priority: { in: filters.priority as MaintenanceTicketPriority[] } });
  }
  const term = filters?.search?.trim();
  if (term) {
    conditions.push({ OR: [{ title: contains(term) }, { description: contains(term) }] });
  }
  return conditions.length > 0 ? { AND: [visibility, ...conditions] } : visibility;
}
