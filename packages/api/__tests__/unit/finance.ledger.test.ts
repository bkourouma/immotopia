/**
 * Tests du grand livre des comptes de tiers (lot 1, volet clients).
 *
 * Prisma est remplace par un magasin en memoire, sur le meme modele que
 * `syndics.owner-accounts.ledger.test.ts` (vague 1) : aucune base n'est
 * requise, et `$transaction` execute simplement le callback avec le client
 * mocke comme `tx`.
 */

jest.mock('@prisma/client', () => {
  type Row = Record<string, any>;

  const store = {
    accounts: [] as Row[],
    movements: [] as Row[],
    tenantClients: [] as Row[],
    users: [] as Row[],
    leases: [] as Row[],
    installments: [] as Row[],
    allocations: [] as Row[],
    penalties: [] as Row[],
    payments: [] as Row[],
    seq: 0
  };

  const nextSeq = () => {
    store.seq += 1;
    return store.seq;
  };

  const nextCreatedAt = () => new Date(Date.UTC(2000, 0, 1) + nextSeq() * 1000);

  const findUserById = (id?: string | null) => (id ? (store.users.find(u => u.id === id) ?? null) : null);

  const client: Row = {
    thirdPartyAccount: {
      findFirst: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        const found = store.accounts.find(
          a =>
            (where.id === undefined || a.id === where.id) &&
            (where.tenantId === undefined || a.tenantId === where.tenantId)
        );
        return found ? { ...found } : null;
      }),
      findUnique: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        if (where.id !== undefined) {
          const found = store.accounts.find(a => a.id === where.id);
          return found ? { ...found } : null;
        }
        const compound = where.tenantId_kind_tenantClientId;
        if (compound) {
          const found = store.accounts.find(
            a =>
              a.tenantId === compound.tenantId &&
              a.kind === compound.kind &&
              a.tenantClientId === compound.tenantClientId
          );
          return found ? { ...found } : null;
        }
        return null;
      }),
      create: jest.fn(async (args: Row) => {
        const created = { id: `acc-${nextSeq()}`, ...args.data };
        store.accounts.push(created);
        return { ...created };
      }),
      update: jest.fn(async (args: Row) => {
        const account = store.accounts.find(a => a.id === args.where.id);
        Object.assign(account ?? {}, args.data);
        return account ? { ...account } : null;
      })
    },
    thirdPartyMovement: {
      create: jest.fn(async (args: Row) => {
        const data = args.data;
        const clash = store.movements.find(
          m => m.sourceType === data.sourceType && m.sourceId === data.sourceId && m.type === data.type
        );
        if (clash) {
          const error: any = new Error('Unique constraint failed');
          error.code = 'P2002';
          throw error;
        }
        const created = { id: `mv-${nextSeq()}`, createdAt: nextCreatedAt(), ...data };
        store.movements.push(created);
        return { ...created };
      }),
      findUnique: jest.fn(async (args: Row) => {
        const key = args.where.sourceType_sourceId_type;
        const found = store.movements.find(
          m => m.sourceType === key.sourceType && m.sourceId === key.sourceId && m.type === key.type
        );
        return found ? { ...found } : null;
      }),
      count: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        return store.movements.filter(m => where.accountId === undefined || m.accountId === where.accountId).length;
      })
    },
    tenantClient: {
      findFirst: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        const found = store.tenantClients.find(
          t =>
            (where.id === undefined || t.id === where.id) &&
            (where.tenantId === undefined || t.tenantId === where.tenantId)
        );
        if (!found) {
          return null;
        }
        return { id: found.id, user: findUserById(found.userId) };
      })
    },
    rentalInstallment: {
      findMany: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        const tenantClientId = where.lease?.primary_renter_client_id;
        const leaseIds = new Set(
          store.leases
            .filter(l => l.tenantId === where.tenant_id && l.primaryRenterClientId === tenantClientId)
            .map(l => l.id)
        );
        return store.installments
          .filter(i => i.tenantId === where.tenant_id && leaseIds.has(i.leaseId))
          .map(i => ({
            id: i.id,
            lease_id: i.leaseId,
            due_date: i.dueDate,
            period_year: i.periodYear,
            period_month: i.periodMonth,
            amount_rent: i.amountRent,
            amount_service: i.amountService,
            amount_other_fees: i.amountOtherFees
          }));
      })
    },
    rentalPaymentAllocation: {
      findMany: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        const tenantClientId = where.payment?.renter_client_id;
        const paymentIds = new Set(
          store.payments
            .filter(p => p.tenantId === where.tenant_id && p.renterClientId === tenantClientId)
            .map(p => p.id)
        );
        return store.allocations
          .filter(a => a.tenantId === where.tenant_id && paymentIds.has(a.paymentId))
          .map(a => {
            const payment = store.payments.find(p => p.id === a.paymentId);
            const installment = store.installments.find(i => i.id === a.installmentId);
            return {
              id: a.id,
              amount: a.amount,
              payment: payment
                ? {
                    id: payment.id,
                    method: payment.method,
                    succeeded_at: payment.succeededAt,
                    initiated_at: payment.initiatedAt,
                    lease_id: payment.leaseId
                  }
                : null,
              installment: installment
                ? {
                    lease_id: installment.leaseId,
                    period_year: installment.periodYear,
                    period_month: installment.periodMonth
                  }
                : null
            };
          });
      })
    },
    rentalPenalty: {
      findMany: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        const tenantClientId = where.installment?.lease?.primary_renter_client_id;
        const leaseIds = new Set(
          store.leases
            .filter(l => l.tenantId === where.tenant_id && l.primaryRenterClientId === tenantClientId)
            .map(l => l.id)
        );
        const installmentIds = new Set(store.installments.filter(i => leaseIds.has(i.leaseId)).map(i => i.id));
        return store.penalties
          .filter(p => p.tenantId === where.tenant_id && installmentIds.has(p.installmentId))
          .map(p => {
            const installment = store.installments.find(i => i.id === p.installmentId);
            return {
              id: p.id,
              amount: p.amount,
              calculated_at: p.calculatedAt,
              installment: installment
                ? {
                    lease_id: installment.leaseId,
                    period_year: installment.periodYear,
                    period_month: installment.periodMonth
                  }
                : null
            };
          });
      })
    },
    rentalPayment: {
      findMany: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        return store.payments
          .filter(
            p =>
              p.tenantId === where.tenant_id && p.renterClientId === where.renter_client_id && p.status === where.status
          )
          .map(p => ({
            id: p.id,
            amount: p.amount,
            method: p.method,
            succeeded_at: p.succeededAt,
            initiated_at: p.initiatedAt,
            lease_id: p.leaseId,
            allocations: store.allocations.filter(a => a.paymentId === p.id).map(a => ({ amount: a.amount }))
          }));
      })
    }
  };

  client.$transaction = jest.fn(async (callback: any) => callback(client));

  return {
    PrismaClient: jest.fn(() => client),
    __mockPrisma: client,
    __store: store
  };
});

import {
  appendThirdPartyMovementTx,
  getOrCreateTenantAccountTx,
  rebuildThirdPartyAccount
} from '../../src/lib/finance/ledger';
import type { AppendMovementParams } from '../../src/lib/finance/types';

const { __mockPrisma: mockPrisma, __store: store } = jest.requireMock('@prisma/client') as {
  __mockPrisma: any;
  __store: any;
};

const TENANT_ID = 'tenant-1';

function seedAccount(tenantClientId: string, balance = 0) {
  const account = {
    id: `acc-seed-${tenantClientId}`,
    tenantId: TENANT_ID,
    kind: 'TENANT',
    tenantClientId,
    label: `Locataire ${tenantClientId}`,
    balance,
    currency: 'XOF'
  };
  store.accounts.push(account);
  return account;
}

beforeEach(() => {
  jest.clearAllMocks();
  store.accounts.length = 0;
  store.movements.length = 0;
  store.tenantClients.length = 0;
  store.users.length = 0;
  store.leases.length = 0;
  store.installments.length = 0;
  store.allocations.length = 0;
  store.penalties.length = 0;
  store.payments.length = 0;
  store.seq = 0;
});

describe('appendThirdPartyMovementTx', () => {
  it('chaine balanceAfter sur des mouvements factures et regles melanges : facture augmente, regle diminue', async () => {
    const account = seedAccount('tc-1', 0);

    const m1: any = await appendThirdPartyMovementTx(mockPrisma, {
      accountId: account.id,
      tenantId: TENANT_ID,
      type: 'INSTALLMENT' as any,
      billed: 50000,
      label: 'Loyer de janvier 2026',
      sourceType: 'RENTAL_INSTALLMENT',
      sourceId: 'inst-1'
    });
    const m2: any = await appendThirdPartyMovementTx(mockPrisma, {
      accountId: account.id,
      tenantId: TENANT_ID,
      type: 'PAYMENT' as any,
      settled: 20000,
      label: 'Reglement (Mobile Money)',
      sourceType: 'RENTAL_PAYMENT_ALLOCATION',
      sourceId: 'alloc-1'
    });
    const m3: any = await appendThirdPartyMovementTx(mockPrisma, {
      accountId: account.id,
      tenantId: TENANT_ID,
      type: 'PENALTY' as any,
      billed: 4500,
      label: 'Penalite de retard',
      sourceType: 'RENTAL_PENALTY',
      sourceId: 'pen-1'
    });
    const m4: any = await appendThirdPartyMovementTx(mockPrisma, {
      accountId: account.id,
      tenantId: TENANT_ID,
      type: 'PAYMENT' as any,
      settled: 34500,
      label: 'Reglement solde',
      sourceType: 'RENTAL_PAYMENT_ALLOCATION',
      sourceId: 'alloc-2'
    });

    expect([m1, m2, m3, m4].map(m => m.balanceAfter)).toEqual([50000, 30000, 34500, 0]);
    expect(store.accounts[0].balance).toBe(0);

    // Le sens est verifie explicitement : facture => amountBilled renseigne, solde monte.
    expect(m1.amountBilled).toBe(50000);
    expect(m1.amountSettled).toBeNull();
    // Regle => amountSettled renseigne, solde descend.
    expect(m2.amountSettled).toBe(20000);
    expect(m2.amountBilled).toBeNull();
  });

  it("est idempotent par (sourceType, sourceId, type) : rejouer le meme triplet ne duplique pas et renvoie l'existant", async () => {
    const account = seedAccount('tc-2', 0);
    const params: AppendMovementParams = {
      accountId: account.id,
      tenantId: TENANT_ID,
      type: 'INSTALLMENT' as any,
      billed: 15000,
      label: 'Loyer de fevrier 2026',
      sourceType: 'RENTAL_INSTALLMENT',
      sourceId: 'inst-idem'
    };

    const first: any = await appendThirdPartyMovementTx(mockPrisma, params);
    const second: any = await appendThirdPartyMovementTx(mockPrisma, params);

    expect(second.id).toBe(first.id);
    expect(store.movements).toHaveLength(1);
    // Le rejeu ne touche pas au solde une seconde fois.
    expect(store.accounts[0].balance).toBe(15000);
  });

  it('renvoie null quand le compte est introuvable', async () => {
    const result = await appendThirdPartyMovementTx(mockPrisma, {
      accountId: 'compte-inconnu',
      tenantId: TENANT_ID,
      type: 'INSTALLMENT' as any,
      billed: 1000,
      label: 'Loyer orphelin',
      sourceType: 'RENTAL_INSTALLMENT',
      sourceId: 'inst-orphelin'
    });

    expect(result).toBeNull();
    expect(store.movements).toHaveLength(0);
  });
});

describe('getOrCreateTenantAccountTx', () => {
  it('cree le compte de locataire avec le label copie du nom, kind TENANT et devise XOF', async () => {
    store.users.push({ id: 'user-1', fullName: 'Awa Diop', email: 'awa@example.com' });
    store.tenantClients.push({ id: 'tc-new', tenantId: TENANT_ID, userId: 'user-1' });

    const account: any = await getOrCreateTenantAccountTx(mockPrisma, TENANT_ID, 'tc-new');

    expect(account).not.toBeNull();
    expect(account.label).toBe('Awa Diop');
    expect(account.balance).toBe(0);
    expect(store.accounts[0].kind).toBe('TENANT');
    expect(store.accounts[0].currency).toBe('XOF');
    expect(mockPrisma.thirdPartyAccount.create).toHaveBeenCalledTimes(1);
  });

  it("un second appel renvoie le meme compte plutot que d'en creer un second", async () => {
    store.users.push({ id: 'user-2', fullName: 'Moussa Kane', email: 'moussa@example.com' });
    store.tenantClients.push({ id: 'tc-repeat', tenantId: TENANT_ID, userId: 'user-2' });

    const first: any = await getOrCreateTenantAccountTx(mockPrisma, TENANT_ID, 'tc-repeat');
    const second: any = await getOrCreateTenantAccountTx(mockPrisma, TENANT_ID, 'tc-repeat');

    expect(second.id).toBe(first.id);
    expect(store.accounts).toHaveLength(1);
    expect(mockPrisma.thirdPartyAccount.create).toHaveBeenCalledTimes(1);
  });

  it('renvoie null quand le TenantClient est introuvable', async () => {
    const result = await getOrCreateTenantAccountTx(mockPrisma, TENANT_ID, 'tc-absent');

    expect(result).toBeNull();
    expect(store.accounts).toHaveLength(0);
  });
});

describe('rebuildThirdPartyAccount', () => {
  const LEASE_A = 'lease-a';
  const LEASE_B = 'lease-b';

  /**
   * Plante un jeu de pieces d'origine identique (aux identifiants pres) pour
   * un locataire donne : 100 echeances entierement reglees, 30 penalites, et
   * 5 paiements laissant un reliquat non affecte. Solde attendu, calcule a la
   * main : (100 x 50000 + 30 x 2000) factures - (100 x 50000 + 5 x 10000)
   * regles = 5 060 000 - 5 050 000 = 10 000.
   */
  function seedSourcePieces(prefix: string, leaseId: string, tenantClientId: string) {
    store.leases.push({ id: leaseId, tenantId: TENANT_ID, primaryRenterClientId: tenantClientId });

    const baseDate = Date.UTC(2024, 0, 1);
    const dayMs = 24 * 60 * 60 * 1000;

    for (let i = 0; i < 100; i++) {
      const installmentId = `${prefix}-inst-${i}`;
      store.installments.push({
        id: installmentId,
        tenantId: TENANT_ID,
        leaseId,
        dueDate: new Date(baseDate + i * dayMs),
        periodYear: 2024,
        periodMonth: (i % 12) + 1,
        amountRent: 50000,
        amountService: 0,
        amountOtherFees: 0
      });

      const paymentId = `${prefix}-pay-full-${i}`;
      store.payments.push({
        id: paymentId,
        tenantId: TENANT_ID,
        renterClientId: tenantClientId,
        leaseId,
        amount: 50000,
        method: 'MOBILE_MONEY',
        status: 'SUCCESS',
        succeededAt: new Date(baseDate + i * dayMs + dayMs / 2),
        initiatedAt: new Date(baseDate + i * dayMs)
      });
      store.allocations.push({
        id: `${prefix}-alloc-${i}`,
        tenantId: TENANT_ID,
        paymentId,
        installmentId,
        amount: 50000
      });
    }

    for (let i = 0; i < 30; i++) {
      store.penalties.push({
        id: `${prefix}-pen-${i}`,
        tenantId: TENANT_ID,
        installmentId: `${prefix}-inst-${i}`,
        amount: 2000,
        calculatedAt: new Date(baseDate + i * dayMs + dayMs)
      });
    }

    for (let i = 0; i < 5; i++) {
      store.payments.push({
        id: `${prefix}-pay-adv-${i}`,
        tenantId: TENANT_ID,
        renterClientId: tenantClientId,
        leaseId,
        amount: 10000,
        method: 'CASH',
        status: 'SUCCESS',
        succeededAt: new Date(baseDate + (200 + i) * dayMs),
        initiatedAt: new Date(baseDate + (200 + i) * dayMs)
      });
      // Aucune allocation pour ces paiements : tout le montant est un reliquat.
    }
  }

  it("reconstruit un solde final identique a l'ajout incremental, sur plus de 200 mouvements", async () => {
    // Compte A : construit "au fil de l'eau", en appelant directement
    // appendThirdPartyMovementTx pour chaque piece, comme le ferait un
    // service appelant en temps reel.
    const accountA = seedAccount('tc-incremental', 0);
    seedSourcePieces('a', LEASE_A, 'tc-incremental');

    const pendingA: AppendMovementParams[] = [];
    for (let i = 0; i < 100; i++) {
      pendingA.push({
        accountId: accountA.id,
        tenantId: TENANT_ID,
        type: 'INSTALLMENT' as any,
        billed: 50000,
        label: `Loyer ${i}`,
        sourceType: 'RENTAL_INSTALLMENT',
        sourceId: `a-inst-${i}`,
        leaseId: LEASE_A,
        movementDate: store.installments.find((x: any) => x.id === `a-inst-${i}`).dueDate
      });
      pendingA.push({
        accountId: accountA.id,
        tenantId: TENANT_ID,
        type: 'PAYMENT' as any,
        settled: 50000,
        label: `Reglement ${i}`,
        sourceType: 'RENTAL_PAYMENT_ALLOCATION',
        sourceId: `a-alloc-${i}`,
        leaseId: LEASE_A,
        movementDate: store.payments.find((x: any) => x.id === `a-pay-full-${i}`).succeededAt
      });
    }
    for (let i = 0; i < 30; i++) {
      pendingA.push({
        accountId: accountA.id,
        tenantId: TENANT_ID,
        type: 'PENALTY' as any,
        billed: 2000,
        label: `Penalite ${i}`,
        sourceType: 'RENTAL_PENALTY',
        sourceId: `a-pen-${i}`,
        leaseId: LEASE_A,
        movementDate: store.penalties.find((x: any) => x.id === `a-pen-${i}`).calculatedAt
      });
    }
    for (let i = 0; i < 5; i++) {
      pendingA.push({
        accountId: accountA.id,
        tenantId: TENANT_ID,
        type: 'ADVANCE_RECEIVED' as any,
        settled: 10000,
        label: `Avance ${i}`,
        sourceType: 'RENTAL_PAYMENT',
        sourceId: `a-pay-adv-${i}`,
        leaseId: LEASE_A,
        movementDate: store.payments.find((x: any) => x.id === `a-pay-adv-${i}`).succeededAt
      });
    }

    // Ordre chronologique, comme le ferait la reconstruction.
    pendingA.sort((x, y) => (x.movementDate as Date).getTime() - (y.movementDate as Date).getTime());
    for (const params of pendingA) {
      await appendThirdPartyMovementTx(mockPrisma, params);
    }

    expect(pendingA).toHaveLength(235);
    expect(store.accounts.find((a: any) => a.id === accountA.id).balance).toBe(10000);

    // Compte B : memes pieces d'origine (identifiants prefixes differemment),
    // reconstruites via rebuildThirdPartyAccount.
    const accountB = seedAccount('tc-rebuild', 0);
    seedSourcePieces('b', LEASE_B, 'tc-rebuild');

    const resultB = await rebuildThirdPartyAccount(TENANT_ID, accountB.id);

    expect(resultB.movementsWritten).toBe(235);
    expect(resultB.balance).toBe(10000);
    // Les deux methodes convergent bien vers le meme solde.
    expect(resultB.balance).toBe(store.accounts.find((a: any) => a.id === accountA.id).balance);
  });

  it('relancee deux fois ne duplique aucun mouvement', async () => {
    const account = seedAccount('tc-rebuild-twice', 0);
    seedSourcePieces('c', 'lease-c', 'tc-rebuild-twice');

    const first = await rebuildThirdPartyAccount(TENANT_ID, account.id);
    expect(first.movementsWritten).toBe(235);

    const movementsAfterFirst = store.movements.filter((m: any) => m.accountId === account.id).length;

    const second = await rebuildThirdPartyAccount(TENANT_ID, account.id);

    expect(second.movementsWritten).toBe(0);
    expect(second.balance).toBe(first.balance);
    expect(store.movements.filter((m: any) => m.accountId === account.id)).toHaveLength(movementsAfterFirst);
  });

  it('renvoie 0 mouvement et le solde courant quand le compte est introuvable', async () => {
    const result = await rebuildThirdPartyAccount(TENANT_ID, 'compte-absent');

    expect(result).toEqual({ movementsWritten: 0, balance: 0 });
  });
});
