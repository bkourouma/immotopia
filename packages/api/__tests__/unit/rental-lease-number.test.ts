/**
 * Numéro de bail automatique : plus grand numéro de l'année + 1, et non le
 * nombre de baux + 1 (un bail supprimé faisait retomber sur un numéro pris).
 */

const findMany = jest.fn(async (..._a: any[]): Promise<any[]> => []);

jest.mock('../../src/utils/database', () => ({
  prisma: { rentalLease: { findMany: (...args: any[]) => (findMany as any)(...args) } }
}));

import { generateLeaseNumber, isLeaseNumberCollision } from '../../src/services/rental-lease-number';

const year = new Date().getFullYear();

describe('generateLeaseNumber', () => {
  it('premier bail de l’année : 0001', async () => {
    findMany.mockResolvedValueOnce([]);
    expect(await generateLeaseNumber('tenant-A')).toBe(`BAIL-${year}-0001`);
  });

  it('après suppression du bail 0002 sur 0001, 0002, 0003 : 0004, pas 0003 (doublon)', async () => {
    // Deux baux restent (0001 et 0003) : count + 1 donnait 0003.
    findMany.mockResolvedValueOnce([{ lease_number: `BAIL-${year}-0001` }, { lease_number: `BAIL-${year}-0003` }]);
    expect(await generateLeaseNumber('tenant-A')).toBe(`BAIL-${year}-0004`);
  });

  it('ignore les numéros saisis à la main qui ne suivent pas la forme', async () => {
    findMany.mockResolvedValueOnce([{ lease_number: `BAIL-${year}-0007` }, { lease_number: `BAIL-${year}-ABC` }]);
    expect(await generateLeaseNumber('tenant-A')).toBe(`BAIL-${year}-0008`);
  });
});

describe('isLeaseNumberCollision', () => {
  it('reconnaît un P2002 sur lease_number seulement', () => {
    expect(isLeaseNumberCollision({ code: 'P2002', meta: { target: ['tenant_id', 'lease_number'] } })).toBe(true);
    expect(isLeaseNumberCollision({ code: 'P2002', meta: { target: ['email'] } })).toBe(false);
    expect(isLeaseNumberCollision(new Error('x'))).toBe(false);
  });
});
