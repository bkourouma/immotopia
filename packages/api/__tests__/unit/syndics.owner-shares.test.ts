/**
 * BUG-2026-09-30-069 : la somme des parts des proprietaires actuels d'un lot ne
 * depasse jamais 100 % (creation et modification), sans derive flottante ; les
 * lots dont le total reste sous 100 % sont signales.
 */

type Profile = {
  id: string;
  lotId: string;
  ownershipPercentage: number;
  isActive: boolean;
  ownedUntil: Date | null;
  portalAccessToken: string | null;
};

jest.mock('@prisma/client', () => {
  const profiles: Profile[] = [];
  const lots = [
    { id: 'lot-a201', lotNumber: 'A201', syndicateId: 's1' },
    { id: 'lot-b1', lotNumber: 'B1', syndicateId: 's1' }
  ];
  let seq = 0;
  const currentOnly = (p: Profile, where: any) =>
    p.lotId === where.lotId &&
    (where.isActive === undefined || p.isActive === where.isActive) &&
    (!where.id?.not || p.id !== where.id.not) &&
    (!where.OR || p.ownedUntil === null || p.ownedUntil > where.OR[1].ownedUntil.gt);

  const prisma: any = {
    __profiles: profiles,
    syndicate: { findFirst: jest.fn(async () => ({ id: 's1' })) },
    syndicateLot: {
      findFirst: jest.fn(async ({ where }: any) => lots.find(l => l.id === where.id) ?? null),
      update: jest.fn(async () => ({}))
    },
    crmContact: { findFirst: jest.fn(async () => ({ id: 'contact' })) },
    lotOwnerProfile: {
      findMany: jest.fn(async ({ where }: any) => {
        if (where.lot) {
          return profiles
            .filter(p => p.isActive && (p.ownedUntil === null || p.ownedUntil > new Date()))
            .map(p => ({ ...p, lot: { lotNumber: lots.find(l => l.id === p.lotId)!.lotNumber } }));
        }
        return profiles.filter(p => currentOnly(p, where));
      }),
      findFirst: jest.fn(async ({ where }: any) => profiles.find(p => p.id === where.id) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const profile = {
          id: `op${++seq}`,
          portalAccessToken: null,
          ...data,
          // Prisma renvoie null (et non undefined) pour une colonne facultative non renseignee.
          ownedUntil: data.ownedUntil ?? null
        } as Profile;
        profiles.push(profile);
        return profile;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const profile = profiles.find(p => p.id === where.id)!;
        for (const [key, value] of Object.entries(data)) if (value !== undefined) (profile as any)[key] = value;
        return profile;
      })
    },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma))
  };
  return { PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma };
});

import {
  createLotOwnerProfileBySyndicate,
  listIncompleteOwnerSharesBySyndicate,
  updateLotOwnerProfileBySyndicate
} from '../../src/lib/syndics/queries';
import { ConflictError } from '../../src/middleware/error-middleware';
import { createLotOwnerProfileSchema } from '../../src/lib/syndics/schemas';

const { __mockPrisma: mockPrisma } = jest.requireMock('@prisma/client') as { __mockPrisma: any };

const create = (lotId: string, pct: number, extra: Record<string, unknown> = {}) =>
  createLotOwnerProfileBySyndicate('t1', 's1', {
    lotId,
    contactId: 'c1',
    ownershipPercentage: pct,
    ownedSince: new Date('2021-07-02T00:00:00.000Z'),
    ...extra
  });

describe("Parts des proprietaires d'un lot (BUG-069)", () => {
  beforeEach(() => {
    mockPrisma.__profiles.length = 0;
  });

  it('refuse 50 % + 50 % + 30 % = 130 % avec le champ fautif et les chiffres', async () => {
    await create('lot-a201', 50);
    await create('lot-a201', 50);
    const error = await create('lot-a201', 30).catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe('Les parts du lot A201 dépassent 100 % (100 % déjà attribués, 30 % demandés).');
    expect(error.errors).toEqual([{ field: 'ownershipPercentage', message: error.message }]);
    expect(mockPrisma.__profiles).toHaveLength(2);
  });

  it('accepte exactement 100 % sans derive flottante (33,33 + 33,33 + 33,34)', async () => {
    await create('lot-a201', 33.33);
    await create('lot-a201', 33.33);
    await expect(create('lot-a201', 33.34)).resolves.toBeTruthy();
    await expect(create('lot-a201', 0.01)).rejects.toBeInstanceOf(ConflictError);
  });

  it('0,1 + 0,2 puis le reste ne derivent pas (10 % + 20 % + 70 % = 100 %)', async () => {
    await create('lot-a201', 10);
    await create('lot-a201', 20);
    await expect(create('lot-a201', 70)).resolves.toBeTruthy();
  });

  it('ignore les profils termines ou inactifs et les autres lots', async () => {
    await create('lot-a201', 60, { isActive: false });
    await create('lot-a201', 60, { ownedUntil: new Date('2022-01-01T00:00:00.000Z') });
    await create('lot-b1', 100);
    await expect(create('lot-a201', 100)).resolves.toBeTruthy();
  });

  it('refuse une modification qui depasse 100 % mais pas celle qui reste dans la limite', async () => {
    const first = await create('lot-a201', 50);
    const second = await create('lot-a201', 40);
    await expect(
      updateLotOwnerProfileBySyndicate('t1', 's1', second.id, { ownershipPercentage: 60 })
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      updateLotOwnerProfileBySyndicate('t1', 's1', second.id, { ownershipPercentage: 50 })
    ).resolves.toBeTruthy();
    // Reactiver un profil desactive compte aussi.
    await updateLotOwnerProfileBySyndicate('t1', 's1', first.id, { isActive: false });
    const third = await create('lot-a201', 50);
    await expect(updateLotOwnerProfileBySyndicate('t1', 's1', first.id, { isActive: true })).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(third).toBeTruthy();
  });

  it('bloque les parts nulles, negatives ou superieures a 100 % a la validation', () => {
    const base = {
      lotId: '11111111-1111-4111-8111-111111111111',
      contactId: '22222222-2222-4222-8222-222222222222',
      ownedSince: '2021-07-02'
    };
    for (const bad of [0, -5, 100.01]) {
      expect(createLotOwnerProfileSchema.safeParse({ ...base, ownershipPercentage: bad }).success).toBe(false);
    }
    expect(createLotOwnerProfileSchema.safeParse({ ...base, ownershipPercentage: 30 }).success).toBe(true);
  });

  it('signale les lots dont les parts sont incompletes (agregat serveur)', async () => {
    await create('lot-a201', 50);
    await create('lot-a201', 20);
    await create('lot-b1', 100);
    const incomplete = await listIncompleteOwnerSharesBySyndicate('t1', 's1');
    expect(incomplete).toEqual([{ lotId: 'lot-a201', lotNumber: 'A201', totalPercentage: 70 }]);
  });
});
