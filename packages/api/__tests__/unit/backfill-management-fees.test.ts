/**
 * Script de rattrapage `scripts/backfill-management-fees.ts` : simulation par
 * défaut (rien n'est écrit), `--apply` fige les honoraires de façon
 * idempotente, `--tenant` borne le périmètre, refus en production sans
 * `--allow-production`.
 *
 * Prisma est remplacé par un magasin en mémoire qui applique les filtres
 * utilisés par `materialize.ts` (agence, curseur d'id, absence d'honoraires,
 * `take`) et l'unicité de `allocationId` (`skipDuplicates`).
 */

interface FakeAllocation {
  id: string;
  tenant_id: string;
  amount: number;
  created_at: Date;
  payment_id: string;
}

let allocations: FakeAllocation[] = [];
let fees: any[] = [];
let tenants: { id: string; name: string }[] = [];
let failingTenantId: string | null = null;

const prismaMock: any = {
  tenant: {
    findMany: jest.fn(async ({ where }: any) => tenants.filter(t => !where?.id || t.id === where.id))
  },
  rentalPaymentAllocation: {
    findMany: jest.fn(async ({ where, take }: any) => {
      if (failingTenantId && where.tenant_id === failingTenantId) throw new Error('base indisponible');
      const taken = new Set(fees.map(f => f.allocationId));
      const rows = allocations
        .filter(a => a.tenant_id === where.tenant_id)
        .filter(a => !where.id?.gt || a.id > where.id.gt)
        .filter(a => !taken.has(a.id))
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .slice(0, take ?? undefined);
      return rows.map(a => ({
        id: a.id,
        amount: a.amount,
        created_at: a.created_at,
        payment_id: a.payment_id,
        payment: { succeeded_at: new Date('2026-09-01T10:00:00Z'), initiated_at: new Date('2026-09-01T09:00:00Z') },
        installment: {
          amount_rent: 100000,
          amount_service: 0,
          amount_other_fees: 0,
          penalty_amount: 0,
          lease: { id: 'lease-1', property_id: 'prop-1', owner_client_id: null, managementTerms: null }
        }
      }));
    })
  },
  ownerManagementTerms: { findMany: jest.fn(async () => []) },
  agentCommissionRate: { findMany: jest.fn(async () => []) },
  managementFee: {
    createMany: jest.fn(async ({ data }: any) => {
      let count = 0;
      for (const row of data) {
        if (fees.some(f => f.allocationId === row.allocationId)) continue;
        fees.push({ ...row });
        count += 1;
      }
      return { count };
    })
  },
  $disconnect: jest.fn()
};

jest.mock('../../src/utils/database', () => ({ prisma: prismaMock, disconnectDatabase: jest.fn() }));
jest.mock('../../src/lib/settings/finance-settings', () => ({
  getAgencyFinanceSettings: jest.fn(async () => ({
    vatRegistered: false,
    vatRate: 18,
    // Conditions d'agence enregistrées le 1er septembre : un encaissement créé avant n'en reçoit pas.
    updatedAt: '2026-09-01T00:00:00.000Z'
  })),
  agencyFeeTerms: jest.fn(() => ({
    managementFeeMode: 'PERCENT',
    managementFeeRate: 10,
    managementFeeFixedAmount: null,
    managementFeeBase: 'ALL_COLLECTED'
  }))
}));

import { parseBackfillArgs, runBackfillManagementFees } from '../../src/scripts/backfill-management-fees';

const AFTER = new Date('2026-09-15T00:00:00Z');
const BEFORE = new Date('2026-08-01T00:00:00Z');

function alloc(id: string, tenantId: string, createdAt: Date = AFTER): FakeAllocation {
  return { id, tenant_id: tenantId, amount: 100000, created_at: createdAt, payment_id: `pay-${id}` };
}

beforeEach(() => {
  jest.clearAllMocks();
  fees = [];
  failingTenantId = null;
  tenants = [
    { id: 'tenant-A', name: 'Agence A' },
    { id: 'tenant-B', name: 'Agence B' }
  ];
  allocations = [
    alloc('a1', 'tenant-A'),
    alloc('a2', 'tenant-A'),
    alloc('a3', 'tenant-A', BEFORE), // antérieur aux conditions : jamais d'honoraires
    alloc('b1', 'tenant-B')
  ];
});

describe('parseBackfillArgs', () => {
  it('simulation par défaut', () => {
    expect(parseBackfillArgs([])).toEqual({
      apply: false,
      json: false,
      tenantId: undefined,
      allowProduction: false
    });
  });

  it('lit --apply, --json, --allow-production et --tenant sous les deux formes', () => {
    expect(parseBackfillArgs(['--apply', '--json', '--allow-production', '--tenant', 'tenant-A'])).toEqual({
      apply: true,
      json: true,
      tenantId: 'tenant-A',
      allowProduction: true
    });
    expect(parseBackfillArgs(['--tenant=tenant-B']).tenantId).toBe('tenant-B');
  });

  it('--tenant sans identifiant est refusé', () => {
    expect(() => parseBackfillArgs(['--tenant'])).toThrow();
    expect(() => parseBackfillArgs(['--tenant', '--apply'])).toThrow();
  });
});

describe('runBackfillManagementFees', () => {
  it("simulation : compte les encaissements et les honoraires par agence, n'écrit rien", async () => {
    const result = await runBackfillManagementFees(parseBackfillArgs([]), {});

    expect(result.mode).toBe('simulation');
    expect(result.reports).toEqual([
      { tenantId: 'tenant-A', tenantName: 'Agence A', allocations: 2, feeAmount: 20000, vatAmount: 0 },
      { tenantId: 'tenant-B', tenantName: 'Agence B', allocations: 1, feeAmount: 10000, vatAmount: 0 }
    ]);
    expect(prismaMock.managementFee.createMany).not.toHaveBeenCalled();
    expect(fees).toEqual([]);
  });

  it('--apply fige les honoraires ; un second passage ne change plus rien (idempotent)', async () => {
    const first = await runBackfillManagementFees(parseBackfillArgs(['--apply']), {});
    expect(first.mode).toBe('apply');
    expect(first.reports.map(r => r.allocations)).toEqual([2, 1]);
    expect(fees.map(f => f.allocationId).sort()).toEqual(['a1', 'a2', 'b1']);
    expect(fees.every(f => Number(f.feeAmount) === 10000 && f.tenantId)).toBe(true);

    const second = await runBackfillManagementFees(parseBackfillArgs(['--apply']), {});
    expect(second.reports.map(r => r.allocations)).toEqual([0, 0]);
    expect(fees).toHaveLength(3);

    // Après l'application, la simulation ne voit plus rien à figer.
    const simulation = await runBackfillManagementFees(parseBackfillArgs([]), {});
    expect(simulation.reports.map(r => r.allocations)).toEqual([0, 0]);
  });

  it("--tenant ne touche qu'une agence", async () => {
    const result = await runBackfillManagementFees(parseBackfillArgs(['--apply', '--tenant', 'tenant-B']), {});

    expect(result.reports.map(r => r.tenantId)).toEqual(['tenant-B']);
    expect(fees.map(f => f.allocationId)).toEqual(['b1']);
  });

  it('agence introuvable : refus', async () => {
    await expect(runBackfillManagementFees(parseBackfillArgs(['--tenant', 'inconnue']), {})).rejects.toThrow(
      /introuvable/
    );
  });

  it('parcourt par lots : tous les encaissements d’une grosse agence sont figés, une seule fois', async () => {
    allocations = Array.from({ length: 1203 }, (_, i) => alloc(`z${String(i).padStart(5, '0')}`, 'tenant-A'));

    const simulation = await runBackfillManagementFees(parseBackfillArgs(['--tenant', 'tenant-A']), {});
    expect(simulation.reports[0].allocations).toBe(1203);
    expect(simulation.reports[0].feeAmount).toBe(1203 * 10000);

    const applied = await runBackfillManagementFees(parseBackfillArgs(['--apply', '--tenant', 'tenant-A']), {});
    expect(applied.reports[0].allocations).toBe(1203);
    expect(fees).toHaveLength(1203);
    expect(prismaMock.managementFee.createMany.mock.calls.length).toBeGreaterThan(1);
  });

  it('une agence en échec est rapportée sans arrêter les autres', async () => {
    failingTenantId = 'tenant-A';
    const result = await runBackfillManagementFees(parseBackfillArgs(['--apply']), {});

    expect(result.reports[0]).toMatchObject({ tenantId: 'tenant-A', error: 'base indisponible' });
    expect(result.reports[1]).toMatchObject({ tenantId: 'tenant-B', allocations: 1 });
    expect(fees.map(f => f.allocationId)).toEqual(['b1']);
  });

  it('production : refus sans --allow-production, accepté avec', async () => {
    await expect(runBackfillManagementFees(parseBackfillArgs([]), { NODE_ENV: 'production' })).rejects.toThrow(
      /NODE_ENV=production/
    );
    expect(prismaMock.tenant.findMany).not.toHaveBeenCalled();

    const result = await runBackfillManagementFees(parseBackfillArgs(['--allow-production']), {
      NODE_ENV: 'production'
    });
    expect(result.mode).toBe('simulation');
  });
});
