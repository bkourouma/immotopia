import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt-utils';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  // Try to get token from cookies first (for browser requests)
  let token = req.cookies?.accessToken;

  // Fallback to Authorization header (for API clients)
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      token = authHeader.split(' ')[1]; // Bearer <token>
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Authentication token missing' });
    return;
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    res.status(403).json({ message: 'Invalid or expired token' });
    return;
  }

  // Attach user identity to request
  req.user = decoded;
  next();
};

// Optional: Middleware to check if user is authenticated but not fail if not
export const optionalAuthenticate = (req: Request, _res: Response, next: NextFunction) => {
  // Try to get token from cookies first (for browser requests)
  let token = req.cookies?.accessToken;

  // Fallback to Authorization header (for API clients)
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      token = authHeader.split(' ')[1];
    }
  }

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  next();
};
