import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../utils/database';
import { REMITTANCE_SUMMARY_SELECT, toRemittanceSummaryDto } from '../direct-debit/remittance-dto';
import { listSyndicMandatesQuerySchema } from '../direct-debit/schemas';
import { listSyndicRemittancesQuerySchema } from '../direct-debit/syndic/schemas';
import { scopeWhere, syndicCtx } from '../direct-debit/syndic/scope';
import { checkDayRange, optionalDayQuery, searchQuery } from './payment-list-filters';

/**
 * Lot SYN-A : recherche serveur des listes du prélèvement d'une copropriété
 * (mandats, remises). La logique de liste des remises vit dans une bibliothèque
 * partagée avec la gestion locative (`lib/direct-debit/remittances.ts`), laissée
 * intacte : la variante syndic est lue ici, avec le même sélecteur et le même
 * DTO, toujours bornée à l'agence ET à la copropriété.
 */

/** Une chaîne vide (`?search=`) équivaut à un paramètre absent. */
const withoutEmptyValues = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  return Object.fromEntries(
    Object.entries(raw).filter(([, value]) => !(typeof value === 'string' && value.trim() === ''))
  );
};

/** Mandats : `search` (référence, copropriétaire, lot, titulaire, 4 derniers chiffres de l'IBAN) existe déjà. */
export const syndicMandatesListQuerySchema = z.preprocess(withoutEmptyValues, listSyndicMandatesQuerySchema);

/** Remises : statut, recherche sur la référence, date de prélèvement du… au…. */
export const syndicRemittancesListQuerySchema = z.preprocess(
  withoutEmptyValues,
  listSyndicRemittancesQuerySchema
    .extend({
      search: searchQuery,
      from: optionalDayQuery,
      to: optionalDayQuery
    })
    .superRefine(checkDayRange)
);
export type SyndicRemittancesListQuery = z.infer<typeof syndicRemittancesListQuerySchema>;

/**
 * Référence de remise `PRL-AAAA-NNNN` (complète) ou `PRL-AAAA` / `AAAA` (année
 * seule). Un texte qui ne ressemble pas à une référence ne ramène rien.
 */
function referenceWhere(search: string): Prisma.DirectDebitRemittanceWhereInput[] {
  const match = /^(?:PRL-?)?(\d{4})(?:-(\d{1,6}))?$/i.exec(search.trim());
  if (!match) return [];
  const year = Number(match[1]);
  return [match[2] ? { year, sequence: Number(match[2]) } : { year }];
}

export async function listSyndicRemittancesFiltered(
  tenantId: string,
  syndicateId: string,
  query: SyndicRemittancesListQuery
) {
  const where: Prisma.DirectDebitRemittanceWhereInput = {
    tenantId,
    ...scopeWhere(syndicCtx(syndicateId)),
    ...(query.status ? { status: query.status } : {}),
    ...(query.from || query.to
      ? { collectionDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
      : {}),
    // Sans référence reconnaissable : aucun résultat (filtre impossible), pas un 400.
    ...(query.search
      ? { OR: referenceWhere(query.search).length > 0 ? referenceWhere(query.search) : [{ id: { in: [] } }] }
      : {})
  };
  const [total, rows] = await Promise.all([
    prisma.directDebitRemittance.count({ where }),
    prisma.directDebitRemittance.findMany({
      where,
      select: REMITTANCE_SUMMARY_SELECT,
      orderBy: [{ collectionDate: 'desc' }, { year: 'desc' }, { sequence: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize
    })
  ]);
  return { items: rows.map(toRemittanceSummaryDto), total, page: query.page, pageSize: query.pageSize };
}
