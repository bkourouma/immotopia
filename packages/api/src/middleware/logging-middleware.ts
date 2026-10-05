import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Préfixe du webhook Meta WhatsApp Cloud (lot 041). Recopié ici plutôt
 * qu'importé du routeur : le journal des requêtes ne dépend d'aucun routeur.
 */
const WHATSAPP_CLOUD_WEBHOOK_PATH = '/api/webhooks/whatsapp-cloud';

/** Paramètres de requête jamais écrits en clair dans le journal (spec 041, W6-R3). */
const MASKED_QUERY_PARAMS = new Set(['hub.verify_token', 'hub.challenge']);

const MASK = '[masqué]';

/**
 * URL telle qu'elle est journalisée.
 *
 * Pour le webhook WhatsApp Cloud, la vérification d'abonnement de Meta
 * (`GET …/events?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`) porte
 * le jeton de vérification dans la chaîne de requête : `hub.verify_token` et
 * `hub.challenge` y sont remplacés par `[masqué]`. Toute autre URL est rendue
 * telle quelle.
 */
export function maskRequestUrl(url: string): string {
  const queryStart = url.indexOf('?');
  if (queryStart < 0) return url;
  const path = url.slice(0, queryStart);
  if (path !== WHATSAPP_CLOUD_WEBHOOK_PATH && !path.startsWith(`${WHATSAPP_CLOUD_WEBHOOK_PATH}/`)) {
    return url;
  }
  const masked = url
    .slice(queryStart + 1)
    .split('&')
    .map(pair => {
      const separator = pair.indexOf('=');
      const rawName = separator < 0 ? pair : pair.slice(0, separator);
      let name = rawName;
      try {
        name = decodeURIComponent(rawName.replace(/\+/g, ' '));
      } catch {
        // Nom mal encodé : comparé tel quel.
      }
      return MASKED_QUERY_PARAMS.has(name) ? `${rawName}=${MASK}` : pair;
    })
    .join('&');
  return `${path}?${masked}`;
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
