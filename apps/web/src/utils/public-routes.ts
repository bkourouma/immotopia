/**
 * Pages publiques à jeton : elles s'authentifient par leur lien, jamais par la
 * session. L'amorçage d'authentification (`/auth/me`, puis `/auth/refresh`) n'a
 * rien à y faire : sans session il ne produirait que des 401 dans le réseau et la console.
 */
const PUBLIC_TOKEN_PATHS = ['/acces-partage', '/rapport-proprietaire', '/payer'];

export function isPublicTokenPath(pathname: string): boolean {
  return PUBLIC_TOKEN_PATHS.some(base => pathname === base || pathname.startsWith(`${base}/`));
}
