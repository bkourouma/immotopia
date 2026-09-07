export function badRequest(message: string, details?: unknown) {
  const error: any = new Error(message);
  error.status = 400;
  if (details) {
    error.details = details;
  }
  return error;
}

export function forbidden(message = 'Accès interdit') {
  const error: any = new Error(message);
  error.status = 403;
  return error;
}

export function notFound(message = 'Ressource introuvable') {
  const error: any = new Error(message);
  error.status = 404;
  return error;
}

export function serverError(message = 'Erreur interne du serveur', cause?: unknown) {
  const error: any = new Error(message);
  error.status = 500;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

