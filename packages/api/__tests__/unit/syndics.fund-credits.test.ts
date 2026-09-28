/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Fonds de copropriete credites par les paiements de charges
 * (`lib/syndics/fund-credits.ts`), sur la base en memoire qui applique
 * vraiment les filtres `where` (`__tests__/helpers/fake-prisma.ts`).
 *
 * Regle : un fonds recoit en entier ce qui est affecte a un appel qui lui est
 * affecte (`ChargeCall.fundId`), sinon la part des postes de budget qui
 * l'alimentent (`BudgetLineItem.fundId`), au prorata de la repartition du lot.
 * Le solde d'un fonds reste la somme de son journal.
 *
 * Jeu de donnees : agence A, copropriete S1, lot L1 ; agence B, copropriete SB.
 */

import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/email-service', () => ({ emailService: { sendEmail: jest.fn(async () => undefined) } }));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: jest.fn(async () => ({ enabled: true, subjectOverride: null, bodyHtmlOverride: null }))
}));
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: jest.fn(async () => false)
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), flushAuditQueue: jest.fn() }));

import { recordLotPayment, type LotPaymentInput } from '../../src/lib/syndics/charge-allocation';
import { adjustSyndicateFundBalanceByTenant, createChargeCallAndUpdateStatus } from '../../src/lib/syndics/queries';
import { setBudgetLineFundByTenant, setChargeCallFundByTenant } from '../../src/lib/syndics/fund-assignments';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const S1 = id(1);
const SB = id(2);
const L1 = id(11);
const TRAVAUX = id(21);
const COURANT = id(22);
const FUND_B = id(23);
const BUDGET = id(31);
const LINE_ENTRETIEN = id(41);
const LINE_TRAVAUX = id(42);
const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

const syndicates: Record<string, { tenantId: string; name: string }> = {
  [S1]: { tenantId: TENANT_A, name: 'Residence Les Palmiers' },
  [SB]: { tenantId: TENANT_B, name: 'Residence B' }
};

function fundRow(fundId: string, syndicateId: string, name: string, balance = 0) {
  return {
    id: fundId,
    syndicateId,
    name,
    balance,
    currency: 'XOF',
    syndicate: { tenantId: syndicates[syndicateId].tenantId }
  };
}

function seed() {
  mockPrisma.reset();
  for (const [syndicId, info] of Object.entries(syndicates)) {
    mockPrisma.syndicate.rows.push({ id: syndicId, tenantId: info.tenantId, name: info.name, status: 'ACTIVE' });
  }
  const awa = { id: 'contact-awa', firstName: 'Awa', lastName: 'Kone', legalName: null, email: 'awa@example.test' };
  mockPrisma.syndicateLot.rows.push({
    id: L1,
    syndicateId: S1,
    lotNumber: 'A-01',
    ownerContactId: awa.id,
    coownerId: awa.id,
    owner: awa,
    coowner: awa,
    syndicate: { tenantId: TENANT_A }
  });
  mockPrisma.syndicateFund.rows.push(
    fundRow(TRAVAUX, S1, 'Fonds de travaux'),
    fundRow(COURANT, S1, 'Compte courant'),
    fundRow(FUND_B, SB, 'Fonds agence B')
  );
}

/** Relations que Postgres suivrait : appel -> copropriete, lot ; paiement -> lot. */
function linkOnCreate(model: any, augment: (row: any) => void) {
  const original = model.create.getMockImplementation();
  model.create.mockImplementation(async (args: any) => {
    const result = await original(args);
    augment(model.rows[model.rows.length - 1]);
    return result;
  });
}
linkOnCreate(mockPrisma.chargeCall, row => {
  row.status = row.status ?? 'PENDING';
  row.fundId = row.fundId ?? null;
  row.syndicate = { tenantId: syndicates[row.syndicateId].tenantId, name: syndicates[row.syndicateId].name };
  row.lot = mockPrisma.syndicateLot.rows.find(lot => lot.id === row.lotId);
});
linkOnCreate(mockPrisma.chargePayment, row => {
  const lot = mockPrisma.syndicateLot.rows.find(candidate => candidate.id === row.lotId);
  row.lot = { syndicateId: lot?.syndicateId, syndicate: lot?.syndicate };
});

async function createCall(period: string, amount: number, dueDate: string, extra: Record<string, unknown> = {}) {
  return createChargeCallAndUpdateStatus(TENANT_A, {
    syndicateId: S1,
    lotId: L1,
    period,
    amount,
    currency: 'XOF',
    dueDate: d(dueDate),
    ...extra
  });
}

function pay(amount: number, paidAt: string, extra: Partial<LotPaymentInput> = {}): LotPaymentInput {
  return {
    tenantId: TENANT_A,
    syndicateId: S1,
    lotId: L1,
    amount,
    paidAt: d(paidAt),
    method: 'VIREMENT',
    reference: null,
    actorUserId: 'user-1',
    ...extra
  };
}

const balanceOf = (fundId: string) => Number(mockPrisma.syndicateFund.rows.find(row => row.id === fundId)?.balance);
const movementsOf = (fundId: string) => mockPrisma.syndicateFundMovement.rows.filter(row => row.fundId === fundId);
const journalSum = (fundId: string) =>
  movementsOf(fundId).reduce((sum, row) => sum + (row.direction === 'CREDIT' ? 1 : -1) * Number(row.amount), 0);

/** Budget de S1 : 250 000 appeles au lot L1, dont 25 000 au titre du poste « Fonds de travaux ». */
function seedBudget() {
  mockPrisma.budgetLineItem.rows.push(
    { id: LINE_ENTRETIEN, budgetId: BUDGET, category: 'Entretien', fundId: null },
    { id: LINE_TRAVAUX, budgetId: BUDGET, category: 'Fonds de travaux', fundId: TRAVAUX }
  );
  mockPrisma.budgetAllocation.rows.push({
    id: id(51),
    budgetId: BUDGET,
    lotId: L1,
    totalAllocated: 250000,
    breakdown: [
      { lineId: LINE_ENTRETIEN, category: 'Entretien', allocated: 225000 },
      { lineId: LINE_TRAVAUX, category: 'Fonds de travaux', allocated: 25000 }
    ]
  });
}

beforeEach(seed);

describe('credit des fonds au paiement des charges', () => {
  it("credite en entier le fonds d'un appel affecte a ce fonds", async () => {
    await createCall('Travaux T1', 100000, '2026-03-05', { fundId: TRAVAUX });

    const result = await recordLotPayment(pay(100000, '2026-03-10'));

    const payment = mockPrisma.chargePayment.rows[0];
    expect(balanceOf(TRAVAUX)).toBe(100000);
    expect(movementsOf(TRAVAUX)).toEqual([
      expect.objectContaining({
        tenantId: TENANT_A,
        direction: 'CREDIT',
        amount: 100000,
        balanceAfter: 100000,
        sourceType: 'CHARGE_PAYMENT',
        sourceId: payment.id,
        label: 'Part du paiement — appel Travaux T1 — lot A-01'
      })
    ]);
    expect(balanceOf(COURANT)).toBe(0);
    expect(result.advance).toBe(0);
  });

  it('credite au prorata le fonds alimente par un poste du budget, paiement partiel compris', async () => {
    seedBudget();
    const call = await createCall('2026-T1', 250000, '2026-03-05');
    (mockPrisma.chargeCall.rows.find(row => row.id === call.id) as any).batch = { budgetId: BUDGET };

    await recordLotPayment(pay(100000, '2026-03-10'));
    await recordLotPayment(pay(150000, '2026-03-20'));

    // 10 % de chaque somme affectee : 10 000 puis 15 000.
    expect(movementsOf(TRAVAUX).map(row => Number(row.amount))).toEqual([10000, 15000]);
    expect(balanceOf(TRAVAUX)).toBe(25000);
  });

  it("ne credite aucun fonds quand l'appel n'est rattache a aucun fonds", async () => {
    await createCall('2026-03', 50000, '2026-03-05');

    await recordLotPayment(pay(50000, '2026-03-10'));

    expect(mockPrisma.syndicateFundMovement.rows).toHaveLength(0);
    expect(balanceOf(TRAVAUX)).toBe(0);
  });

  it("credite le fonds quand une avance du lot est imputee plus tard sur l'appel", async () => {
    await recordLotPayment(pay(40000, '2026-02-01'));
    expect(mockPrisma.syndicateFundMovement.rows).toHaveLength(0);

    await createCall('Travaux T1', 30000, '2026-03-05', { fundId: TRAVAUX });

    expect(movementsOf(TRAVAUX)).toEqual([
      expect.objectContaining({
        amount: 30000,
        sourceType: 'CHARGE_PAYMENT',
        label: "Part de l'avance imputée — appel Travaux T1 — lot A-01"
      })
    ]);
    expect(balanceOf(TRAVAUX)).toBe(30000);
  });

  it('garde le solde egal a la somme du journal apres credits et depense', async () => {
    await createCall('Travaux T1', 80000, '2026-03-05', { fundId: TRAVAUX });
    await recordLotPayment(pay(50000, '2026-03-10'));
    await recordLotPayment(pay(30000, '2026-03-12'));
    await adjustSyndicateFundBalanceByTenant(TENANT_A, S1, TRAVAUX, {
      direction: 'DEBIT',
      amount: 20000,
      reason: 'Réfection de la toiture',
      kind: 'EXPENSE'
    });

    expect(balanceOf(TRAVAUX)).toBe(60000);
    expect(journalSum(TRAVAUX)).toBe(60000);
    expect(movementsOf(TRAVAUX).map(row => row.sourceType)).toEqual([
      'CHARGE_PAYMENT',
      'CHARGE_PAYMENT',
      'MANUAL_EXPENSE'
    ]);
    expect(movementsOf(TRAVAUX).map(row => Number(row.balanceAfter))).toEqual([50000, 80000, 60000]);
  });
});

describe('affectation a un fonds — isolation', () => {
  it("refuse a la creation d'un appel le fonds d'une autre agence, comme un fonds inexistant", async () => {
    await expect(createCall('Travaux T1', 100000, '2026-03-05', { fundId: FUND_B })).rejects.toMatchObject({
      statusCode: 404
    });
    expect(mockPrisma.chargeCall.rows).toHaveLength(0);
  });

  it("affecte un appel existant a un fonds de la copropriete, et refuse celui d'une autre agence", async () => {
    const call = await createCall('2026-03', 50000, '2026-03-05');

    await expect(setChargeCallFundByTenant(TENANT_A, S1, call.id, FUND_B)).rejects.toMatchObject({ statusCode: 404 });
    await setChargeCallFundByTenant(TENANT_A, S1, call.id, COURANT, 'user-1');
    await recordLotPayment(pay(50000, '2026-03-10'));

    expect(balanceOf(COURANT)).toBe(50000);
  });

  it("refuse d'affecter l'appel d'une autre agence", async () => {
    const call = await createCall('2026-03', 50000, '2026-03-05');

    await expect(setChargeCallFundByTenant(TENANT_B, S1, call.id, COURANT)).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.chargeCall.rows[0].fundId).toBeNull();
  });

  it("affecte un poste de budget a un fonds, jamais a celui d'une autre agence", async () => {
    mockPrisma.budgetLineItem.rows.push({
      id: LINE_ENTRETIEN,
      budgetId: BUDGET,
      fundId: null,
      budget: { syndicateId: S1, currency: 'XOF', syndicate: { tenantId: TENANT_A } }
    });

    await expect(setBudgetLineFundByTenant(TENANT_A, S1, BUDGET, LINE_ENTRETIEN, FUND_B)).rejects.toMatchObject({
      statusCode: 404
    });
    await setBudgetLineFundByTenant(TENANT_A, S1, BUDGET, LINE_ENTRETIEN, COURANT);
    expect(mockPrisma.budgetLineItem.rows[0].fundId).toBe(COURANT);

    await setBudgetLineFundByTenant(TENANT_A, S1, BUDGET, LINE_ENTRETIEN, null);
    expect(mockPrisma.budgetLineItem.rows[0].fundId).toBeNull();
  });
});
