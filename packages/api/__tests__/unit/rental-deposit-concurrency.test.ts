/**
 * Dépôt de garantie : les contrôles de solde se font SOUS verrou de ligne.
 *
 * Deux remboursements concurrents de 300 000 sur 500 000 lisaient le même
 * solde hors transaction et passaient tous deux. Le verrou (`FOR UPDATE`, simulé
 * ici par un mutex tenu jusqu'à la fin de la transaction) les sérialise : le
 * second relit 200 000 et est refusé. Mêmes garanties pour « un seul COLLECT »,
 * et une libération ne peut pas dépasser la retenue.
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

const tick = () => new Promise(resolve => setImmediate(resolve));

// Mutex simulant SELECT ... FOR UPDATE : tenu jusqu'à la fin de la transaction.
let lockChain: Promise<void> = Promise.resolve();
const locksAcquired: number[] = [];

function makeTx(release: { fn: (() => void) | null }): Row {
  return {
    $queryRaw: jest.fn(async () => {
      let done!: () => void;
      const mine = new Promise<void>(resolve => (done = resolve));
      const previous = lockChain;
      lockChain = previous.then(() => mine);
      await previous;
      release.fn = done;
      locksAcquired.push(1);
    }),
    rentalPayment: {
      findFirst: jest.fn(async () => ({ id: 'pay-1', lease_id: 'lease-1', renter_client_id: 'client-1' }))
    },
    rentalSecurityDeposit: {
      findFirst: jest.fn(async ({ where }: Row) => {
        await tick(); // fenêtre d'entrelacement
        return store.deposit && store.deposit.id === where.id && store.deposit.tenant_id === where.tenant_id
          ? { ...store.deposit }
          : null;
      }),
      update: jest.fn(async ({ data }: Row) => {
        await tick();
        applyUpdate(store.deposit!, data);
        return { ...store.deposit };
      })
    },
    rentalDepositMovement: {
      findMany: jest.fn(async ({ where }: Row) => store.movements.filter(m => m.type === where.type)),
      create: jest.fn(async ({ data }: Row) => {
        const created = { id: `mv-${++store.seq}`, ...data };
        store.movements.push(created);
        return created;
      })
    }
  };
}

const mockPrisma: Row = {
  rentalSecurityDeposit: {
    findFirst: jest.fn(async ({ where }: Row) => {
      await tick();
      return store.deposit && store.deposit.id === where.id && store.deposit.tenant_id === where.tenant_id
        ? { ...store.deposit }
        : null;
    })
  },
  rentalPayment: { findFirst: jest.fn(async () => ({ id: 'pay-1' })) },
  rentalInstallment: { findFirst: jest.fn(async () => null) },
  $transaction: jest.fn(async (callback: (tx: Row) => Promise<any>) => {
    const release = { fn: null as (() => void) | null };
    const tx = makeTx(release);
    try {
      return await callback(tx);
    } finally {
      release.fn?.();
    }
  })
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({
  syncDirectDepositMovementEntryTx: jest.fn(async () => 'none'),
  syncDirectRentPaymentEntryTx: jest.fn(async () => 'none')
}));
const annulerPieceTx = jest.fn(async () => null);
jest.mock('../../src/services/rental-installment-service', () => ({
  annulerPieceTx: (...args: any[]) => (annulerPieceTx as any)(...args),
  compteLocataireTx: jest.fn(async () => 'acc-locataire'),
  compteLocataireDuBailTx: jest.fn(async () => ({ accountId: 'acc-locataire' }))
}));

import { RentalDepositMovementType as T } from '@prisma/client';
import { computeDepositBalance, createDepositMovement } from '../../src/services/rental-deposit-service';
import {
  syncDirectDepositMovementEntryTx,
  syncDirectRentPaymentEntryTx
} from '../../src/lib/finance/rental-direct-ledger';

const TENANT = 'tenant-A';

beforeEach(() => {
  store.movements = [];
  store.seq = 0;
  lockChain = Promise.resolve();
  locksAcquired.length = 0;
  annulerPieceTx.mockClear();
  (syncDirectDepositMovementEntryTx as jest.Mock).mockClear();
  (syncDirectRentPaymentEntryTx as jest.Mock).mockClear();
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

describe('createDepositMovement — verrou et relecture du solde', () => {
  it('deux REFUND de 300 000 sur 500 000 en parallèle : un seul passe', async () => {
    const results = await Promise.allSettled([
      createDepositMovement(TENANT, 'dep-1', T.REFUND, 300000),
      createDepositMovement(TENANT, 'dep-1', T.REFUND, 300000)
    ]);

    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(Number(store.deposit!.refunded_amount)).toBe(300000);
    expect(computeDepositBalance(store.deposit as any)).toBe(200000);
    expect(locksAcquired.length).toBeGreaterThanOrEqual(2);
  });

  it('deux COLLECT concurrents : un seul encaissement', async () => {
    store.deposit!.collected_amount = 0;
    const results = await Promise.allSettled([
      createDepositMovement(TENANT, 'dep-1', T.COLLECT, 500000, 'pay-1'),
      createDepositMovement(TENANT, 'dep-1', T.COLLECT, 500000, 'pay-1')
    ]);

    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(store.movements.filter(m => m.type === 'COLLECT')).toHaveLength(1);
    expect(Number(store.deposit!.collected_amount)).toBe(500000);
  });

  it('un COLLECT retire le règlement des avances et le reclasse en dépôt', async () => {
    store.deposit!.collected_amount = 0;
    await createDepositMovement(TENANT, 'dep-1', T.COLLECT, 500000, 'pay-1');

    expect(annulerPieceTx).toHaveBeenCalledTimes(1);
    expect((annulerPieceTx.mock.calls[0] as any)[1]).toMatchObject({ sourceType: 'RENTAL_PAYMENT', sourceId: 'pay-1' });
    expect(syncDirectRentPaymentEntryTx).toHaveBeenCalledWith(expect.anything(), TENANT, 'pay-1');
  });

  it('un REFUND ou un FORFEIT écrit sa pièce comptable dans la transaction', async () => {
    await createDepositMovement(TENANT, 'dep-1', T.FORFEIT, 100000);
    await createDepositMovement(TENANT, 'dep-1', T.REFUND, 400000);
    expect(syncDirectDepositMovementEntryTx).toHaveBeenCalledTimes(2);
    expect(computeDepositBalance(store.deposit as any)).toBe(0);
  });

  it('une libération ne peut pas dépasser la retenue (held_amount jamais négatif)', async () => {
    store.deposit!.held_amount = 50000;
    await expect(createDepositMovement(TENANT, 'dep-1', T.RELEASE, 80000)).rejects.toThrow();
    expect(Number(store.deposit!.held_amount)).toBe(50000);

    await createDepositMovement(TENANT, 'dep-1', T.RELEASE, 50000);
    expect(Number(store.deposit!.held_amount)).toBe(0);
  });
});
