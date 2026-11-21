/**
 * Revue locative (lot 6) : le remboursement d'un dépôt de garantie est une
 * SORTIE d'argent. Un compte BANQUE ou MOBILE_MONEY de l'agence doit passer ;
 * un compte d'une autre agence ou d'un type interdit reste refusé.
 */

type Row = Record<string, any>;

const store = { deposit: null as Row | null, movements: [] as Row[], seq: 0, accounts: [] as Row[] };

const mockTx: Row = {
  $queryRaw: jest.fn(async () => undefined),
  rentalSecurityDeposit: {
    findFirst: jest.fn(async () => ({ ...store.deposit })),
    update: jest.fn(async () => ({ ...store.deposit }))
  },
  rentalDepositMovement: {
    findMany: jest.fn(async () => []),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: `mv-${++store.seq}`, ...data };
      store.movements.push(created);
      return created;
    })
  },
  treasuryAccount: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const row = store.accounts.find(a => a.id === where.id && a.tenantId === where.tenantId);
      return row ? { ...row } : null;
    })
  }
};

const mockPrisma: Row = {
  rentalSecurityDeposit: { findFirst: jest.fn(async () => ({ ...store.deposit })) },
  rentalPayment: { findFirst: jest.fn(async () => ({ id: 'pay-1' })) },
  rentalInstallment: { findFirst: jest.fn(async () => null) },
  $transaction: jest.fn(async (callback: (tx: Row) => Promise<any>) => callback(mockTx))
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({
  syncDirectDepositMovementEntryTx: jest.fn(async () => 'none'),
  syncDirectRentPaymentEntryTx: jest.fn(async () => 'none')
}));
jest.mock('../../src/services/rental-installment-service', () => ({
  annulerPieceTx: jest.fn(async () => null),
  compteLocataireTx: jest.fn(async () => 'acc-locataire'),
  compteLocataireDuBailTx: jest.fn(async () => ({ accountId: 'acc-locataire' }))
}));

import { RentalDepositMovementType as T } from '@prisma/client';
import { createDepositMovement } from '../../src/services/rental-deposit-service';

const TENANT = 'tenant-A';

const account = (id: string, kind: string, tenantId = TENANT, isActive = true): Row => ({
  id,
  tenantId,
  kind,
  isActive,
  chartOfAccountId: `chart-${id}`,
  number: id,
  label: id
});

beforeEach(() => {
  store.movements = [];
  store.seq = 0;
  store.accounts = [
    account('t-cash', 'CASH'),
    account('t-bank', 'BANK'),
    account('t-momo', 'MOBILE_MONEY'),
    account('t-checks', 'CHECKS_TO_CASH'),
    account('t-autre-agence', 'BANK', 'tenant-B')
  ];
  store.deposit = {
    id: 'dep-1',
    tenant_id: TENANT,
    lease_id: 'lease-1',
    currency: 'FCFA',
    target_amount: 500000,
    collected_amount: 500000,
    held_amount: 0,
    refunded_amount: 0,
    forfeited_amount: 0
  };
});

const refund = (accountId: string | null, method?: any) =>
  createDepositMovement(
    TENANT,
    'dep-1',
    T.REFUND,
    100000,
    undefined,
    undefined,
    undefined,
    undefined,
    accountId,
    method
  );

describe('remboursement du dépôt : compte de trésorerie de sortie', () => {
  it('passe par un compte BANQUE de l’agence', async () => {
    await refund('t-bank');
    expect(store.movements[0].treasury_account_id).toBe('t-bank');
  });

  it('passe par un compte MOBILE_MONEY de l’agence', async () => {
    await refund('t-momo');
    expect(store.movements[0].treasury_account_id).toBe('t-momo');
  });

  it('passe par la caisse de l’agence', async () => {
    await refund('t-cash');
    expect(store.movements[0].treasury_account_id).toBe('t-cash');
  });

  it('refuse un compte d’une autre agence (400, rien n’est écrit)', async () => {
    await expect(refund('t-autre-agence')).rejects.toMatchObject({ status: 400 });
    expect(store.movements).toHaveLength(0);
  });

  it('refuse un compte de type interdit en sortie (chèques à encaisser)', async () => {
    await expect(refund('t-checks')).rejects.toMatchObject({ status: 400 });
    expect(store.movements).toHaveLength(0);
  });

  it('respecte le moyen déclaré : un virement ne sort pas de la caisse', async () => {
    await expect(refund('t-cash', 'BANK_TRANSFER')).rejects.toMatchObject({ status: 400 });
    await refund('t-bank', 'BANK_TRANSFER');
    expect(store.movements).toHaveLength(1);
  });
});
