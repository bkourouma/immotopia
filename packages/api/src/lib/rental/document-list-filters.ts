/**
 * Liste des documents de location : paramètres de recherche ajoutés
 * (`search`, `from`, `to`). Validation Zod (400 si invalide) puis application
 * sur le `where` Prisma. Le `tenant_id` est déjà posé par le service ; ces
 * filtres ne font que RESTREINDRE (combinés par `AND`, jamais d'écrasement).
 */
import type { Request } from 'express';
import { z } from 'zod';
import { BadRequestError } from '../../middleware/error-middleware';
import { dayOrderRefinement, dayRange, zDay, zSearch } from '../../utils/list-query-schemas';
import { t } from '../../i18n';
import { escapeLike } from '../../utils/like-escape';

export interface DocumentListExtras {
  search?: string;
  from?: string;
  to?: string;
}

const documentListExtrasSchema = z
  .object({
    search: zSearch(),
    from: zDay,
    to: zDay
  })
  .superRefine(dayOrderRefinement('from', 'to'));

/** Valide `search`, `from`, `to` (période d'émission) ; toute valeur invalide lève une 400. */
export function parseDocumentListExtras(query: Request['query']): DocumentListExtras {
  const parsed = documentListExtrasSchema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestError(
      t('Paramètres de recherche invalides.'),
      parsed.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message }))
    );
  }
  const { search, from, to } = parsed.data;
  return {
    ...(search ? { search } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {})
  };
}

/** Ajoute recherche libre (n° de document, titre, n° de bail) et période d'émission au `where`. */
export function applyDocumentListExtras(where: any, extras?: DocumentListExtras): void {
  if (!extras) return;
  const and: any[] = [];
  if (extras.search) {
    const contains = { contains: escapeLike(extras.search), mode: 'insensitive' };
    and.push({
      OR: [{ document_number: contains }, { title: contains }, { lease: { is: { lease_number: contains } } }]
    });
  }
  const issued = dayRange(extras.from, extras.to);
  if (issued) where.issued_at = issued;
  if (and.length > 0) where.AND = [...(Array.isArray(where.AND) ? where.AND : []), ...and];
}
