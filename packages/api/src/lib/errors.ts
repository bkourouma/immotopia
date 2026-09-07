export function badRequest(message: string, details?: unknown) {
  const error: any = new Error(message);
  error.status = 400;
  if (details) {
    error.details = details;
  }
  return error;
}

export function forbidden(message = 'Acces interdit') {
  const error: any = new Error(message);
  error.status = 403;
  return error;
}

export function unauthorized(message = 'Authentification requise') {
  const error: any = new Error(message);
  error.status = 401;
  return error;
}

export function notFound(message = 'Ressource introuvable') {
  const error: any = new Error(message);
  error.status = 404;
  return error;
}

export function conflict(message = 'Conflit de donnees', details?: unknown) {
  const error: any = new Error(message);
  error.status = 409;
  if (details) {
    error.details = details;
  }
  return error;
}

export function unprocessableEntity(message = 'Donnees invalides', details?: unknown) {
  const error: any = new Error(message);
  error.status = 422;
  if (details) {
    error.details = details;
  }
  return error;
}

export function tenantIsolationError(message = 'Violation d isolation tenant') {
  const error: any = new Error(message);
  error.status = 403;
  error.code = 'TENANT_ISOLATION_ERROR';
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
