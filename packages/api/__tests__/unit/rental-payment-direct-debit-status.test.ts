/**
 * Un encaissement par prélèvement se pilote depuis la remise (spec 042, P3,
 * data-model §8.6) : la route générique de changement de statut refuse un
 * paiement lié à une ligne de remise.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockPrisma: Record<string, any> = {
  directDebitRemittanceLine: { findFirst: jest.fn() },
  $transaction: jest.fn()
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
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
import { ConflictError } from '../../src/middleware/error-middleware';
import { updatePaymentStatus } from '../../src/services/rental-payment-service';

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockResolvedValue({ id: 'pay-1', status: 'CANCELED' });
});

describe('changement de statut d’un paiement / prélèvement', () => {
  it('refuse un paiement lié à une ligne de remise (409) sans rien écrire', async () => {
    mockPrisma.directDebitRemittanceLine.findFirst.mockResolvedValue({ id: 'line-1' });

    const attempt = updatePaymentStatus('tenant-a', 'pay-1', RentalPaymentStatus.CANCELED, 'user-1');

    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toThrow('constatez un rejet depuis la remise');
    expect(mockPrisma.directDebitRemittanceLine.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', rentalPaymentId: 'pay-1' },
      select: { id: true }
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('laisse passer un paiement qui n’est lié à aucune ligne', async () => {
    mockPrisma.directDebitRemittanceLine.findFirst.mockResolvedValue(null);
    await expect(updatePaymentStatus('tenant-a', 'pay-1', RentalPaymentStatus.CANCELED, 'user-1')).resolves.toEqual({
      id: 'pay-1',
      status: 'CANCELED'
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
