/**
 * Revue locative (lot 6, H3) : `materializeManagementFees` fournit à
 * `computeAllocationFee` la somme des affectations précédentes de la même
 * échéance (règlements réussis, ordre created_at puis id), même quand elles
 * ne font pas partie du lot examiné.
 */

type Row = Record<string, any>;

const mockDb = {
  scanned: [] as Row[],
  siblings: [] as Row[],
  created: [] as Row[],
  siblingWhere: null as Row | null
};

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalPaymentAllocation: {
      findMany: jest.fn(async (args: Row) => {
        if (args.where?.installment_id) {
          mockDb.siblingWhere = args.where;
          return mockDb.siblings;
        }
        return mockDb.scanned;
      })
    },
    ownerManagementTerms: { findMany: jest.fn(async () => []) },
    agentCommissionRate: { findMany: jest.fn(async () => []) },
    managementFee: {
      createMany: jest.fn(async ({ data }: Row) => {
        mockDb.created.push(...data);
        return { count: data.length };
      })
    }
  }
}));
jest.mock('../../src/lib/settings/finance-settings', () => ({
  getAgencyFinanceSettings: jest.fn(async () => ({ updatedAt: null, vatRegistered: false, vatRate: 0 })),
  agencyFeeTerms: jest.fn(() => ({
    managementFeeMode: 'FIXED',
    managementFeeRate: null,
    managementFeeFixedAmount: 1001,
    managementFeeBase: 'RENT_ONLY'
  }))
}));

import { materializeManagementFees } from '../../src/lib/rental-fees/materialize';

const TENANT = 'tenant-A';
const installment = {
  amount_rent: 100000,
  amount_service: 0,
  amount_other_fees: 0,
  penalty_amount: 0,
  lease: { id: 'lease-1', property_id: 'prop-1', owner_client_id: null, managementTerms: null }
};
const alloc = (id: string, amount: number, createdAt: string): Row => ({
  id,
  amount,
  created_at: new Date(createdAt),
  installment_id: 'inst-1',
  payment_id: `pay-${id}`,
  payment: { succeeded_at: new Date(createdAt), initiated_at: new Date(createdAt) },
  installment
});

const range = { from: new Date('2026-01-01'), to: new Date('2026-12-31') };

beforeEach(() => {
  mockDb.scanned = [];
  mockDb.siblings = [];
  mockDb.created = [];
  mockDb.siblingWhere = null;
});

describe('materializeManagementFees : arrondi cumulé entre affectations de la même échéance', () => {
  it('deux moitiés dans le même lot : forfait 1 001 au total', async () => {
    const a = alloc('a1', 50000, '2026-03-01T10:00:00Z');
    const b = alloc('a2', 50000, '2026-03-02T10:00:00Z');
    mockDb.scanned = [a, b];
    mockDb.siblings = [a, b];

    await materializeManagementFees(TENANT, range);

    const fees = mockDb.created.map(r => Number(r.feeAmount));
    expect(fees).toEqual([501, 500]);
    expect(fees.reduce((s, f) => s + f, 0)).toBe(1001);
  });

  it('la première moitié est déjà matérialisée (hors lot) : la seconde reçoit le reste', async () => {
    const first = alloc('a1', 50000, '2026-03-01T10:00:00Z');
    const second = alloc('a2', 50000, '2026-03-02T10:00:00Z');
    mockDb.scanned = [second];
    mockDb.siblings = [first, second];

    await materializeManagementFees(TENANT, range);

    expect(mockDb.created.map(r => Number(r.feeAmount))).toEqual([500]);
    expect(mockDb.siblingWhere).toMatchObject({ tenant_id: TENANT, payment: { status: 'SUCCESS' } });
  });

  it('même created_at : l’ordre se joue sur l’id', async () => {
    const a = alloc('a1', 50000, '2026-03-01T10:00:00Z');
    const b = alloc('a2', 50000, '2026-03-01T10:00:00Z');
    mockDb.scanned = [b, a];
    mockDb.siblings = [a, b];

    await materializeManagementFees(TENANT, range);

    const byAlloc = Object.fromEntries(mockDb.created.map(r => [r.allocationId, Number(r.feeAmount)]));
    expect(byAlloc).toEqual({ a1: 501, a2: 500 });
  });

  it('échéance payée en une fois : comportement inchangé', async () => {
    const only = alloc('a1', 100000, '2026-03-01T10:00:00Z');
    mockDb.scanned = [only];
    mockDb.siblings = [only];

    await materializeManagementFees(TENANT, range);

    expect(mockDb.created.map(r => Number(r.feeAmount))).toEqual([1001]);
  });
});
