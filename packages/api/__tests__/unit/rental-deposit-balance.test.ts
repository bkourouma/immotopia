/**
 * BUG-2026-09-30-048 : une restitution ne doit être retranchée qu'une fois.
 * Encaissé 900 000, restitué 100 000 -> solde détenu 800 000.
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

const mockPrisma: Row = {
  // Verrou de ligne du dépôt (FOR UPDATE) : sans effet en mémoire.
  $queryRaw: jest.fn(async () => []),
  rentalSecurityDeposit: {
    findFirst: jest.fn(async ({ where }: Row) =>
      store.deposit && store.deposit.id === where.id && store.deposit.tenant_id === where.tenant_id
        ? { ...store.deposit }
        : null
    ),
    update: jest.fn(async ({ data }: Row) => {
      applyUpdate(store.deposit!, data);
      return { ...store.deposit };
    })
  },
  rentalPayment: { findFirst: jest.fn(async () => ({ id: 'pay-1' })) },
  rentalInstallment: { findFirst: jest.fn(async () => null) },
  rentalDepositMovement: {
    findMany: jest.fn(async ({ where }: Row) => store.movements.filter(m => m.type === where.type)),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: `mv-${++store.seq}`, ...data };
      store.movements.push(created);
      return created;
    })
  },
  $transaction: jest.fn(async (callback: (tx: Row) => Promise<any>) => callback(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
// Les écritures comptables du dépôt sont testées à part (finance.rental-deposit-ledger).
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({
  syncDirectDepositMovementEntryTx: jest.fn(async () => 'none'),
  syncDirectRentPaymentEntryTx: jest.fn(async () => 'none')
}));
jest.mock('../../src/services/rental-installment-service', () => ({
  annulerPieceTx: jest.fn(async () => null),
  compteLocataireTx: jest.fn(async () => 'acc'),
  compteLocataireDuBailTx: jest.fn(async () => ({ accountId: 'acc' }))
}));

import { RentalDepositMovementType as T } from '@prisma/client';
import { computeDepositBalance, createDepositMovement } from '../../src/services/rental-deposit-service';
import { logAuditEvent, recordAuditEvent } from '../../src/services/audit-service';

const TENANT = 'tenant-A';

beforeEach(() => {
  store.movements = [];
  store.seq = 0;
  store.deposit = {
    id: 'dep-1',
    tenant_id: TENANT,
    lease_id: 'lease-1',
    currency: 'FCFA',
    target_amount: 900000,
    collected_amount: 0,
    held_amount: 0,
    refunded_amount: 0,
    forfeited_amount: 0
  };
});

describe("mouvement du dépôt — trace d'audit transactionnelle", () => {
  it('écrit RENTAL_DEPOSIT_MOVEMENT_CREATED dans la transaction du mouvement', async () => {
    const movement = await createDepositMovement(
      TENANT,
      'dep-1',
      T.COLLECT,
      900000,
      'pay-1',
      undefined,
      undefined,
      'user-1'
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        actionKey: 'RENTAL_DEPOSIT_MOVEMENT_CREATED',
        entityId: movement.id,
        actorUserId: 'user-1',
        tenantId: TENANT
      })
    );
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe('solde du dépôt de garantie — une seule source de vérité', () => {
  it('collecte 900 000 puis restitution 100 000 : encaissé 900 000, restitué 100 000, solde 800 000', async () => {
    await createDepositMovement(TENANT, 'dep-1', T.COLLECT, 900000, 'pay-1');
    await createDepositMovement(TENANT, 'dep-1', T.REFUND, 100000);

    expect(Number(store.deposit!.collected_amount)).toBe(900000);
    expect(Number(store.deposit!.refunded_amount)).toBe(100000);
    expect(computeDepositBalance(store.deposit as any)).toBe(800000);
  });

  it('enchaîne collecte, restitution partielle, retenue puis restitution totale du reste', async () => {
    await createDepositMovement(TENANT, 'dep-1', T.COLLECT, 900000, 'pay-1');
    await createDepositMovement(TENANT, 'dep-1', T.REFUND, 100000);
    await createDepositMovement(TENANT, 'dep-1', T.FORFEIT, 250000);
    expect(computeDepositBalance(store.deposit as any)).toBe(550000);
    expect(Number(store.deposit!.forfeited_amount)).toBe(250000);

    await createDepositMovement(TENANT, 'dep-1', T.REFUND, 550000);
    expect(computeDepositBalance(store.deposit as any)).toBe(0);
    expect(Number(store.deposit!.collected_amount)).toBe(900000);
    expect(Number(store.deposit!.refunded_amount)).toBe(650000);
  });

  it('refuse une restitution supérieure au solde réellement détenu', async () => {
    await createDepositMovement(TENANT, 'dep-1', T.COLLECT, 900000, 'pay-1');
    await createDepositMovement(TENANT, 'dep-1', T.REFUND, 800000);

    await expect(createDepositMovement(TENANT, 'dep-1', T.REFUND, 200000)).rejects.toThrow();
    expect(computeDepositBalance(store.deposit as any)).toBe(100000);
  });

  it("l'isolation tient : un dépôt d'une autre agence est introuvable", async () => {
    await expect(createDepositMovement('tenant-B', 'dep-1', T.REFUND, 1)).rejects.toThrow();
  });
});
