import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JWTPayload } from '../types/auth-types';

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_in_production_secret_key_12345';
const ACCESS_TOKEN_EXPIRY = (process.env.JWT_EXPIRES_IN || '15m') as jwt.SignOptions['expiresIn'];

/**
 * Generate JWT access token
 * @param payload - JWT payload
 * @returns Signed JWT access token
 */
export function generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: 'immobillier-api',
    audience: 'immobillier-web'
  });
}

/**
 * Generate refresh token (random string, not JWT)
 * @returns Random refresh token string
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify JWT access token
 * @param token - JWT access token to verify
 * @returns Decoded JWT payload or null if invalid
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'immobillier-api',
      audience: 'immobillier-web'
    }) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Decode JWT token without verification (for debugging)
 * @param token - JWT token to decode
 * @returns Decoded payload or null if invalid format
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch (error) {
    return null;
  }
}
