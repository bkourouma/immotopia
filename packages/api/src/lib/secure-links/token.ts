import crypto from 'crypto';

/** 32 octets aléatoires, soit 256 bits, encodés en base64url (43 caractères). */
const TOKEN_BYTES = 32;

/** Bornes de longueur d'un jeton présenté : rejette l'évident avant tout accès à la base. */
export const TOKEN_MIN_LENGTH = 20;
export const TOKEN_MAX_LENGTH = 128;

/** Jeton en clair, à remettre UNE seule fois à l'appelant. Jamais stocké, jamais journalisé. */
export function generateToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Empreinte SHA-256 hexadécimale : la seule forme persistée. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Comparaison à temps constant de deux empreintes hexadécimales. */
export function hashesMatch(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  if (expected.length === 0 || expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

/** Vrai si la valeur a la forme d'un jeton (chaîne base64url bornée) ; ne dit rien de sa validité. */
export function looksLikeToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= TOKEN_MIN_LENGTH &&
    value.length <= TOKEN_MAX_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}
