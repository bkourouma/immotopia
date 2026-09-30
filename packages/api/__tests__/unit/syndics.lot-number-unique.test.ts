/**
 * BUG-2026-09-30-025 : le numero de lot est unique dans une copropriete
 * (casse et espaces de bord ignores), a la creation comme a la modification.
 * Une copropriete ou une agence differente accepte le meme numero.
 */

type Lot = { id: string; syndicateId: string; lotNumber: string };

jest.mock('@prisma/client', () => {
  const lots: Lot[] = [];
  const syndicates: Array<{ id: string; tenantId: string }> = [
    { id: 's1', tenantId: 'tenant-a' },
    { id: 's2', tenantId: 'tenant-a' },
    { id: 's3', tenantId: 'tenant-b' }
  ];
  let seq = 0;
  const prisma: any = {
    __lots: lots,
    syndicate: {
      update: jest.fn(async () => ({})),
      findFirst: jest.fn(
        async ({ where }: any) => syndicates.find(s => s.id === where.id && s.tenantId === where.tenantId) ?? null
      )
    },
    syndicateLot: {
      findFirst: jest.fn(async ({ where }: any) => {
        const wanted = where.lotNumber?.equals?.toLowerCase();
        const idOk = (l: Lot) =>
          typeof where.id === 'string' ? l.id === where.id : where.id?.not ? l.id !== where.id.not : true;
        const tenantOk = (l: Lot) =>
          !where.syndicate?.tenantId ||
          syndicates.some(s => s.id === l.syndicateId && s.tenantId === where.syndicate.tenantId);
        return (
          lots.find(
            l =>
              idOk(l) &&
              tenantOk(l) &&
              (!where.syndicateId || l.syndicateId === where.syndicateId) &&
              (wanted === undefined || l.lotNumber.toLowerCase() === wanted)
          ) ?? null
        );
      }),
      create: jest.fn(async ({ data }: any) => {
        const lot = { id: `lot-${++seq}`, ...data };
        lots.push(lot);
        return lot;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const lot = lots.find(l => l.id === where.id)!;
        Object.assign(lot, data);
        return { ...lot, propertyId: null };
      }),
      count: jest.fn(async () => lots.length)
    },
    $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma))
  };
  return { PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma };
});

jest.mock('../../src/services/lot-registry-service', () => ({
  syncLotActivationsTx: jest.fn(async () => ({ activated: [], deactivated: [], quota: null })),
  assertCapacityTx: jest.fn(async () => ({ decision: 'ALLOW' })),
  resolveLotScope: jest.fn(async (_tx: unknown, _tenantId: string, scope: unknown) => scope),
  ACTIVE_SYNDICATE_STATUSES: ['ACTIVE', 'IN_DISPUTE'],
  LOT_QUOTA_REACHED_REASON: 'Quota de lots atteint'
}));

import { createSyndicateLot, updateSyndicateLotByTenant } from '../../src/lib/syndics/queries';
import { ConflictError } from '../../src/middleware/error-middleware';

const { __mockPrisma: mockPrisma } = jest.requireMock('@prisma/client') as { __mockPrisma: any };
const registry = jest.requireMock('../../src/services/lot-registry-service') as { syncLotActivationsTx: jest.Mock };

const base = { lotType: 'APARTMENT' as const, tantiemes: 10 };
const create = (tenantId: string, syndicateId: string, lotNumber: string) =>
  createSyndicateLot(tenantId, { syndicateId, lotNumber, ...base });

describe('Numero de lot unique par copropriete (BUG-025)', () => {
  beforeEach(() => {
    mockPrisma.__lots.length = 0;
    jest.clearAllMocks();
  });

  it('refuse un doublon exact a la creation par un 409 avec errors[lotNumber]', async () => {
    await create('tenant-a', 's1', 'A101');
    const error = await create('tenant-a', 's1', 'A101').catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.statusCode).toBe(409);
    expect(error.errors).toEqual([{ field: 'lotNumber', message: 'Ce numéro de lot existe déjà dans la copropriété' }]);
    expect(mockPrisma.__lots).toHaveLength(1);
  });

  it('ignore la casse et les espaces autour', async () => {
    await create('tenant-a', 's1', 'A1');
    await expect(create('tenant-a', 's1', '  a1 ')).rejects.toBeInstanceOf(ConflictError);
    expect(mockPrisma.__lots).toHaveLength(1);
  });

  it('refuse avant toute ecriture derivee (quota, compte du lot)', async () => {
    await create('tenant-a', 's1', 'A1');
    registry.syncLotActivationsTx.mockClear();
    mockPrisma.syndicateLot.create.mockClear();
    await expect(create('tenant-a', 's1', 'a1')).rejects.toBeInstanceOf(ConflictError);
    expect(mockPrisma.syndicateLot.create).not.toHaveBeenCalled();
    expect(registry.syncLotActivationsTx).not.toHaveBeenCalled();
  });

  it('accepte le meme numero dans une autre copropriete et une autre agence', async () => {
    await create('tenant-a', 's1', 'A1');
    await expect(create('tenant-a', 's2', 'A1')).resolves.toBeDefined();
    await expect(create('tenant-b', 's3', 'A1')).resolves.toBeDefined();
  });

  it('enregistre le numero sans espaces de bord', async () => {
    const lot = await create('tenant-a', 's1', '  B7  ');
    expect(lot.lotNumber).toBe('B7');
  });

  it('transforme la violation de l index unique (course) en 409', async () => {
    mockPrisma.syndicateLot.create.mockRejectedValueOnce(Object.assign(new Error('P2002'), { code: 'P2002' }));
    await expect(create('tenant-a', 's1', 'Z9')).rejects.toBeInstanceOf(ConflictError);
  });

  it('distingue l unicite du bien rattache (propertyId) de celle du numero de lot (B3)', async () => {
    mockPrisma.syndicateLot.create.mockRejectedValueOnce(
      Object.assign(new Error('P2002'), { code: 'P2002', meta: { target: ['property_id'] } })
    );
    const error = await create('tenant-a', 's1', 'Y8').catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.errors[0].field).toBe('propertyId');
    expect(error.message).toContain('bien');
  });

  describe('modification', () => {
    it('refuse de renommer un lot vers le numero d un autre lot (casse ignoree)', async () => {
      await create('tenant-a', 's1', 'A1');
      const b = await create('tenant-a', 's1', 'B1');
      const error = await updateSyndicateLotByTenant('tenant-a', 's1', b.id, { lotNumber: ' a1' }).catch(e => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect(error.errors[0].field).toBe('lotNumber');
      expect(mockPrisma.syndicateLot.update).not.toHaveBeenCalled();
    });

    it('accepte de conserver son propre numero (autre casse) et un numero libre', async () => {
      const a = await create('tenant-a', 's1', 'A1');
      await expect(updateSyndicateLotByTenant('tenant-a', 's1', a.id, { lotNumber: 'a1' })).resolves.toBeDefined();
      await expect(updateSyndicateLotByTenant('tenant-a', 's1', a.id, { lotNumber: 'A2' })).resolves.toBeDefined();
    });
  });
});
