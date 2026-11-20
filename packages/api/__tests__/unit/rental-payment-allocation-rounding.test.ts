/**
 * Revue d'effectivité (lot 4) : `allocatePaymentTx` compare des montants au
 * centime. En flottant, 0,1 + 0,2 vaut 0,30000000000000004 : un règlement de
 * 0,30 laissait l'échéance « Partiellement payée » alors que son montant payé
 * égalait le dû, et un reste de 1e-13 pouvait créer une affectation fantôme.
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
import { allocatePaymentTx } from '../../src/services/rental-payment-service';

type Row = Record<string, any>;

const TENANT = 'tenant-A';
const INST_1 = '11111111-1111-4111-8111-111111111111';
const INST_2 = '22222222-2222-4222-8222-222222222222';

function installment(id: string, dueDate: Date, rent: number, service: number): Row {
  return {
    id,
    tenant_id: TENANT,
    lease_id: 'lease-1',
    status: RentalInstallmentStatus.DUE,
    due_date: dueDate,
    period_year: 2026,
    period_month: dueDate.getMonth() + 1,
    amount_rent: rent,
    amount_service: service,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    paid_at: null
  };
}

function makeTx(paymentAmount: number, installments: Row[]) {
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
        currency: 'FCFA',
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
      update: jest.fn(async ({ where, data }: Row) => ({
        ...installments.find(i => i.id === where.id),
        ...data
      }))
    },
    rentalDepositMovement: { findMany: jest.fn(async () => []) },
    thirdPartyMovement: { findUnique: jest.fn(async () => null) }
  };
  return tx;
}

describe('allocatePaymentTx : arrondi des montants fractionnaires', () => {
  it('solde une échéance de 0,1 + 0,2 avec un règlement de 0,30 (statut PAYÉE)', async () => {
    const tx = makeTx(0.3, [installment(INST_1, new Date(2026, 0, 5), 0.1, 0.2)]);

    const result = await allocatePaymentTx(tx as any, TENANT, 'pay-1', { installmentIds: [INST_1] }, 'u1');

    expect(result.allocations).toHaveLength(1);
    expect(Number(result.allocations[0].amount)).toBe(0.3);
    const update = tx.rentalInstallment.update.mock.calls[0][0];
    expect(update.data.status).toBe(RentalInstallmentStatus.PAID);
    expect(Number(update.data.amount_paid)).toBe(0.3);
  });

  it('un surplus de 0,10 + 0,20 sur deux échéances ne laisse aucune affectation fantôme', async () => {
    const tx = makeTx(0.6, [
      installment(INST_1, new Date(2026, 0, 5), 0.1, 0.2),
      installment(INST_2, new Date(2026, 1, 5), 0.1, 0.2)
    ]);

    const result = await allocatePaymentTx(tx as any, TENANT, 'pay-1', { installmentIds: [INST_1, INST_2] }, 'u1');

    expect(result.allocations.map(a => Number(a.amount))).toEqual([0.3, 0.3]);
    for (const [arg] of tx.rentalInstallment.update.mock.calls) {
      expect(arg.data.status).toBe(RentalInstallmentStatus.PAID);
    }
  });

  it('un règlement partiel laisse l’échéance PARTIELLE avec le montant exact', async () => {
    const tx = makeTx(100, [installment(INST_1, new Date(2026, 0, 5), 1000.5, 0)]);

    await allocatePaymentTx(tx as any, TENANT, 'pay-1', { installmentIds: [INST_1] }, 'u1');

    const update = tx.rentalInstallment.update.mock.calls[0][0];
    expect(update.data.status).toBe(RentalInstallmentStatus.PARTIAL);
    expect(Number(update.data.amount_paid)).toBe(100);
  });
});

describe('schémas de paiement : montant minimum', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createPaymentSchema, allocatePaymentSchema } = require('../../src/lib/rental/payment-schemas');
  const base = { leaseId: INST_1, method: 'CASH' };

  it('refuse un montant inférieur au centime (arrondi à 0,00 par Decimal(12,2))', () => {
    expect(createPaymentSchema.safeParse({ ...base, amount: 0.004 }).success).toBe(false);
    expect(createPaymentSchema.safeParse({ ...base, amount: 0.01 }).success).toBe(true);
  });

  it('refuse une affectation partielle inférieure au centime', () => {
    expect(allocatePaymentSchema.safeParse({ installmentIds: [INST_1], amounts: { [INST_1]: 0.004 } }).success).toBe(
      false
    );
    expect(allocatePaymentSchema.safeParse({ installmentIds: [INST_1], amounts: { [INST_1]: 500 } }).success).toBe(
      true
    );
  });
});
