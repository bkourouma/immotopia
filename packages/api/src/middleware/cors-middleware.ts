import { Request, Response, NextFunction } from 'express';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const ALLOWED_ORIGINS = [FRONTEND_URL];

/**
 * CORS middleware
 * Allows only frontend domain to access the API
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  // Allow requests from frontend domain
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    // Allow credentials (cookies) only for allowed origins
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    // Allow requests without origin (e.g., direct API calls, Postman, curl)
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Cannot use credentials with wildcard origin
  }

  // Allowed methods
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');

  // Allowed headers
  //
  // Idempotency-Key : posé par `apps/web/src/services/tenant-service.ts` sur
  // la création d'agence, pour qu'un double clic pendant la requête en vol ne
  // crée pas une seconde agence.
  // X-Portal-Tenant-Id : posé par `apps/web/src/utils/api-client.ts` sur les
  // routes `/portal/*`, pour qu'un client rattaché à plusieurs agences dise
  // laquelle.
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Idempotency-Key, X-Portal-Tenant-Id'
  );

  // Exposed headers
  // Content-Disposition : sans lui, le front d'une autre origine ne lit pas
  // le nom du fichier d'un export et doit en inventer un.
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Content-Disposition');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
}
