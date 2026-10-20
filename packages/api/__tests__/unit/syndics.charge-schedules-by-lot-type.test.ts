/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BUG-2026-10-19-001 : une programmation de montant fixe répartie PAR TYPE DE LOT
 * n'a pas de montant fixe (le total vient du barème). La base refusait la ligne
 * (CHECK `syndic_charge_schedules_amount_source_check`) : POST et PATCH en 500.
 * La base en mémoire rejoue ici la contrainte telle que la migration
 * 20261019190000 la définit.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), flushAuditQueue: jest.fn() }));

import { createChargeSchedule, updateChargeSchedule } from '../../src/lib/syndics/charge-schedules';
import type { CreateChargeScheduleInput } from '../../src/lib/syndics/charge-schedule-schemas';

const TENANT = 'tenant-a';
const SYNDIC = '00000000-0000-4000-8000-000000000001';
const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const NOW = d('2026-10-19');

/** Reflet de la contrainte posée par la migration 20261019190000. */
function assertAmountSourceCheck(row: any) {
  const fixed = row.fixedAmount === null || row.fixedAmount === undefined ? null : Number(row.fixedAmount);
  const method = row.allocationMethod ?? 'SHARES';
  const ok =
    (row.amountSource === 'FIXED' &&
      !row.budgetId &&
      (fixed !== null || method === 'BY_LOT_TYPE') &&
      (fixed === null || fixed > 0)) ||
    (row.amountSource === 'BUDGET' && fixed === null);
  if (!ok) throw new Error('violates check constraint "syndic_charge_schedules_amount_source_check"');
}

const originalCreate = mockPrisma.syndicChargeSchedule.create.getMockImplementation()!;
mockPrisma.syndicChargeSchedule.create.mockImplementation(async (args: any) => {
  assertAmountSourceCheck(args.data);
  return originalCreate(args);
});
const originalUpdateMany = mockPrisma.syndicChargeSchedule.updateMany.getMockImplementation()!;
mockPrisma.syndicChargeSchedule.updateMany.mockImplementation(async (args: any) => {
  const row = mockPrisma.syndicChargeSchedule.rows.find((r: any) => r.id === args.where.id);
  if (row) assertAmountSourceCheck({ ...row, ...args.data });
  return originalUpdateMany(args);
});

beforeEach(() => {
  mockPrisma.reset();
  mockPrisma.syndicate.rows.push({
    id: SYNDIC,
    tenantId: TENANT,
    name: 'Residence A',
    status: 'ACTIVE',
    lotTypeRates: { APARTMENT: 50000, COMMERCIAL: 120000, PARKING: 10000 }
  });
});

function fixedInput(overrides: Partial<CreateChargeScheduleInput> = {}): CreateChargeScheduleInput {
  return {
    label: 'Charges courantes',
    frequency: 'MONTHLY',
    issueDay: 1,
    dueOffsetDays: 15,
    amountSource: 'FIXED',
    fixedAmount: 100000,
    startDate: d('2026-11-01'),
    ...overrides
  };
}

describe('programmation en mode Par type de lot', () => {
  it('creation : enregistrée sans montant fixe, mode conservé à la lecture', async () => {
    const view = await createChargeSchedule(
      TENANT,
      SYNDIC,
      fixedInput({ fixedAmount: undefined, allocationMethod: 'BY_LOT_TYPE' }),
      'user-1',
      NOW
    );
    expect(view.allocationMethod).toBe('BY_LOT_TYPE');
    expect(view.amountSource).toBe('FIXED');
    expect(view.fixedAmount).toBeNull();
    expect(mockPrisma.syndicChargeSchedule.rows).toHaveLength(1);
  });

  it('creation en pause : même résultat', async () => {
    const view = await createChargeSchedule(
      TENANT,
      SYNDIC,
      fixedInput({ fixedAmount: undefined, allocationMethod: 'BY_LOT_TYPE', active: false }),
      null,
      NOW
    );
    expect(view.active).toBe(false);
    expect(view.allocationMethod).toBe('BY_LOT_TYPE');
  });

  it('modification : une programmation équitable passe en Par type de lot (montant fixe effacé)', async () => {
    const created = await createChargeSchedule(TENANT, SYNDIC, fixedInput({ allocationMethod: 'EQUAL' }), null, NOW);
    expect(created.fixedAmount).toBe(100000);
    const updated = await updateChargeSchedule(
      TENANT,
      SYNDIC,
      created.id,
      { allocationMethod: 'BY_LOT_TYPE' } as any,
      NOW
    );
    expect(updated.allocationMethod).toBe('BY_LOT_TYPE');
    expect(updated.fixedAmount).toBeNull();
  });

  it('un montant fixe reste refusé hors mode Par type de lot si absent', async () => {
    await expect(
      createChargeSchedule(TENANT, SYNDIC, fixedInput({ fixedAmount: undefined, allocationMethod: 'EQUAL' }), null, NOW)
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('la migration assouplit la contrainte pour ce seul mode', () => {
    const sql = readFileSync(
      join(__dirname, '../../prisma/migrations/20261019190000_syndic_programmation_montant_bareme/migration.sql'),
      'utf8'
    );
    expect(sql).toContain('DROP CONSTRAINT "syndic_charge_schedules_amount_source_check"');
    expect(sql).toContain(`"allocation_method" = 'BY_LOT_TYPE'`);
  });
});
