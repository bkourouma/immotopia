/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot S2 — affectation des paiements de charges, avance du lot et suivi
 * mensuel, sur une base en memoire qui applique vraiment les filtres `where`
 * (`__tests__/helpers/fake-prisma.ts`).
 *
 * Jeu de donnees :
 *   Agence A — copropriete S1 : lots L1 (Awa) et L2 (Bakary).
 *   Agence B — copropriete SB : lot LB.
 */

import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const mockSendEmail = jest.fn(async (_params: any) => undefined);
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (params: any) => mockSendEmail(params) }
}));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: jest.fn(async () => ({ enabled: true, subjectOverride: null, bodyHtmlOverride: null }))
}));
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: jest.fn(async () => false)
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), flushAuditQueue: jest.fn() }));

import {
  applyLotAdvanceTx,
  getLotAdvance,
  listOpenCallsForLot,
  previewLotPaymentForTenant,
  recordLotPayment,
  withAllocationPayments,
  type LotPaymentInput
} from '../../src/lib/syndics/charge-allocation';
import { getMonthlyTrackingBySyndicate } from '../../src/lib/syndics/charge-monthly-tracking';
import {
  createChargeCallAndUpdateStatus,
  recordChargePaymentWithStatusUpdate,
  runReminderBatchForSyndicate
} from '../../src/lib/syndics/queries';
import { notifyChargeCall, notifyChargeCallReminder } from '../../src/lib/syndics/notifications';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const S1 = id(1);
const SB = id(2);
const L1 = id(11);
const L2 = id(12);
const LB = id(13);
const AWA = 'contact-awa';
const BAKARY = 'contact-bakary';
const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

const syndicates: Record<string, { tenantId: string; name: string }> = {
  [S1]: { tenantId: TENANT_A, name: 'Residence Les Palmiers' },
  [SB]: { tenantId: TENANT_B, name: 'Residence B' }
};

/**
 * La base en memoire ne resout pas les relations : on les accroche aux lignes
 * creees (appel -> copropriete, paiement -> lot), comme Postgres les suivrait.
 */
function linkOnCreate(model: any, augment: (row: any) => void) {
  const original = model.create.getMockImplementation();
  model.create.mockImplementation(async (args: any) => {
    const result = await original(args);
    augment(model.rows[model.rows.length - 1]);
    return result;
  });
}

function lotRow(lotId: string, syndicateId: string, lotNumber: string, owner: any) {
  return {
    id: lotId,
    syndicateId,
    lotNumber,
    ownerContactId: owner?.id ?? null,
    coownerId: owner?.id ?? null,
    owner,
    coowner: owner,
    syndicate: { tenantId: syndicates[syndicateId].tenantId }
  };
}

function seed() {
  mockPrisma.reset();
  mockSendEmail.mockClear();
  mockPrisma.$executeRaw.mockClear();
  for (const [syndicId, info] of Object.entries(syndicates)) {
    mockPrisma.syndicate.rows.push({ id: syndicId, tenantId: info.tenantId, name: info.name, status: 'ACTIVE' });
  }
  const awa = { id: AWA, firstName: 'Awa', lastName: 'Kone', legalName: null, email: 'awa@example.test' };
  const bakary = { id: BAKARY, firstName: 'Bakary', lastName: 'Traore', legalName: null, email: 'bakary@example.test' };
  mockPrisma.syndicateLot.rows.push(
    lotRow(L1, S1, 'A-01', awa),
    lotRow(L2, S1, 'A-02', bakary),
    lotRow(LB, SB, 'B-01', { id: 'contact-b', firstName: 'Bintou', lastName: 'Diallo' })
  );
}

linkOnCreate(mockPrisma.chargeCall, row => {
  row.status = row.status ?? 'PENDING';
  row.syndicate = { tenantId: syndicates[row.syndicateId].tenantId, name: syndicates[row.syndicateId].name };
});
linkOnCreate(mockPrisma.chargePayment, row => {
  const lot = mockPrisma.syndicateLot.rows.find(candidate => candidate.id === row.lotId);
  row.lot = { syndicateId: lot?.syndicateId, syndicate: lot?.syndicate };
});

async function createCall(lotId: string, period: string, amount: number, dueDate: string, syndicateId = S1) {
  return createChargeCallAndUpdateStatus(syndicates[syndicateId].tenantId, {
    syndicateId,
    lotId,
    period,
    amount,
    currency: 'XOF',
    dueDate: d(dueDate)
  });
}

function pay(lotId: string, amount: number, paidAt: string, extra: Partial<LotPaymentInput> = {}): LotPaymentInput {
  return {
    tenantId: TENANT_A,
    syndicateId: S1,
    lotId,
    amount,
    paidAt: d(paidAt),
    method: 'VIREMENT',
    reference: null,
    actorUserId: 'user-1',
    ...extra
  };
}

const callRow = (callId: string): any => mockPrisma.chargeCall.rows.find(row => row.id === callId);
const paymentsOf = (lotId: string) => mockPrisma.chargePayment.rows.filter(row => row.lotId === lotId);
const allocationsOf = (callId: string) =>
  mockPrisma.chargePaymentAllocation.rows.filter(row => row.chargeCallId === callId);
const ledger = () => mockPrisma.ownerAccountTransaction.rows;
const accountOf = (lotId: string): any => mockPrisma.ownerAccount.rows.find(row => row.lotId === lotId);

/** Relations lues par les notifications et les relances (include), accrochees a la main. */
function attachCallRelations() {
  for (const row of mockPrisma.chargeCall.rows) {
    row.allocations = mockPrisma.chargePaymentAllocation.rows.filter(a => a.chargeCallId === row.id);
    row.lot = mockPrisma.syndicateLot.rows.find(lot => lot.id === row.lotId);
  }
}

beforeEach(seed);

describe('recordLotPayment — affectation d un paiement', () => {
  it('solde les appels les plus anciens d abord, un seul credit au grand livre', async () => {
    const mars = await createCall(L1, '2026-03', 10000, '2026-03-05');
    const janvier = await createCall(L1, '2026-01', 10000, '2026-01-05');
    const fevrier = await createCall(L1, '2026-02', 10000, '2026-02-05');

    const result = await recordLotPayment(pay(L1, 25000, '2026-02-10'));

    expect(result.allocations.map(a => [a.chargeCallId, a.amount, a.source])).toEqual([
      [janvier.id, 10000, 'PAYMENT'],
      [fevrier.id, 10000, 'PAYMENT'],
      [mars.id, 5000, 'PAYMENT']
    ]);
    expect(result.advance).toBe(0);
    expect(result.lotAdvanceBalance).toBe(0);
    expect(result.payment).toMatchObject({ amount: 25000, unallocatedAmount: 0, chargeCallId: janvier.id, lotId: L1 });
    expect([callRow(janvier.id).status, callRow(fevrier.id).status, callRow(mars.id).status]).toEqual([
      'PAID',
      'PAID',
      'PARTIAL'
    ]);

    const payments = paymentsOf(L1);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amount: 25000, unallocatedAmount: 0, createdById: 'user-1' });

    const credits = ledger().filter(row => row.type === 'PAYMENT');
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ credit: 25000, sourceId: payments[0].id });
    expect(Number(accountOf(L1).balance)).toBe(5000);
  });

  it('les mois coches passent seuls, meme si un appel plus ancien reste du', async () => {
    const janvier = await createCall(L1, '2026-01', 10000, '2026-01-05');
    const fevrier = await createCall(L1, '2026-02', 10000, '2026-02-05');
    const mars = await createCall(L1, '2026-03', 10000, '2026-03-05');

    const result = await recordLotPayment(pay(L1, 20000, '2026-03-01', { chargeCallIds: [mars.id, fevrier.id] }));

    expect(result.allocations.map(a => a.chargeCallId)).toEqual([fevrier.id, mars.id]);
    expect(callRow(janvier.id).status).toBe('PENDING');
    expect(allocationsOf(janvier.id)).toHaveLength(0);
  });

  it('au-dela des mois coches, l excedent solde les autres appels ouverts puis reste en avance', async () => {
    const janvier = await createCall(L1, '2026-01', 10000, '2026-01-05');
    const fevrier = await createCall(L1, '2026-02', 10000, '2026-02-05');

    const result = await recordLotPayment(pay(L1, 25000, '2026-02-10', { chargeCallIds: [fevrier.id] }));

    expect(result.allocations.map(a => [a.chargeCallId, a.amount, a.source, a.callStatusAfter])).toEqual([
      [fevrier.id, 10000, 'PAYMENT', 'PAID'],
      [janvier.id, 10000, 'ADVANCE', 'PAID']
    ]);
    expect(result.advance).toBe(5000);
    expect(result.lotAdvanceBalance).toBe(5000);
    expect(paymentsOf(L1)[0].unallocatedAmount).toBe(5000);
    // L'imputation n'est pas un mouvement d'argent : toujours un seul credit.
    expect(ledger().filter(row => row.type === 'PAYMENT')).toHaveLength(1);
    expect(Number(accountOf(L1).balance)).toBe(-5000);
  });

  it('sans appel ouvert, tout le paiement devient une avance (appel principal nul)', async () => {
    const result = await recordLotPayment(pay(L1, 7500, '2026-01-10'));
    expect(result.allocations).toEqual([]);
    expect(result.advance).toBe(7500);
    expect(result.payment.chargeCallId).toBeNull();
    expect(await getLotAdvance(TENANT_A, S1, L1)).toEqual({ advance: 7500, currency: 'XOF' });
  });

  it('prend le verrou du lot avant de lire l etat', async () => {
    await recordLotPayment(pay(L1, 100, '2026-01-10'));
    const keys = mockPrisma.$executeRaw.mock.calls.map(call => call[1]);
    expect(keys).toContain(`syndic-lot-allocation:${L1}`);
  });

  it('l apercu annonce exactement ce que l enregistrement fera, sans rien ecrire', async () => {
    const janvier = await createCall(L1, '2026-01', 10000, '2026-01-05');
    const fevrier = await createCall(L1, '2026-02', 8000, '2026-02-05');
    const before = {
      payments: mockPrisma.chargePayment.rows.length,
      allocations: mockPrisma.chargePaymentAllocation.rows.length,
      ledger: ledger().length
    };

    const input = pay(L1, 21000, '2026-02-10', { chargeCallIds: [fevrier.id] });
    const preview = await previewLotPaymentForTenant(input);
    expect({
      payments: mockPrisma.chargePayment.rows.length,
      allocations: mockPrisma.chargePaymentAllocation.rows.length,
      ledger: ledger().length
    }).toEqual(before);
    expect(preview.payment.id).toBeNull();

    const actual = await recordLotPayment(input);
    const strip = (items: any[]) => items.map(({ paymentId: _ignored, ...rest }) => rest);
    expect(strip(preview.allocations)).toEqual(strip(actual.allocations));
    expect([preview.advance, preview.lotAdvanceBalance]).toEqual([actual.advance, actual.lotAdvanceBalance]);
    expect(preview.allocations.map(a => a.chargeCallId)).toEqual([fevrier.id, janvier.id]);
    expect(preview.advance).toBe(3000);
  });

  it('refuse un montant nul (422) sans rien ecrire', async () => {
    await expect(recordLotPayment(pay(L1, 0, '2026-01-10'))).rejects.toMatchObject({ statusCode: 422 });
    expect(mockPrisma.chargePayment.rows).toHaveLength(0);
  });
});

describe('isolation', () => {
  it('un lot d une autre agence ou d une autre copropriete repond 404', async () => {
    await expect(recordLotPayment(pay(LB, 100, '2026-01-10'))).rejects.toMatchObject({ statusCode: 404 });
    await expect(recordLotPayment(pay(LB, 100, '2026-01-10', { syndicateId: SB }))).rejects.toMatchObject({
      statusCode: 404
    });
    await expect(previewLotPaymentForTenant(pay(LB, 100, '2026-01-10'))).rejects.toMatchObject({ statusCode: 404 });
    await expect(getLotAdvance(TENANT_A, S1, LB)).rejects.toMatchObject({ statusCode: 404 });
    await expect(listOpenCallsForLot(TENANT_A, S1, LB)).rejects.toMatchObject({ statusCode: 404 });
    await expect(getMonthlyTrackingBySyndicate(TENANT_A, SB, 2026)).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.chargePayment.rows).toHaveLength(0);
  });

  it('un appel d un autre lot parmi les mois coches repond 404, rien n est ecrit', async () => {
    const autreLot = await createCall(L2, '2026-01', 10000, '2026-01-05');
    const autreAgence = await createCall(LB, '2026-01', 10000, '2026-01-05', SB);
    for (const foreign of [autreLot.id, autreAgence.id]) {
      await expect(recordLotPayment(pay(L1, 100, '2026-01-10', { chargeCallIds: [foreign] }))).rejects.toMatchObject({
        statusCode: 404
      });
    }
    expect(mockPrisma.chargePayment.rows).toHaveLength(0);
    expect(mockPrisma.chargePaymentAllocation.rows).toHaveLength(0);
  });

  it('la route historique refuse un appel d une autre copropriete (404)', async () => {
    const call = await createCall(L1, '2026-01', 10000, '2026-01-05');
    await expect(
      recordChargePaymentWithStatusUpdate(TENANT_A, { chargeCallId: call.id, amount: 100, paidAt: d('2026-01-10'), syndicateId: SB })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      recordChargePaymentWithStatusUpdate(TENANT_B, { chargeCallId: call.id, amount: 100, paidAt: d('2026-01-10') })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('avance imputee a la creation des appels', () => {
  it('une avance qui couvre un appel entier : appel PAID des sa creation, aucun mouvement d argent', async () => {
    await recordLotPayment(pay(L1, 10000, '2026-01-02'));
    const ledgerBefore = ledger().length;

    const call = await createCall(L1, '2026-02', 10000, '2026-02-05');

    expect(call.status).toBe('PAID');
    expect(allocationsOf(call.id)).toEqual([expect.objectContaining({ amount: 10000, source: 'ADVANCE' })]);
    expect(paymentsOf(L1)[0].unallocatedAmount).toBe(0);
    // Seul le debit de l'appel s'ajoute ; l'imputation n'ecrit rien au grand livre.
    const added = ledger().slice(ledgerBefore);
    expect(added.map(row => row.type)).toEqual(['CHARGE_CALL']);
    expect(Number(accountOf(L1).balance)).toBe(0);
  });

  it('une avance partielle laisse l appel PARTIAL et s epuise', async () => {
    await recordLotPayment(pay(L1, 4000, '2026-01-02'));
    const call = await createCall(L1, '2026-02', 10000, '2026-02-05');
    expect(call.status).toBe('PARTIAL');
    expect(await getLotAdvance(TENANT_A, S1, L1)).toEqual({ advance: 0, currency: 'XOF' });
    const open = await listOpenCallsForLot(TENANT_A, S1, L1);
    expect(open).toEqual([
      expect.objectContaining({ id: call.id, amount: 10000, paid: 4000, outstanding: 6000, periodStart: '2026-02-01' })
    ]);
  });

  it('plusieurs paiements consommes dans l ordre (FIFO) sur des appels recurrents, bornes decalees', async () => {
    await recordLotPayment(pay(L1, 5000, '2026-01-20'));
    await recordLotPayment(pay(L1, 3000, '2026-01-02'));
    const [recent, ancien] = [...paymentsOf(L1)].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());

    const result = await createChargeCallAndUpdateStatus(TENANT_A, {
      syndicateId: S1,
      lotId: L1,
      period: '2026-01',
      amount: 4000,
      currency: 'XOF',
      dueDate: d('2026-01-31'),
      isRecurring: true,
      recurrenceFrequency: 'MONTHLY',
      recurrenceCount: 2
    });

    const [first, second] = result.chargeCalls;
    expect([first.period, second.period]).toEqual(['2026-01-R1', '2026-01-R2']);
    expect([first.status, second.status]).toEqual(['PAID', 'PAID']);
    expect(second.periodStart.toISOString().slice(0, 10)).toBe('2026-02-01');
    expect(second.periodEnd.toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(allocationsOf(first.id).map(a => [a.paymentId, a.amount])).toEqual([
      [ancien.id, 3000],
      [recent.id, 1000]
    ]);
    expect(allocationsOf(second.id).map(a => [a.paymentId, a.amount])).toEqual([[recent.id, 4000]]);
    expect(recent.unallocatedAmount).toBe(0);
    expect(ancien.unallocatedAmount).toBe(0);
  });

  it('applyLotAdvanceTx ne fait rien sans avance (une seule lecture)', async () => {
    await createCall(L1, '2026-01', 10000, '2026-01-05');
    const outcome = await applyLotAdvanceTx(mockPrisma as any, L1);
    expect(outcome.imputations).toEqual([]);
  });
});

describe('grand livre : coherent apres une suite d operations', () => {
  it('solde = total appele - total paye ; restes dus - avance = solde', async () => {
    await createCall(L1, '2026-01', 10000, '2026-01-05');
    await createCall(L1, '2026-02', 10000, '2026-02-05');
    await recordLotPayment(pay(L1, 25000, '2026-02-10'));
    await createCall(L1, '2026-03', 10000, '2026-03-05');
    await recordLotPayment(pay(L1, 1200, '2026-03-06'));

    const debits = ledger().filter(row => row.type === 'CHARGE_CALL');
    const credits = ledger().filter(row => row.type === 'PAYMENT');
    expect(debits).toHaveLength(3);
    expect(credits).toHaveLength(2);
    const balance = Number(accountOf(L1).balance);
    expect(balance).toBe(30000 - 26200);

    const open = await listOpenCallsForLot(TENANT_A, S1, L1);
    const outstanding = open.reduce((sum, item) => sum + item.outstanding, 0);
    const { advance } = await getLotAdvance(TENANT_A, S1, L1);
    expect(outstanding - advance).toBe(balance);
    // Chaque paiement est entierement affecte ou en avance, jamais plus.
    for (const payment of paymentsOf(L1)) {
      const allocated = mockPrisma.chargePaymentAllocation.rows
        .filter(row => row.paymentId === payment.id)
        .reduce((sum, row) => sum + Number(row.amount), 0);
      expect(allocated + Number(payment.unallocatedAmount)).toBe(Number(payment.amount));
    }
  });
});

describe('route historique .../charges/:chargeId/pay', () => {
  it('un trop-percu n est plus refuse : il devient une avance (ancien 422)', async () => {
    const call = await createCall(L1, '2026-01', 20000, '2026-01-05');
    const result: any = await recordChargePaymentWithStatusUpdate(TENANT_A, {
      chargeCallId: call.id,
      amount: 25000,
      paidAt: d('2026-01-10'),
      method: 'ESPECES',
      reference: 'R-1',
      syndicateId: S1
    });
    // Champs historiques conserves, ajouts du lot S2.
    expect(result).toMatchObject({ chargeCallId: call.id, amount: 25000, method: 'ESPECES', reference: 'R-1' });
    expect(result.advance).toBe(5000);
    expect(result.lotAdvanceBalance).toBe(5000);
    expect(result.allocations).toEqual([
      expect.objectContaining({ chargeCallId: call.id, amount: 20000, source: 'PAYMENT', callStatusAfter: 'PAID' })
    ]);
    expect(callRow(call.id).status).toBe('PAID');
  });

  it('PENDING -> PARTIAL -> PAID', async () => {
    const call = await createCall(L1, '2026-01', 100000, '2099-01-05');
    await recordChargePaymentWithStatusUpdate(TENANT_A, { chargeCallId: call.id, amount: 30000, paidAt: d('2026-01-10') });
    expect(callRow(call.id).status).toBe('PARTIAL');
    await recordChargePaymentWithStatusUpdate(TENANT_A, { chargeCallId: call.id, amount: 70000, paidAt: d('2026-01-11') });
    expect(callRow(call.id).status).toBe('PAID');
  });
});

describe('un appel couvert n est ni notifie ni relance', () => {
  it('notifyChargeCall ignore un appel couvert par l avance, notifie un appel du', async () => {
    await recordLotPayment(pay(L1, 10000, '2026-01-02'));
    const covered = await createCall(L1, '2026-02', 10000, '2026-02-05');
    const due = await createCall(L1, '2026-03', 10000, '2026-03-05');
    attachCallRelations();

    expect(await notifyChargeCall(covered.id)).toMatchObject({ skipped: 'ALREADY_PAID' });
    expect(mockSendEmail).not.toHaveBeenCalled();

    expect(await notifyChargeCall(due.id)).toMatchObject({ emailSent: true });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('la relance groupee saute un appel couvert, meme au statut stocke perime', async () => {
    const covered = await createCall(L1, '2026-01', 10000, '2026-01-05');
    const overdue = await createCall(L2, '2026-01', 10000, '2026-01-05');
    await recordLotPayment(pay(L1, 10000, '2026-01-06'));
    // Statut stocke volontairement perime : la relance se fie aux affectations.
    callRow(covered.id).status = 'PENDING';
    attachCallRelations();

    const result = await runReminderBatchForSyndicate(TENANT_A, S1);
    expect(result.remindersCreated).toBe(1);
    expect(mockPrisma.paymentReminder.rows.map(row => row.chargeCallId)).toEqual([overdue.id]);
  });

  it('notifyChargeCallReminder n envoie rien pour un appel solde entre-temps', async () => {
    const call = await createCall(L1, '2026-01', 10000, '2026-01-05');
    await recordLotPayment(pay(L1, 10000, '2026-01-06'));
    attachCallRelations();
    mockPrisma.paymentReminder.rows.push({ id: 'rem-1', chargeCallId: call.id, reminderLevel: 1, chargeCall: callRow(call.id) });

    expect(await notifyChargeCallReminder('rem-1')).toMatchObject({ skipped: 'ALREADY_PAID' });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe('suivi mensuel', () => {
  it('grille par lot : trimestre reparti, mois regles, en retard, avance', async () => {
    const q1 = await createChargeCallAndUpdateStatus(TENANT_A, {
      syndicateId: S1,
      lotId: L1,
      period: '2026-T1',
      amount: 90000,
      currency: 'XOF',
      dueDate: d('2026-01-10')
    });
    await recordLotPayment(pay(L1, 40000, '2026-01-05'));
    await createCall(L2, 'Charges exceptionnelles', 5000, '2099-06-15');
    await createCall(L2, '2025-12', 1000, '2025-12-05');

    const grid = await getMonthlyTrackingBySyndicate(TENANT_A, S1, 2026);
    expect(grid.year).toBe(2026);
    expect(grid.months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(grid.lots.map(lot => [lot.lotNumber, lot.ownerName])).toEqual([
      ['A-01', 'Awa Kone'],
      ['A-02', 'Bakary Traore']
    ]);

    const awa = grid.lots[0];
    expect(awa.advance).toBe(0);
    expect(awa.months.slice(0, 4)).toEqual([
      { month: 1, due: 30000, paid: 30000, status: 'PAID' },
      { month: 2, due: 30000, paid: 10000, status: 'OVERDUE' },
      { month: 3, due: 30000, paid: 0, status: 'OVERDUE' },
      { month: 4, due: 0, paid: 0, status: 'NONE' }
    ]);
    expect(q1.periodStart.toISOString().slice(0, 10)).toBe('2026-01-01');

    // Appel sans bornes (libelle libre) : range au mois de son echeance ; un
    // appel de 2025 n'apparait pas en 2026.
    const bakary = grid.lots[1];
    expect(bakary.months.filter(cell => cell.status !== 'NONE')).toEqual([]);
  });

  it('la grille d une annee future montre l appel a son mois d echeance, avec l avance du lot', async () => {
    await createCall(L2, 'Charges exceptionnelles', 5000, '2099-06-15');
    await recordLotPayment(pay(L2, 7000, '2026-01-05'));
    const grid = await getMonthlyTrackingBySyndicate(TENANT_A, S1, 2099);
    const bakary = grid.lots.find(lot => lot.lotId === L2)!;
    expect(bakary.months[5]).toEqual({ month: 6, due: 5000, paid: 5000, status: 'PAID' });
    expect(bakary.advance).toBe(2000);
  });
});

describe('withAllocationPayments — forme historique des appels', () => {
  it('reconstitue `payments` a partir des affectations et ajoute regle et reste', () => {
    const view = withAllocationPayments({
      id: 'call-1',
      amount: 10000,
      status: 'PARTIAL',
      allocations: [
        {
          id: 'alloc-1',
          paymentId: 'pay-1',
          amount: 2500,
          source: 'PAYMENT',
          createdAt: d('2026-01-05'),
          payment: { paidAt: d('2026-01-05'), method: 'VIREMENT', reference: 'R', createdAt: d('2026-01-05') }
        },
        {
          id: 'alloc-2',
          paymentId: 'pay-0',
          amount: 1000.1,
          source: 'ADVANCE',
          createdAt: d('2026-01-06'),
          payment: { paidAt: d('2025-12-20'), method: null, reference: null, createdAt: d('2025-12-20') }
        }
      ]
    });
    expect(view).not.toHaveProperty('allocations');
    expect(view.payments).toEqual([
      expect.objectContaining({ id: 'alloc-1', paymentId: 'pay-1', chargeCallId: 'call-1', amount: 2500, method: 'VIREMENT' }),
      expect.objectContaining({ id: 'alloc-2', paymentId: 'pay-0', amount: 1000.1, source: 'ADVANCE' })
    ]);
    expect(view.paidAmount).toBe(3500.1);
    expect(view.outstandingAmount).toBe(6499.9);
  });
});
