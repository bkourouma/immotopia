/**
 * « Dernier reversement » (BUG-003) : plusieurs reversements le même jour ont
 * le même `paidAt` ; le plus récent doit gagner, pas le plus ancien.
 */
type Row = { ownerClientId: string; year: number; sequence: number; amount: number; paidAt: Date; createdAt: Date };

let rows: Row[] = [];

jest.mock('../../src/utils/database', () => ({
  prisma: {
    thirdPartyAccount: { findMany: jest.fn(async () => []) },
    // Applique réellement le tri demandé, pour que le test éprouve `orderBy`.
    ownerPayout: {
      findMany: jest.fn(
        async (args: { orderBy: Array<Record<string, 'asc' | 'desc'>> | Record<string, 'asc' | 'desc'> }) => {
          const criteria = (Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]).map(o => Object.entries(o)[0]);
          return [...rows].sort((a, b) => {
            for (const [key, dir] of criteria) {
              const av = (a as any)[key];
              const bv = (b as any)[key];
              const diff = av instanceof Date ? av.getTime() - bv.getTime() : av - bv;
              if (diff !== 0) return dir === 'desc' ? -diff : diff;
            }
            return 0;
          });
        }
      )
    }
  }
}));
jest.mock('../../src/lib/rental-fees/materialize', () => ({
  materializeManagementFees: jest.fn(async () => undefined)
}));
jest.mock('../../src/lib/owner-account/sync', () => ({
  agencyOwnerWhere: jest.fn(),
  getOrCreateOwnerAccountTx: jest.fn(),
  listAgencyOwners: jest.fn(async () => [{ id: 'o1', user: { fullName: 'Owner', email: 'o@x.y' } }]),
  OWNER_SOURCE: {},
  reverseDocumentEntryTx: jest.fn(),
  syncOwnerAccount: jest.fn(async () => undefined)
}));

import { listOwnerAccounts } from '../../src/lib/owner-account/service';

const noon = new Date('2026-09-10T12:00:00.000Z');

describe('listOwnerAccounts : dernier reversement', () => {
  it('à même paidAt, retient le reversement créé en dernier', async () => {
    rows = [
      {
        ownerClientId: 'o1',
        year: 2026,
        sequence: 1,
        amount: 100,
        paidAt: noon,
        createdAt: new Date('2026-09-10T08:00:00Z')
      },
      {
        ownerClientId: 'o1',
        year: 2026,
        sequence: 2,
        amount: 200,
        paidAt: noon,
        createdAt: new Date('2026-09-10T09:00:00Z')
      }
    ];
    const [owner] = await listOwnerAccounts('t1');
    expect(owner.lastPayout?.number).toBe('REV-2026-0002');
    expect(owner.lastPayout?.amount).toBe(200);
  });

  it('à même paidAt et même createdAt, départage par le numéro', async () => {
    const created = new Date('2026-09-10T08:00:00Z');
    rows = [
      { ownerClientId: 'o1', year: 2026, sequence: 3, amount: 300, paidAt: noon, createdAt: created },
      { ownerClientId: 'o1', year: 2026, sequence: 4, amount: 400, paidAt: noon, createdAt: created }
    ];
    const [owner] = await listOwnerAccounts('t1');
    expect(owner.lastPayout?.number).toBe('REV-2026-0004');
  });
});
