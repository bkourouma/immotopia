import { Request, Response, NextFunction } from 'express';
import { runWithRequestContext } from '../utils/request-context';

/**
 * Stores the current request's client IP and User-Agent in AsyncLocalStorage
 * so that audit logs (and other code) can access them without receiving req.
 * Must run early in the middleware chain.
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket?.remoteAddress || null;
  const userAgent = (req.get && req.get('User-Agent')) || null;

  runWithRequestContext({ ip, userAgent }, () => {
    next();
  });
}
