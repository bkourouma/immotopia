/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 042, lot M2 — décision du gestionnaire sur un paiement en revue
 * (`decideSyndicCheckout`, contracts §1.7), sur la base en mémoire de
 * `syndics.online-payment-fixtures`.
 */

import { createEngineDb, IDS } from './syndics.online-payment-fixtures';

const db = createEngineDb();
const mockDb = db;

jest.mock('../../src/utils/database', () => ({ prisma: mockDb.prisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: any[]) => mockDb.engine.logAuditEvent(...a)
}));
jest.mock('../../src/lib/syndics/charge-allocation', () => ({
  sumAllocationsByCall: (...a: any[]) => (mockDb.engine.sumAllocationsByCall as any)(...a),
  assertSyndicateOfTenant: (...a: any[]) => (mockDb.engine.assertSyndicateOfTenant as any)(...a),
  recordLotPaymentTx: (...a: any[]) => (mockDb.engine.recordLotPaymentTx as any)(...a)
}));
jest.mock('../../src/lib/syndics/charge-receipts', () => ({
  issueReceiptsForPaymentTx: (...a: any[]) => (mockDb.engine.issueReceiptsForPaymentTx as any)(...a),
  toDocumentRefs: (docs: any[]) => docs.map(({ id, kind, number }) => ({ id, kind, number }))
}));
jest.mock('../../src/lib/syndics/charge-receipt-delivery', () => ({
  scheduleChargeDocumentDelivery: (...a: any[]) => mockDb.engine.scheduleChargeDocumentDelivery(...a)
}));
jest.mock('../../src/lib/syndics/provider-invoice-accounting', () => ({
  assertFiscalYearOpenTx: (...a: any[]) => (mockDb.engine.assertFiscalYearOpenTx as any)(...a)
}));
jest.mock('../../src/lib/syndics/charge-schedule-tenant-gate', () => ({
  evaluateSchedulingGate: (...a: any[]) => (mockDb.engine.evaluateSchedulingGate as any)(...a)
}));

import { decideSyndicCheckout } from '../../src/lib/syndics/online-payment/checkout-review';
import type { DecideSyndicCheckoutParams } from '../../src/lib/syndics/online-payment/checkout-review';

const row = (id: string) => db.store.checkouts.find(c => c.id === id)!;
const payments = () => db.store.payments;

const decide = (checkoutId: string, overrides: Partial<DecideSyndicCheckoutParams> = {}) =>
  decideSyndicCheckout({
    tenantId: IDS.T1,
    syndicateId: IDS.S1,
    checkoutId,
    decision: 'ACCEPT',
    note: 'Vérifié avec le relevé PaySecureHub',
    actorUserId: IDS.MANAGER,
    ...overrides
  });

async function expectAppError(promise: Promise<unknown>, statusCode: number, code?: string) {
  await expect(promise).rejects.toMatchObject({ statusCode, ...(code ? { code } : {}) });
}

const inReview = (kind: string, extra: Record<string, unknown> = {}) =>
  db.addCheckout({
    status: 'REVIEW',
    reviewKind: kind,
    reviewReason: 'motif',
    receivedAmount: 49000,
    providerTransactionId: 'TX-9',
    ...extra
  });

beforeEach(() => db.reset());

describe('REJECT', () => {
  it('ne rembourse ni n’enregistre rien : FAILED, REJECTED, note conservée, audit', async () => {
    const checkout = inReview('AMOUNT_MISMATCH');

    const result = await decide(checkout.id, {
      decision: 'REJECT',
      note: '  Payeur contacté, remboursement hors ImmoTopia  '
    });

    expect(result.payment).toBeNull();
    expect(result.checkout).toMatchObject({
      status: 'FAILED',
      resolution: 'REJECTED',
      resolutionNote: 'Payeur contacté, remboursement hors ImmoTopia',
      failureMessage: 'Payeur contacté, remboursement hors ImmoTopia',
      resolvedByName: 'Gestionnaire Un',
      chargePaymentId: null
    });
    expect(result.checkout.resolvedAt).toEqual(expect.any(String));
    expect(payments()).toHaveLength(0);
    expect(db.engine.recordLotPaymentTx).not.toHaveBeenCalled();
    expect(db.engine.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'SYNDIC_ONLINE_PAYMENT_RESOLVED',
        actorUserId: IDS.MANAGER,
        payload: expect.objectContaining({ decision: 'REJECT', reviewKind: 'AMOUNT_MISMATCH', amount: 49000 })
      })
    );
  });

  it('DUPLICATE_TRANSACTION : seul REJECT est possible', async () => {
    const checkout = inReview('DUPLICATE_TRANSACTION');
    await expectAppError(decide(checkout.id, { decision: 'ACCEPT' }), 409, 'REVIEW_NOT_ACCEPTABLE');
    expect(row(checkout.id).status).toBe('REVIEW');

    const result = await decide(checkout.id, { decision: 'REJECT' });
    expect(result.checkout).toMatchObject({ status: 'FAILED', resolution: 'REJECTED' });
  });

  it('CONTRARY_STATE : REJECT refusé (l’encaissement est déjà enregistré)', async () => {
    const checkout = inReview('CONTRARY_STATE', { chargePaymentId: 'pay-1' });

    await expectAppError(decide(checkout.id, { decision: 'REJECT' }), 409, 'REVIEW_NOT_REJECTABLE');

    expect(row(checkout.id)).toMatchObject({ status: 'REVIEW', resolution: null });
  });
});

describe('ACCEPT : encaissement du montant REÇU, une seule transaction', () => {
  it('AMOUNT_MISMATCH : enregistre 49 000 sur les appels visés, reçu émis, documents envoyés après commit', async () => {
    const checkout = inReview('AMOUNT_MISMATCH');

    const result = await decide(checkout.id);

    expect(payments()).toHaveLength(1);
    expect(db.engine.recordLotPaymentTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        amount: 49000,
        method: 'MOBILE_MONEY',
        idempotencyKey: checkout.codePaiement,
        providerTransactionId: 'TX-9',
        origin: 'ONLINE',
        treasuryAccountNumber: '5525',
        actorUserId: IDS.MANAGER
      })
    );
    expect(result.checkout).toMatchObject({
      status: 'SUCCESS',
      resolution: 'ACCEPTED',
      resolvedByName: 'Gestionnaire Un',
      chargePaymentId: payments()[0].id
    });
    expect(result.payment).toMatchObject({ id: payments()[0].id, amount: 49000, unallocatedAmount: 0 });
    expect(result.payment!.documents).toHaveLength(1);
    expect(db.store.allocations.map(a => a.amount).sort((a, b) => a - b)).toEqual([19000, 30000]);
    expect(db.engine.scheduleChargeDocumentDelivery).toHaveBeenCalledTimes(1);
    expect(db.engine.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'SYNDIC_ONLINE_PAYMENT_CONFIRMED' })
    );
  });

  it('payé en trop : l’excédent devient une avance du lot', async () => {
    const checkout = inReview('AMOUNT_MISMATCH', { receivedAmount: 52000 });

    const result = await decide(checkout.id);

    expect(result.payment).toMatchObject({ amount: 52000, unallocatedAmount: 2000 });
  });

  it('sans montant reçu noté, retombe sur le montant demandé', async () => {
    const checkout = inReview('FISCAL_YEAR_CLOSED', { receivedAmount: null });
    const result = await decide(checkout.id, { paidAt: new Date('2025-12-15T00:00:00Z') });
    expect(result.payment?.amount).toBe(50000);
  });

  it('exercice clos : refusé sans date ouverte (rien d’enregistré, reste en REVIEW) ; accepté avec une date d’exercice ouvert', async () => {
    const checkout = inReview('FISCAL_YEAR_CLOSED');
    db.store.closedYears.add(String(new Date().getUTCFullYear()));

    await expect(decide(checkout.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(row(checkout.id)).toMatchObject({ status: 'REVIEW', chargePaymentId: null, resolution: null });
    expect(payments()).toHaveLength(0);

    const paidAt = new Date('2025-12-15T00:00:00Z');
    const result = await decide(checkout.id, { paidAt });

    expect(result.checkout.status).toBe('SUCCESS');
    expect(payments()[0].paidAt).toEqual(paidAt);
    expect(db.engine.assertFiscalYearOpenTx).toHaveBeenLastCalledWith(expect.anything(), IDS.S1, paidAt);
  });

  it('appel disparu : encaisse sur les appels restants, le reliquat devient une avance', async () => {
    const checkout = inReview('CALLS_UNAVAILABLE', { receivedAmount: 50000 });
    db.store.calls.splice(
      db.store.calls.findIndex(c => c.id === IDS.C2),
      1
    );

    const result = await decide(checkout.id);

    expect(db.engine.recordLotPaymentTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ chargeCallIds: [IDS.C1] })
    );
    expect(result.payment).toMatchObject({ amount: 50000, unallocatedAmount: 20000 });
  });

  it('transaction fournisseur déjà enregistrée découverte à l’acceptation : 409 et le motif devient DUPLICATE_TRANSACTION', async () => {
    const checkout = inReview('AMOUNT_MISMATCH');
    db.store.payments.push({
      id: 'other',
      lotId: IDS.L2,
      amount: 1,
      providerTransactionId: 'TX-9',
      idempotencyKey: 'IMS-other'
    });

    await expectAppError(decide(checkout.id), 409, 'REVIEW_NOT_ACCEPTABLE');

    expect(row(checkout.id)).toMatchObject({
      status: 'REVIEW',
      reviewKind: 'DUPLICATE_TRANSACTION',
      chargePaymentId: null
    });
    expect(payments()).toHaveLength(1);
  });

  it('CONTRARY_STATE : ne crée aucun nouvel encaissement, clôt seulement le suivi', async () => {
    const checkout = inReview('CONTRARY_STATE', { chargePaymentId: 'pay-1', receivedAmount: 50000 });

    const result = await decide(checkout.id);

    expect(result.payment).toBeNull();
    expect(result.checkout).toMatchObject({ status: 'SUCCESS', resolution: 'ACCEPTED', chargePaymentId: 'pay-1' });
    expect(db.engine.recordLotPaymentTx).not.toHaveBeenCalled();
    expect(db.engine.issueReceiptsForPaymentTx).not.toHaveBeenCalled();
    expect(payments()).toHaveLength(0);
  });
});

describe('CONTRARY_STATE sans encaissement (succès tardif après expiration)', () => {
  it('ACCEPT encaisse le montant reçu comme les autres motifs, reçus programmés, audit de confirmation', async () => {
    const checkout = inReview('CONTRARY_STATE', { chargePaymentId: null, receivedAmount: 49000 });

    const result = await decide(checkout.id);

    expect(payments()).toHaveLength(1);
    expect(db.engine.recordLotPaymentTx).toHaveBeenCalledTimes(1);
    expect(result.payment).toMatchObject({ id: payments()[0].id, amount: 49000 });
    expect(result.checkout).toMatchObject({
      status: 'SUCCESS',
      resolution: 'ACCEPTED',
      chargePaymentId: payments()[0].id
    });
    expect(db.engine.scheduleChargeDocumentDelivery).toHaveBeenCalledTimes(1);
    expect(db.engine.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'SYNDIC_ONLINE_PAYMENT_CONFIRMED' })
    );
  });

  it('REJECT est permis : FAILED, REJECTED, aucun encaissement', async () => {
    const checkout = inReview('CONTRARY_STATE', { chargePaymentId: null });

    const result = await decide(checkout.id, { decision: 'REJECT' });

    expect(result.payment).toBeNull();
    expect(result.checkout).toMatchObject({ status: 'FAILED', resolution: 'REJECTED', chargePaymentId: null });
    expect(payments()).toHaveLength(0);
    expect(db.engine.recordLotPaymentTx).not.toHaveBeenCalled();
  });
});

describe('garde-fous', () => {
  it('seule une tentative en REVIEW se tranche : 409 CHECKOUT_NOT_IN_REVIEW', async () => {
    for (const status of ['PENDING', 'SUCCESS', 'FAILED', 'CANCELED', 'EXPIRED']) {
      const checkout = db.addCheckout({ status, codePaiement: `IMS-${status}${'z'.repeat(20 - status.length)}` });
      await expectAppError(decide(checkout.id), 409, 'CHECKOUT_NOT_IN_REVIEW');
      await expectAppError(decide(checkout.id, { decision: 'REJECT' }), 409, 'CHECKOUT_NOT_IN_REVIEW');
    }
    expect(payments()).toHaveLength(0);
  });

  it('une deuxième décision, après la première, est refusée', async () => {
    const checkout = inReview('AMOUNT_MISMATCH');
    await decide(checkout.id);
    await expectAppError(decide(checkout.id), 409, 'CHECKOUT_NOT_IN_REVIEW');
    await expectAppError(decide(checkout.id, { decision: 'REJECT' }), 409, 'CHECKOUT_NOT_IN_REVIEW');
    expect(payments()).toHaveLength(1);
  });

  it('deux décisions concurrentes : une seule gagne, jamais deux effets', async () => {
    const checkout = inReview('AMOUNT_MISMATCH');

    const outcomes = await Promise.allSettled([decide(checkout.id), decide(checkout.id, { decision: 'REJECT' })]);

    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    const loser = outcomes.find(o => o.status === 'rejected') as PromiseRejectedResult;
    expect(loser.reason).toMatchObject({ statusCode: 409, code: 'CHECKOUT_NOT_IN_REVIEW' });
    const final = row(checkout.id);
    if (final.status === 'SUCCESS') expect(payments()).toHaveLength(1);
    else expect(payments()).toHaveLength(0);
  });

  it('deux ACCEPT concurrents : un seul encaissement et un seul reçu', async () => {
    const checkout = inReview('AMOUNT_MISMATCH');

    const outcomes = await Promise.allSettled([decide(checkout.id), decide(checkout.id)]);

    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    expect(payments()).toHaveLength(1);
    expect(db.engine.issueReceiptsForPaymentTx).toHaveBeenCalledTimes(1);
  });

  it('une note de 1 à 500 caractères est obligatoire ; la date d’encaissement ne peut pas être future', async () => {
    const checkout = inReview('AMOUNT_MISMATCH');
    await expectAppError(decide(checkout.id, { note: '   ' }), 400);
    await expectAppError(decide(checkout.id, { note: 'x'.repeat(501) }), 400);
    await expectAppError(decide(checkout.id, { paidAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) }), 400);
    expect(row(checkout.id).status).toBe('REVIEW');
  });

  it('une tentative d’une autre copropriété ou d’une autre agence répond 404', async () => {
    const checkout = inReview('AMOUNT_MISMATCH');
    await expectAppError(decide(checkout.id, { syndicateId: IDS.S2 }), 404);
    await expectAppError(decide(checkout.id, { tenantId: IDS.T2 }), 404);
    await expectAppError(decide('00000000-0000-4000-8000-0000000000aa'), 404);
    expect(row(checkout.id).status).toBe('REVIEW');
  });
});
