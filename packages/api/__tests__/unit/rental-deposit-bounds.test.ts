/**
 * Dépôt de garantie : toute sortie ou retenue est bornée par le disponible.
 *
 * Une retenue (HOLD) supérieure à ce que le dépôt détient laissait `held_amount`
 * au-dessus du solde. Remboursement et confiscation étaient déjà bornés ;
 * l'ajustement n'est pas encadré par la spécification 006 : son comportement
 * reste inchangé.
 */

type Row = Record<string, any>;

const store = { deposit: null as Row | null, movements: [] as Row[], seq: 0 };

function applyUpdate(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && ('increment' in value || 'decrement' in value)) {
      row[key] = Number(row[key]) + Number(value.increment ?? 0) - Number(value.decrement ?? 0);
    } else {
      row[key] = value;
    }
  }
}

const mockTx: Row = {
  $queryRaw: jest.fn(async () => undefined),
  rentalSecurityDeposit: {
    findFirst: jest.fn(async () => ({ ...store.deposit })),
    update: jest.fn(async ({ data }: Row) => {
      applyUpdate(store.deposit!, data);
      return { ...store.deposit };
    })
  },
  rentalDepositMovement: {
    findMany: jest.fn(async () => []),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: `mv-${++store.seq}`, ...data };
      store.movements.push(created);
      return created;
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
import { BadRequestError } from '../../src/middleware/error-middleware';

const TENANT = 'tenant-A';

beforeEach(() => {
  store.movements = [];
  store.seq = 0;
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

describe('createDepositMovement — bornes du disponible', () => {
  it('une retenue supérieure au dépôt est refusée (400), rien n’est écrit', async () => {
    await expect(createDepositMovement(TENANT, 'dep-1', T.HOLD, 600000)).rejects.toBeInstanceOf(BadRequestError);
    expect(store.movements).toHaveLength(0);
    expect(Number(store.deposit!.held_amount)).toBe(0);
  });

  it('les retenues cumulées ne dépassent pas ce que le dépôt détient', async () => {
    await createDepositMovement(TENANT, 'dep-1', T.HOLD, 300000);
    await expect(createDepositMovement(TENANT, 'dep-1', T.HOLD, 300000)).rejects.toBeInstanceOf(BadRequestError);
    expect(Number(store.deposit!.held_amount)).toBe(300000);
  });

  it('une retenue égale au disponible passe', async () => {
    await createDepositMovement(TENANT, 'dep-1', T.HOLD, 500000);
    expect(Number(store.deposit!.held_amount)).toBe(500000);
  });

  it('une retenue après un remboursement est bornée par le solde restant', async () => {
    await createDepositMovement(TENANT, 'dep-1', T.REFUND, 400000);
    await expect(createDepositMovement(TENANT, 'dep-1', T.HOLD, 200000)).rejects.toBeInstanceOf(BadRequestError);
    await createDepositMovement(TENANT, 'dep-1', T.HOLD, 100000);
    expect(Number(store.deposit!.held_amount)).toBe(100000);
  });

  it('un remboursement et une confiscation supérieurs au disponible restent refusés', async () => {
    await expect(createDepositMovement(TENANT, 'dep-1', T.REFUND, 500001)).rejects.toBeInstanceOf(BadRequestError);
    await expect(createDepositMovement(TENANT, 'dep-1', T.FORFEIT, 500001)).rejects.toBeInstanceOf(BadRequestError);
    expect(store.movements).toHaveLength(0);
  });

  it('un ajustement n’est pas borné (comportement inchangé, spécification muette)', async () => {
    await createDepositMovement(TENANT, 'dep-1', T.ADJUSTMENT, 1000);
    expect(Number(store.deposit!.collected_amount)).toBe(501000);
  });
});
