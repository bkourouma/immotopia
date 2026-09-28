/**
 * Tests du service des entités détentrices et de leurs rattachements (lot
 * P4, territoire A2). Prisma est remplacé par un magasin en mémoire (même
 * esprit que `crm-cross-tenant-references.test.ts`) : aucune base requise.
 */

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const store = {
  holdingEntities: [] as Row[],
  propertyHoldings: [] as Row[],
  contacts: [] as Row[],
  properties: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function matchesWhere(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'NOT') {
      return !matchesWhere(row, expected as Row);
    }
    if (expected && typeof expected === 'object' && 'in' in (expected as Row)) {
      return (expected as Row).in.includes(row[key]);
    }
    return row[key] === expected;
  });
}

/** Simule la forme d'un `include` du contrôleur (holdings/children/parent/contact/_count). */
function withIncludes(row: Row | undefined, include: Row | undefined): Row | null {
  if (!row) return null;
  if (!include) return row;
  const holdings = store.propertyHoldings
    .filter(h => h.entityId === row.id)
    .map(h => ({
      ...h,
      property: store.properties.find(p => p.id === h.propertyId) ?? {
        id: h.propertyId,
        title: 'Bien',
        internalReference: 'REF',
        propertyType: 'APARTMENT',
        status: 'ACTIVE'
      }
    }));
  return {
    ...row,
    parentEntity: row.parentEntityId ? (store.holdingEntities.find(e => e.id === row.parentEntityId) ?? null) : null,
    contact: row.contactId ? (store.contacts.find(c => c.id === row.contactId) ?? null) : null,
    children: store.holdingEntities
      .filter(e => e.parentEntityId === row.id)
      .map(e => ({
        id: e.id,
        name: e.name,
        legalForm: e.legalForm
      })),
    holdings,
    _count: { holdings: holdings.length }
  };
}

const holdingEntityDelegate = {
  findFirst: jest.fn(async ({ where, include }: Row) => {
    const row = store.holdingEntities.find(e => matchesWhere(e, where));
    return withIncludes(row, include);
  }),
  findMany: jest.fn(async ({ where }: Row = {}) => store.holdingEntities.filter(e => matchesWhere(e, where ?? {}))),
  count: jest.fn(async ({ where }: Row) => store.holdingEntities.filter(e => matchesWhere(e, where)).length),
  create: jest.fn(async ({ data }: Row) => {
    const created = {
      id: nextId('entity'),
      isActive: true,
      notes: null,
      rccm: null,
      taxId: null,
      contactId: null,
      parentEntityId: null,
      fiscalOwnerKind: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data
    };
    store.holdingEntities.push(created);
    return created;
  }),
  update: jest.fn(async ({ where, data }: Row) => {
    const row = store.holdingEntities.find(e => matchesWhere(e, where));
    if (!row) {
      const err: any = new Error('Record not found');
      err.code = 'P2025';
      err.name = 'PrismaClientKnownRequestError';
      throw err;
    }
    Object.assign(row, data);
    return row;
  }),
  delete: jest.fn(async ({ where }: Row) => {
    const index = store.holdingEntities.findIndex(e => matchesWhere(e, where));
    if (index === -1) {
      const err: any = new Error('Record not found');
      err.code = 'P2025';
      throw err;
    }
    const [removed] = store.holdingEntities.splice(index, 1);
    return removed;
  })
};

const propertyHoldingDelegate = {
  findFirst: jest.fn(async ({ where }: Row) => store.propertyHoldings.find(h => matchesWhere(h, where)) ?? null),
  findMany: jest.fn(async ({ where }: Row = {}) => store.propertyHoldings.filter(h => matchesWhere(h, where ?? {}))),
  count: jest.fn(async ({ where }: Row) => store.propertyHoldings.filter(h => matchesWhere(h, where)).length),
  groupBy: jest.fn(async ({ where }: Row) => {
    const rows = store.propertyHoldings.filter(h => matchesWhere(h, where ?? {}));
    const byProperty = new Map<string, number>();
    for (const row of rows) {
      byProperty.set(row.propertyId, (byProperty.get(row.propertyId) ?? 0) + Number(row.sharePercent));
    }
    return Array.from(byProperty.entries()).map(([propertyId, sum]) => ({
      propertyId,
      _sum: { sharePercent: sum }
    }));
  }),
  create: jest.fn(async ({ data }: Row) => {
    const created = { id: nextId('holding'), notes: null, effectiveFrom: null, createdAt: new Date(), ...data };
    store.propertyHoldings.push(created);
    return created;
  }),
  createMany: jest.fn(async ({ data }: Row) => {
    for (const item of data) {
      store.propertyHoldings.push({
        id: nextId('holding'),
        notes: null,
        effectiveFrom: null,
        createdAt: new Date(),
        ...item
      });
    }
    return { count: data.length };
  }),
  update: jest.fn(async ({ where, data }: Row) => {
    const row = store.propertyHoldings.find(h => matchesWhere(h, where));
    if (!row) {
      const err: any = new Error('Record not found');
      err.code = 'P2025';
      throw err;
    }
    Object.assign(row, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)));
    return row;
  }),
  delete: jest.fn(async ({ where }: Row) => {
    const index = store.propertyHoldings.findIndex(h => matchesWhere(h, where));
    if (index === -1) {
      const err: any = new Error('Record not found');
      err.code = 'P2025';
      throw err;
    }
    const [removed] = store.propertyHoldings.splice(index, 1);
    return removed;
  }),
  deleteMany: jest.fn(async ({ where }: Row) => {
    const before = store.propertyHoldings.length;
    store.propertyHoldings = store.propertyHoldings.filter(h => !matchesWhere(h, where));
    return { count: before - store.propertyHoldings.length };
  })
};

const crmContactDelegate = {
  findFirst: jest.fn(async ({ where, select }: Row) => {
    const row = store.contacts.find(c => matchesWhere(c, where));
    if (!row) return null;
    return select ? { id: row.id } : row;
  })
};

const propertyDelegate = {
  findFirst: jest.fn(async ({ where }: Row) => store.properties.find(p => matchesWhere(p, where)) ?? null)
};

const mockPrisma: Row = {
  holdingEntity: holdingEntityDelegate,
  propertyHolding: propertyHoldingDelegate,
  crmContact: crmContactDelegate,
  property: propertyDelegate,
  $transaction: jest.fn(async (callback: (tx: Row) => Promise<unknown>) => {
    const tx = {
      ...mockPrisma,
      $queryRaw: jest.fn(async (_strings: TemplateStringsArray, propertyId: string, tenantId: string) => {
        const property = store.properties.find(p => p.id === propertyId && p.tenantId === tenantId);
        return property ? [{ id: property.id }] : [];
      })
    };
    return callback(tx);
  })
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import {
  createHoldingEntity,
  updateHoldingEntity,
  createEntityHolding,
  setPropertyHoldings,
  deleteHoldingEntity,
  getHoldingEntityById
} from '../../src/lib/patrimoine/entities/service';

beforeEach(() => {
  store.holdingEntities = [];
  store.propertyHoldings = [];
  store.contacts = [];
  store.properties = [];
  jest.clearAllMocks();
});

describe('entities/service — isolation tenant', () => {
  it("entité d'une autre agence -> 404, `where` de la lecture porte tenantId", async () => {
    store.holdingEntities.push({ id: 'entity-b', tenantId: TENANT_B, name: 'Entité B' });

    await expect(getHoldingEntityById(TENANT_A, 'entity-b')).rejects.toMatchObject({ statusCode: 404 });
    expect(holdingEntityDelegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'entity-b', tenantId: TENANT_A } })
    );
  });

  it("bien d'une autre agence -> 404 lors du rattachement", async () => {
    store.properties.push({ id: 'prop-b', tenantId: TENANT_B, title: 'Bien B' });
    const entity = await createHoldingEntity(TENANT_A, {
      name: 'SCI A',
      legalForm: 'SCI',
      country: 'CI'
    } as any);

    await expect(
      createEntityHolding(TENANT_A, entity.id, { propertyId: 'prop-b', sharePercent: 50 } as any)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("contactId et parentEntityId d'une autre agence -> 404 (création)", async () => {
    store.contacts.push({ id: 'contact-b', tenantId: TENANT_B });
    await expect(
      createHoldingEntity(TENANT_A, {
        name: 'SCI A',
        legalForm: 'SCI',
        country: 'CI',
        contactId: 'contact-b'
      } as any)
    ).rejects.toMatchObject({ statusCode: 404 });

    store.holdingEntities.push({ id: 'entity-b', tenantId: TENANT_B, name: 'Parent B' });
    await expect(
      createHoldingEntity(TENANT_A, {
        name: 'SCI A2',
        legalForm: 'SCI',
        country: 'CI',
        parentEntityId: 'entity-b'
      } as any)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("entité mère d'une autre agence dans le PUT (update) -> 404, `where` de la vérification porte tenantId", async () => {
    const entity = await createHoldingEntity(TENANT_A, { name: 'SCI A', legalForm: 'SCI', country: 'CI' } as any);
    store.holdingEntities.push({ id: 'entity-b', tenantId: TENANT_B, name: 'Parent B' });

    await expect(updateHoldingEntity(TENANT_A, entity.id, { parentEntityId: 'entity-b' } as any)).rejects.toMatchObject(
      { statusCode: 404 }
    );

    // La vérification passe par assertBelongsToTenant : le `where` de la
    // requête de garde porte toujours tenantId.
    expect(holdingEntityDelegate.findFirst.mock.calls.some(([args]: any) => 'tenantId' in (args.where ?? {}))).toBe(
      true
    );
  });

  it("cycle dans l'organigramme -> 400", async () => {
    const parent = await createHoldingEntity(TENANT_A, { name: 'Parent', legalForm: 'SCI', country: 'CI' } as any);
    const child = await createHoldingEntity(TENANT_A, {
      name: 'Enfant',
      legalForm: 'SCI',
      country: 'CI',
      parentEntityId: parent.id
    } as any);

    // Le parent tente de désigner son propre enfant comme entité mère : boucle.
    await expect(updateHoldingEntity(TENANT_A, parent.id, { parentEntityId: child.id } as any)).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it('somme des quotes-parts > 100 -> 400', async () => {
    store.properties.push({ id: 'prop-1', tenantId: TENANT_A, title: 'Bien 1' });
    const entityOne = await createHoldingEntity(TENANT_A, { name: 'E1', legalForm: 'SCI', country: 'CI' } as any);
    const entityTwo = await createHoldingEntity(TENANT_A, { name: 'E2', legalForm: 'SCI', country: 'CI' } as any);

    await createEntityHolding(TENANT_A, entityOne.id, { propertyId: 'prop-1', sharePercent: 60 } as any);

    await expect(
      createEntityHolding(TENANT_A, entityTwo.id, { propertyId: 'prop-1', sharePercent: 50 } as any)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('somme des quotes-parts = 100 est acceptée', async () => {
    store.properties.push({ id: 'prop-1', tenantId: TENANT_A, title: 'Bien 1' });
    const entityOne = await createHoldingEntity(TENANT_A, { name: 'E1', legalForm: 'SCI', country: 'CI' } as any);
    const entityTwo = await createHoldingEntity(TENANT_A, { name: 'E2', legalForm: 'SCI', country: 'CI' } as any);

    await createEntityHolding(TENANT_A, entityOne.id, { propertyId: 'prop-1', sharePercent: 60 } as any);
    await expect(
      createEntityHolding(TENANT_A, entityTwo.id, { propertyId: 'prop-1', sharePercent: 40 } as any)
    ).resolves.toMatchObject({ sharePercent: 40 });
  });

  it('doublon dans le PUT (même entité deux fois) -> 400', async () => {
    store.properties.push({ id: 'prop-1', tenantId: TENANT_A, title: 'Bien 1' });
    const entity = await createHoldingEntity(TENANT_A, { name: 'E1', legalForm: 'SCI', country: 'CI' } as any);

    await expect(
      setPropertyHoldings(TENANT_A, 'prop-1', {
        holdings: [
          { entityId: entity.id, sharePercent: 30 },
          { entityId: entity.id, sharePercent: 20 }
        ]
      } as any)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('POST en double (même entité déjà rattachée au bien) -> 409', async () => {
    store.properties.push({ id: 'prop-1', tenantId: TENANT_A, title: 'Bien 1' });
    const entity = await createHoldingEntity(TENANT_A, { name: 'E1', legalForm: 'SCI', country: 'CI' } as any);
    await createEntityHolding(TENANT_A, entity.id, { propertyId: 'prop-1', sharePercent: 30 } as any);

    await expect(
      createEntityHolding(TENANT_A, entity.id, { propertyId: 'prop-1', sharePercent: 10 } as any)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('suppression avec rattachements existants -> 409', async () => {
    store.properties.push({ id: 'prop-1', tenantId: TENANT_A, title: 'Bien 1' });
    const entity = await createHoldingEntity(TENANT_A, { name: 'E1', legalForm: 'SCI', country: 'CI' } as any);
    await createEntityHolding(TENANT_A, entity.id, { propertyId: 'prop-1', sharePercent: 30 } as any);

    await expect(deleteHoldingEntity(TENANT_A, entity.id)).rejects.toMatchObject({ statusCode: 409 });
  });
});
