/**
 * BUG-2026-11-04-001 / 002 / 004 : le net inscrit au compte du locataire pour
 * une pénalité (pénalités − remises) égale toujours son montant retenu courant
 * (0 une fois supprimée), quel que soit le nombre d'ajustements.
 *
 * Le grand livre est réel (idempotence par `(sourceType, sourceId, type)`
 * comprise) ; seul Prisma est simulé par un magasin en mémoire.
 */
type Mvt = {
  id: string;
  accountId: string;
  tenantId: string;
  type: string;
  debit?: number;
  credit?: number;
  label: string;
  sourceType: string;
  sourceId: string;
  movementDate: Date;
  balanceAfter: number;
  leaseId?: string | null;
  createdAt: Date;
};

const store: { movements: Mvt[]; balance: number; penalty: any; installmentPenaltyAmount: number } = {
  movements: [],
  balance: 0,
  penalty: null,
  installmentPenaltyAmount: 0
};

const TENANT = 'tenant-1';
const PEN = 'pen-1';

const fakeTx: any = {
  thirdPartyAccount: {
    findUnique: jest.fn(async () => ({ id: 'acc-1', label: 'Loc', balance: store.balance })),
    findFirst: jest.fn(async () => ({ id: 'acc-1', balance: store.balance, kind: 'TENANT' })),
    update: jest.fn(async ({ data }: any) => {
      store.balance = Number(data.balance);
      return {};
    })
  },
  thirdPartyMovement: {
    findUnique: jest.fn(async ({ where }: any) => {
      const k = where.sourceType_sourceId_type;
      return (
        store.movements.find(m => m.sourceType === k.sourceType && m.sourceId === k.sourceId && m.type === k.type) ??
        null
      );
    }),
    findMany: jest.fn(async ({ where }: any) => {
      return store.movements.filter(m => {
        if (m.sourceType !== where.sourceType) return false;
        if (typeof where.sourceId === 'string') return m.sourceId === where.sourceId;
        if (where.sourceId?.startsWith) return m.sourceId.startsWith(where.sourceId.startsWith);
        return true;
      });
    }),
    count: jest.fn(async () => store.movements.length),
    create: jest.fn(async ({ data }: any) => {
      const dup = store.movements.find(
        m => m.sourceType === data.sourceType && m.sourceId === data.sourceId && m.type === data.type
      );
      if (dup) throw new Error('P2002 unique');
      const row = { id: `m-${store.movements.length + 1}`, createdAt: new Date(), ...data } as Mvt;
      store.movements.push(row);
      return row;
    })
  },
  rentalPenalty: {
    update: jest.fn(async ({ data }: any) => {
      store.penalty = { ...store.penalty, ...data };
      return store.penalty;
    }),
    delete: jest.fn(async () => {
      store.penalty = null;
      return {};
    }),
    findMany: jest.fn(async () => (store.penalty ? [store.penalty] : []))
  },
  rentalInstallment: {
    update: jest.fn(async ({ data }: any) => {
      store.installmentPenaltyAmount = Number(data.penalty_amount);
      return {};
    })
  },
  rentalLease: { findFirst: jest.fn(async () => ({ primary_renter_client_id: 'client-1' })) }
};

const mockPrisma: any = {
  rentalPenalty: { findFirst: jest.fn(async () => store.penalty) },
  $transaction: jest.fn(async (cb: any) => cb(fakeTx))
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/lib/audit/changes', () => ({ diffForAudit: jest.fn(() => ({})) }));
jest.mock('../../src/utils/project-root', () => ({ getProjectRoot: () => '/tmp' }));
jest.mock('../../src/utils/tenant-context', () => ({
  runWithTenantContext: (_ctx: unknown, fn: () => unknown) => fn()
}));
jest.mock('../../src/i18n', () => ({ t: (s: string) => s }));
jest.mock('../../src/services/rental-installment-service', () => ({
  ...jest.requireActual('../../src/services/rental-installment-service'),
  updateInstallmentStatus: jest.fn(async () => undefined)
}));

import { updatePenalty, deletePenalty } from '../../src/services/rental-penalty-service';
import { rebuildThirdPartyAccount } from '../../src/lib/finance/ledger';

const net = () => store.movements.reduce((s, m) => s + Number(m.debit ?? 0) - Number(m.credit ?? 0), 0);

function seedPenalty(amount: number) {
  store.penalty = {
    id: PEN,
    tenant_id: TENANT,
    installment_id: 'inst-1',
    amount,
    calculatedAmount: amount,
    is_manual_override: false,
    override_reason: null,
    calculated_at: new Date('2026-07-10'),
    installment: { lease_id: 'lease-1', period_year: 2026, period_month: 7 }
  };
  // Inscription initiale, telle que l'écrit le calcul : un mouvement PENALTY.
  store.movements = [
    {
      id: 'm-0',
      accountId: 'acc-1',
      tenantId: TENANT,
      type: 'PENALTY',
      debit: amount,
      label: "Pénalité de retard sur l'échéance 07/2026",
      sourceType: 'RENTAL_PENALTY',
      sourceId: PEN,
      movementDate: new Date('2026-07-10'),
      balanceAfter: amount,
      createdAt: new Date()
    }
  ];
  store.balance = amount;
}

beforeEach(() => {
  jest.clearAllMocks();
  store.installmentPenaltyAmount = 0;
  seedPenalty(3200);
});

describe('compte du locataire après ajustements de pénalité', () => {
  it('001 : une hausse inscrit le complément au compte', async () => {
    await updatePenalty(TENANT, PEN, 1000, 'Geste commercial', 'u1');
    expect(net()).toBe(1000);
    await updatePenalty(TENANT, PEN, 5000, 'Frais de relance', 'u1');
    expect(net()).toBe(5000);
    expect(store.balance).toBe(5000);
    await updatePenalty(TENANT, PEN, 6000, 'Frais de relance', 'u1');
    expect(net()).toBe(6000);
  });

  it('002 : une seconde baisse remet de nouveau la différence', async () => {
    await updatePenalty(TENANT, PEN, 1000, 'Geste', 'u1');
    await updatePenalty(TENANT, PEN, 0, 'Remise totale', 'u1');
    expect(net()).toBe(0);
    expect(store.balance).toBe(0);
  });

  it('004 : supprimer une pénalité déjà ajustée remet le reliquat', async () => {
    await updatePenalty(TENANT, PEN, 2000, 'Geste', 'u1');
    await updatePenalty(TENANT, PEN, 4000, 'Relance', 'u1');
    await deletePenalty(TENANT, PEN, 'u1');
    expect(net()).toBe(0);
    expect(store.balance).toBe(0);
  });

  it('supprimer une pénalité jamais ajustée remet tout', async () => {
    await deletePenalty(TENANT, PEN, 'u1');
    expect(net()).toBe(0);
  });

  it('un ajustement au même montant ne crée aucun mouvement', async () => {
    await updatePenalty(TENANT, PEN, 3200, 'Idem', 'u1');
    expect(store.movements).toHaveLength(1);
  });

  it('libellés : pénalité pour une hausse, remise pour une baisse', async () => {
    await updatePenalty(TENANT, PEN, 1000, 'a', 'u1');
    await updatePenalty(TENANT, PEN, 5000, 'b', 'u1');
    const labels = store.movements.map(m => m.label);
    expect(labels[1]).toMatch(/^Remise de la pénalité de retard sur l'échéance/);
    expect(labels[2]).toMatch(/^Pénalité de retard sur l'échéance/);
  });

  it('la reconstruction du compte donne le solde de l’inscription incrémentale', async () => {
    await updatePenalty(TENANT, PEN, 1000, 'a', 'u1');
    await updatePenalty(TENANT, PEN, 5000, 'b', 'u1');
    await updatePenalty(TENANT, PEN, 0, 'c', 'u1');
    await updatePenalty(TENANT, PEN, 2500, 'd', 'u1');
    const incremental = store.balance;

    // Reconstruction sur un compte vierge, depuis les pièces d'origine.
    const montant = Number(store.penalty.amount);
    store.movements = [];
    store.balance = 0;
    const rebuildTx: any = {
      ...fakeTx,
      thirdPartyAccount: {
        ...fakeTx.thirdPartyAccount,
        findFirst: jest.fn(async () => ({
          id: 'acc-1',
          tenantClientId: 'client-1',
          balance: store.balance,
          kind: 'TENANT'
        })),
        findUnique: jest.fn(async () => ({ balance: store.balance }))
      },
      rentalInstallment: { findMany: jest.fn(async () => []) },
      rentalPaymentAllocation: { findMany: jest.fn(async () => []) },
      rentalPenalty: { findMany: jest.fn(async () => [{ ...store.penalty, amount: montant }]) },
      rentalPayment: { findMany: jest.fn(async () => []) }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (cb: any) => cb(rebuildTx));
    const res = await rebuildThirdPartyAccount(TENANT, 'acc-1');
    expect(res.balance).toBe(incremental);
    expect(incremental).toBe(2500);
  });
});
