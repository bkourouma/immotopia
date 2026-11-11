/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contrat 049 §1.3 (extension « autres modes ») : à la validation d'une déclaration en
 * espèces, chèque ou virement, le paiement garde son mode et le compte de trésorerie suit
 * le comportement historique (aucun compte de numéro de réception, jamais d'opérateur).
 */
const declFindFirst = jest.fn();
const declUpdateMany = jest.fn();
const declUpdate = jest.fn();
const paymentCreate = jest.fn();
const treasuryFindFirst = jest.fn();
const assertTreasury = jest.fn();

const tx: any = {
  rentalPaymentDeclaration: {
    updateMany: (...a: any[]) => declUpdateMany(...a),
    update: (...a: any[]) => declUpdate(...a)
  },
  rentalPayment: { create: (...a: any[]) => paymentCreate(...a) },
  treasuryAccount: { findFirst: (...a: any[]) => treasuryFindFirst(...a) }
};

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalPaymentDeclaration: {
      findFirst: (...a: any[]) => declFindFirst(...a),
      updateMany: (...a: any[]) => declUpdateMany(...a),
      findFirstOrThrow: jest.fn()
    },
    rentalLease: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: (fn: any) => fn(tx)
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
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
jest.mock('../../src/lib/treasury/accounts', () => ({
  assertTreasuryAccountUsableTx: (...a: any[]) => assertTreasury(...a)
}));
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({ syncDirectRentPaymentEntryTx: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));
jest.mock('../../src/lib/rental/declared-payment/declaration-dto', () => ({ loadDeclarationDtos: jest.fn() }));

import { approvePaymentDeclaration } from '../../src/services/rental-payment-declaration-service';

const cashDeclaration = {
  id: 'decl-cash',
  tenant_id: 'tenant-A',
  lease_id: 'lease-1',
  declared_by: 'client-1',
  payment_method: 'CASH',
  amount: 90000,
  mobile_operator: null,
  reference: null,
  payment_date: new Date('2026-10-01'),
  installment_id: null,
  status: 'PENDING',
  lease: {},
  installment: null,
  declarer: {},
  receivingNumber: null
};

beforeEach(() => {
  jest.clearAllMocks();
  declFindFirst.mockResolvedValue(cashDeclaration);
  declUpdateMany.mockResolvedValue({ count: 1 });
  paymentCreate.mockResolvedValue({ id: 'pay-1' });
  declUpdate.mockResolvedValue({ id: 'decl-cash', status: 'APPROVED' });
});

describe('approbation d une déclaration hors mobile money', () => {
  it('espèces : paiement CASH, sans opérateur, sans compte de numéro de réception', async () => {
    const result = await approvePaymentDeclaration('tenant-A', 'decl-cash', 'user-1');
    expect(result.corrected).toBe(false);
    expect(treasuryFindFirst).not.toHaveBeenCalled();
    expect(assertTreasury).toHaveBeenCalledWith(tx, 'tenant-A', null, 'CASH');
    expect(paymentCreate.mock.calls[0][0].data).toMatchObject({
      method: 'CASH',
      mm_operator: null,
      treasury_account_id: null,
      psp_reference: null,
      idempotency_key: 'declaration-decl-cash'
    });
    expect(Number(paymentCreate.mock.calls[0][0].data.amount)).toBe(90000);
  });

  it('virement : le compte du corps (ancien comportement) prime et est contrôlé pour le mode', async () => {
    declFindFirst.mockResolvedValue({ ...cashDeclaration, payment_method: 'BANK_TRANSFER', reference: 'VIR0001' });
    await approvePaymentDeclaration('tenant-A', 'decl-cash', 'user-1', undefined, 'ta-bank');
    expect(assertTreasury).toHaveBeenCalledWith(tx, 'tenant-A', 'ta-bank', 'BANK_TRANSFER');
    expect(paymentCreate.mock.calls[0][0].data).toMatchObject({
      method: 'BANK_TRANSFER',
      treasury_account_id: 'ta-bank',
      psp_reference: 'VIR0001'
    });
  });
});
