import { AxiosError } from 'axios';
import { t } from '../i18n/t';

/**
 * Error handler utility
 * Handles API errors consistently
 */
export class ApiError extends Error {
  statusCode?: number;
  errors?: Array<{ field: string; message: string }>;
  code?: string;

  constructor(message: string, statusCode?: number, errors?: Array<{ field: string; message: string }>, code?: string) {
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
      return t('Votre session a expiré. Veuillez vous reconnecter.');
    }
    if (response?.status === 403) {
      return t('Accès refusé. Permissions insuffisantes.');
    }
    if (response?.status === 404) {
      return t('Ressource non trouvée.');
    }
    if (response?.status === 429) {
      return t('Trop de tentatives. Veuillez réessayer dans quelques instants.');
    }
    if (response?.status === 500) {
      return t('Une erreur est survenue côté serveur. Veuillez réessayer plus tard.');
    }
    return t('Une erreur est survenue lors de la communication avec le serveur.');
  }

  if (error instanceof Error) {
    return error.message;
  }

  return t('Une erreur inattendue est survenue.');
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

/**
 * Vrai quand l'API refuse l'action faute de droits (403 RBAC). Les refus
 * d'abonnement (403 avec un `code`) ont leur propre message
 * (`subscription-denial-notice.ts`) et ne sont pas des manques de droits.
 */
export function isPermissionDenied(error: unknown): boolean {
  if (!(error instanceof AxiosError)) {
    const response = (error as { response?: { status?: number; data?: { code?: unknown } } } | null)?.response;
    return response?.status === 403 && !response.data?.code;
  }
  return error.response?.status === 403 && !error.response.data?.code;
}

/**
 * Message d'une erreur d'écriture : le texte clair `forbidden` quand la
 * personne n'a pas les droits, sinon le message du serveur, sinon `fallback`.
 */
export function writeErrorMessage(error: unknown, fallback: string, forbidden: string): string {
  if (isPermissionDenied(error)) return forbidden;
  const message = (error as { response?: { data?: { message?: unknown } } } | null)?.response?.data?.message;
  return typeof message === 'string' && message.length > 0 ? message : fallback;
}
