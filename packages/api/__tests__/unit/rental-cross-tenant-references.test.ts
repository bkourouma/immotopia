/**
 * Lot B — trous d'étanchéité corrigés dans
 * packages/api/src/services/{rental-lease,rental-payment,rental-deposit}-service.ts.
 *
 * Chaque cas prouve qu'une référence reçue dans un corps de requête
 * (renterClientId d'un co-locataire, renterClientId/invoiceId d'un
 * règlement, paymentId/installmentId d'un mouvement de dépôt) qui pointe vers
 * une autre agence est refusée, avant toute écriture. Prisma est remplacé par
 * un magasin en mémoire (même esprit que `crm-cross-tenant-references.test.ts`) :
 * aucune base n'est requise.
 */

type Row = Record<string, any>;

const store = {
  leases: [] as Row[],
  coRenters: [] as Row[],
  tenantClients: [] as Row[],
  payments: [] as Row[],
  invoices: [] as Row[],
  deposits: [] as Row[],
  depositMovements: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const mockPrisma: Row = {
  rentalLease: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.leases.find(l => l.id === where.id && l.tenant_id === where.tenant_id) ?? null
    )
  },
  rentalLeaseCoRenter: {
    findFirst: jest.fn(
      async ({ where }: Row) =>
        store.coRenters.find(c => c.lease_id === where.lease_id && c.renter_client_id === where.renter_client_id) ??
        null
    ),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('corenter'), ...data };
      store.coRenters.push(created);
      return created;
    })
  },
  tenantClient: {
    findFirst: jest.fn(
      async ({ where }: Row) =>
        store.tenantClients.find(c => c.id === where.id && c.tenantId === where.tenantId) ?? null
    )
  },
  rentalPayment: {
    findFirst: jest.fn(async ({ where }: Row) => {
      if (where.idempotency_key !== undefined) {
        return (
          store.payments.find(p => p.tenant_id === where.tenant_id && p.idempotency_key === where.idempotency_key) ??
          null
        );
      }
      return null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('payment'), ...data };
      store.payments.push(created);
      return created;
    })
  },
  invoice: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.invoices.find(i => i.id === where.id && i.tenantId === where.tenantId) ?? null
    )
  },
  rentalInstallment: {
    findFirst: jest.fn(async () => null)
  },
  rentalSecurityDeposit: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.deposits.find(d => d.id === where.id && d.tenant_id === where.tenant_id) ?? null
    )
  },
  rentalDepositMovement: {
    findMany: jest.fn(async () => []),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('movement'), ...data };
      store.depositMovements.push(created);
      return created;
    })
  },
  $executeRaw: jest.fn(async () => 0),
  $transaction: jest.fn(async (callback: (tx: Row) => Promise<any>) => callback(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, prop) {
        return (mockPrisma as any)[prop];
      }
    }
  )
}));

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn()
}));

// `rental-lease-service.ts` importe `./property-status-service` ->
// `./property-service` -> `./property-template-service`, qui porte une
// erreur TS ancienne (TS2352, hors de ce lot). `addCoRenter` n'appelle jamais
// `updatePropertyStatus` : on coupe la chaîne ici plutôt que de corriger ce
// fichier hors territoire.
jest.mock('../../src/services/property-status-service', () => ({
  updatePropertyStatus: jest.fn(async () => undefined)
}));

// `rental-lease-service.ts` importe aussi `./tenant-service`
// (`getTenantById`), qui porte des erreurs TS anciennes (TS2440/TS2322, hors
// de ce lot). `addCoRenter` ne l'appelle jamais : même remède.
jest.mock('../../src/services/tenant-service', () => ({
  getTenantById: jest.fn(async () => null),
  getOrCreateTenantClientFromContact: jest.fn()
}));

import { addCoRenter } from '../../src/services/rental-lease-service';
import { createPayment } from '../../src/services/rental-payment-service';
import { createDepositMovement } from '../../src/services/rental-deposit-service';

function seedLease(overrides: Partial<Row> = {}): Row {
  const lease = {
    id: nextId('lease'),
    tenant_id: TENANT_A,
    property_id: 'property-1',
    status: 'ACTIVE',
    ...overrides
  };
  store.leases.push(lease);
  return lease;
}

function seedTenantClient(overrides: Partial<Row> = {}): Row {
  const client = { id: nextId('client'), tenantId: TENANT_A, ...overrides };
  store.tenantClients.push(client);
  return client;
}

function seedInvoice(overrides: Partial<Row> = {}): Row {
  const invoice = { id: nextId('invoice'), tenantId: TENANT_A, ...overrides };
  store.invoices.push(invoice);
  return invoice;
}

function seedDeposit(overrides: Partial<Row> = {}): Row {
  const deposit = {
    id: nextId('deposit'),
    tenant_id: TENANT_A,
    lease_id: 'lease-x',
    currency: 'FCFA',
    target_amount: 100_000,
    collected_amount: 0,
    held_amount: 0,
    refunded_amount: 0,
    forfeited_amount: 0,
    ...overrides
  };
  store.deposits.push(deposit);
  return deposit;
}

beforeEach(() => {
  store.leases = [];
  store.coRenters = [];
  store.tenantClients = [];
  store.payments = [];
  store.invoices = [];
  store.deposits = [];
  store.depositMovements = [];
  store.seq = 0;
  jest.clearAllMocks();
});

describe('rental-lease-service — addCoRenter : le locataire ajouté doit appartenir à cette agence', () => {
  it("refuse un renterClientId d'une AUTRE agence", async () => {
    const lease = seedLease();
    const foreignClient = seedTenantClient({ tenantId: TENANT_B });

    await expect(addCoRenter(TENANT_A, lease.id, foreignClient.id, 'actor-1')).rejects.toThrow(
      'Co-renter client not found or does not belong to this tenant'
    );

    expect(store.coRenters).toHaveLength(0);
  });
});

describe('rental-payment-service — createPayment : les références du corps doivent appartenir à cette agence', () => {
  it("refuse un renterClientId d'une AUTRE agence", async () => {
    const foreignClient = seedTenantClient({ tenantId: TENANT_B });

    await expect(
      createPayment(
        TENANT_A,
        {
          renterClientId: foreignClient.id,
          method: 'CASH',
          amount: 50_000,
          idempotencyKey: 'idem-1'
        } as any,
        'actor-1'
      )
    ).rejects.toThrow('Locataire introuvable');

    expect(store.payments).toHaveLength(0);
  });

  it("refuse un invoiceId d'une AUTRE agence", async () => {
    const foreignInvoice = seedInvoice({ tenantId: TENANT_B });

    await expect(
      createPayment(
        TENANT_A,
        {
          invoiceId: foreignInvoice.id,
          method: 'CASH',
          amount: 50_000,
          idempotencyKey: 'idem-2'
        } as any,
        'actor-1'
      )
    ).rejects.toThrow('Facture introuvable');

    expect(store.payments).toHaveLength(0);
  });
});

describe('rental-deposit-service — createDepositMovement : paymentId/installmentId doivent appartenir à cette agence', () => {
  it("refuse un paymentId d'une AUTRE agence", async () => {
    const deposit = seedDeposit();

    await expect(
      createDepositMovement(TENANT_A, deposit.id, 'ADJUSTMENT' as any, 1_000, 'payment-from-tenant-b', undefined)
    ).rejects.toThrow('Paiement introuvable');

    expect(store.depositMovements).toHaveLength(0);
  });

  it("refuse un installmentId d'une AUTRE agence", async () => {
    const deposit = seedDeposit();

    await expect(
      createDepositMovement(TENANT_A, deposit.id, 'ADJUSTMENT' as any, 1_000, undefined, 'installment-from-tenant-b')
    ).rejects.toThrow('Échéance introuvable');

    expect(store.depositMovements).toHaveLength(0);
  });
});
