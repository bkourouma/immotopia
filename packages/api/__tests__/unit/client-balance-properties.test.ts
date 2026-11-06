const findMany = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: { property: { findMany: (...args: unknown[]) => findMany(...args) } }
}));

import { listClientBalanceProperties } from '../../src/lib/finance/client-balance-properties';

beforeEach(() => findMany.mockReset());

describe('biens du filtre financier', () => {
  it('borne la requête à l’agence et ne renvoie que id/title', async () => {
    findMany.mockResolvedValue([
      { id: 'p2', title: '', internalReference: 'REF-2', address: 'privée' },
      { id: 'p1', title: 'Maison A', internalReference: 'REF-1', address: 'privée' }
    ]);

    const result = await listClientBalanceProperties('tenant-A');

    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-A', rentalLeases: { some: { tenant_id: 'tenant-A' } } },
      select: { id: true, title: true, internalReference: true }
    });
    expect(result).toEqual([
      { id: 'p1', title: 'Maison A' },
      { id: 'p2', title: 'REF-2' }
    ]);
    expect(JSON.stringify(result)).not.toContain('privée');
  });

  it('refuse une agence absente avant toute requête', async () => {
    await expect(listClientBalanceProperties('')).rejects.toThrow('Contexte tenant requis');
    expect(findMany).not.toHaveBeenCalled();
  });
});
