import { BadRequestError } from '../middleware/error-middleware';
import { t } from '../i18n';

/**
 * Pagination helper utilities
 * Provides consistent pagination logic across all services
 */

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  skip: number;
}

/**
 * Calculate pagination parameters
 * @param options - Pagination options (page, limit)
 * @param maxLimit - Maximum items per page (default: 100)
 * @returns Pagination result with calculated values
 */
export function calculatePagination(options?: PaginationOptions, maxLimit: number = 100): PaginationResult {
  const page = Math.max(1, options?.page || 1);
  const limit = Math.min(maxLimit, Math.max(1, options?.limit || 20));
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
    total: 0, // Will be set by the caller
    totalPages: 0 // Will be calculated after total is known
  };
}

/**
 * Create pagination metadata from total count
 * @param total - Total number of items
 * @param pagination - Pagination options
 * @returns Pagination metadata
 */
export function createPaginationMetadata(total: number, pagination: PaginationResult): Omit<PaginationResult, 'skip'> {
  return {
    page: pagination.page,
    limit: pagination.limit,
    total,
    totalPages: Math.ceil(total / pagination.limit)
  };
}

/**
 * Validate pagination parameters
 * @param page - Page number
 * @param limit - Items per page
 * @param maxLimit - Maximum items per page
 * @returns Validation result
 */
export function validatePagination(
  page?: number,
  limit?: number,
  maxLimit: number = 100
): { isValid: boolean; error?: string } {
  if (page !== undefined && (page < 1 || !Number.isInteger(page))) {
    return { isValid: false, error: 'Le numéro de page doit être un entier positif' };
  }

  if (limit !== undefined) {
    if (limit < 1 || !Number.isInteger(limit)) {
      return { isValid: false, error: 'La limite doit être un entier positif' };
    }
    if (limit > maxLimit) {
      return { isValid: false, error: `La limite ne peut pas dépasser ${maxLimit}` };
    }
  }

  return { isValid: true };
}

export interface ParsePaginationOptions {
  /** Page par défaut ; `undefined` laisse le service choisir. */
  defaultPage?: number;
  /** Limite par défaut ; `undefined` laisse le service choisir. */
  defaultLimit?: number;
  /** Plafond de `limit` (défaut 1000) : une valeur plus grande est refusée (400), jamais tronquée. */
  maxLimit?: number;
  /** Plafond de `page` (défaut 100000) : au-delà, 400. */
  maxPage?: number;
}

export const DEFAULT_MAX_LIMIT = 1000;
export const DEFAULT_MAX_PAGE = 100000;

function parsePositiveInt(raw: unknown, label: string): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new BadRequestError(t('Paramètre de pagination invalide : {{name}}.', { name: label }));
  }
  const text = String(value).trim();
  if (!/^\d+$/.test(text) || Number(text) < 1 || !Number.isSafeInteger(Number(text))) {
    throw new BadRequestError(t('Paramètre de pagination invalide : {{name}}.', { name: label }), [
      { field: label, message: t('Doit être un entier positif.') }
    ]);
  }
  return Number(text);
}

/**
 * Lit `page` et `limit` d'une query string. Absent : valeur par défaut ;
 * non numérique, nul, négatif ou hors plage : `BadRequestError` (400 traduit) ;
 * `limit` au-delà du plafond : 400 (jamais de troncature silencieuse). Jamais
 * `NaN` ni `skip` hors plage vers Prisma.
 */
export function parsePagination(
  query: { page?: unknown; limit?: unknown } | undefined,
  options: ParsePaginationOptions & { defaultPage: number; defaultLimit: number }
): { page: number; limit: number };
export function parsePagination(
  query: { page?: unknown; limit?: unknown } | undefined,
  options?: ParsePaginationOptions
): { page: number | undefined; limit: number | undefined };
export function parsePagination(
  query: { page?: unknown; limit?: unknown } | undefined,
  options: ParsePaginationOptions = {}
): { page: number | undefined; limit: number | undefined } {
  const maxLimit = options.maxLimit ?? DEFAULT_MAX_LIMIT;
  const maxPage = options.maxPage ?? DEFAULT_MAX_PAGE;
  const page = parsePositiveInt(query?.page, 'page') ?? options.defaultPage;
  const limit = parsePositiveInt(query?.limit, 'limit') ?? options.defaultLimit;
  if (page !== undefined && page > maxPage) {
    throw new BadRequestError(t('Paramètre de pagination invalide : {{name}}.', { name: 'page' }), [
      { field: 'page', message: t('Doit être inférieur ou égal à {{max}}.', { max: maxPage }) }
    ]);
  }
  if (limit !== undefined && limit > maxLimit) {
    throw new BadRequestError(t('Paramètre de pagination invalide : {{name}}.', { name: 'limit' }), [
      { field: 'limit', message: t('Doit être inférieur ou égal à {{max}}.', { max: maxLimit }) }
    ]);
  }
  return { page, limit };
}
