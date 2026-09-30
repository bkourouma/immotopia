/**
 * Une échéance ANNULÉE reste annulée.
 *
 * - Annuler un règlement dont une allocation portait une échéance annulée ne
 *   doit ni la remettre « À payer » / « En retard », ni lui réinscrire une
 *   créance (`reverseInstallmentAllocations`).
 * - Un règlement ne s'alloue pas à une échéance annulée (`allocatePaymentTx`).
 */

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({
  syncDirectRentPaymentEntryTx: jest.fn(async () => 'none')
}));
jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: jest.fn(),
  getOrCreateTenantAccountTx: jest.fn()
}));
const inscrireEcheanceFactureeTx = jest.fn();
jest.mock('../../src/services/rental-installment-service', () => ({
  annulerPieceTx: jest.fn(),
  compteLocataireDuBailTx: jest.fn(),
  compteLocataireTx: jest.fn(),
  inscrireEcheanceFactureeTx: (...args: any[]) => inscrireEcheanceFactureeTx(...args),
  libellePeriodeEcheance: jest.fn(() => null)
}));

import { RentalInstallmentStatus, RentalPaymentStatus } from '@prisma/client';
import { allocatePaymentTx, updatePaymentStatusTx } from '../../src/services/rental-payment-service';

type Row = Record<string, any>;

const TENANT = 'tenant-A';

function makeTx(installment: Row | null): Row {
  return {
    rentalPayment: {
      findFirst: jest.fn(async () => ({
        id: 'pay-1',
        tenant_id: TENANT,
        lease_id: 'lease-1',
        amount: 100000,
        method: 'CASH',
        status: 'SUCCESS',
        currency: 'FCFA',
        allocations: []
      })),
      update: jest.fn(async ({ data }: Row) => ({ id: 'pay-1', ...data, allocations: [] }))
    },
    rentalPaymentAllocation: {
      findMany: jest.fn(async ({ select }: Row) =>
        select?.installment_id ? [{ id: 'al-1', installment_id: 'inst-1', installment: null }] : []
      ),
      deleteMany: jest.fn(async () => ({ count: 1 }))
    },
    rentalInstallment: {
      findUnique: jest.fn(async () => installment),
      findMany: jest.fn(async () => []),
      update: jest.fn(async ({ data }: Row) => ({ ...installment, ...data }))
    },
    thirdPartyMovement: { count: jest.fn(async () => 0) }
  };
}

const canceled = (): Row => ({
  id: 'inst-1',
  tenant_id: TENANT,
  lease_id: 'lease-1',
  status: RentalInstallmentStatus.CANCELED,
  due_date: new Date(2026, 0, 5),
  amount_rent: 100000,
  amount_service: 0,
  amount_other_fees: 0,
  penalty_amount: 0,
  amount_paid: 100000,
  paid_at: null
});

beforeEach(() => {
  inscrireEcheanceFactureeTx.mockClear();
});

describe('annulation d’un règlement portant une échéance annulée', () => {
  it('ne remet pas l’échéance annulée en DUE/OVERDUE et ne lui réinscrit aucune créance', async () => {
    const tx = makeTx(canceled());

    await updatePaymentStatusTx(tx as any, TENANT, 'pay-1', RentalPaymentStatus.CANCELED);

    expect(tx.rentalPaymentAllocation.deleteMany).toHaveBeenCalled();
    expect(tx.rentalInstallment.update).not.toHaveBeenCalled();
    expect(inscrireEcheanceFactureeTx).not.toHaveBeenCalled();
  });

  it('continue de recalculer une échéance vivante (témoin)', async () => {
    const tx = makeTx({ ...canceled(), status: RentalInstallmentStatus.PAID });

    await updatePaymentStatusTx(tx as any, TENANT, 'pay-1', RentalPaymentStatus.CANCELED);

    expect(tx.rentalInstallment.update).toHaveBeenCalledTimes(1);
    expect((tx.rentalInstallment.update.mock.calls[0] as any)[0].data.status).toBe(RentalInstallmentStatus.OVERDUE);
    expect(inscrireEcheanceFactureeTx).toHaveBeenCalledTimes(1);
  });
});

describe('allocatePaymentTx', () => {
  it('ne sélectionne jamais une échéance annulée', async () => {
    const tx = makeTx(null);

    await expect(
      allocatePaymentTx(tx as any, TENANT, 'pay-1', { installmentIds: ['inst-1'] } as any, 'u1')
    ).rejects.toThrow();

    const where = (tx.rentalInstallment.findMany.mock.calls[0] as any)[0].where;
    expect(where.status).toEqual({ not: RentalInstallmentStatus.CANCELED });
  });
});
