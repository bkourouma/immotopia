/**
 * Audit lot B : `approvePaymentDeclaration` passe la déclaration de PENDING à
 * APPROVED de façon atomique dans la transaction (updateMany conditionnel).
 * Deux approbations concurrentes : une seule crée un paiement, l'autre lève
 * ConflictError. La clé d'idempotence du paiement est stable (sans Date.now).
 */
const declFindFirst = jest.fn();
const declUpdateMany = jest.fn();
const declUpdate = jest.fn();
const paymentCreate = jest.fn();

const tx: any = {
  rentalPaymentDeclaration: {
    updateMany: (...a: any[]) => declUpdateMany(...a),
    update: (...a: any[]) => declUpdate(...a)
  },
  rentalPayment: { create: (...a: any[]) => paymentCreate(...a) }
};

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalPaymentDeclaration: { findFirst: (...a: any[]) => declFindFirst(...a) },
    rentalLease: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: (fn: any) => fn(tx)
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/rental-installment-service', () => ({
  compteLocataireTx: jest.fn().mockResolvedValue('acc-1'),
  inscrireEcheanceFactureeTx: jest.fn(),
  libellePeriodeEcheance: jest.fn()
}));
jest.mock('../../src/services/rental-payment-service', () => ({
  inscrireAllocationTx: jest.fn(),
  inscrireReliquatTx: jest.fn(),
  libelleMoyen: jest.fn().mockReturnValue('Espèces')
}));
jest.mock('../../src/lib/treasury/accounts', () => ({ assertTreasuryAccountUsableTx: jest.fn() }));
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({ syncDirectRentPaymentEntryTx: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));

import { approvePaymentDeclaration } from '../../src/services/rental-payment-declaration-service';
import { ConflictError } from '../../src/middleware/error-middleware';

const declaration = {
  id: 'decl-1',
  tenant_id: 'tenant-A',
  lease_id: 'lease-1',
  declared_by: 'client-1',
  payment_method: 'CASH',
  amount: 100000,
  mobile_operator: null,
  reference: null,
  payment_date: new Date('2026-10-01'),
  installment_id: null,
  lease: {},
  installment: null,
  declarer: {}
};

beforeEach(() => {
  jest.clearAllMocks();
  declFindFirst.mockResolvedValue(declaration);
  paymentCreate.mockResolvedValue({ id: 'pay-1' });
  declUpdate.mockResolvedValue({ id: 'decl-1', status: 'APPROVED' });
});

describe('approvePaymentDeclaration : passage atomique', () => {
  it('deux approbations concurrentes : un seul paiement, l’autre lève ConflictError', async () => {
    declUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const [a, b] = await Promise.allSettled([
      approvePaymentDeclaration('tenant-A', 'decl-1', 'user-1'),
      approvePaymentDeclaration('tenant-A', 'decl-1', 'user-2')
    ]);

    expect(a.status).toBe('fulfilled');
    expect(b.status).toBe('rejected');
    expect((b as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    expect(paymentCreate).toHaveBeenCalledTimes(1);
  });

  it('le passage est conditionné à PENDING et scopé par agence', async () => {
    declUpdateMany.mockResolvedValue({ count: 1 });
    await approvePaymentDeclaration('tenant-A', 'decl-1', 'user-1', 'ok');
    expect(declUpdateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'decl-1', tenant_id: 'tenant-A', status: 'PENDING' },
      data: { status: 'APPROVED', reviewed_by: 'user-1', review_notes: 'ok' }
    });
  });

  it('la clé d’idempotence est stable (sans horodatage)', async () => {
    declUpdateMany.mockResolvedValue({ count: 1 });
    await approvePaymentDeclaration('tenant-A', 'decl-1', 'user-1');
    await approvePaymentDeclaration('tenant-A', 'decl-1', 'user-1');
    const keys = paymentCreate.mock.calls.map(c => c[0].data.idempotency_key);
    expect(keys).toEqual(['declaration-decl-1', 'declaration-decl-1']);
  });
});
