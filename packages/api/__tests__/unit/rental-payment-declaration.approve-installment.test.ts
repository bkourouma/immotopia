/**
 * Revue d'effectivité (lot 4) : `approvePaymentDeclaration` affecte le règlement
 * à l'échéance visée par la déclaration.
 *
 * - Une échéance ANNULÉE ne reçoit aucune affectation (comme `allocatePaymentTx`) :
 *   le montant approuvé reste tout entier une avance reçue.
 * - L'échéance est verrouillée (`FOR UPDATE`) avant la lecture de son reste dû :
 *   deux approbations simultanées sur la même échéance la surpayaient.
 * - Les allocations existantes sont lues pour l'agence et les montants sont
 *   arrondis au centime (0,1 + 0,2 soldait l'échéance « partiellement »).
 */
const declFindFirst = jest.fn();
const declUpdateMany = jest.fn();
const declUpdate = jest.fn();
const paymentCreate = jest.fn();
const queryRaw = jest.fn();
const installmentFindFirst = jest.fn();
const installmentUpdate = jest.fn();
const allocFindMany = jest.fn();
const allocCreate = jest.fn();
const inscrireAllocationTx = jest.fn();
const inscrireReliquatTx = jest.fn();

const tx: any = {
  $queryRaw: (...a: any[]) => queryRaw(...a),
  rentalPaymentDeclaration: {
    updateMany: (...a: any[]) => declUpdateMany(...a),
    update: (...a: any[]) => declUpdate(...a)
  },
  rentalPayment: { create: (...a: any[]) => paymentCreate(...a) },
  rentalInstallment: {
    findFirst: (...a: any[]) => installmentFindFirst(...a),
    update: (...a: any[]) => installmentUpdate(...a)
  },
  rentalPaymentAllocation: {
    findMany: (...a: any[]) => allocFindMany(...a),
    create: (...a: any[]) => allocCreate(...a)
  }
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
  inscrireAllocationTx: (...a: any[]) => inscrireAllocationTx(...a),
  inscrireReliquatTx: (...a: any[]) => inscrireReliquatTx(...a),
  libelleMoyen: jest.fn().mockReturnValue('Espèces')
}));
jest.mock('../../src/lib/treasury/accounts', () => ({ assertTreasuryAccountUsableTx: jest.fn() }));
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({ syncDirectRentPaymentEntryTx: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));

import { approvePaymentDeclaration } from '../../src/services/rental-payment-declaration-service';

const INSTALLMENT_ID = '11111111-1111-4111-8111-111111111111';

const declaration = (amount: number) => ({
  id: 'decl-1',
  tenant_id: 'tenant-A',
  lease_id: 'lease-1',
  declared_by: 'client-1',
  payment_method: 'CASH',
  amount,
  mobile_operator: null,
  reference: null,
  payment_date: new Date('2026-10-01'),
  installment_id: INSTALLMENT_ID,
  lease: {},
  installment: null,
  declarer: {}
});

const installment = (rent: number, service: number) => ({
  id: INSTALLMENT_ID,
  lease_id: 'lease-1',
  status: 'DUE',
  period_year: 2026,
  period_month: 10,
  amount_rent: rent,
  amount_service: service,
  amount_other_fees: 0,
  penalty_amount: 0
});

beforeEach(() => {
  jest.clearAllMocks();
  declUpdateMany.mockResolvedValue({ count: 1 });
  declUpdate.mockResolvedValue({ id: 'decl-1', status: 'APPROVED' });
  paymentCreate.mockResolvedValue({ id: 'pay-1' });
  queryRaw.mockResolvedValue([]);
  allocFindMany.mockResolvedValue([]);
  allocCreate.mockResolvedValue({ id: 'al-1' });
  installmentUpdate.mockImplementation(async ({ data }: any) => ({ id: INSTALLMENT_ID, ...data }));
});

describe('approvePaymentDeclaration : échéance visée', () => {
  it('verrouille l’échéance avant de lire son reste dû et ne sélectionne jamais une échéance annulée', async () => {
    declFindFirst.mockResolvedValue(declaration(100000));
    installmentFindFirst.mockResolvedValue(installment(100000, 0));

    await approvePaymentDeclaration('tenant-A', 'decl-1', 'user-1');

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(installmentFindFirst.mock.invocationCallOrder[0]);
    expect(installmentFindFirst.mock.calls[0][0].where).toMatchObject({
      id: INSTALLMENT_ID,
      tenant_id: 'tenant-A',
      status: { not: 'CANCELED' }
    });
    expect(allocFindMany.mock.calls[0][0].where).toMatchObject({
      installment_id: INSTALLMENT_ID,
      tenant_id: 'tenant-A'
    });
  });

  it('échéance annulée (non trouvée par le filtre) : aucune affectation, tout le montant en avance', async () => {
    declFindFirst.mockResolvedValue(declaration(100000));
    installmentFindFirst.mockResolvedValue(null);

    const result = await approvePaymentDeclaration('tenant-A', 'decl-1', 'user-1');

    expect(allocCreate).not.toHaveBeenCalled();
    expect(installmentUpdate).not.toHaveBeenCalled();
    expect(inscrireAllocationTx).not.toHaveBeenCalled();
    expect(inscrireReliquatTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ dejaAffecte: 0, payment: expect.objectContaining({ id: 'pay-1' }) })
    );
    expect(result.installment).toBeNull();
  });

  it('montants fractionnaires : 0,30 déclaré solde une échéance de 0,1 + 0,2 (PAYÉE)', async () => {
    declFindFirst.mockResolvedValue(declaration(0.3));
    installmentFindFirst.mockResolvedValue(installment(0.1, 0.2));

    const result = await approvePaymentDeclaration('tenant-A', 'decl-1', 'user-1');

    expect(Number(allocCreate.mock.calls[0][0].data.amount)).toBe(0.3);
    expect(installmentUpdate.mock.calls[0][0].data.status).toBe('PAID');
    expect(result.installment?.status).toBe('PAID');
  });
});
