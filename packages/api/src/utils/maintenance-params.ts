import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { t } from '../i18n';

const uuidSchema = z.string().uuid();

/**
 * Identifiant `?leaseId=…` / `?assignedVendorId=…` d'un filtre de liste.
 *
 * Ces colonnes sont des UUID : une valeur qui n'en est pas un (ou un tableau,
 * `?leaseId=a&leaseId=b`) remontait jusqu'à Prisma (`P2023`) et sortait en 500.
 * Absent ou vide : pas de filtre. Illisible : 400 typé, qui nomme le paramètre.
 */
export function parseUuidQuery(raw: unknown, name: string): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const parsed = uuidSchema.safeParse(typeof raw === 'string' ? raw.trim() : raw);
  if (!parsed.success) {
    throw new BadRequestError(t('Paramètre invalide : {{name}}.', { name }), [
      { field: name, message: t('Identifiant mal formé.') }
    ]);
  }
  return parsed.data;
}

/**
 * Garde de paramètre de chemin (`router.param`) : `:ticketId` et `:vendorId`
 * sont des UUID. Un identifiant qui n'en est pas un ne désigne rien : 404, comme
 * un objet inexistant ou d'une autre agence, jamais un 500 de Prisma.
 */
export function uuidPathParam(notFoundMessage: string) {
  return (_req: Request, _res: Response, next: NextFunction, value: string) => {
    if (!uuidSchema.safeParse(value).success) {
      next(new NotFoundError(notFoundMessage));
      return;
    }
    next();
  };
}
