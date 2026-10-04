/**
 * Tests des lots, du coût de revient et de la clôture
 * (`lib/finance/site-closing.ts`) — lot 4, sixième et dernier sous-lot.
 *
 * Modèle : `__tests__/unit/finance.salaries.test.ts` (sous-lot précédent).
 *
 * ---------------------------------------------------------------------------
 * Ce qui N'EST PAS simulé, et pourquoi
 * ---------------------------------------------------------------------------
 *
 * `lib/finance/site-cost.ts` (`sumSiteActualCost`) n'est PAS mocké : c'est le
 * VRAI calcul du coût réel — la seule définition du module — qui doit prouver
 * le critère de sortie le plus important du sous-lot, à savoir que
 * `finalCost` reçoit exactement ce que ce calcul rend à l'instant de la
 * clôture. Simuler la somme aurait surtout prouvé que la simulation est
 * juste.
 *
 * `money.ts` n'est pas mocké non plus : la distinction entre `roundMoneyXof`
 * (montant entier) et `roundPercent` (pourcentage à deux décimales) est
 * précisément ce que ces tests vérifient.
 *
 * Seul le client Prisma est remplacé par un magasin en mémoire.
 */

type Row = Record<string, any>;

const store = {
  sites: [] as Row[],
  lots: [] as Row[],
  allocations: [] as Row[],
  invoices: [] as Row[],
  vouchers: [] as Row[],
  salaryNotes: [] as Row[],
  statements: [] as Row[],
  users: [] as Row[],
  properties: [] as Row[],
  valuations: [] as Row[],
  assets: [] as Row[],
  seq: 0
};

/** Lot 040 : le stock du lieu du chantier (bloqueurs A7-R3) et les verrous pris. */
const stockStore = {
  locations: [] as Row[],
  counts: [] as Row[],
  balances: [] as Row[],
  movements: [] as Row[],
  locks: [] as string[]
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${String(store.seq).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Filtre `where` minimal — égalité, `null`, `{ not: … }`, `NOT: { … }`
// ---------------------------------------------------------------------------

function matchValue(actual: any, expected: any): boolean {
  if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) {
    if ('not' in expected) {
      const target = (expected as Row).not;
      return target === null ? actual !== null && actual !== undefined : actual !== target;
    }
    return false;
  }
  if (expected === null) {
    return actual === null || actual === undefined;
  }
  return actual === expected;
}

function matches(row: Row, where: Row = {}): boolean {
  for (const [key, expected] of Object.entries(where ?? {})) {
    if (key === 'NOT') {
      if (matches(row, expected as Row)) return false;
      continue;
    }
    if (!matchValue(row[key], expected)) return false;
  }
  return true;
}

function project(row: Row, select?: Row): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const key of Object.keys(select)) {
    if (key === 'property') {
      out.property = row.propertyId ? (store.properties.find(p => p.id === row.propertyId) ?? null) : null;
      continue;
    }
    out[key] = row[key] ?? null;
  }
  return out;
}

function sortByCreatedAtThenId(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    const da = new Date(a.createdAt).getTime();
    const db = new Date(b.createdAt).getTime();
    if (da !== db) return da - db;
    return String(a.id).localeCompare(String(b.id));
  });
}

const mockPrisma: Row = {
  // Lot 040 : verrou consultatif (`lockStockSiteTx`) et lectures des bloqueurs de stock.
  $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
    stockStore.locks.push(`${strings.join('?')}|${values.join(',')}`);
    return 0;
  }),
  stockLocation: {
    findFirst: jest.fn(async ({ where }: Row) => stockStore.locations.find(row => matches(row, where)) ?? null)
  },
  stockCount: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const { status, ...rest } = where;
      const rows = stockStore.counts
        .filter(row => matches(row, rest))
        .filter(row => (status?.in ? status.in.includes(row.status) : row.status === status))
        .sort((a, b) => (b.validatedAt?.getTime?.() ?? 0) - (a.validatedAt?.getTime?.() ?? 0));
      return rows[0] ?? null;
    }),
    findMany: jest.fn(async ({ where }: Row) => stockStore.counts.filter(row => matches(row, where)))
  },
  stockBalance: {
    count: jest.fn(async ({ where }: Row) => {
      const { quantity, ...rest } = where;
      return stockStore.balances.filter(row => matches(row, rest) && row.quantity > quantity.gt).length;
    })
  },
  stockMovement: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const { type, OR, ...rest } = where;
      const rows = stockStore.movements
        .filter(row => matches(row, rest) && type.in.includes(row.type))
        .filter(row => !OR || OR.some((branch: Row) => matches(row, branch)))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return rows[0] ?? null;
    })
  },

  constructionSite: {
    findFirst: jest.fn(async ({ where, select }: Row) => {
      const row = store.sites.find(site => matches(site, where));
      return row ? project(row, select) : null;
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.sites.filter(site => matches(site, where));
      rows.forEach(row => Object.assign(row, data));
      return { count: rows.length };
    })
  },

  siteLot: {
    findFirst: jest.fn(async ({ where, select }: Row) => {
      const row = store.lots.find(lot => matches(lot, where));
      return row ? project(row, select) : null;
    }),
    findMany: jest.fn(async ({ where, select }: Row) => {
      const rows = sortByCreatedAtThenId(store.lots.filter(lot => matches(lot, where)));
      return rows.map(row => project(row, select));
    }),
    count: jest.fn(async ({ where }: Row) => store.lots.filter(lot => matches(lot, where)).length),
    create: jest.fn(async ({ data, select }: Row) => {
      store.seq += 1;
      const created = {
        id: nextId('lot'),
        surfaceArea: null,
        manualSharePercent: null,
        propertyId: null,
        createdAt: new Date(2026, 0, 1, 0, 0, store.seq),
        ...data
      };
      store.lots.push(created);
      return project(created, select);
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.lots.filter(lot => matches(lot, where));
      rows.forEach(row => Object.assign(row, data));
      return { count: rows.length };
    }),
    deleteMany: jest.fn(async ({ where }: Row) => {
      const kept = store.lots.filter(lot => !matches(lot, where));
      const removed = store.lots.length - kept.length;
      store.lots = kept;
      return { count: removed };
    })
  },

  // Le VRAI `sumSiteActualCost` tape ici : imputations validées et non annulées.
  costAllocation: {
    aggregate: jest.fn(async ({ where }: Row) => {
      const rows = store.allocations.filter(allocation => matches(allocation, where));
      const total = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
      return { _sum: { amount: rows.length === 0 ? null : total } };
    })
  },

  supplierInvoice: {
    count: jest.fn(async ({ where }: Row) => store.invoices.filter(row => matches(row, where)).length),
    findMany: jest.fn(async ({ where }: Row) =>
      store.invoices
        .filter(row => matches(row, where))
        .map(row => ({ id: row.id ?? 'inv', reference: row.reference ?? 'FRS-X' }))
    )
  },
  cashVoucher: {
    count: jest.fn(async ({ where }: Row) => store.vouchers.filter(row => matches(row, where)).length)
  },
  salaryNote: {
    count: jest.fn(async ({ where }: Row) => store.salaryNotes.filter(row => matches(row, where)).length)
  },
  progressStatement: {
    // La situation d'avancement n'a pas de `siteId` : elle est lue par son
    // contrat, `contract: { siteId }` — par le client Prisma, sans rien
    // importer de `contractors.ts`.
    count: jest.fn(async ({ where }: Row) => {
      const { contract, ...rest } = where ?? {};
      return store.statements.filter(
        row => matches(row, rest) && (!contract?.siteId || row.contractSiteId === contract.siteId)
      ).length;
    })
  },

  user: {
    findFirst: jest.fn(async ({ where, select }: Row) => {
      const row = store.users.find(user => matches(user, where));
      return row ? project(row, select) : null;
    })
  },

  property: {
    findFirst: jest.fn(async ({ where, select }: Row) => {
      const row = store.properties.find(property => matches(property, where));
      return row ? project(row, select) : null;
    }),
    create: jest.fn(async ({ data, select }: Row) => {
      const created = { id: nextId('bien'), ...data };
      store.properties.push(created);
      return project(created, select);
    })
  },

  asset: {
    findUnique: jest.fn(
      async ({ where }: Row) =>
        store.assets.find(a => a.propertyId === where.propertyId && a.tenantId === where.tenantId) ?? null
    ),
    findFirst: jest.fn(async ({ where }: Row) => {
      const found = store.assets.find(a => a.id === where.id && a.tenantId === where.tenantId);
      return found ? { details: found.details } : null;
    }),
    upsert: jest.fn(async ({ where, create }: Row) => {
      const found = store.assets.find(a => a.propertyId === where.propertyId && a.tenantId === where.tenantId);
      if (found) return found;
      const row = { id: nextId('actif'), ...create };
      store.assets.push(row);
      return row;
    })
  },

  assetValuation: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('evaluation'), ...data };
      store.valuations.push(created);
      return created;
    })
  }
};

// Registre des lots de l'abonnement (vague 2, lot B) : remplace par des
// espions. Son comportement est couvert par lot-registry.sync.test.ts ; ici,
// on verifie seulement que chaque operation l'appelle dans sa transaction.
jest.mock('../../src/services/lot-registry-service', () => ({
  syncLotActivationsTx: jest.fn(async () => ({ activated: [], deactivated: [], quota: null })),
  assertCapacityTx: jest.fn(async () => ({ decision: 'ALLOW' })),
  resolveLotScope: jest.fn(async (_tx: unknown, _tenantId: string, scope: unknown) => scope),
  ACTIVE_SYNDICATE_STATUSES: ['ACTIVE', 'IN_DISPUTE'],
  LOT_QUOTA_REACHED_REASON: 'Quota de lots atteint'
}));
const mockLotRegistry = jest.requireMock('../../src/services/lot-registry-service') as {
  syncLotActivationsTx: jest.Mock;
  assertCapacityTx: jest.Mock;
};

jest.mock('../../src/utils/database', () => ({
  prisma: mockPrisma,
  get default() {
    return mockPrisma;
  }
}));

import {
  assertSiteOpenTx,
  capitalizeSiteLotTx,
  closeSiteTx,
  createSiteLotTx,
  deleteSiteLotTx,
  getSiteClosureBlockers,
  getSiteClosureBlockersForCaller,
  getSiteCostBreakdown,
  listSiteLots,
  reopenSiteTx,
  setLotAllocationMethodTx,
  updateSiteLotTx
} from '../../src/lib/finance/site-closing';

const TENANT = 'tenant-A';
const OTHER_TENANT = 'tenant-B';
const USER = 'user-1';

const tx: any = mockPrisma;

function resetStore(): void {
  store.sites = [];
  store.lots = [];
  store.allocations = [];
  store.invoices = [];
  store.vouchers = [];
  store.salaryNotes = [];
  store.statements = [];
  store.users = [];
  store.properties = [];
  store.valuations = [];
  store.assets = [];
  store.seq = 0;
  stockStore.locations = [];
  stockStore.counts = [];
  stockStore.balances = [];
  stockStore.movements = [];
  stockStore.locks = [];
}

function seedSite(overrides: Row = {}): Row {
  const site = {
    id: nextId('chantier'),
    tenantId: TENANT,
    name: 'Résidence Kipé',
    status: 'IN_PROGRESS',
    closedAt: null,
    finalCost: null,
    closedByUserId: null,
    lotAllocationMethod: null,
    ...overrides
  };
  store.sites.push(site);
  return site;
}

/** Une imputation VALIDÉE et non annulée : celle que `sumSiteActualCost` compte. */
function seedActualCost(siteId: string, amount: number): void {
  store.allocations.push({
    id: nextId('imputation'),
    tenantId: TENANT,
    siteId,
    amount,
    validatedAt: new Date('2026-06-01'),
    voidedAt: null
  });
}

async function seedLots(
  siteId: string,
  lots: Array<{ name: string; surfaceArea?: number; manualSharePercent?: number }>
) {
  const created = [];
  for (const lot of lots) {
    created.push(
      await createSiteLotTx(tx, TENANT, {
        siteId,
        name: lot.name,
        surfaceArea: lot.surfaceArea ?? null,
        manualSharePercent: lot.manualSharePercent ?? null
      })
    );
  }
  return created;
}

beforeEach(() => {
  resetStore();
  jest.clearAllMocks();
  store.users.push({ id: USER, fullName: 'Fatoumata Camara', email: 'fatoumata@example.gn' });
});

// ===========================================================================
// A. `assertSiteOpenTx` — la garde qui rend `finalCost` vrai
// ===========================================================================

describe('assertSiteOpenTx', () => {
  it('laisse passer un chantier ouvert', async () => {
    const site = seedSite();
    await expect(assertSiteOpenTx(tx, TENANT, site.id)).resolves.toBeUndefined();
  });

  it('lève NotFoundError quand le chantier n’existe pas — audit multi-tenant du 24/09/2026 (lot B1)', async () => {
    await expect(assertSiteOpenTx(tx, TENANT, 'chantier-fantome')).rejects.toMatchObject({ status: 404 });
  });

  it('refuse toute écriture sur un chantier clos (409)', async () => {
    const site = seedSite({ closedAt: new Date('2026-07-01'), status: 'CLOSED', finalCost: 500_000 });

    await expect(assertSiteOpenTx(tx, TENANT, site.id)).rejects.toMatchObject({ status: 409 });
  });

  it('ne voit pas le chantier d’un AUTRE tenant — même NotFoundError qu’un chantier inexistant', async () => {
    const site = seedSite({ tenantId: OTHER_TENANT, closedAt: new Date('2026-07-01') });

    await expect(assertSiteOpenTx(tx, TENANT, site.id)).rejects.toMatchObject({ status: 404 });
  });

  it('laisse de nouveau passer après réouverture', async () => {
    const site = seedSite({ closedAt: new Date('2026-07-01'), status: 'CLOSED', finalCost: 500_000 });

    await reopenSiteTx(tx, TENANT, site.id);

    await expect(assertSiteOpenTx(tx, TENANT, site.id)).resolves.toBeUndefined();
  });
});

// ===========================================================================
// B. Les lots — création, correction, suppression
// ===========================================================================

describe('createSiteLotTx', () => {
  it('ajoute un lot à un chantier ouvert', async () => {
    const site = seedSite();

    const lot = await createSiteLotTx(tx, TENANT, { siteId: site.id, name: 'Villa A', surfaceArea: 120 });

    expect(lot).toMatchObject({ siteId: site.id, name: 'Villa A', surfaceArea: 120, currency: 'XOF' });
    // Aucune clé encore choisie : la quote-part vaut zéro (contrat).
    expect(lot.sharePercent).toBe(0);
    expect(lot.costPrice).toBe(0);
    expect(lot.propertyId).toBeNull();
  });

  it('refuse un chantier clos (409)', async () => {
    const site = seedSite({ closedAt: new Date('2026-07-01'), status: 'CLOSED', finalCost: 1_000_000 });

    await expect(createSiteLotTx(tx, TENANT, { siteId: site.id, name: 'Villa A' })).rejects.toMatchObject({
      status: 409
    });
  });

  it('refuse un nom déjà porté par un lot du même chantier, SANS tenter l’écriture (409)', async () => {
    const site = seedSite();
    await createSiteLotTx(tx, TENANT, { siteId: site.id, name: 'Villa A' });
    (mockPrisma.siteLot.create as jest.Mock).mockClear();

    await expect(createSiteLotTx(tx, TENANT, { siteId: site.id, name: 'Villa A' })).rejects.toMatchObject({
      status: 409
    });
    // Lecture AVANT écriture : en PostgreSQL une commande en échec condamne
    // toute la transaction, « tenter puis rattraper le P2002 » ne marche pas.
    expect(mockPrisma.siteLot.create).not.toHaveBeenCalled();
  });

  it('accepte le même nom de lot sur DEUX chantiers différents', async () => {
    const premier = seedSite({ name: 'Kipé' });
    const second = seedSite({ name: 'Lambanyi' });

    await createSiteLotTx(tx, TENANT, { siteId: premier.id, name: 'Villa A' });

    await expect(createSiteLotTx(tx, TENANT, { siteId: second.id, name: 'Villa A' })).resolves.toMatchObject({
      name: 'Villa A'
    });
  });

  it('refuse une quote-part qui ferait dépasser cent pour cent (409)', async () => {
    const site = seedSite();
    await seedLots(site.id, [
      { name: 'Villa A', manualSharePercent: 60 },
      { name: 'Villa B', manualSharePercent: 30 }
    ]);

    await expect(
      createSiteLotTx(tx, TENANT, { siteId: site.id, name: 'Villa C', manualSharePercent: 20 })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('exige la surface quand le chantier répartit déjà à la surface (400)', async () => {
    const site = seedSite();
    await seedLots(site.id, [{ name: 'Villa A', surfaceArea: 100 }]);
    await setLotAllocationMethodTx(tx, TENANT, site.id, 'SURFACE');

    await expect(createSiteLotTx(tx, TENANT, { siteId: site.id, name: 'Villa B' })).rejects.toMatchObject({
      status: 400
    });
  });

  it('refuse une surface négative ou nulle (400)', async () => {
    const site = seedSite();

    await expect(
      createSiteLotTx(tx, TENANT, { siteId: site.id, name: 'Villa A', surfaceArea: 0 })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('updateSiteLotTx', () => {
  it('corrige le nom et la surface', async () => {
    const site = seedSite();
    const [lot] = await seedLots(site.id, [{ name: 'Villa A', surfaceArea: 100 }]);

    const updated = await updateSiteLotTx(tx, TENANT, lot.id, { name: 'Villa A1', surfaceArea: 150 });

    expect(updated).toMatchObject({ name: 'Villa A1', surfaceArea: 150 });
  });

  it('distingue « ne touche pas à la surface » de « efface la surface »', async () => {
    const site = seedSite();
    const [lot] = await seedLots(site.id, [{ name: 'Villa A', surfaceArea: 100 }]);

    const inchange = await updateSiteLotTx(tx, TENANT, lot.id, { name: 'Villa A1' });
    expect(inchange.surfaceArea).toBe(100);

    const efface = await updateSiteLotTx(tx, TENANT, lot.id, { surfaceArea: null });
    expect(efface.surfaceArea).toBeNull();
  });

  it('refuse un lot qui a basculé au patrimoine (409)', async () => {
    const site = seedSite();
    const [lot] = await seedLots(site.id, [{ name: 'Villa A' }]);
    store.lots.find(row => row.id === lot.id)!.propertyId = 'bien-x';

    await expect(updateSiteLotTx(tx, TENANT, lot.id, { name: 'Villa Z' })).rejects.toMatchObject({ status: 409 });
  });

  it('refuse aussi quand c’est un lot VOISIN qui a basculé — corriger celui-ci changerait son coût (409)', async () => {
    const site = seedSite();
    const [premier, second] = await seedLots(site.id, [{ name: 'Villa A' }, { name: 'Villa B' }]);
    store.lots.find(row => row.id === premier.id)!.propertyId = 'bien-x';

    await expect(updateSiteLotTx(tx, TENANT, second.id, { name: 'Villa B1' })).rejects.toMatchObject({ status: 409 });
  });
});

describe('deleteSiteLotTx', () => {
  it('supprime un lot qui n’a pas basculé', async () => {
    const site = seedSite();
    const [lot] = await seedLots(site.id, [{ name: 'Villa A' }]);

    await deleteSiteLotTx(tx, TENANT, lot.id);

    expect(store.lots).toHaveLength(0);
  });

  it('refuse de supprimer un lot qui a basculé (409)', async () => {
    const site = seedSite();
    const [lot] = await seedLots(site.id, [{ name: 'Villa A' }]);
    store.lots.find(row => row.id === lot.id)!.propertyId = 'bien-x';

    await expect(deleteSiteLotTx(tx, TENANT, lot.id)).rejects.toMatchObject({ status: 409 });
    expect(store.lots).toHaveLength(1);
  });
});

// ===========================================================================
// C. LE TEST QUI COMPTE : la somme des coûts de revient vaut EXACTEMENT le
//    coût du chantier, avec un coût qui ne se divise pas par trois.
// ===========================================================================

describe('la somme des coûts de revient vaut exactement le coût du chantier', () => {
  const COUT = 1_000_000;

  it('EQUAL — trois lots, un million : le reliquat va au PREMIER lot', async () => {
    const site = seedSite();
    seedActualCost(site.id, COUT);
    await seedLots(site.id, [{ name: 'Villa A' }, { name: 'Villa B' }, { name: 'Villa C' }]);
    await setLotAllocationMethodTx(tx, TENANT, site.id, 'EQUAL');

    const lots = await listSiteLots(TENANT, site.id);

    expect(lots.map(lot => lot.costPrice)).toEqual([333_334, 333_333, 333_333]);
    expect(lots.reduce((sum, lot) => sum + lot.costPrice, 0)).toBe(COUT);
    // Tous les coûts sont des ENTIERS : le franc CFA n'a pas de subdivision.
    expect(lots.every(lot => Number.isInteger(lot.costPrice))).toBe(true);
    // Le pourcentage, lui, garde ses deux décimales : un pourcentage n'est
    // pas un montant.
    expect(lots.map(lot => lot.sharePercent)).toEqual([33.33, 33.33, 33.33]);
  });

  it('SURFACE — des surfaces qui ne tombent pas rond', async () => {
    const site = seedSite();
    seedActualCost(site.id, COUT);
    await seedLots(site.id, [
      { name: 'Villa A', surfaceArea: 101.37 },
      { name: 'Villa B', surfaceArea: 98.42 },
      { name: 'Villa C', surfaceArea: 87.91 }
    ]);
    await setLotAllocationMethodTx(tx, TENANT, site.id, 'SURFACE');

    const lots = await listSiteLots(TENANT, site.id);

    expect(lots.reduce((sum, lot) => sum + lot.costPrice, 0)).toBe(COUT);
    expect(lots.every(lot => Number.isInteger(lot.costPrice))).toBe(true);
    // Le plus grand lot coûte le plus cher : l'ordre reste celui des surfaces.
    expect(lots[0].costPrice).toBeGreaterThan(lots[2].costPrice);
  });

  it('MANUAL — 33,33 / 33,33 / 33,34', async () => {
    const site = seedSite();
    seedActualCost(site.id, COUT);
    await seedLots(site.id, [
      { name: 'Villa A', manualSharePercent: 33.33 },
      { name: 'Villa B', manualSharePercent: 33.33 },
      { name: 'Villa C', manualSharePercent: 33.34 }
    ]);
    await setLotAllocationMethodTx(tx, TENANT, site.id, 'MANUAL');

    const lots = await listSiteLots(TENANT, site.id);

    expect(lots.map(lot => lot.manualSharePercent)).toEqual([33.33, 33.33, 33.34]);
    expect(lots.reduce((sum, lot) => sum + lot.costPrice, 0)).toBe(COUT);
    // La quote-part manuelle EST la donnée : le coût en dérive directement.
    expect(lots[2].costPrice).toBe(333_400);
  });

  it('un coût impair sur deux lots en parts égales tombe encore juste', async () => {
    const site = seedSite();
    seedActualCost(site.id, 999_999);
    await seedLots(site.id, [{ name: 'Villa A' }, { name: 'Villa B' }]);
    await setLotAllocationMethodTx(tx, TENANT, site.id, 'EQUAL');

    const lots = await listSiteLots(TENANT, site.id);

    expect(lots.reduce((sum, lot) => sum + lot.costPrice, 0)).toBe(999_999);
  });
});

// ===========================================================================
// D. La clé de répartition — et la somme des parts sur les valeurs ARRONDIES
// ===========================================================================

describe('setLotAllocationMethodTx', () => {
  it('EQUAL n’exige rien des lots', async () => {
    const site = seedSite();
    await seedLots(site.id, [{ name: 'Villa A' }, { name: 'Villa B' }]);

    await expect(setLotAllocationMethodTx(tx, TENANT, site.id, 'EQUAL')).resolves.toHaveLength(2);
    expect(store.sites.find(row => row.id === site.id)!.lotAllocationMethod).toBe('EQUAL');
  });

  it('SURFACE refuse tant qu’un lot n’a pas de surface (400), et NE fixe pas la clé', async () => {
    const site = seedSite();
    await seedLots(site.id, [{ name: 'Villa A', surfaceArea: 100 }, { name: 'Villa B' }]);

    await expect(setLotAllocationMethodTx(tx, TENANT, site.id, 'SURFACE')).rejects.toMatchObject({ status: 400 });
    expect(store.sites.find(row => row.id === site.id)!.lotAllocationMethod).toBeNull();
  });

  it('MANUAL accepte 33,33 / 33,33 / 33,34 — la somme des ARRONDIS vaut cent', async () => {
    const site = seedSite();
    await seedLots(site.id, [
      { name: 'Villa A', manualSharePercent: 33.33 },
      { name: 'Villa B', manualSharePercent: 33.33 },
      { name: 'Villa C', manualSharePercent: 33.34 }
    ]);

    await expect(setLotAllocationMethodTx(tx, TENANT, site.id, 'MANUAL')).resolves.toHaveLength(3);
  });

  it('MANUAL REFUSE 33,333 / 33,333 / 33,334 : les valeurs BRUTES font cent, les valeurs STOCKÉES font 99,99', async () => {
    const site = seedSite();
    await seedLots(site.id, [
      { name: 'Villa A', manualSharePercent: 33.333 },
      { name: 'Villa B', manualSharePercent: 33.333 },
      { name: 'Villa C', manualSharePercent: 33.334 }
    ]);

    // Ce qui est stocké, c'est l'arrondi à deux décimales.
    expect(store.lots.map(lot => lot.manualSharePercent)).toEqual([33.33, 33.33, 33.33]);

    // Et c'est sur CES valeurs que la somme se vérifie. Défaut n°1 du moteur
    // comptable : sommer les valeurs brutes aurait laissé passer 100.
    await expect(setLotAllocationMethodTx(tx, TENANT, site.id, 'MANUAL')).rejects.toMatchObject({ status: 400 });
    expect(store.sites.find(row => row.id === site.id)!.lotAllocationMethod).toBeNull();
  });

  it('MANUAL refuse un chantier sans aucun lot (400)', async () => {
    const site = seedSite();

    await expect(setLotAllocationMethodTx(tx, TENANT, site.id, 'MANUAL')).rejects.toMatchObject({ status: 400 });
  });

  it('refuse de changer la clé dès qu’un lot a basculé (409)', async () => {
    const site = seedSite();
    const [lot] = await seedLots(site.id, [{ name: 'Villa A' }, { name: 'Villa B' }]);
    store.lots.find(row => row.id === lot.id)!.propertyId = 'bien-x';

    await expect(setLotAllocationMethodTx(tx, TENANT, site.id, 'EQUAL')).rejects.toMatchObject({ status: 409 });
  });
});

// ===========================================================================
// E. Le coût de revient vu du chantier
// ===========================================================================

describe('getSiteCostBreakdown', () => {
  it('ne répartit rien et expose tout en non réparti quand le chantier n’a aucun lot', async () => {
    const site = seedSite();
    seedActualCost(site.id, 750_000);

    const breakdown = await getSiteCostBreakdown(TENANT, site.id);

    expect(breakdown).toMatchObject({
      siteId: site.id,
      siteLabel: 'Résidence Kipé',
      isClosed: false,
      totalCost: 750_000,
      allocationMethod: null,
      unallocatedCost: 750_000,
      currency: 'XOF'
    });
    expect(breakdown.lots).toHaveLength(0);
  });

  it('ne répartit rien tant qu’aucune clé n’est choisie, même avec des lots', async () => {
    const site = seedSite();
    seedActualCost(site.id, 750_000);
    await seedLots(site.id, [{ name: 'Villa A' }, { name: 'Villa B' }]);

    const breakdown = await getSiteCostBreakdown(TENANT, site.id);

    expect(breakdown.lots.map(lot => lot.sharePercent)).toEqual([0, 0]);
    expect(breakdown.lots.map(lot => lot.costPrice)).toEqual([0, 0]);
    expect(breakdown.unallocatedCost).toBe(750_000);
  });

  it('ne laisse RIEN de non réparti dès qu’une clé s’applique', async () => {
    const site = seedSite();
    seedActualCost(site.id, 1_000_000);
    await seedLots(site.id, [{ name: 'Villa A' }, { name: 'Villa B' }, { name: 'Villa C' }]);
    await setLotAllocationMethodTx(tx, TENANT, site.id, 'EQUAL');

    const breakdown = await getSiteCostBreakdown(TENANT, site.id);

    expect(breakdown.unallocatedCost).toBe(0);
    expect(breakdown.lots.reduce((sum, lot) => sum + lot.costPrice, 0)).toBe(breakdown.totalCost);
  });

  it('ignore les imputations en brouillon et les imputations annulées', async () => {
    const site = seedSite();
    seedActualCost(site.id, 400_000);
    store.allocations.push(
      { id: nextId('imputation'), tenantId: TENANT, siteId: site.id, amount: 999, validatedAt: null, voidedAt: null },
      {
        id: nextId('imputation'),
        tenantId: TENANT,
        siteId: site.id,
        amount: 888,
        validatedAt: new Date(),
        voidedAt: new Date()
      }
    );

    const breakdown = await getSiteCostBreakdown(TENANT, site.id);

    expect(breakdown.totalCost).toBe(400_000);
  });

  it('sur un chantier clos, part du coût FIGÉ et non du coût courant', async () => {
    const site = seedSite({ closedAt: new Date('2026-07-01'), status: 'CLOSED', finalCost: 600_000 });
    // Une imputation arrivée après coup : elle ne doit PAS bouger le total.
    seedActualCost(site.id, 900_000);

    const breakdown = await getSiteCostBreakdown(TENANT, site.id);

    expect(breakdown.isClosed).toBe(true);
    expect(breakdown.totalCost).toBe(600_000);
  });

  it('refuse un chantier d’un autre tenant (404)', async () => {
    const site = seedSite({ tenantId: OTHER_TENANT });

    await expect(getSiteCostBreakdown(TENANT, site.id)).rejects.toMatchObject({ status: 404 });
  });
});

// ===========================================================================
// F. Les bloqueurs de clôture — et la preuve que les DEUX chemins s'accordent
// ===========================================================================

function seedAllFourDraftPieces(siteId: string): void {
  store.invoices.push({ id: nextId('facture'), tenantId: TENANT, siteId, status: 'DRAFT' });
  store.invoices.push({ id: nextId('facture'), tenantId: TENANT, siteId, status: 'DRAFT' });
  store.vouchers.push({ id: nextId('caisse'), tenantId: TENANT, siteId, validatedAt: null });
  store.salaryNotes.push({ id: nextId('salaire'), tenantId: TENANT, siteId, status: 'DRAFT' });
  store.statements.push({ id: nextId('situation'), tenantId: TENANT, contractSiteId: siteId, status: 'DRAFT' });
}

describe('getSiteClosureBlockers', () => {
  it('ne liste rien quand tout est validé', async () => {
    const site = seedSite();
    store.invoices.push({ id: nextId('facture'), tenantId: TENANT, siteId: site.id, status: 'VALIDATED' });
    store.vouchers.push({ id: nextId('caisse'), tenantId: TENANT, siteId: site.id, validatedAt: new Date() });
    store.salaryNotes.push({ id: nextId('salaire'), tenantId: TENANT, siteId: site.id, status: 'VALIDATED' });
    store.statements.push({
      id: nextId('situation'),
      tenantId: TENANT,
      contractSiteId: site.id,
      status: 'VALIDATED'
    });

    await expect(getSiteClosureBlockers(TENANT, site.id)).resolves.toEqual([]);
  });

  it('liste les quatre natures de pièces brouillon, avec leur compte', async () => {
    const site = seedSite();
    seedAllFourDraftPieces(site.id);

    const blockers = await getSiteClosureBlockers(TENANT, site.id);

    expect(blockers.map(blocker => blocker.count)).toEqual([2, 1, 1, 1]);
    expect(blockers[0].message).toContain('factures fournisseur');
    expect(blockers[1].message).toContain('pièce de caisse');
    expect(blockers[2].message).toContain('note de salaire');
    expect(blockers[3].message).toContain("situation d'avancement");
  });

  it('nomme les factures brouillon bloquantes et propose de les annuler (BUG-042)', async () => {
    const site = seedSite();
    store.invoices.push({ id: 'inv-1', tenantId: TENANT, siteId: site.id, status: 'DRAFT', reference: 'FRS-INT-001' });

    const [blocker] = await getSiteClosureBlockers(TENANT, site.id);

    expect(blocker.message).toContain('annulez-la');
    expect(blocker.message).toContain('FRS-INT-001');
    expect(blocker.references).toEqual(['FRS-INT-001']);
    expect(blocker.documentIds).toEqual(['inv-1']);
    expect(blocker.documentType).toBe('SUPPLIER_INVOICE');
  });

  it('lit la situation d’avancement par son CONTRAT, jamais par un siteId qu’elle n’a pas', async () => {
    const site = seedSite();
    const autre = seedSite({ name: 'Lambanyi' });
    store.statements.push({ id: nextId('situation'), tenantId: TENANT, contractSiteId: autre.id, status: 'DRAFT' });

    await expect(getSiteClosureBlockers(TENANT, site.id)).resolves.toEqual([]);
    await expect(getSiteClosureBlockers(TENANT, autre.id)).resolves.toHaveLength(1);
  });

  it('n’emploie AUCUN libellé comptable à l’écran (principe P-1)', async () => {
    const site = seedSite();
    seedAllFourDraftPieces(site.id);

    const blockers = await getSiteClosureBlockers(TENANT, site.id);

    for (const blocker of blockers) {
      expect(blocker.message.toLowerCase()).not.toMatch(/débit|crédit|debit|credit/);
    }
  });
});

describe('closeSiteTx applique EXACTEMENT les bloqueurs que getSiteClosureBlockers liste', () => {
  it('les deux chemins s’accordent, message pour message', async () => {
    const site = seedSite();
    seedAllFourDraftPieces(site.id);

    const listes = await getSiteClosureBlockers(TENANT, site.id);
    expect(listes).toHaveLength(4);

    const refus: any = await closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER }).catch(error => error);

    expect(refus.statusCode).toBe(409);
    expect(refus.code).toBe('CONFLICT');
    // Les bloqueurs appliqués sont les bloqueurs listés — mêmes messages,
    // mêmes comptes, même ordre. Ce serait cruel d'en lister puis d'en
    // appliquer d'autres (contrat).
    expect(refus.data.blockers).toEqual(listes);
    expect(store.sites.find(row => row.id === site.id)!.closedAt).toBeNull();
  });

  it('et s’accordent AUSSI quand il n’y a plus rien à bloquer', async () => {
    const site = seedSite();
    seedActualCost(site.id, 250_000);

    await expect(getSiteClosureBlockers(TENANT, site.id)).resolves.toEqual([]);
    await expect(closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER })).resolves.toMatchObject({
      finalCost: 250_000
    });
  });

  it('une seule des quatre natures suffit à refuser', async () => {
    const site = seedSite();
    store.vouchers.push({ id: nextId('caisse'), tenantId: TENANT, siteId: site.id, validatedAt: null });

    const listes = await getSiteClosureBlockers(TENANT, site.id);
    const refus: any = await closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER }).catch(error => error);

    expect(listes).toHaveLength(1);
    expect(refus.data.blockers).toEqual(listes);
  });
});

// ===========================================================================
// G. La clôture
// ===========================================================================

describe('closeSiteTx', () => {
  it('fige `finalCost` sur ce que rend `sumSiteActualCost`, à cet instant', async () => {
    const site = seedSite();
    seedActualCost(site.id, 700_000);
    seedActualCost(site.id, 300_000);

    const closure = await closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER });

    expect(closure).toMatchObject({
      siteId: site.id,
      siteLabel: 'Résidence Kipé',
      finalCost: 1_000_000,
      closedByLabel: 'Fatoumata Camara',
      currency: 'XOF'
    });
    expect(closure.closedAt).toBeInstanceOf(Date);

    const stored = store.sites.find(row => row.id === site.id)!;
    expect(stored.status).toBe('CLOSED');
    expect(stored.finalCost).toBe(1_000_000);
    expect(stored.closedByUserId).toBe(USER);
    expect(stored.closedAt).toBeInstanceOf(Date);
  });

  it('fige zéro sur un chantier sans aucune imputation, plutôt que de refuser', async () => {
    const site = seedSite();

    await expect(closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER })).resolves.toMatchObject({ finalCost: 0 });
  });

  it('rend les lots avec leur coût de revient définitif', async () => {
    const site = seedSite();
    seedActualCost(site.id, 1_000_000);
    await seedLots(site.id, [{ name: 'Villa A' }, { name: 'Villa B' }, { name: 'Villa C' }]);
    await setLotAllocationMethodTx(tx, TENANT, site.id, 'EQUAL');

    const closure = await closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER });

    expect(closure.lots.reduce((sum, lot) => sum + lot.costPrice, 0)).toBe(1_000_000);
  });

  it('refuse un chantier déjà clos, plutôt que de re-figer un coût (409)', async () => {
    const site = seedSite();
    seedActualCost(site.id, 500_000);
    await closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER });

    seedActualCost(site.id, 400_000);
    await expect(closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER })).rejects.toMatchObject({ status: 409 });
    expect(store.sites.find(row => row.id === site.id)!.finalCost).toBe(500_000);
  });

  it('refuse un chantier introuvable (404)', async () => {
    await expect(closeSiteTx(tx, TENANT, 'chantier-fantome', { closedByUserId: USER })).rejects.toMatchObject({
      status: 404
    });
  });
});

// ===========================================================================
// G bis. Lot 040 — les trois bloqueurs de stock (A7-R3) et le verrou (A7-R3 bis)
// ===========================================================================

describe('closeSiteTx — bloqueurs de stock du lot 040', () => {
  const MINUTE = 60_000;

  function seedSiteLocation(siteId: string): Row {
    const location = { id: nextId('lieu'), tenantId: TENANT, siteId, kind: 'SITE' };
    stockStore.locations.push(location);
    return location;
  }

  function seedMovement(locationId: string, overrides: Row): Row {
    const movement = {
      id: nextId('mouvement'),
      tenantId: TENANT,
      locationId,
      isDecrease: false,
      stockCountId: null,
      createdAt: new Date(),
      ...overrides
    };
    stockStore.movements.push(movement);
    return movement;
  }

  function seedValidatedClosing(locationId: string, validatedAt: Date): Row {
    const count = {
      id: nextId('inventaire'),
      tenantId: TENANT,
      locationId,
      kind: 'CLOSING',
      status: 'VALIDATED',
      validatedAt
    };
    stockStore.counts.push(count);
    return count;
  }

  const kinds = (blockers: Array<{ documentType?: string }>) => blockers.map(blocker => blocker.documentType);

  it('A7-6 : 12 sacs sur le lieu → STOCK_RESIDUAL et STOCK_CLOSING_COUNT_MISSING ; la clôture est refusée', async () => {
    const site = seedSite();
    const lieu = seedSiteLocation(site.id);
    stockStore.balances.push({ tenantId: TENANT, locationId: lieu.id, itemId: 'ciment', quantity: 12 });
    seedMovement(lieu.id, { type: 'RECEIPT', createdAt: new Date(Date.now() - 10 * MINUTE) });

    const blockers = await getSiteClosureBlockers(TENANT, site.id);
    expect(kinds(blockers)).toEqual(['STOCK_RESIDUAL', 'STOCK_CLOSING_COUNT_MISSING']);
    expect(blockers[0]).toEqual({
      message:
        "Le lieu de stockage du chantier porte encore du stock : faites l'inventaire de clôture, puis transférez le reste vers un magasin.",
      count: 1,
      documentIds: [lieu.id],
      documentType: 'STOCK_RESIDUAL'
    });
    expect(blockers[1]).toMatchObject({
      message:
        "Le lieu de stockage du chantier n'a pas d'inventaire de clôture validé depuis sa dernière entrée de marchandise.",
      documentIds: [lieu.id]
    });

    const refus: any = await closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER }).catch(error => error);
    expect(refus).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    expect(refus.data.blockers).toEqual(blockers);

    // Inventaire de clôture validé (qui constate 10 sacs), puis transfert des 10 vers un magasin.
    const closing = seedValidatedClosing(lieu.id, new Date(Date.now() - 2 * MINUTE));
    seedMovement(lieu.id, { type: 'ADJUSTMENT', isDecrease: true, stockCountId: closing.id });
    seedMovement(lieu.id, { type: 'TRANSFER', isDecrease: true });
    stockStore.balances[0].quantity = 0;

    await expect(getSiteClosureBlockers(TENANT, site.id)).resolves.toEqual([]);
    await expect(closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER })).resolves.toMatchObject({
      siteId: site.id
    });
  });

  it('A7-7 : une réception APRÈS l’inventaire de clôture fait revenir STOCK_CLOSING_COUNT_MISSING', async () => {
    const site = seedSite();
    const lieu = seedSiteLocation(site.id);
    seedValidatedClosing(lieu.id, new Date(Date.now() - 10 * MINUTE));
    seedMovement(lieu.id, { type: 'RECEIPT', createdAt: new Date(Date.now() - 5 * MINUTE) });
    seedMovement(lieu.id, { type: 'ISSUE', isDecrease: true, createdAt: new Date(Date.now() - 4 * MINUTE) });

    expect(kinds(await getSiteClosureBlockers(TENANT, site.id))).toEqual(['STOCK_CLOSING_COUNT_MISSING']);
  });

  it('l’ajustement en hausse écrit par l’inventaire de clôture lui-même ne compte pas comme une entrée', async () => {
    const site = seedSite();
    const lieu = seedSiteLocation(site.id);
    const closing = seedValidatedClosing(lieu.id, new Date(Date.now() - MINUTE));
    seedMovement(lieu.id, { type: 'ADJUSTMENT', isDecrease: false, stockCountId: closing.id, createdAt: new Date() });

    expect(await getSiteClosureBlockers(TENANT, site.id)).toEqual([]);
  });

  it('STOCK_COUNT : un inventaire DRAFT ou COUNTED sur le lieu bloque, son identifiant est rendu', async () => {
    const site = seedSite();
    const lieu = seedSiteLocation(site.id);
    for (const status of ['DRAFT', 'COUNTED']) {
      stockStore.counts = [
        { id: `inventaire-${status}`, tenantId: TENANT, locationId: lieu.id, kind: 'REGULAR', status }
      ];
      const blockers = await getSiteClosureBlockers(TENANT, site.id);
      expect(blockers).toEqual([
        {
          message: 'Un inventaire est en cours sur le lieu de stockage du chantier : terminez-le avant de clôturer.',
          count: 1,
          documentIds: [`inventaire-${status}`],
          documentType: 'STOCK_COUNT'
        }
      ]);
    }
  });

  it('§8.2 : un compteur sans STOCK_COUNT_VALIDATE ne lit pas le nombre d’articles d’un lieu en comptage', async () => {
    const site = seedSite();
    const lieu = seedSiteLocation(site.id);
    stockStore.balances.push({ tenantId: TENANT, locationId: lieu.id, itemId: 'ciment', quantity: 12 });
    stockStore.balances.push({ tenantId: TENANT, locationId: lieu.id, itemId: 'fer', quantity: 3 });
    stockStore.counts.push({
      id: 'inventaire-draft',
      tenantId: TENANT,
      locationId: lieu.id,
      kind: 'REGULAR',
      status: 'DRAFT'
    });
    const compteur: any = { userId: USER, canValidateCount: false, valuesVisible: false };
    const valideur: any = { userId: USER, canValidateCount: true, valuesVisible: true };

    const masques = await getSiteClosureBlockersForCaller(TENANT, site.id, compteur);
    expect(masques.find(blocker => blocker.documentType === 'STOCK_RESIDUAL')).toMatchObject({
      count: null,
      documentIds: [lieu.id]
    });
    // Le bloqueur d'inventaire en cours reste compté : il ne révèle rien du stock.
    expect(masques.find(blocker => blocker.documentType === 'STOCK_COUNT')).toMatchObject({ count: 1 });

    const complets = await getSiteClosureBlockersForCaller(TENANT, site.id, valideur);
    expect(complets.find(blocker => blocker.documentType === 'STOCK_RESIDUAL')).toMatchObject({ count: 2 });

    // Inventaire COUNTED : les écarts sont révélés, plus rien n'est aveugle.
    stockStore.counts[stockStore.counts.length - 1].status = 'COUNTED';
    const apresComptage = await getSiteClosureBlockersForCaller(TENANT, site.id, compteur);
    expect(apresComptage.find(blocker => blocker.documentType === 'STOCK_RESIDUAL')).toMatchObject({ count: 2 });
  });

  it('un chantier sans lieu de stockage n’a aucun bloqueur de stock', async () => {
    const site = seedSite();
    expect(await getSiteClosureBlockers(TENANT, site.id)).toEqual([]);
  });

  it('A7-R3 bis : le verrou `stock-site` du chantier est pris AVANT la lecture du chantier et des bloqueurs', async () => {
    const site = seedSite();
    await closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER });

    expect(stockStore.locks).toEqual([expect.stringMatching(/hashtext\('stock-site'\).*\|chantier-/)]);
    expect(stockStore.locks[0].endsWith(`|${site.id}`)).toBe(true);
    const lockOrder = (mockPrisma.$executeRaw as jest.Mock).mock.invocationCallOrder[0];
    const firstSiteRead = (mockPrisma.constructionSite.findFirst as jest.Mock).mock.invocationCallOrder[0];
    const firstBlockerRead = (mockPrisma.stockLocation.findFirst as jest.Mock).mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(firstSiteRead);
    expect(lockOrder).toBeLessThan(firstBlockerRead);
  });
});

// ===========================================================================
// H. La réouverture
// ===========================================================================

describe('reopenSiteTx', () => {
  it('efface la date, le coût figé et l’auteur, et remet le chantier en cours', async () => {
    const site = seedSite();
    seedActualCost(site.id, 500_000);
    await closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER });

    const reopened = await reopenSiteTx(tx, TENANT, site.id);

    // Le record décrit la clôture qu'on vient de DÉFAIRE.
    expect(reopened.finalCost).toBe(500_000);
    expect(reopened.closedByLabel).toBe('Fatoumata Camara');

    const stored = store.sites.find(row => row.id === site.id)!;
    expect(stored.status).toBe('IN_PROGRESS');
    expect(stored.closedAt).toBeNull();
    expect(stored.finalCost).toBeNull();
    expect(stored.closedByUserId).toBeNull();
  });

  it('le coût redevient dérivé après réouverture', async () => {
    const site = seedSite();
    seedActualCost(site.id, 500_000);
    await closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER });
    await reopenSiteTx(tx, TENANT, site.id);
    seedActualCost(site.id, 120_000);

    await expect(getSiteCostBreakdown(TENANT, site.id)).resolves.toMatchObject({
      isClosed: false,
      totalCost: 620_000
    });
  });

  it('refuse dès qu’un lot a basculé au patrimoine (409)', async () => {
    const site = seedSite();
    seedActualCost(site.id, 500_000);
    const [lot] = await seedLots(site.id, [{ name: 'Villa A' }]);
    await setLotAllocationMethodTx(tx, TENANT, site.id, 'EQUAL');
    await closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER });
    await capitalizeSiteLotTx(tx, TENANT, lot.id, {
      internalReference: 'REF-001',
      propertyType: 'MAISON_VILLA',
      ownershipType: 'TENANT',
      title: 'Villa A — Kipé',
      description: 'Villa issue du chantier',
      address: 'Kipé, Conakry',
      acquisitionDate: new Date('2026-07-15')
    });

    await expect(reopenSiteTx(tx, TENANT, site.id)).rejects.toMatchObject({ status: 409 });
    expect(store.sites.find(row => row.id === site.id)!.closedAt).not.toBeNull();
  });

  it('refuse un chantier qui n’est pas clos (409)', async () => {
    const site = seedSite();

    await expect(reopenSiteTx(tx, TENANT, site.id)).rejects.toMatchObject({ status: 409 });
  });
});

// ===========================================================================
// I. La bascule au patrimoine
// ===========================================================================

const BASCULE = {
  internalReference: 'REF-001',
  propertyType: 'MAISON_VILLA',
  ownershipType: 'TENANT',
  title: 'Villa A — Kipé',
  description: 'Villa de trois chambres issue du chantier de Kipé',
  address: 'Kipé, commune de Ratoma, Conakry',
  acquisitionDate: new Date('2026-07-15')
};

async function seedClosedSiteWithLots(cout = 1_000_000) {
  const site = seedSite();
  seedActualCost(site.id, cout);
  const lots = await seedLots(site.id, [{ name: 'Villa A' }, { name: 'Villa B' }, { name: 'Villa C' }]);
  await setLotAllocationMethodTx(tx, TENANT, site.id, 'EQUAL');
  await closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER });
  return { site, lots };
}

describe('capitalizeSiteLotTx', () => {
  it('crée un bien ET une évaluation portant le coût de revient pour valeur d’acquisition', async () => {
    const { lots } = await seedClosedSiteWithLots();

    const capitalized = await capitalizeSiteLotTx(tx, TENANT, lots[1].id, BASCULE);

    expect(capitalized).toMatchObject({
      lotId: lots[1].id,
      lotName: 'Villa B',
      propertyInternalReference: 'REF-001',
      acquisitionCost: 333_333,
      currency: 'XOF'
    });

    expect(store.properties).toHaveLength(1);
    // L'actif REAL_ESTATE du bien naît dans la même transaction ; la
    // valorisation reste sur propertyId (lot 1 multi-actifs).
    expect(store.assets).toHaveLength(1);
    expect(store.assets[0]).toMatchObject({
      propertyId: capitalized.propertyId,
      tenantId: TENANT,
      assetClass: 'REAL_ESTATE'
    });
    expect(store.valuations).toHaveLength(1);
    expect(store.valuations[0].assetId).toBeUndefined();
    expect(store.valuations[0]).toMatchObject({
      propertyId: capitalized.propertyId,
      acquisitionCost: 333_333,
      acquisitionDate: BASCULE.acquisitionDate,
      currency: 'XOF'
    });
    // La fiabilité est stockée : saisie manuelle sans source, statut juridique encore inconnu.
    expect(store.valuations[0]).toMatchObject({
      method: 'MANUAL',
      reliability: 'LOW',
      reliabilityReasons: expect.arrayContaining(['METHOD_MANUAL_NO_SOURCE', 'LEGAL_STATUS_UNKNOWN'])
    });
    // Le lot pointe désormais vers son bien.
    expect(store.lots.find(row => row.id === lots[1].id)!.propertyId).toBe(capitalized.propertyId);
  });

  it('ne devine AUCUN champ depuis le chantier — tout vient de l’appelant', async () => {
    const { lots } = await seedClosedSiteWithLots();

    await capitalizeSiteLotTx(tx, TENANT, lots[0].id, BASCULE);

    const created = store.properties[0];
    expect(created).toMatchObject({
      tenantId: TENANT,
      internalReference: 'REF-001',
      propertyType: 'MAISON_VILLA',
      ownershipType: 'TENANT',
      title: 'Villa A — Kipé',
      address: 'Kipé, commune de Ratoma, Conakry'
    });
    // Le bien ne reprend ni le nom, ni la zone du chantier : un chantier a
    // une zone, pas une adresse postale.
    expect(created.locationZone).toBeUndefined();
    expect(created.title).not.toBe('Résidence Kipé');
  });

  it('le premier lot porte le reliquat d’arrondi, et son bien aussi', async () => {
    const { lots } = await seedClosedSiteWithLots();

    const capitalized = await capitalizeSiteLotTx(tx, TENANT, lots[0].id, BASCULE);

    expect(capitalized.acquisitionCost).toBe(333_334);
  });

  it('refuse sur un chantier ouvert (409)', async () => {
    const site = seedSite();
    seedActualCost(site.id, 1_000_000);
    const [lot] = await seedLots(site.id, [{ name: 'Villa A' }]);
    await setLotAllocationMethodTx(tx, TENANT, site.id, 'EQUAL');

    await expect(capitalizeSiteLotTx(tx, TENANT, lot.id, BASCULE)).rejects.toMatchObject({ status: 409 });
    expect(store.properties).toHaveLength(0);
  });

  it('refuse un lot déjà basculé (409)', async () => {
    const { lots } = await seedClosedSiteWithLots();
    await capitalizeSiteLotTx(tx, TENANT, lots[0].id, BASCULE);

    await expect(
      capitalizeSiteLotTx(tx, TENANT, lots[0].id, { ...BASCULE, internalReference: 'REF-002' })
    ).rejects.toMatchObject({ status: 409 });
    expect(store.properties).toHaveLength(1);
  });

  it('refuse un type de bien inconnu (400) plutôt que de laisser Prisma lever une erreur illisible', async () => {
    const { lots } = await seedClosedSiteWithLots();

    await expect(
      capitalizeSiteLotTx(tx, TENANT, lots[0].id, { ...BASCULE, propertyType: 'CHATEAU' })
    ).rejects.toMatchObject({ status: 400 });
    expect(store.properties).toHaveLength(0);
  });

  it('refuse un mode de détention inconnu (400)', async () => {
    const { lots } = await seedClosedSiteWithLots();

    await expect(
      capitalizeSiteLotTx(tx, TENANT, lots[0].id, { ...BASCULE, ownershipType: 'LOCATAIRE' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuse une référence interne déjà prise, SANS tenter l’écriture (409)', async () => {
    const { lots } = await seedClosedSiteWithLots();
    store.properties.push({ id: 'bien-existant', tenantId: TENANT, internalReference: 'REF-001' });
    (mockPrisma.property.create as jest.Mock).mockClear();

    await expect(capitalizeSiteLotTx(tx, TENANT, lots[0].id, BASCULE)).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.property.create).not.toHaveBeenCalled();
  });

  it('n’écrit AUCUNE écriture comptable — la bascule n’immobilise rien (contrat)', async () => {
    const { lots } = await seedClosedSiteWithLots();

    await capitalizeSiteLotTx(tx, TENANT, lots[0].id, BASCULE);

    // Aucun modèle comptable n'est même exposé par le magasin : si le domaine
    // en avait appelé un, l'appel aurait levé. On le fige quand même.
    expect(mockPrisma.assetValuation.create).toHaveBeenCalledTimes(1);
    expect(store.allocations.filter(row => row.sourceType)).toHaveLength(0);
  });

  it('la somme des valeurs d’acquisition des trois lots vaut le coût figé du chantier', async () => {
    const { lots } = await seedClosedSiteWithLots();

    const a = await capitalizeSiteLotTx(tx, TENANT, lots[0].id, { ...BASCULE, internalReference: 'REF-A' });
    const b = await capitalizeSiteLotTx(tx, TENANT, lots[1].id, { ...BASCULE, internalReference: 'REF-B' });
    const c = await capitalizeSiteLotTx(tx, TENANT, lots[2].id, { ...BASCULE, internalReference: 'REF-C' });

    expect(a.acquisitionCost + b.acquisitionCost + c.acquisitionCost).toBe(1_000_000);
  });
});

describe('registre des lots de l’abonnement (vague 2, lot B)', () => {
  beforeEach(() => {
    mockLotRegistry.syncLotActivationsTx.mockClear();
    mockLotRegistry.assertCapacityTx.mockClear();
  });

  it('un lot créé entre au registre, dans la transaction de la création', async () => {
    const site = seedSite();
    const lot = await createSiteLotTx(tx, TENANT, { siteId: site.id, name: 'Villa A' });
    expect(mockLotRegistry.syncLotActivationsTx).toHaveBeenCalledWith(tx, TENANT, { siteLotIds: [lot.id] });
  });

  it('un lot supprimé sort du registre', async () => {
    const site = seedSite();
    const [lot] = await seedLots(site.id, [{ name: 'Villa A' }]);
    await deleteSiteLotTx(tx, TENANT, lot.id);
    expect(mockLotRegistry.syncLotActivationsTx).toHaveBeenCalledWith(
      tx,
      TENANT,
      { siteLotIds: [lot.id] },
      { reason: 'SITE_LOT_DELETED' }
    );
  });

  it('la clôture fait sortir les lots du chantier ; la réouverture contrôle la capacité CHANTIERS puis les recompte', async () => {
    const site = seedSite();
    await closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER });
    expect(mockLotRegistry.syncLotActivationsTx).toHaveBeenLastCalledWith(
      tx,
      TENANT,
      { siteIds: [site.id] },
      {
        actorUserId: USER,
        reason: 'SITE_CLOSED'
      }
    );

    await reopenSiteTx(tx, TENANT, site.id);
    expect(mockLotRegistry.assertCapacityTx).toHaveBeenCalledWith(tx, TENANT, 'CHANTIERS');
    expect(mockLotRegistry.syncLotActivationsTx).toHaveBeenLastCalledWith(
      tx,
      TENANT,
      { siteIds: [site.id] },
      { reason: 'SITE_REOPENED' }
    );
  });

  it('une réouverture refusée par le quota (BLOCK) ne rouvre rien', async () => {
    const site = seedSite();
    await closeSiteTx(tx, TENANT, site.id, { closedByUserId: USER });
    const { QuotaExceededError } = jest.requireActual('../../src/middleware/error-middleware');
    mockLotRegistry.assertCapacityTx.mockRejectedValueOnce(
      new QuotaExceededError({ capacityKey: 'CHANTIERS', limit: 2, used: 2, requested: 1 })
    );
    await expect(reopenSiteTx(tx, TENANT, site.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(store.sites.find(row => row.id === site.id)!.status).toBe('CLOSED');
  });

  it('la bascule au patrimoine est un transfert : PL:<lot> et P:<bien> dans le même appel', async () => {
    const { lots } = await seedClosedSiteWithLots();
    const capitalized = await capitalizeSiteLotTx(tx, TENANT, lots[0].id, BASCULE);
    expect(mockLotRegistry.syncLotActivationsTx).toHaveBeenLastCalledWith(
      tx,
      TENANT,
      { siteLotIds: [lots[0].id], propertyIds: [capitalized.propertyId] },
      { reason: 'TRANSFERRED_TO_PROPERTY' }
    );
  });
});
