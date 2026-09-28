/**
 * Lot B — trou d'étanchéité corrigé dans packages/api/src/lib/sales/mandates.ts.
 *
 * `agentUserId` (négociateur) reçu dans le corps de la requête doit être
 * membre ACTIF de l'agence : ni un utilisateur d'une autre agence, ni un
 * membre suspendu/en attente. Avant ce correctif, `createMandate` acceptait
 * n'importe quelle adhésion (même non `ACTIVE`), et `updateMandate` ne
 * vérifiait pas du tout `agentUserId` au changement.
 *
 * Prisma est remplacé par un magasin en mémoire (même esprit que
 * `crm-cross-tenant-references.test.ts`) : aucune base n'est requise.
 */

type Row = Record<string, any>;

const store = {
  properties: [] as Row[],
  tenantClients: [] as Row[],
  memberships: [] as Row[],
  mandates: [] as Row[],
  offers: [] as Row[],
  agreements: [] as Row[],
  users: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    return row[key] === value;
  });
}

const mockPrisma: Row = {
  property: {
    findFirst: jest.fn(async ({ where }: Row) => store.properties.find(p => matches(p, where)) ?? null),
    findMany: jest.fn(async ({ where }: Row) => store.properties.filter(p => matches(p, { tenantId: where.tenantId })))
  },
  tenantClient: {
    findFirst: jest.fn(async ({ where }: Row) => store.tenantClients.find(c => matches(c, where)) ?? null),
    findMany: jest.fn(async ({ where }: Row) =>
      store.tenantClients.filter(c => matches(c, { tenantId: where.tenantId }))
    )
  },
  membership: {
    findFirst: jest.fn(async ({ where }: Row) => store.memberships.find(m => matches(m, where)) ?? null)
  },
  user: {
    findMany: jest.fn(async () => store.users)
  },
  saleMandate: {
    findFirst: jest.fn(async ({ where, orderBy }: Row) => {
      const rows = store.mandates.filter(m => matches(m, where));
      if (orderBy?.sequence === 'desc') {
        return rows.sort((a, b) => b.sequence - a.sequence)[0] ?? null;
      }
      return rows[0] ?? null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      const created = {
        id: nextId('mandate'),
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data
      };
      store.mandates.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const idx = store.mandates.findIndex(m => matches(m, where));
      if (idx === -1) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
      store.mandates[idx] = { ...store.mandates[idx], ...data };
      return store.mandates[idx];
    })
  },
  saleOffer: {
    count: jest.fn(async () => 0)
  },
  saleAgreement: {
    findFirst: jest.fn(async () => null)
  },
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

// `mandates.ts` importe `./offers` -> `./property-status` ->
// `services/property-status-service` -> `services/property-service` ->
// `services/property-template-service`, qui porte une erreur TS ancienne
// (TS2352, hors de ce lot). `createMandate`/`updateMandate` n'appellent
// jamais `setPropertyStatusTx` : on coupe la chaîne ici plutôt que de
// corriger ce fichier hors territoire.
jest.mock('../../src/services/property-status-service', () => ({
  validateStatusTransition: jest.fn(() => ({ valid: true })),
  updatePropertyStatus: jest.fn(async () => undefined)
}));

// Barriere « detenu en propre » (pack Patrimoine, lot P1) : hors sujet ici
// (couverte par own-assets-barrier.test.ts) — no-op pour ne pas lire les
// droits d'abonnement via le magasin en memoire ci-dessus.
jest.mock('../../src/services/own-assets-barrier-service', () => ({
  assertThirdPartyAllowedForTenant: jest.fn()
}));

import { createMandate, updateMandate } from '../../src/lib/sales/mandates';

function seedProperty(overrides: Partial<Row> = {}): Row {
  const property = {
    id: nextId('property'),
    tenantId: TENANT_A,
    title: 'Villa Almadies',
    internalReference: 'REF-1',
    status: 'AVAILABLE',
    ...overrides
  };
  store.properties.push(property);
  return property;
}

function seedSeller(overrides: Partial<Row> = {}): Row {
  const seller = {
    id: nextId('client'),
    tenantId: TENANT_A,
    user: { fullName: 'Awa Diallo', email: 'awa@x.com' },
    ...overrides
  };
  store.tenantClients.push(seller);
  return seller;
}

function seedMembership(overrides: Partial<Row> = {}): Row {
  const membership = {
    id: nextId('membership'),
    tenantId: TENANT_A,
    userId: 'agent-1',
    status: 'ACTIVE',
    ...overrides
  };
  store.memberships.push(membership);
  return membership;
}

function seedMandate(overrides: Partial<Row> = {}): Row {
  const mandate = {
    id: nextId('mandate'),
    tenantId: TENANT_A,
    year: 2026,
    sequence: 1,
    propertyId: 'property-x',
    sellerClientId: 'client-x',
    mandateType: 'SIMPLE',
    askingPrice: 50_000_000,
    minimumPrice: null,
    commissionMode: 'PERCENT',
    commissionRate: 5,
    commissionFixedAmount: null,
    commissionPayer: 'SELLER',
    agentUserId: null,
    agentSharePercent: null,
    startDate: new Date('2026-01-01'),
    endDate: null,
    status: 'ACTIVE',
    revokedAt: null,
    revokeReason: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
  store.mandates.push(mandate);
  return mandate;
}

function baseMandateInput(overrides: Partial<Row> = {}) {
  return {
    propertyId: overrides.propertyId,
    sellerClientId: overrides.sellerClientId,
    mandateType: 'SIMPLE',
    askingPrice: 50_000_000,
    commissionMode: 'PERCENT',
    commissionRate: 5,
    commissionPayer: 'SELLER',
    startDate: new Date('2026-01-01'),
    ...overrides
  };
}

beforeEach(() => {
  store.properties = [];
  store.tenantClients = [];
  store.memberships = [];
  store.mandates = [];
  store.offers = [];
  store.agreements = [];
  store.users = [];
  store.seq = 0;
  jest.clearAllMocks();
});

describe('lib/sales/mandates — createMandate : agentUserId doit être membre ACTIF de cette agence', () => {
  it("refuse un agentUserId qui n'est membre que d'une AUTRE agence", async () => {
    const property = seedProperty();
    const seller = seedSeller();
    seedMembership({ tenantId: TENANT_B, userId: 'agent-2' });

    await expect(
      createMandate(
        TENANT_A,
        'actor-1',
        baseMandateInput({ propertyId: property.id, sellerClientId: seller.id, agentUserId: 'agent-2' })
      )
    ).rejects.toThrow("Le négociateur choisi n'est pas un collaborateur actif de cette agence");

    expect(store.mandates).toHaveLength(0);
  });

  it("refuse un agentUserId dont l'adhésion à cette agence n'est pas ACTIVE (ex : suspendue)", async () => {
    const property = seedProperty();
    const seller = seedSeller();
    seedMembership({ tenantId: TENANT_A, userId: 'agent-3', status: 'SUSPENDED' });

    await expect(
      createMandate(
        TENANT_A,
        'actor-1',
        baseMandateInput({ propertyId: property.id, sellerClientId: seller.id, agentUserId: 'agent-3' })
      )
    ).rejects.toThrow("Le négociateur choisi n'est pas un collaborateur actif de cette agence");

    expect(store.mandates).toHaveLength(0);
  });

  it('accepte un agentUserId membre ACTIF de la même agence', async () => {
    const property = seedProperty();
    const seller = seedSeller();
    seedMembership({ tenantId: TENANT_A, userId: 'agent-1' });
    store.users.push({ id: 'agent-1', fullName: 'Ibrahima Ba', email: 'ibrahima@x.com' });

    const mandate = await createMandate(
      TENANT_A,
      'actor-1',
      baseMandateInput({ propertyId: property.id, sellerClientId: seller.id, agentUserId: 'agent-1' })
    );

    expect(mandate.agentUserId).toBe('agent-1');
    expect(store.mandates).toHaveLength(1);
  });
});

describe('lib/sales/mandates — updateMandate : changer agentUserId est soumis à la même règle', () => {
  it("refuse de réaffecter le mandat à un agentUserId d'une AUTRE agence", async () => {
    const property = seedProperty();
    const seller = seedSeller();
    const mandate = seedMandate({ propertyId: property.id, sellerClientId: seller.id });

    seedMembership({ tenantId: TENANT_B, userId: 'agent-2' });

    await expect(updateMandate(TENANT_A, mandate.id, { agentUserId: 'agent-2' })).rejects.toThrow(
      "Le négociateur choisi n'est pas un collaborateur actif de cette agence"
    );

    expect(store.mandates.find(m => m.id === mandate.id)?.agentUserId).toBeNull();
  });
});
