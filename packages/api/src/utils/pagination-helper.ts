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
