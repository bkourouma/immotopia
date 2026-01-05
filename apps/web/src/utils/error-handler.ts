import { AxiosError } from 'axios';

/**
 * Error handler utility
 * Handles API errors consistently
 */
export class ApiError extends Error {
  statusCode?: number;
  errors?: Array<{ field: string; message: string }>;
  code?: string;

  constructor(
    message: string,
    statusCode?: number,
    errors?: Array<{ field: string; message: string }>,
    code?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.code = code;
  }
}

/**
 * Handle API error
 * @param error - Axios error or Error
 * @returns Formatted error message
 */
export function handleApiError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof AxiosError) {
    const response = error.response;
    if (response?.data?.message) {
      return response.data.message;
    }
    if (response?.status === 401) {
      return 'Votre session a expiré. Veuillez vous reconnecter.';
    }
    if (response?.status === 403) {
      return 'Accès refusé. Permissions insuffisantes.';
    }
    if (response?.status === 404) {
      return 'Ressource non trouvée.';
    }
    if (response?.status === 429) {
      return 'Trop de tentatives. Veuillez réessayer dans quelques instants.';
    }
    if (response?.status === 500) {
      return 'Une erreur est survenue côté serveur. Veuillez réessayer plus tard.';
    }
    return 'Une erreur est survenue lors de la communication avec le serveur.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Une erreur inattendue est survenue.';
}

/**
 * Extract field errors from API error
 * @param error - Axios error
 * @returns Field errors object
 */
export function extractFieldErrors(error: unknown): Record<string, string> {
  if (error instanceof AxiosError) {
    const errors = error.response?.data?.errors;
    if (Array.isArray(errors)) {
      const fieldErrors: Record<string, string> = {};
      errors.forEach((err: { field: string; message: string }) => {
        fieldErrors[err.field] = err.message;
      });
      return fieldErrors;
    }
  }
  return {};
}


