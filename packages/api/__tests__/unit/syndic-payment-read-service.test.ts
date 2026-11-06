const assertSyndicate = jest.fn().mockResolvedValue(undefined);
const count = jest.fn().mockResolvedValue(5001);
const findAllocations = jest.fn().mockResolvedValue([]);
const findMethods = jest.fn().mockResolvedValue([{ method: 'VIREMENT' }]);
const queryRaw = jest.fn().mockResolvedValue([{ id: '12345678-0000-4000-8000-000000000001' }]);

jest.mock('../../src/lib/syndics/queries', () => ({
  assertSyndicateTenantOwnership: (...args: unknown[]) => assertSyndicate(...args)
}));
jest.mock('../../src/utils/database', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    chargePaymentAllocation: {
      count: (...args: unknown[]) => count(...args),
      findMany: (...args: unknown[]) => findAllocations(...args)
    },
    chargePayment: { findMany: (...args: unknown[]) => findMethods(...args) }
  }
}));

import { listSyndicPaymentAllocations } from '../../src/services/syndic-payment-read-service';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('liste des affectations de paiements', () => {
  it('pagine au-delà de 5 000, filtre le total et les lignes dans la même copropriété du tenant', async () => {
    const result = await listSyndicPaymentAllocations('tenant-a', 'syndic-a', {
      page: 251,
      limit: 20,
      search: 'Awa',
      method: 'VIREMENT',
      amountMin: 100,
      paidFrom: '2026-01-01',
      sort: 'amount:desc'
    });
    expect(assertSyndicate).toHaveBeenCalledWith('tenant-a', 'syndic-a');
    const where = count.mock.calls[0][0].where;
    expect(where).toMatchObject({
      chargeCall: { syndicateId: 'syndic-a', syndicate: { tenantId: 'tenant-a' } },
      payment: { method: 'VIREMENT' },
      amount: { gte: 100 },
      AND: [{ payment: { paidAt: { gte: new Date('2026-01-01T00:00:00.000Z') } } }, { OR: expect.any(Array) }]
    });
    expect(findAllocations).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 5000,
        take: 20,
        orderBy: [{ amount: 'desc' }, { id: 'asc' }]
      })
    );
    expect(findMethods).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          allocations: { some: { chargeCall: { syndicateId: 'syndic-a', syndicate: { tenantId: 'tenant-a' } } } }
        }
      })
    );
    expect(result).toEqual({ items: [], total: 5001, methods: ['VIREMENT'] });
  });

  it('résout la référence courte d’appel dans la même copropriété avant le filtre', async () => {
    await listSyndicPaymentAllocations('tenant-a', 'syndic-a', {
      page: 1,
      limit: 20,
      search: 'APPEL-12345678'
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0].slice(1, 3)).toEqual(['tenant-a', 'syndic-a']);
    expect(count.mock.calls[0][0].where.AND[0].OR).toContainEqual({
      chargeCall: { id: { in: ['12345678-0000-4000-8000-000000000001'] } }
    });
  });

  it('exige chaque mot sur une colonne quelconque, y compris une référence affichée', async () => {
    await listSyndicPaymentAllocations('tenant-a', 'syndic-a', {
      page: 1,
      limit: 20,
      search: 'Awa A-12 APPEL-12345678'
    });
    const where = count.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(3);
    expect(where.AND[0].OR).toContainEqual({
      chargeCall: { lot: { owner: { firstName: { contains: 'Awa', mode: 'insensitive' } } } }
    });
    expect(where.AND[1].OR).toContainEqual({
      chargeCall: { lot: { lotNumber: { contains: 'A-12', mode: 'insensitive' } } }
    });
    expect(where.AND[2].OR).toContainEqual({
      chargeCall: { id: { in: ['12345678-0000-4000-8000-000000000001'] } }
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(findAllocations.mock.calls[0][0].where).toBe(where);
  });

  it('reconnaît le préfixe APPEL seul comme référence présente sur chaque ligne', async () => {
    await listSyndicPaymentAllocations('tenant-a', 'syndic-a', { page: 1, limit: 20, search: 'APPEL' });
    expect(count.mock.calls[0][0].where.AND).toBeUndefined();
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
