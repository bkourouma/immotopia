/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Menu lot 2 — mode de repartition d'un appel de charges cree a la main
 * (SHARES, BY_LOT_TYPE, EQUAL), sur la base en memoire du depot.
 *
 *   Agence A — copropriete S1 : A-01 (APARTMENT, 300 tantiemes), A-02 (APARTMENT, 100),
 *   P-01 (PARKING, 100), Z-01 (APARTMENT, 0 tantieme).
 *   Agence B — copropriete SB : lot LB.
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
// Visio : le SDK LiveKit n'a rien a faire dans un calcul de repartition.
jest.mock('../../src/services/livekit-service', () => ({}));
jest.mock('../../src/lib/syndics/meeting-recording-storage', () => ({}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), flushAuditQueue: jest.fn() }));

import { createChargeCallAndUpdateStatus } from '../../src/lib/syndics/queries';
import { createChargeCallSchema } from '../../src/lib/syndics/schemas';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TENANT_A = 'tenant-a';
const S1 = id(1);
const SB = id(2);
const L1 = id(11);
const L2 = id(12);
const LP = id(13);
const LZ = id(14);
const LB = id(15);
const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

function lotRow(lotId: string, syndicateId: string, lotNumber: string, lotType: string, generalShares: number) {
  const owner = { id: `contact-${lotNumber}`, firstName: lotNumber, lastName: 'Test', legalName: null, email: null };
  return {
    id: lotId,
    syndicateId,
    lotNumber,
    lotType,
    generalShares,
    ownerContactId: owner.id,
    coownerId: owner.id,
    owner,
    coowner: owner,
    syndicate: { tenantId: syndicateId === S1 ? TENANT_A : 'tenant-b' }
  };
}

function seed(lotTypeRates: unknown = null) {
  mockPrisma.reset();
  mockPrisma.syndicate.rows.push(
    { id: S1, tenantId: TENANT_A, name: 'Residence A', status: 'ACTIVE', lotTypeRates },
    { id: SB, tenantId: 'tenant-b', name: 'Residence B', status: 'ACTIVE', lotTypeRates: null }
  );
  mockPrisma.syndicateLot.rows.push(
    lotRow(L1, S1, 'A-01', 'APARTMENT', 300),
    lotRow(L2, S1, 'A-02', 'APARTMENT', 100),
    lotRow(LP, S1, 'P-01', 'PARKING', 100),
    lotRow(LZ, S1, 'Z-01', 'APARTMENT', 0),
    lotRow(LB, SB, 'B-01', 'APARTMENT', 100)
  );
}

// La base en memoire ne resout pas les relations : l'appel porte sa copropriete.
const originalCreate = mockPrisma.chargeCall.create.getMockImplementation();
mockPrisma.chargeCall.create.mockImplementation(async (args: any) => {
  const result = await originalCreate!(args);
  const row = mockPrisma.chargeCall.rows[mockPrisma.chargeCall.rows.length - 1];
  row.status = row.status ?? 'PENDING';
  row.syndicate = { tenantId: TENANT_A, name: 'Residence A' };
  return result;
});

const base = { syndicateId: S1, period: '2026-01', currency: 'XOF', dueDate: d('2026-01-31') };
const amountsByLot = (calls: any[]) => Object.fromEntries(calls.map(call => [call.lotId, Number(call.amount)]));
const sum = (calls: any[]) => calls.reduce((total, call) => total + Number(call.amount), 0);

beforeEach(() => seed());

describe('createChargeCallSchema — allocationMethod', () => {
  const input = { syndicateId: S1, applyToAllLots: true, period: '2026-01', dueDate: '2026-01-31' };

  it('exige le montant sans methode ou avec SHARES / EQUAL, pas avec BY_LOT_TYPE', () => {
    expect(createChargeCallSchema.safeParse(input).success).toBe(false);
    expect(createChargeCallSchema.safeParse({ ...input, allocationMethod: 'SHARES' }).success).toBe(false);
    expect(createChargeCallSchema.safeParse({ ...input, allocationMethod: 'EQUAL' }).success).toBe(false);
    expect(createChargeCallSchema.safeParse({ ...input, allocationMethod: 'BY_LOT_TYPE' }).success).toBe(true);
    expect(createChargeCallSchema.safeParse({ ...input, amount: 1000 }).success).toBe(true);
    expect(createChargeCallSchema.safeParse({ ...input, amount: 1000, allocationMethod: 'SHARES' }).success).toBe(true);
    expect(createChargeCallSchema.safeParse({ ...input, amount: 0, allocationMethod: 'SHARES' }).success).toBe(false);
    expect(createChargeCallSchema.safeParse({ ...input, allocationMethod: 'AUTRE' }).success).toBe(false);
  });
});

describe('createChargeCallAndUpdateStatus — repartition', () => {
  it('sans methode : montant PAR LOT identique (comportement historique)', async () => {
    const result = await createChargeCallAndUpdateStatus(TENANT_A, {
      ...base,
      lotIds: [L1, L2],
      amount: 5000
    });
    expect(amountsByLot(result.chargeCalls)).toEqual({ [L1]: 5000, [L2]: 5000 });
    expect(result.allocationMethod).toBeUndefined();
    expect(result.totalAmount).toBeUndefined();
  });

  it('SHARES : le total est reparti au prorata, somme exacte, lot a 0 tantieme sans appel', async () => {
    const result = await createChargeCallAndUpdateStatus(TENANT_A, {
      ...base,
      applyToAllLots: true,
      allocationMethod: 'SHARES',
      amount: 100000
    });
    expect(amountsByLot(result.chargeCalls)).toEqual({ [L1]: 60000, [L2]: 20000, [LP]: 20000 });
    expect(sum(result.chargeCalls)).toBe(100000);
    expect(result).toMatchObject({
      allocationMethod: 'SHARES',
      totalAmount: 100000,
      generatedLots: 3,
      occurrences: 1,
      totalCreated: 3
    });
    expect(mockPrisma.chargeCall.rows.some(row => row.lotId === LZ)).toBe(false);
  });

  it('SHARES sur une liste de lots dont un a 0 tantieme : ce lot est ecarte', async () => {
    const result = await createChargeCallAndUpdateStatus(TENANT_A, {
      ...base,
      lotIds: [L1, LZ],
      allocationMethod: 'SHARES',
      amount: 7000
    });
    expect(amountsByLot(result.chargeCalls)).toEqual({ [L1]: 7000 });
    expect(result.generatedLots).toBe(1);
  });

  it('EQUAL : parts egales, le reste va au dernier lot', async () => {
    const result = await createChargeCallAndUpdateStatus(TENANT_A, {
      ...base,
      lotIds: [L1, L2, LP],
      allocationMethod: 'EQUAL',
      amount: 100000
    });
    expect(amountsByLot(result.chargeCalls)).toEqual({ [L1]: 33333, [L2]: 33333, [LP]: 33334 });
    expect(sum(result.chargeCalls)).toBe(100000);
    expect(result.totalAmount).toBe(100000);
  });

  it('BY_LOT_TYPE : montant par type applique, total = somme des lots concernes', async () => {
    seed({ APARTMENT: 50000, PARKING: 10000, CELLAR: 5000 });
    const result = await createChargeCallAndUpdateStatus(TENANT_A, {
      ...base,
      lotIds: [L1, L2, LP],
      allocationMethod: 'BY_LOT_TYPE',
      amount: 999 // ignore
    });
    expect(amountsByLot(result.chargeCalls)).toEqual({ [L1]: 50000, [L2]: 50000, [LP]: 10000 });
    expect(result).toMatchObject({ allocationMethod: 'BY_LOT_TYPE', totalAmount: 110000 });
  });

  it('BY_LOT_TYPE : un type a 0 dans le bareme n est pas appele', async () => {
    seed({ APARTMENT: 40000, PARKING: 0 });
    const result = await createChargeCallAndUpdateStatus(TENANT_A, {
      ...base,
      applyToAllLots: true,
      allocationMethod: 'BY_LOT_TYPE'
    });
    expect(amountsByLot(result.chargeCalls)).toEqual({ [L1]: 40000, [L2]: 40000 });
    expect(result.totalAmount).toBe(80000);
  });

  it('BY_LOT_TYPE avec un bareme vide : 422 clair, rien n est ecrit', async () => {
    await expect(
      createChargeCallAndUpdateStatus(TENANT_A, { ...base, lotIds: [L1], allocationMethod: 'BY_LOT_TYPE' })
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining('barème par type de lot') });
    expect(mockPrisma.chargeCall.rows).toHaveLength(0);
  });

  it('BY_LOT_TYPE avec un bareme incomplet : 422 qui nomme le type manquant', async () => {
    seed({ APARTMENT: 50000 });
    await expect(
      createChargeCallAndUpdateStatus(TENANT_A, { ...base, lotIds: [L1, LP], allocationMethod: 'BY_LOT_TYPE' })
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining('PARKING') });
    expect(mockPrisma.chargeCall.rows).toHaveLength(0);
  });

  it('un seul lot avec une methode : passe par le chemin multi-lots', async () => {
    const result = await createChargeCallAndUpdateStatus(TENANT_A, {
      ...base,
      lotId: L2,
      allocationMethod: 'SHARES',
      amount: 12345
    });
    expect(result.chargeCalls).toHaveLength(1);
    expect(Number(result.chargeCalls[0].amount)).toBe(12345);
    expect(result.totalAmount).toBe(12345);
  });

  it('recurrence : chaque occurrence reprend les memes montants', async () => {
    const result = await createChargeCallAndUpdateStatus(TENANT_A, {
      ...base,
      applyToAllLots: true,
      allocationMethod: 'SHARES',
      amount: 100000,
      isRecurring: true,
      recurrenceFrequency: 'MONTHLY',
      recurrenceCount: 3
    });
    expect(result).toMatchObject({ occurrences: 3, totalCreated: 9, generatedLots: 3, totalAmount: 100000 });
    for (const period of ['2026-01-R1', '2026-01-R2', '2026-01-R3']) {
      const calls = result.chargeCalls.filter((call: any) => call.period === period);
      expect(amountsByLot(calls)).toEqual({ [L1]: 60000, [L2]: 20000, [LP]: 20000 });
    }
  });

  it('un lot d une autre agence : 404, rien n est ecrit', async () => {
    await expect(
      createChargeCallAndUpdateStatus(TENANT_A, { ...base, lotIds: [L1, LB], allocationMethod: 'EQUAL', amount: 1000 })
    ).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.chargeCall.rows).toHaveLength(0);
  });

  it('un total manquant avec SHARES / EQUAL : 422', async () => {
    await expect(
      createChargeCallAndUpdateStatus(TENANT_A, { ...base, lotIds: [L1, L2], allocationMethod: 'SHARES' })
    ).rejects.toMatchObject({ status: 422 });
  });
});
