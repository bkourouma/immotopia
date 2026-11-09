import { Prisma } from '@prisma/client';
import { prisma } from '../utils/database';
import { escapeLike, dayEnd, dayStart } from '../utils/list-query-schemas';
import { assertSyndicateTenantOwnership } from '../lib/syndics/queries';

export interface SyndicPaymentListQuery {
  page: number;
  limit: number;
  search?: string;
  method?: string;
  paidFrom?: string;
  paidTo?: string;
  amountMin?: number;
  amountMax?: number;
  sort?: 'paidAt:asc' | 'paidAt:desc' | 'amount:asc' | 'amount:desc';
}

/** Une ligne correspond à une affectation, comme `payments[]` sur un appel. */
export async function listSyndicPaymentAllocations(
  tenantId: string,
  syndicateId: string,
  query: SyndicPaymentListQuery
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const words = query.search?.trim().split(/\s+/).filter(Boolean) ?? [];
  const shortReferences = words.map(word => word.match(/^APPEL-([0-9a-f]{1,8})$/i)?.[1] ?? null);
  // `ChargeCall.id` est un UUID PostgreSQL : un `startsWith` Prisma émettrait
  // un ILIKE sur uuid. Le cast explicite garde la recherche sur APPEL-xxxxxxxx.
  const referenceIds = await Promise.all(
    shortReferences.map(prefix =>
      prefix
        ? prisma.$queryRaw<Array<{ id: string }>>`
        SELECT cc.id::text AS id FROM charge_calls cc
        JOIN syndicates s ON s.id = cc.syndicate_id
        WHERE s.tenant_id = ${tenantId}
          AND cc.syndicate_id = ${syndicateId}::uuid
          AND cc.id::text ILIKE ${`${prefix}%`}
      `
        : Promise.resolve([])
    )
  );

  const where: Prisma.ChargePaymentAllocationWhereInput = {
    chargeCall: { syndicateId, syndicate: { tenantId } },
    ...(query.method ? { payment: { method: query.method } } : {}),
    ...(query.amountMin !== undefined || query.amountMax !== undefined
      ? {
          amount: {
            ...(query.amountMin !== undefined ? { gte: query.amountMin } : {}),
            ...(query.amountMax !== undefined ? { lte: query.amountMax } : {})
          }
        }
      : {})
  };

  const and: Prisma.ChargePaymentAllocationWhereInput[] = [];
  if (query.paidFrom || query.paidTo) {
    and.push({
      payment: {
        paidAt: {
          ...(query.paidFrom ? { gte: dayStart(query.paidFrom) } : {}),
          ...(query.paidTo ? { lte: dayEnd(query.paidTo) } : {})
        }
      }
    });
  }
  for (const [index, word] of words.entries()) {
    // La référence affichée commence toujours par APPEL-. Ce mot seul
    // correspond à toutes les lignes ; les autres mots restent obligatoires.
    if (/^APPEL-?$/i.test(word)) continue;
    const term = escapeLike(word);
    and.push({
      OR: [
        { chargeCall: { period: { contains: term, mode: 'insensitive' } } },
        { chargeCall: { lot: { lotNumber: { contains: term, mode: 'insensitive' } } } },
        { chargeCall: { lot: { property: { title: { contains: term, mode: 'insensitive' } } } } },
        { chargeCall: { lot: { owner: { firstName: { contains: term, mode: 'insensitive' } } } } },
        { chargeCall: { lot: { owner: { lastName: { contains: term, mode: 'insensitive' } } } } },
        { chargeCall: { lot: { owner: { email: { contains: term, mode: 'insensitive' } } } } },
        ...(referenceIds[index].length ? [{ chargeCall: { id: { in: referenceIds[index].map(row => row.id) } } }] : [])
      ]
    });
  }
  if (and.length) where.AND = and;

  const [total, items, methodRows] = await Promise.all([
    prisma.chargePaymentAllocation.count({ where }),
    prisma.chargePaymentAllocation.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [
        query.sort?.startsWith('amount:')
          ? { amount: query.sort.endsWith(':asc') ? 'asc' : 'desc' }
          : { payment: { paidAt: query.sort === 'paidAt:asc' ? 'asc' : 'desc' } },
        { id: 'asc' }
      ],
      select: {
        id: true,
        amount: true,
        payment: { select: { paidAt: true, method: true } },
        chargeCall: {
          select: {
            id: true,
            period: true,
            lotId: true,
            lot: {
              select: {
                lotNumber: true,
                lotType: true,
                generalShares: true,
                property: { select: { title: true } },
                owner: { select: { firstName: true, lastName: true, email: true } }
              }
            }
          }
        }
      }
    }),
    prisma.chargePayment.findMany({
      where: { allocations: { some: { chargeCall: { syndicateId, syndicate: { tenantId } } } } },
      distinct: ['method'],
      select: { method: true }
    })
  ]);
  return {
    items,
    total,
    methods: methodRows
      .map(row => row.method)
      .filter((method): method is string => Boolean(method))
      .sort()
  };
}
