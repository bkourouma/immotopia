/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contrat 049 §2.5 : décision d'un paiement en ligne locatif en REVIEW (`resolveOnlinePayment`).
 * Base en mémoire minimale ; les services d'allocation sont simulés.
 */

const store = {
  checkout: null as any,
  payment: null as any,
  installments: [] as any[],
  allocations: [] as any[]
};
const calls = { updateStatus: [] as any[], allocate: [] as any[], audit: [] as any[] };
let allocateImpl: (installmentIds: string[]) => Promise<void> = async () => undefined;

const tx: any = {
  onlinePaymentCheckout: {
    findFirst: jest.fn(async ({ where }: any) =>
      store.checkout && store.checkout.id === where.id && store.checkout.tenantId === where.tenantId
        ? { ...store.checkout }
        : null
    ),
    updateMany: jest.fn(async ({ where, data }: any) => {
      if (store.checkout.id !== where.id || store.checkout.tenantId !== where.tenantId) return { count: 0 };
      if (where.status && store.checkout.status !== where.status) return { count: 0 };
      Object.assign(store.checkout, data);
      return { count: 1 };
    })
  },
  rentalPayment: {
    findFirst: jest.fn(async () => ({ ...store.payment })),
    findFirstOrThrow: jest.fn(async () => ({ ...store.payment })),
    update: jest.fn(async ({ data }: any) => {
      Object.assign(store.payment, data);
      return store.payment;
    })
  },
  rentalInstallment: { findMany: jest.fn(async () => store.installments) },
  rentalPaymentAllocation: { findMany: jest.fn(async () => store.allocations) }
};

jest.mock('../../src/utils/database', () => ({
  prisma: { $transaction: (fn: any) => fn(tx) }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (entry: any) => calls.audit.push(entry)
}));
jest.mock('../../src/services/rental-payment-service', () => ({
  updatePaymentStatusTx: jest.fn(async (_tx: any, _t: string, _id: string, status: string) => {
    calls.updateStatus.push(status);
    store.payment.status = status;
  }),
  allocatePaymentTx: jest.fn(async (_tx: any, _t: string, _id: string, data: any) => {
    calls.allocate.push(data.installmentIds);
    await allocateImpl(data.installmentIds);
  }),
  montantDisponibleTx: jest.fn(async () => 0)
}));
jest.mock('../../src/lib/payment-gateway/checkout', () => ({
  resteDuEcheance: (row: any) => Number(row.amount_rent) - Number(row.amount_paid)
}));
jest.mock('../../src/lib/rental/online-review/queries', () => ({
  getOnlinePaymentRow: jest.fn(async () => ({ id: 'CK1', status: store.checkout.status }))
}));

import { resolveOnlinePayment } from '../../src/lib/rental/online-review/resolve';

const T1 = 'tenant-1';
const inst = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  status: 'DUE',
  amount_rent: 50000,
  amount_service: 0,
  amount_other_fees: 0,
  penalty_amount: 0,
  amount_paid: 0,
  payments: [],
  ...over
});

beforeEach(() => {
  store.checkout = {
    id: 'CK1',
    tenantId: T1,
    codePaiement: 'IMT-AAAAAAAAAAAAAAAAAAAA',
    status: 'REVIEW',
    reviewKind: 'AMOUNT_MISMATCH',
    amount: 50000,
    receivedAmount: 49000,
    leaseId: 'L1',
    installmentIds: ['I1'],
    paymentId: 'P1'
  };
  store.payment = { id: 'P1', status: 'PENDING', amount: 50000, currency: 'FCFA' };
  store.installments = [inst('I1')];
  store.allocations = [{ installment_id: 'I1' }];
  calls.updateStatus = [];
  calls.allocate = [];
  calls.audit = [];
  allocateImpl = async () => undefined;
});

describe('validation', () => {
  it('REJECT sans note : 400 RENTAL_ONLINE_PAYMENT_NOTE_REQUIRED', async () => {
    await expect(resolveOnlinePayment(T1, 'U1', 'CK1', { decision: 'REJECT' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'RENTAL_ONLINE_PAYMENT_NOTE_REQUIRED'
    });
    expect(store.checkout.status).toBe('REVIEW');
  });

  it('REJECT avec paidAt : 400', async () => {
    await expect(
      resolveOnlinePayment(T1, 'U1', 'CK1', { decision: 'REJECT', note: 'non', paidAt: '2026-01-01' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('paidAt dans le futur : 400', async () => {
    await expect(
      resolveOnlinePayment(T1, 'U1', 'CK1', { decision: 'ACCEPT', paidAt: '2999-01-01' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('champ inconnu refusé (strict)', async () => {
    await expect(resolveOnlinePayment(T1, 'U1', 'CK1', { decision: 'ACCEPT', tenantId: 'autre' })).rejects.toBeTruthy();
  });

  it('autre agence : 404', async () => {
    await expect(resolveOnlinePayment('tenant-2', 'U1', 'CK1', { decision: 'ACCEPT' })).rejects.toMatchObject({
      statusCode: 404
    });
  });
});

describe('ACCEPT', () => {
  it('encaisse le montant reçu et alloue aux échéances ouvertes', async () => {
    const result = await resolveOnlinePayment(T1, 'U1', 'CK1', { decision: 'ACCEPT', note: 'ok' });
    expect(Number(store.payment.amount)).toBe(49000);
    expect(calls.updateStatus).toEqual(['SUCCESS']);
    expect(calls.allocate).toEqual([['I1']]);
    expect(store.checkout).toMatchObject({ status: 'SUCCESS', resolution: 'ACCEPT', resolvedByUserId: 'U1' });
    expect(result.payment).toMatchObject({ id: 'P1', amount: 49000, allocatedInstallmentIds: ['I1'] });
    expect(calls.audit[0]).toMatchObject({ actionKey: 'RENTAL_ONLINE_PAYMENT_RESOLVED' });
    expect(JSON.stringify(calls.audit[0])).not.toMatch(/https?:|token/i);
  });

  it('aucune échéance ouverte : paiement enregistré non alloué', async () => {
    store.installments = [inst('I1', { status: 'CANCELED' })];
    store.allocations = [];
    const result = await resolveOnlinePayment(T1, 'U1', 'CK1', { decision: 'ACCEPT' });
    expect(calls.allocate).toEqual([]);
    expect(calls.updateStatus).toEqual(['SUCCESS']);
    expect(result.payment?.allocatedInstallmentIds).toEqual([]);
  });

  it('DUPLICATE_TRANSACTION : 409 REVIEW_NOT_ACCEPTABLE, rien d écrit', async () => {
    store.checkout.reviewKind = 'DUPLICATE_TRANSACTION';
    await expect(resolveOnlinePayment(T1, 'U1', 'CK1', { decision: 'ACCEPT' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'REVIEW_NOT_ACCEPTABLE'
    });
    expect(store.checkout.status).toBe('REVIEW');
    expect(calls.updateStatus).toEqual([]);
  });

  it('CONTRARY_STATE déjà encaissé : aucun nouvel encaissement, clôt en SUCCESS', async () => {
    store.checkout.reviewKind = 'CONTRARY_STATE';
    store.payment.status = 'SUCCESS';
    const result = await resolveOnlinePayment(T1, 'U1', 'CK1', { decision: 'ACCEPT' });
    expect(calls.updateStatus).toEqual([]);
    expect(calls.allocate).toEqual([]);
    expect(store.checkout.status).toBe('SUCCESS');
    expect(result.payment).toBeNull();
  });

  it('une erreur d allocation autre que « rien à allouer » annule la décision', async () => {
    allocateImpl = async () => {
      const { BadRequestError } = jest.requireActual('../../src/middleware/error-middleware');
      throw new BadRequestError('Exercice clos');
    };
    await expect(resolveOnlinePayment(T1, 'U1', 'CK1', { decision: 'ACCEPT' })).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it('une seconde décision : 409 RENTAL_ONLINE_PAYMENT_NOT_IN_REVIEW, jamais de double encaissement', async () => {
    await resolveOnlinePayment(T1, 'U1', 'CK1', { decision: 'ACCEPT' });
    await expect(resolveOnlinePayment(T1, 'U2', 'CK1', { decision: 'ACCEPT' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'RENTAL_ONLINE_PAYMENT_NOT_IN_REVIEW'
    });
    expect(calls.updateStatus).toEqual(['SUCCESS']);
  });
});

describe('REJECT', () => {
  it('FAILED, paiement FAILED, note conservée, aucun encaissement', async () => {
    const result = await resolveOnlinePayment(T1, 'U1', 'CK1', { decision: 'REJECT', note: ' Doublon constaté ' });
    expect(store.checkout).toMatchObject({
      status: 'FAILED',
      resolution: 'REJECT',
      resolutionNote: 'Doublon constaté',
      failureMessage: 'Doublon constaté'
    });
    expect(calls.updateStatus).toEqual(['FAILED']);
    expect(calls.allocate).toEqual([]);
    expect(result.payment).toBeNull();
  });

  it('CONTRARY_STATE déjà encaissé : 409 REVIEW_NOT_REJECTABLE', async () => {
    store.checkout.reviewKind = 'CONTRARY_STATE';
    store.payment.status = 'SUCCESS';
    await expect(resolveOnlinePayment(T1, 'U1', 'CK1', { decision: 'REJECT', note: 'non' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'REVIEW_NOT_REJECTABLE'
    });
    expect(store.checkout.status).toBe('REVIEW');
  });

  it('DUPLICATE_TRANSACTION : refus simple possible', async () => {
    store.checkout.reviewKind = 'DUPLICATE_TRANSACTION';
    await resolveOnlinePayment(T1, 'U1', 'CK1', { decision: 'REJECT', note: 'doublon' });
    expect(store.checkout.status).toBe('FAILED');
  });
});
