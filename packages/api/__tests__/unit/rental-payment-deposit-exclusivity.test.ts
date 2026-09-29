/**
 * BUG-2026-09-28-025 — un paiement ne sert qu'à UNE destination à la fois.
 *
 * Un paiement de 150 000 rattaché à la collecte du dépôt de garantie ne peut
 * plus être affecté à un loyer (disponible = montant - affecté - déposé), et
 * inversement. L'annulation du paiement défait la collecte de dépôt rattachée.
 * Prisma est remplacé par un magasin en mémoire, aucune base requise.
 */

type Row = Record<string, any>;

const store = {
  payments: [] as Row[],
  allocations: [] as Row[],
  installments: [] as Row[],
  deposits: [] as Row[],
  movements: [] as Row[],
  seq: 0
};

const nextId = (p: string) => `${p}-${++store.seq}`;

const mockPrisma: Row = {
  rentalPayment: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const p = store.payments.find(x => x.id === where.id && x.tenant_id === where.tenant_id);
      if (!p) return null;
      return { ...p, allocations: store.allocations.filter(a => a.payment_id === p.id) };
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const p = store.payments.find(x => x.id === where.id)!;
      Object.assign(p, data);
      return { ...p, allocations: [] };
    })
  },
  rentalPaymentAllocation: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.allocations
        .filter(a => (where.payment_id ? a.payment_id === where.payment_id : a.installment_id === where.installment_id))
        .map(a => ({ ...a, installment: store.installments.find(i => i.id === a.installment_id) }))
    ),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('alloc'), ...data };
      store.allocations.push(created);
      return created;
    }),
    deleteMany: jest.fn(async ({ where }: Row) => {
      store.allocations = store.allocations.filter(a => a.payment_id !== where.payment_id);
    })
  },
  rentalInstallment: {
    findMany: jest.fn(async ({ where }: Row) => store.installments.filter(i => where.id.in.includes(i.id))),
    findUnique: jest.fn(async ({ where }: Row) => store.installments.find(i => i.id === where.id) ?? null),
    update: jest.fn(async () => ({}))
  },
  rentalSecurityDeposit: {
    findFirst: jest.fn(async ({ where }: Row) => store.deposits.find(d => d.id === where.id) ?? null),
    update: jest.fn(async ({ where, data }: Row) => {
      const d = store.deposits.find(x => x.id === where.id)!;
      for (const [k, v] of Object.entries<any>(data)) {
        if (v && typeof v === 'object' && 'increment' in v) d[k] += Number(v.increment);
        else if (v && typeof v === 'object' && 'decrement' in v) d[k] -= Number(v.decrement);
      }
      return d;
    })
  },
  rentalDepositMovement: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.movements.filter(
        m =>
          (!where.deposit_id || m.deposit_id === where.deposit_id) &&
          (!where.payment_id || m.payment_id === where.payment_id) &&
          (!where.type || m.type === where.type)
      )
    ),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('mvt'), ...data };
      store.movements.push(created);
      return created;
    }),
    delete: jest.fn(async ({ where }: Row) => {
      store.movements = store.movements.filter(m => m.id !== where.id);
    })
  },
  thirdPartyMovement: { count: jest.fn(async () => 0), findUnique: jest.fn(async () => null) },
  $transaction: jest.fn(async (cb: (tx: Row) => Promise<any>) => cb(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/rental-installment-service', () => ({
  annulerPieceTx: jest.fn(),
  compteLocataireDuBailTx: jest.fn(async () => null),
  compteLocataireTx: jest.fn(async () => null),
  libellePeriodeEcheance: jest.fn(() => '09/2026')
}));
jest.mock('../../src/lib/treasury/accounts', () => ({ assertTreasuryAccountUsableTx: jest.fn() }));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: jest.fn(async () => ({ enabled: false }))
}));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));

import { allocatePaymentTx, updatePaymentStatusTx } from '../../src/services/rental-payment-service';
import { createDepositMovement } from '../../src/services/rental-deposit-service';

const T = 'tenant-a';

function seed() {
  store.payments = [
    {
      id: 'pay-1',
      tenant_id: T,
      lease_id: 'lease-1',
      amount: 150_000,
      currency: 'FCFA',
      status: 'SUCCESS',
      method: 'MOBILE_MONEY'
    }
  ];
  store.installments = [
    {
      id: 'inst-1',
      tenant_id: T,
      lease_id: 'lease-1',
      amount_rent: 160_000,
      amount_service: 0,
      amount_other_fees: 0,
      penalty_amount: 0,
      status: 'DUE',
      period_year: 2026,
      period_month: 9,
      due_date: new Date('2026-09-05')
    }
  ];
  store.allocations = [];
  store.deposits = [
    {
      id: 'dep-1',
      tenant_id: T,
      lease_id: 'lease-1',
      currency: 'FCFA',
      target_amount: 150_000,
      collected_amount: 0,
      held_amount: 0,
      refunded_amount: 0,
      forfeited_amount: 0
    }
  ];
  store.movements = [];
}

beforeEach(() => {
  seed();
  store.seq = 0;
  jest.clearAllMocks();
});

describe('un paiement lié à la collecte du dépôt ne sert plus au loyer', () => {
  it('collecte puis affectation : le paiement de 150 000 est déjà entièrement utilisé', async () => {
    await createDepositMovement(T, 'dep-1', 'COLLECT' as any, 150_000, 'pay-1');
    expect(store.deposits[0].collected_amount).toBe(150_000);

    await expect(
      allocatePaymentTx(mockPrisma as any, T, 'pay-1', { installmentIds: ['inst-1'] }, 'actor')
    ).rejects.toThrow('déjà entièrement');
    expect(store.allocations).toHaveLength(0);
  });

  it('affectation puis collecte : le paiement affecté ne peut plus servir de dépôt', async () => {
    await allocatePaymentTx(mockPrisma as any, T, 'pay-1', { installmentIds: ['inst-1'] }, 'actor');
    expect(store.allocations).toHaveLength(1);

    await expect(createDepositMovement(T, 'dep-1', 'COLLECT' as any, 150_000, 'pay-1')).rejects.toThrow(/disponible/);
    expect(store.movements).toHaveLength(0);
    expect(store.deposits[0].collected_amount).toBe(0);
  });

  it('un paiement affecté en partie ne couvre pas la collecte complète', async () => {
    store.payments[0].amount = 200_000;
    store.allocations = [{ id: 'a1', payment_id: 'pay-1', installment_id: 'inst-1', amount: 100_000, tenant_id: T }];

    await expect(createDepositMovement(T, 'dep-1', 'COLLECT' as any, 150_000, 'pay-1')).rejects.toThrow(/disponible/);
  });

  it('le refus « une seule collecte » est en français', async () => {
    await createDepositMovement(T, 'dep-1', 'COLLECT' as any, 150_000, 'pay-1');
    store.payments.push({ ...store.payments[0], id: 'pay-2' });

    await expect(createDepositMovement(T, 'dep-1', 'COLLECT' as any, 150_000, 'pay-2')).rejects.toThrow(
      "Le dépôt de garantie ne peut être collecté qu'une seule fois"
    );
  });

  it('un paiement annulé ne peut pas servir de collecte', async () => {
    store.payments[0].status = 'CANCELED';
    await expect(createDepositMovement(T, 'dep-1', 'COLLECT' as any, 150_000, 'pay-1')).rejects.toThrow(/encaissé/);
  });
});

describe("l'annulation d'un paiement défait la collecte de dépôt rattachée", () => {
  it('CANCELED : le mouvement COLLECT disparaît et le dépôt revient à 0', async () => {
    await createDepositMovement(T, 'dep-1', 'COLLECT' as any, 150_000, 'pay-1');
    expect(store.deposits[0].collected_amount).toBe(150_000);

    await updatePaymentStatusTx(mockPrisma as any, T, 'pay-1', 'CANCELED' as any, 'actor');

    expect(store.movements.filter(m => m.type === 'COLLECT')).toHaveLength(0);
    expect(store.deposits[0].collected_amount).toBe(0);
  });

  it('après annulation, un autre paiement peut servir de collecte', async () => {
    await createDepositMovement(T, 'dep-1', 'COLLECT' as any, 150_000, 'pay-1');
    await updatePaymentStatusTx(mockPrisma as any, T, 'pay-1', 'CANCELED' as any, 'actor');
    store.payments.push({ ...store.payments[0], id: 'pay-2', status: 'SUCCESS' });

    await createDepositMovement(T, 'dep-1', 'COLLECT' as any, 150_000, 'pay-2');
    expect(store.deposits[0].collected_amount).toBe(150_000);
  });
});
