/**
 * Revue fonctionnelle du dépôt de garantie (lot 3, territoire E).
 *
 * Variantes que la recette du 09/11 ne couvre pas : fractions et arrondi,
 * montants aberrants, retenue qui doit bloquer le remboursement, rattachement
 * du règlement de collecte (bail annulé, devise, locataire).
 * Prisma est remplacé par un magasin en mémoire, aucune base requise.
 */

type Row = Record<string, any>;

const store = { deposit: null as Row | null, payment: null as Row | null, movements: [] as Row[], seq: 0 };

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
  rentalPayment: {
    findFirst: jest.fn(async ({ where }: Row) =>
      store.payment && store.payment.id === where.id && store.payment.tenant_id === where.tenant_id
        ? { ...store.payment }
        : null
    )
  },
  rentalPaymentAllocation: { findMany: jest.fn(async () => []) },
  rentalInstallment: { findFirst: jest.fn(async () => null) },
  rentalDepositMovement: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.movements.filter(m => m.type === where.type && (!where.payment_id || m.payment_id === where.payment_id))
    ),
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
import { depositCurrentBalance } from '../../src/services/rental-deposit-balance';
import { BadRequestError, ConflictError, NotFoundError } from '../../src/middleware/error-middleware';

const TENANT = 'tenant-A';

function seed(over: Row = {}, lease: Row = { status: 'ACTIVE', primary_renter_client_id: 'renter-1' }) {
  store.deposit = {
    id: 'dep-1',
    tenant_id: TENANT,
    lease_id: 'lease-1',
    currency: 'FCFA',
    target_amount: 500000,
    collected_amount: 500000,
    held_amount: 0,
    refunded_amount: 0,
    forfeited_amount: 0,
    lease,
    ...over
  };
}

beforeEach(() => {
  store.movements = [];
  store.seq = 0;
  store.payment = {
    id: 'pay-1',
    tenant_id: TENANT,
    status: 'SUCCESS',
    amount: 500000,
    currency: 'FCFA',
    lease_id: 'lease-1',
    renter_client_id: 'renter-1'
  };
  seed();
});

describe('solde : arrondi au centime', () => {
  it('collecté 100,10 - remboursé 100 = 0,10 exactement (pas 0,0999999…)', () => {
    expect(computeDepositBalance({ collected_amount: 100.1, refunded_amount: 100, forfeited_amount: 0 })).toBe(0.1);
    expect(depositCurrentBalance({ collected_amount: 100.1, refunded_amount: 100, forfeited_amount: 0 })).toBe(0.1);
  });

  it('on peut rembourser le dernier centime restant', async () => {
    seed({ collected_amount: 100.1, refunded_amount: 100, target_amount: 100.1, currency: 'EUR' });
    await createDepositMovement(TENANT, 'dep-1', T.REFUND, 0.1);
    expect(store.movements).toHaveLength(1);
  });
});

describe('montants aberrants', () => {
  it.each([NaN, Infinity, -Infinity, 0.001, 10.005, 1e12, 1e10])('refuse %p sans rien écrire', async amount => {
    await expect(createDepositMovement(TENANT, 'dep-1', T.REFUND, amount)).rejects.toBeInstanceOf(BadRequestError);
    expect(store.movements).toHaveLength(0);
    expect(Number(store.deposit!.refunded_amount)).toBe(0);
  });

  it('accepte deux décimales dans une devise à sous-unité', async () => {
    seed({ currency: 'EUR' });
    await createDepositMovement(TENANT, 'dep-1', T.REFUND, 1000.25);
    expect(Number(store.deposit!.refunded_amount)).toBe(1000.25);
  });

  it('FCFA (devise du bail) : refuse les décimales sans rien écrire (décision H3)', async () => {
    await expect(createDepositMovement(TENANT, 'dep-1', T.REFUND, 1000.25)).rejects.toThrow(
      'Le montant doit être un nombre entier en FCFA.'
    );
    expect(store.movements).toHaveLength(0);
    expect(Number(store.deposit!.refunded_amount)).toBe(0);
  });

  it('FCFA : un montant entier reste accepté', async () => {
    await createDepositMovement(TENANT, 'dep-1', T.REFUND, 1000);
    expect(Number(store.deposit!.refunded_amount)).toBe(1000);
  });
});

describe('retenue et remboursement', () => {
  it('le remboursement ne touche pas la part bloquée', async () => {
    seed({ held_amount: 50000 });
    await expect(createDepositMovement(TENANT, 'dep-1', T.REFUND, 500000)).rejects.toBeInstanceOf(BadRequestError);
    expect(store.movements).toHaveLength(0);

    await createDepositMovement(TENANT, 'dep-1', T.REFUND, 450000);
    expect(Number(store.deposit!.refunded_amount)).toBe(450000);
    // Reste 50 000 détenus, tous bloqués : plus rien à rembourser.
    await expect(createDepositMovement(TENANT, 'dep-1', T.REFUND, 1)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('après libération, le remboursement du solde complet passe', async () => {
    seed({ held_amount: 50000 });
    await createDepositMovement(TENANT, 'dep-1', T.RELEASE, 50000);
    await createDepositMovement(TENANT, 'dep-1', T.REFUND, 500000);
    expect(computeDepositBalance(store.deposit as any)).toBe(0);
  });
});

describe('collecte : rattachement du règlement', () => {
  beforeEach(() => seed({ collected_amount: 0 }));

  it('refuse la collecte sur un bail annulé', async () => {
    seed({ collected_amount: 0 }, { status: 'CANCELED', primary_renter_client_id: 'renter-1' });
    await expect(createDepositMovement(TENANT, 'dep-1', T.COLLECT, 500000, 'pay-1')).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(store.movements).toHaveLength(0);
  });

  it('un remboursement reste possible sur un bail terminé', async () => {
    seed({}, { status: 'ENDED', primary_renter_client_id: 'renter-1' });
    await createDepositMovement(TENANT, 'dep-1', T.REFUND, 500000);
    expect(store.movements).toHaveLength(1);
  });

  it('refuse un règlement dans une autre devise', async () => {
    store.payment!.currency = 'EUR';
    await expect(createDepositMovement(TENANT, 'dep-1', T.COLLECT, 500000, 'pay-1')).rejects.toBeInstanceOf(
      BadRequestError
    );
    expect(store.movements).toHaveLength(0);
  });

  it("refuse un règlement sans bail d'un autre locataire", async () => {
    store.payment!.lease_id = null;
    store.payment!.renter_client_id = 'renter-AUTRE';
    await expect(createDepositMovement(TENANT, 'dep-1', T.COLLECT, 500000, 'pay-1')).rejects.toBeInstanceOf(
      BadRequestError
    );
  });

  it("refuse le règlement d'un autre bail", async () => {
    store.payment!.lease_id = 'lease-2';
    await expect(createDepositMovement(TENANT, 'dep-1', T.COLLECT, 500000, 'pay-1')).rejects.toBeInstanceOf(
      BadRequestError
    );
  });

  it("refuse le règlement d'une autre agence (introuvable)", async () => {
    store.payment!.tenant_id = 'tenant-B';
    await expect(createDepositMovement(TENANT, 'dep-1', T.COLLECT, 500000, 'pay-1')).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('collecte nominale : bail actif, même devise, même bail', async () => {
    await createDepositMovement(TENANT, 'dep-1', T.COLLECT, 500000, 'pay-1');
    expect(Number(store.deposit!.collected_amount)).toBe(500000);
  });
});

describe('isolation', () => {
  it("le dépôt d'une autre agence est introuvable", async () => {
    await expect(createDepositMovement('tenant-B', 'dep-1', T.REFUND, 1000)).rejects.toBeInstanceOf(NotFoundError);
  });
});
