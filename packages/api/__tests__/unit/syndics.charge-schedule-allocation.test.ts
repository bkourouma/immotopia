/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Menu lot 2 — mode de répartition d'une programmation d'appels de charges
 * (SHARES, EQUAL, BY_LOT_TYPE), sur la base en mémoire de
 * `__tests__/helpers/fake-prisma.ts`.
 *
 * Jeu de données :
 *   Agence A — copropriété S1 : A-01 (appartement, 600 tantièmes), A-02
 *              (appartement, 400), P-01 (parking, 50), K-01 (cave, 0 tantième).
 *   Agence B — copropriété SB : lot B-01, barème propre à l'agence B.
 */

import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: jest.fn(async () => undefined) },
  isEmailDeliveryConfigured: () => true
}));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: jest.fn(async () => ({ enabled: true, subjectOverride: null, bodyHtmlOverride: null }))
}));
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: jest.fn(async () => false)
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), flushAuditQueue: jest.fn() }));

import {
  createChargeSchedule,
  executeChargeScheduleNow,
  previewChargeSchedule,
  updateChargeSchedule
} from '../../src/lib/syndics/charge-schedules';
import {
  createChargeScheduleSchema,
  scheduleConsistencyIssues,
  updateChargeScheduleSchema
} from '../../src/lib/syndics/charge-schedule-schemas';
import type { CreateChargeScheduleInput } from '../../src/lib/syndics/charge-schedule-schemas';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const S1 = id(1);
const SB = id(3);
const L1 = id(11);
const L2 = id(12);
const P1 = id(13);
const K1 = id(14);
const LB = id(15);
const BUD1 = id(21);
const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const NOW = d('2026-09-27');

const syndicates: Record<string, { tenantId: string; name: string }> = {
  [S1]: { tenantId: TENANT_A, name: 'Residence Les Palmiers' },
  [SB]: { tenantId: TENANT_B, name: 'Residence B' }
};

function lotRow(lotId: string, syndicateId: string, lotNumber: string, lotType: string, shares: number) {
  return {
    id: lotId,
    syndicateId,
    lotNumber,
    lotType,
    generalShares: shares,
    specialShares: null,
    ownerContactId: null,
    owner: null,
    coowner: null,
    syndicate: { tenantId: syndicates[syndicateId].tenantId }
  };
}

const originalCallCreate = mockPrisma.chargeCall.create.getMockImplementation()!;
mockPrisma.chargeCall.create.mockImplementation(async (args: any) => {
  const result = await originalCallCreate(args);
  const row = mockPrisma.chargeCall.rows[mockPrisma.chargeCall.rows.length - 1];
  row.status = row.status ?? 'PENDING';
  row.syndicate = { tenantId: syndicates[row.syndicateId].tenantId, name: syndicates[row.syndicateId].name };
  row.lot = mockPrisma.syndicateLot.rows.find(lot => lot.id === row.lotId);
  Object.defineProperty(row, 'allocations', {
    enumerable: true,
    get: () => mockPrisma.chargePaymentAllocation.rows.filter(allocation => allocation.chargeCallId === row.id)
  });
  return result;
});

function seed(rates: Record<string, unknown> | null = null, ratesB: Record<string, unknown> | null = null) {
  mockPrisma.reset();
  for (const [syndicId, info] of Object.entries(syndicates)) {
    mockPrisma.syndicate.rows.push({
      id: syndicId,
      tenantId: info.tenantId,
      name: info.name,
      address: 'Abidjan',
      registrationNo: null,
      cadastralReference: null,
      status: 'ACTIVE',
      mandatingAgencyId: null,
      mandatingAgency: null,
      lotTypeRates: syndicId === S1 ? rates : ratesB
    });
  }
  mockPrisma.tenant.rows.push(
    { id: TENANT_A, name: 'Agence A', status: 'ACTIVE' },
    { id: TENANT_B, name: 'Agence B', status: 'ACTIVE' }
  );
  mockPrisma.syndicateLot.rows.push(
    lotRow(L1, S1, 'A-01', 'APARTMENT', 600),
    lotRow(L2, S1, 'A-02', 'APARTMENT', 400),
    lotRow(P1, S1, 'P-01', 'PARKING', 50),
    lotRow(K1, S1, 'K-01', 'CELLAR', 0),
    lotRow(LB, SB, 'B-01', 'APARTMENT', 1000)
  );
  mockPrisma.syndicateBudget.rows.push({
    id: BUD1,
    syndicateId: S1,
    fiscalYear: 2026,
    label: 'Budget 2026',
    status: 'APPROVED',
    approvedAt: d('2026-01-15'),
    totalAmount: 20000,
    currency: 'XOF',
    createdAt: d('2026-01-01'),
    allocations: [
      { budgetId: BUD1, lotId: L1, totalAllocated: 12000 },
      { budgetId: BUD1, lotId: L2, totalAllocated: 8000 }
    ]
  });
}

const FULL_RATES = { APARTMENT: 50000, PARKING: 10000, CELLAR: 5000 };

function input(overrides: Partial<CreateChargeScheduleInput> = {}): CreateChargeScheduleInput {
  return {
    label: 'Charges courantes',
    frequency: 'MONTHLY',
    issueDay: 1,
    dueOffsetDays: 15,
    amountSource: 'FIXED',
    budgetId: null,
    fixedAmount: 1000,
    startDate: d('2026-01-01'),
    ...overrides
  };
}

const byLotType = (overrides: Partial<CreateChargeScheduleInput> = {}) =>
  input({ allocationMethod: 'BY_LOT_TYPE', fixedAmount: undefined, ...overrides });

const calls = () => mockPrisma.chargeCall.rows;
const batches = () => mockPrisma.chargeCallBatch.rows;
const runs = () => mockPrisma.syndicChargeScheduleRun.rows;
const amountsByLot = (rows: any[]) => Object.fromEntries(rows.map(row => [row.lotId, Number(row.amount)]));
const scheduleRow = (scheduleId: string) => mockPrisma.syndicChargeSchedule.rows.find(row => row.id === scheduleId)!;

beforeEach(() => seed(FULL_RATES));

describe('SHARES (défaut) : comportement historique inchangé', () => {
  it('corps sans allocationMethod : tantièmes, lots principaux seulement', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    expect(schedule.allocationMethod).toBe('SHARES');
    expect(scheduleRow(schedule.id).allocationMethod).toBe('SHARES');
    await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    // Le parking (50 tantièmes) et la cave sont exclus : lots principaux seulement.
    expect(amountsByLot(calls())).toEqual({ [L1]: 600, [L2]: 400 });
    expect(batches()[0].allocationMethod).toBe('SHARES');
  });
});

describe('EQUAL : montant fixe à parts égales', () => {
  it('reste au dernier lot, somme exacte, lot à 0 tantième exclu', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, input({ allocationMethod: 'EQUAL' }), null, NOW);
    expect(schedule).toMatchObject({ allocationMethod: 'EQUAL', fixedAmount: 1000 });
    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run.status).toBe('SUCCESS');
    expect(amountsByLot(calls())).toEqual({ [L1]: 333, [L2]: 333, [P1]: 334 });
    expect(calls().some(call => call.lotId === K1)).toBe(false);
    expect(calls().reduce((sum, call) => sum + Number(call.amount), 0)).toBe(1000);
    expect(batches()[0]).toMatchObject({ allocationMethod: 'EQUAL', totalAmount: 1000 });
  });

  it('montant fixe obligatoire', async () => {
    await expect(
      createChargeSchedule(TENANT_A, S1, input({ allocationMethod: 'EQUAL', fixedAmount: undefined }), null, NOW)
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('BY_LOT_TYPE : barème de la copropriété', () => {
  it('montants par type, total = somme, lot d appels marqué BY_LOT_TYPE', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, byLotType(), null, NOW);
    expect(schedule).toMatchObject({ allocationMethod: 'BY_LOT_TYPE', fixedAmount: null });

    const preview = await previewChargeSchedule(TENANT_A, S1, schedule.id, NOW, 1);
    expect(preview.periods[0]).toMatchObject({ allocationMethod: 'BY_LOT_TYPE', totalAmount: 110000, error: null });
    expect(calls()).toHaveLength(0);

    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run.status).toBe('SUCCESS');
    expect(amountsByLot(calls())).toEqual({ [L1]: 50000, [L2]: 50000, [P1]: 10000 });
    expect(batches()[0]).toMatchObject({ allocationMethod: 'BY_LOT_TYPE', totalAmount: 110000 });
  });

  it('un montant fixe est refusé avec BY_LOT_TYPE (schéma et service)', async () => {
    expect(
      scheduleConsistencyIssues({
        amountSource: 'FIXED',
        allocationMethod: 'BY_LOT_TYPE',
        fixedAmount: 100,
        startDate: d('2026-01-01')
      })
    ).toHaveLength(1);
    const body = {
      label: 'x',
      frequency: 'MONTHLY',
      issueDay: 1,
      dueOffsetDays: 5,
      amountSource: 'FIXED',
      allocationMethod: 'BY_LOT_TYPE',
      fixedAmount: 100,
      startDate: '2026-01-01'
    };
    expect(createChargeScheduleSchema.safeParse(body).success).toBe(false);
    expect(createChargeScheduleSchema.safeParse({ ...body, fixedAmount: undefined }).success).toBe(true);
    await expect(
      createChargeSchedule(TENANT_A, S1, input({ allocationMethod: 'BY_LOT_TYPE', fixedAmount: 100 }), null, NOW)
    ).rejects.toBeDefined();
  });

  it('barème vide : création refusée (aucune programmation écrite)', async () => {
    seed(null);
    await expect(createChargeSchedule(TENANT_A, S1, byLotType(), null, NOW)).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('barème')
    });
    expect(mockPrisma.syndicChargeSchedule.rows).toHaveLength(0);
  });

  it('barème incomplet : aperçu avec error clair, exécution FAILED consignée, aucun appel', async () => {
    seed({ APARTMENT: 50000 });
    const schedule = await createChargeSchedule(TENANT_A, S1, byLotType(), null, NOW);
    const preview = await previewChargeSchedule(TENANT_A, S1, schedule.id, NOW, 1);
    expect(preview.periods[0].error).toContain('PARKING');
    expect(preview.periods[0]).toMatchObject({ totalAmount: null, lots: [], allocationMethod: 'BY_LOT_TYPE' });

    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run.status).toBe('FAILED');
    expect(result.run.error).toContain('PARKING');
    expect(runs().map(run => run.status)).toEqual(['FAILED']);
    expect(calls()).toHaveLength(0);
    expect(batches()).toHaveLength(0);
  });

  it('étanchéité : le barème d une autre agence n est jamais lu', async () => {
    seed(null, FULL_RATES);
    // S1 (agence A) n'a pas de barème : celui de l'agence B ne le remplace pas.
    await expect(createChargeSchedule(TENANT_A, S1, byLotType(), null, NOW)).rejects.toMatchObject({
      statusCode: 422
    });
    // Et l'agence A ne peut pas viser la copropriété de l'agence B.
    await expect(createChargeSchedule(TENANT_A, SB, byLotType(), null, NOW)).rejects.toMatchObject({
      statusCode: 404
    });
  });
});

describe('BUDGET : méthode forcée à SHARES', () => {
  it('création et modification normalisent silencieusement', async () => {
    const schedule = await createChargeSchedule(
      TENANT_A,
      S1,
      input({ amountSource: 'BUDGET', budgetId: BUD1, fixedAmount: undefined, allocationMethod: 'EQUAL' }),
      null,
      NOW
    );
    expect(schedule).toMatchObject({ amountSource: 'BUDGET', allocationMethod: 'SHARES' });
    const updated = await updateChargeSchedule(TENANT_A, S1, schedule.id, { allocationMethod: 'BY_LOT_TYPE' }, NOW);
    expect(updated.allocationMethod).toBe('SHARES');

    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run.status).toBe('SUCCESS');
    expect(amountsByLot(calls())).toEqual({ [L1]: 1000, [L2]: 666.66 });
    expect(batches()[0].allocationMethod).toBe('SHARES');
  });
});

describe('modification (PATCH)', () => {
  it('SHARES -> EQUAL conserve le montant fixe', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    expect(updateChargeScheduleSchema.safeParse({ allocationMethod: 'EQUAL' }).success).toBe(true);
    const updated = await updateChargeSchedule(TENANT_A, S1, schedule.id, { allocationMethod: 'EQUAL' }, NOW);
    expect(updated).toMatchObject({ allocationMethod: 'EQUAL', fixedAmount: 1000 });
    expect(scheduleRow(schedule.id).allocationMethod).toBe('EQUAL');
  });

  it('SHARES -> BY_LOT_TYPE met le montant fixe à null ; refusé si barème vide', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const updated = await updateChargeSchedule(TENANT_A, S1, schedule.id, { allocationMethod: 'BY_LOT_TYPE' }, NOW);
    expect(updated).toMatchObject({ allocationMethod: 'BY_LOT_TYPE', fixedAmount: null });

    seed(null);
    const other = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    await expect(
      updateChargeSchedule(TENANT_A, S1, other.id, { allocationMethod: 'BY_LOT_TYPE' }, NOW)
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(scheduleRow(other.id).allocationMethod).toBe('SHARES');
  });

  it('FIXED -> BUDGET : méthode SHARES, montant fixe effacé', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, input({ allocationMethod: 'EQUAL' }), null, NOW);
    const updated = await updateChargeSchedule(
      TENANT_A,
      S1,
      schedule.id,
      { amountSource: 'BUDGET', budgetId: BUD1 },
      NOW
    );
    expect(updated).toMatchObject({
      amountSource: 'BUDGET',
      allocationMethod: 'SHARES',
      fixedAmount: null,
      budgetId: BUD1
    });
  });

  it('BY_LOT_TYPE -> SHARES sans montant fixe : refusé', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, byLotType(), null, NOW);
    await expect(
      updateChargeSchedule(TENANT_A, S1, schedule.id, { allocationMethod: 'SHARES' }, NOW)
    ).rejects.toMatchObject({ statusCode: 422 });
    const ok = await updateChargeSchedule(
      TENANT_A,
      S1,
      schedule.id,
      { allocationMethod: 'SHARES', fixedAmount: 500 },
      NOW
    );
    expect(ok).toMatchObject({ allocationMethod: 'SHARES', fixedAmount: 500 });
  });
});
