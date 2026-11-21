/**
 * Revue locative (lot 6, H3) : en FCFA/XOF/XAF les montants sont entiers de
 * bout en bout. Une saisie avec décimales est refusée (400), pas arrondie ;
 * les autres devises gardent leurs décimales.
 */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({
  syncDirectRentPaymentEntryTx: jest.fn(async () => 'none')
}));
jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: jest.fn(),
  getOrCreateTenantAccountTx: jest.fn()
}));
jest.mock('../../src/services/rental-installment-service', () => ({
  annulerPieceTx: jest.fn(),
  compteLocataireDuBailTx: jest.fn(),
  compteLocataireTx: jest.fn(),
  inscrireEcheanceFactureeTx: jest.fn(),
  libellePeriodeEcheance: jest.fn(() => null)
}));

import { RentalInstallmentStatus } from '@prisma/client';
import { allocatePaymentTx, assertAmountMatchesCurrency } from '../../src/services/rental-payment-service';
import { createPaymentSchema, allocatePaymentSchema } from '../../src/lib/rental/payment-schemas';
import { BadRequestError } from '../../src/middleware/error-middleware';

type Row = Record<string, any>;
const TENANT = 'tenant-A';
const INST_1 = '11111111-1111-4111-8111-111111111111';
const INST_2 = '22222222-2222-4222-8222-222222222222';
const INST_3 = '33333333-3333-4333-8333-333333333333';
const LEASE = '44444444-4444-4444-8444-444444444444';

describe('createPaymentSchema : décimales selon la devise', () => {
  const base = { leaseId: LEASE, method: 'CASH' as const };

  it.each(['FCFA', 'XOF', 'XAF'])('refuse un montant décimal en %s (400, message français)', currency => {
    const result = createPaymentSchema.safeParse({ ...base, currency, amount: 1500.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['amount']);
      expect(result.error.issues[0].message).toBe('Le montant doit être un nombre entier en FCFA.');
    }
  });

  it('devise absente : FCFA par défaut, donc décimal refusé', () => {
    expect(createPaymentSchema.safeParse({ ...base, amount: 10.25 }).success).toBe(false);
  });

  it('accepte un montant entier en FCFA et un montant décimal en EUR', () => {
    expect(createPaymentSchema.safeParse({ ...base, currency: 'FCFA', amount: 150000 }).success).toBe(true);
    expect(createPaymentSchema.safeParse({ ...base, currency: 'EUR', amount: 150.25 }).success).toBe(true);
  });
});

describe('assertAmountMatchesCurrency', () => {
  it('lève une BadRequestError en FCFA pour un décimal, accepte l’entier et l’EUR', () => {
    expect(() => assertAmountMatchesCurrency(100.5, 'FCFA')).toThrow(BadRequestError);
    expect(() => assertAmountMatchesCurrency(100.5, undefined)).toThrow(BadRequestError);
    expect(() => assertAmountMatchesCurrency(100, 'XOF')).not.toThrow();
    expect(() => assertAmountMatchesCurrency(100.5, 'EUR')).not.toThrow();
  });
});

function installment(id: string, month: number, rent: number): Row {
  return {
    id,
    tenant_id: TENANT,
    lease_id: 'lease-1',
    status: RentalInstallmentStatus.DUE,
    due_date: new Date(2026, month - 1, 5),
    period_year: 2026,
    period_month: month,
    amount_rent: rent,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    paid_at: null
  };
}

function makeTx(paymentAmount: number, currency: string, installments: Row[]) {
  const allocs: Row[] = [];
  const tx: Row = {
    $queryRaw: jest.fn(async () => []),
    rentalPayment: {
      findFirst: jest.fn(async () => ({
        id: 'pay-1',
        tenant_id: TENANT,
        lease_id: 'lease-1',
        renter_client_id: null,
        amount: paymentAmount,
        method: 'CASH',
        status: 'SUCCESS',
        currency,
        allocations: []
      }))
    },
    rentalPaymentAllocation: {
      findMany: jest.fn(async () => [...allocs]),
      create: jest.fn(async ({ data }: Row) => {
        const row = { id: `al-${allocs.length + 1}`, ...data };
        allocs.push(row);
        return row;
      })
    },
    rentalInstallment: {
      findMany: jest.fn(async () => installments),
      update: jest.fn(async ({ where, data }: Row) => ({ ...installments.find(i => i.id === where.id), ...data }))
    },
    rentalDepositMovement: { findMany: jest.fn(async () => []) },
    thirdPartyMovement: { findUnique: jest.fn(async () => null) }
  };
  return tx;
}

describe('allocatePaymentTx : entiers en FCFA', () => {
  it('l’affectation automatique d’un règlement entre échéances donne des entiers qui somment au règlement', async () => {
    const tx = makeTx(250001, 'FCFA', [
      installment(INST_1, 1, 100000),
      installment(INST_2, 2, 100000),
      installment(INST_3, 3, 100000)
    ]);

    const result = await allocatePaymentTx(
      tx as any,
      TENANT,
      'pay-1',
      { installmentIds: [INST_1, INST_2, INST_3] },
      'u1'
    );

    const amounts = result.allocations.map(a => Number(a.amount));
    expect(amounts).toEqual([100000, 100000, 50001]);
    expect(amounts.every(Number.isInteger)).toBe(true);
    expect(amounts.reduce((s, a) => s + a, 0)).toBe(250001);
  });

  it('refuse une affectation manuelle décimale en FCFA (400), rien n’est écrit', async () => {
    const tx = makeTx(100000, 'FCFA', [installment(INST_1, 1, 100000)]);

    await expect(
      allocatePaymentTx(tx as any, TENANT, 'pay-1', { installmentIds: [INST_1], amounts: { [INST_1]: 500.5 } }, 'u1')
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(tx.rentalPaymentAllocation.create).not.toHaveBeenCalled();
  });

  it('accepte une affectation manuelle décimale en EUR', async () => {
    const tx = makeTx(1000, 'EUR', [installment(INST_1, 1, 1000.5)]);

    const result = await allocatePaymentTx(
      tx as any,
      TENANT,
      'pay-1',
      { installmentIds: [INST_1], amounts: { [INST_1]: 500.25 } },
      'u1'
    );

    expect(Number(result.allocations[0].amount)).toBe(500.25);
  });

  it('plafonne vers le bas : 1000,5 dû et 5000 disponibles donnent 1000, échéance soldée (reliquat < 1 franc)', async () => {
    const tx = makeTx(5000, 'FCFA', [installment(INST_1, 1, 1000.5)]);

    const result = await allocatePaymentTx(tx as any, TENANT, 'pay-1', { installmentIds: [INST_1] }, 'u1');

    expect(result.allocations.map(a => Number(a.amount))).toEqual([1000]);
    expect(tx.rentalInstallment.update.mock.calls[0][0].data.status).toBe(RentalInstallmentStatus.PAID);
  });

  it('ne dépasse jamais le disponible : 1000,5 disponibles pour 5000 dus donnent 1000', async () => {
    const tx = makeTx(1000.5, 'FCFA', [installment(INST_1, 1, 5000)]);

    const result = await allocatePaymentTx(tx as any, TENANT, 'pay-1', { installmentIds: [INST_1] }, 'u1');

    expect(result.allocations.map(a => Number(a.amount))).toEqual([1000]);
    expect(result.totalAllocated).toBeLessThanOrEqual(1000.5);
    expect(tx.rentalInstallment.update.mock.calls[0][0].data.status).toBe(RentalInstallmentStatus.PARTIAL);
  });

  it('un reste dû de 0,4 est soldé (PAID) sans créer d’affectation de 0', async () => {
    const tx = makeTx(5000, 'FCFA', [installment(INST_1, 1, 0.4), installment(INST_2, 2, 2000)]);

    const result = await allocatePaymentTx(tx as any, TENANT, 'pay-1', { installmentIds: [INST_1, INST_2] }, 'u1');

    expect(result.allocations.map(a => [a.installment_id, Number(a.amount)])).toEqual([[INST_2, 2000]]);
    const paid = tx.rentalInstallment.update.mock.calls.filter(
      ([arg]: any[]) => arg.where.id === INST_1 && arg.data.status === RentalInstallmentStatus.PAID
    );
    expect(paid).toHaveLength(1);
  });

  it('seul un reste dû inférieur à 1 franc : pas d’erreur, échéance soldée, aucune affectation', async () => {
    const tx = makeTx(5000, 'FCFA', [installment(INST_1, 1, 0.4)]);

    const result = await allocatePaymentTx(tx as any, TENANT, 'pay-1', { installmentIds: [INST_1] }, 'u1');

    expect(result.allocations).toEqual([]);
    expect(tx.rentalPaymentAllocation.create).not.toHaveBeenCalled();
    expect(tx.rentalInstallment.update.mock.calls[0][0].data.status).toBe(RentalInstallmentStatus.PAID);
  });

  it('EUR garde les centimes : 1000,5 dû, 1000,5 affectés', async () => {
    const tx = makeTx(5000, 'EUR', [installment(INST_1, 1, 1000.5)]);

    const result = await allocatePaymentTx(tx as any, TENANT, 'pay-1', { installmentIds: [INST_1] }, 'u1');

    expect(result.allocations.map(a => Number(a.amount))).toEqual([1000.5]);
  });

  it('le schéma d’affectation laisse passer le corps ; la devise du paiement tranche dans le service', () => {
    expect(allocatePaymentSchema.safeParse({ installmentIds: [INST_1], amounts: { [INST_1]: 500.5 } }).success).toBe(
      true
    );
  });
});
