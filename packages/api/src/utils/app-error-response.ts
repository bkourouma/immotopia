import type { Response } from 'express';
import { AppError } from '../middleware/error-middleware';
import { t } from '../i18n';

const STATUS_LABELS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity'
};

/**
 * Reponse d'une erreur typee (`NotFoundError`, `ConflictError`...) pour les
 * controleurs qui gerent encore leur `try/catch` eux-memes au lieu de passer
 * par `asyncHandler` : statut et message viennent de l'erreur, le message est
 * traduit dans la langue de la requete.
 *
 * Renvoie `true` quand la reponse est partie ; le controleur n'a alors plus
 * rien a faire. Les autres erreurs suivent leur chemin habituel.
 */
export function respondWithAppError(res: Response, error: unknown): boolean {
  if (!(error instanceof AppError) || error.statusCode >= 500) return false;

  res.status(error.statusCode).json({
    success: false,
    error: STATUS_LABELS[error.statusCode] ?? 'Error',
    message: t(error.message),
    ...(error.code ? { code: error.code } : {}),
    ...(error.errors?.length ? { errors: error.errors.map(entry => ({ ...entry, message: t(entry.message) })) } : {})
  });
  return true;
}
