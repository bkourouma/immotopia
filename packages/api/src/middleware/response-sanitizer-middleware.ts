import { Request, Response, NextFunction } from 'express';

/**
 * Last line of defence against leaking secrets in JSON responses.
 *
 * Services are expected to `select` the user fields they return, but a single
 * `include: { user: true }` hands the whole User row — `passwordHash`
 * included — to `res.json`. This middleware strips those keys, whatever the
 * depth, before the response leaves the API.
 *
 * It is a safety net, not a licence: keep writing explicit `select`s.
 */

/** Keys that must never appear in an API response. */
export const SECRET_RESPONSE_KEYS = new Set(['passwordHash', 'password_hash', 'tokenHash', 'token_hash']);

const MAX_DEPTH = 20;

/** Copy of `value` without the secret keys. Leaves dates, buffers and primitives untouched. */
export function stripSecrets(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) {
    return value;
  }

  if (value instanceof Date || Buffer.isBuffer(value)) {
    return value;
  }

  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(item => stripSecrets(item, depth + 1, seen));
  }

  // Prisma.Decimal and other class instances serialise through toJSON: keep them as they are.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_RESPONSE_KEYS.has(key)) {
      continue;
    }
    out[key] = stripSecrets(child, depth + 1, seen);
  }
  return out;
}

export const responseSanitizer = (_req: Request, res: Response, next: NextFunction): void => {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => originalJson(stripSecrets(body))) as Response['json'];
  next();
};
