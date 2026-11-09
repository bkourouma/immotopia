import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { maskSensitivePath } from '../utils/sensitive-path';

/**
 * URL telle qu'elle est journalisée.
 *
 * Le jeton d'un chemin (signature électronique) et la valeur des paramètres de
 * requête sensibles (`token` de vérification d'e-mail et de newsletter,
 * `hub.verify_token` et `hub.challenge` du webhook WhatsApp Cloud) sont
 * remplacés par `[masqué]` sur tous les chemins ; toute autre URL est rendue
 * telle quelle. Logique commune : `utils/sensitive-path.ts`.
 */
export function maskRequestUrl(rawUrl: string): string {
  return maskSensitivePath(rawUrl);
}

/**
 * Request logging middleware
 * Logs all API requests with method, URL, IP, and timestamp
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  // Calculée une fois, à l'entrée : un routeur monté sur un préfixe réécrit
  // `req.url` pendant son traitement.
  const url = maskRequestUrl(req.url);

  // Log request
  logger.info('Incoming request', {
    method: req.method,
    url,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    };

    if (res.statusCode >= 500) {
      logger.error('Request failed', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Request error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
}
