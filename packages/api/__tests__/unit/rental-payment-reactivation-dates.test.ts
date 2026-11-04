/**
 * BUG-2026-11-04-050 : un paiement réactivé (Annulé puis Réussi) ne garde plus
 * la date d'annulation (ni celle d'échec) de l'état qu'il vient de quitter.
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

import { RentalPaymentStatus } from '@prisma/client';
import { updatePaymentStatusTx } from '../../src/services/rental-payment-service';

type Row = Record<string, any>;
const TENANT = 'tenant-A';

function makeTx(payment: Row): Row {
  return {
    $queryRaw: jest.fn(async () => []),
    rentalPayment: {
      findFirst: jest.fn(async () => ({
        id: 'pay-1',
        tenant_id: TENANT,
        lease_id: 'lease-1',
        amount: 100000,
        method: 'CASH',
        currency: 'FCFA',
        allocations: [],
        ...payment
      })),
      update: jest.fn(async ({ data }: Row) => ({ id: 'pay-1', ...data, allocations: [] }))
    },
    rentalPaymentAllocation: { findMany: jest.fn(async () => []), deleteMany: jest.fn(async () => ({ count: 0 })) },
    rentalInstallment: { findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []), update: jest.fn() },
    rentalDepositMovement: { findMany: jest.fn(async () => []) },
    thirdPartyMovement: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) }
  };
}

const donnees = (tx: Row): Row => tx.rentalPayment.update.mock.calls[0][0].data;

describe('dates propres à l’annulation et à l’échec', () => {
  it('Annulé -> Réussi : canceled_at est remis à null', async () => {
    const tx = makeTx({ status: 'CANCELED', canceled_at: new Date('2026-11-04T05:58:52Z'), succeeded_at: null });
    await updatePaymentStatusTx(tx as any, TENANT, 'pay-1', RentalPaymentStatus.SUCCESS);
    expect(donnees(tx).canceled_at).toBeNull();
    expect(donnees(tx).succeeded_at).toBeInstanceOf(Date);
  });

  it('Échoué -> Réussi : failed_at est remis à null', async () => {
    const tx = makeTx({ status: 'FAILED', failed_at: new Date(), succeeded_at: null });
    await updatePaymentStatusTx(tx as any, TENANT, 'pay-1', RentalPaymentStatus.SUCCESS);
    expect(donnees(tx).failed_at).toBeNull();
  });

  it('Réussi -> Annulé : canceled_at est posé', async () => {
    const tx = makeTx({ status: 'SUCCESS', succeeded_at: new Date(), canceled_at: null });
    await updatePaymentStatusTx(tx as any, TENANT, 'pay-1', RentalPaymentStatus.CANCELED);
    expect(donnees(tx).canceled_at).toBeInstanceOf(Date);
  });
});
