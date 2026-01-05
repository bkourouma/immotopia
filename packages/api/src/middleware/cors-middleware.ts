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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // Exposed headers
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
}
