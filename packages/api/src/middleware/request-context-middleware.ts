import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { runWithRequestContext } from '../utils/request-context';

/** Identifiant entrant accepté tel quel : court, caractères sûrs (pas d'injection dans les logs). */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

function resolveRequestId(req: Request): string {
  const incoming = req.get && req.get('X-Request-Id');
  return incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

/**
 * Stores the current request's client IP, User-Agent and request id in
 * AsyncLocalStorage so that audit logs (and other code) can access them without
 * receiving req. The actor (user, agency) is added later by `authenticate` and
 * the tenant middlewares through `setAuditActor`.
 * The request id is echoed in `X-Request-Id`, so a user can quote it to support
 * and every audit event of the request can be found from it.
 * Must run early in the middleware chain.
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket?.remoteAddress || null;
  const userAgent = (req.get && req.get('User-Agent')) || null;
  const requestId = resolveRequestId(req);

  if (typeof res.setHeader === 'function') {
    res.setHeader('X-Request-Id', requestId);
  }

  runWithRequestContext({ ip, userAgent, requestId }, () => {
    next();
  });
}
