import type { Request } from 'express';
import { BadRequestError, NotFoundError } from '../../../middleware/error-middleware';

/**
 * Aides de contrôleur partagées par les routes assurances et carnet
 * d'entretien (spec 032).
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  return tenantId;
}

/**
 * Paramètre d'URL portant un `@db.Uuid` : une valeur qui n'est pas un UUID
 * donne la même `NotFoundError` (404) qu'un objet inexistant, au lieu d'une
 * erreur Prisma 500.
 */
export function uuidParam(req: Request, name: string, notFoundMessage: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new NotFoundError(notFoundMessage);
  return value;
}
