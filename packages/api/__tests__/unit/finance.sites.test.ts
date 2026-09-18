/**
 * Tests des chantiers et postes de dépense (`lib/finance/sites.ts`).
 *
 * Prisma est remplacé par un magasin en mémoire (même esprit que
 * `finance.billing-run.test.ts`) : aucune base n'est requise. `cash.ts` n'est
 * pas mocké pour son unique fonction pure utilisée ici
 * (`formatCashVoucherNumber`) : c'est un simple formatage, le caractériser une
 * seconde fois n'apporterait rien ; `accounting.ts`, lui, n'est jamais importé
 * par `sites.ts`, donc rien à mocker de ce côté.
 */

type Row = Record<string, any>;

const store = {
  sites: [] as Row[],
  categories: [] as Row[],
  allocations: [] as Row[],
  properties: [] as Row[],
  users: [] as Row[],
  invoices: [] as Row[],
  vouchers: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function uniqueConstraintError(target: string[]): any {
  return Object.assign(new Error(`Unique constraint failed on the fields: (\`${target.join(', ')}\`)`), {
    code: 'P2002',
    meta: { target }
  });
}

const TENANT_ID = 'tenant-1';

const mockPrisma: Row = {
  property: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.properties.find(p => p.id === where.id && p.tenantId === where.tenantId) ?? null
    )
  },

  user: {
    findUnique: jest.fn(async ({ where }: Row) => store.users.find(u => u.id === where.id) ?? null)
  },

  constructionSite: {
    create: jest.fn(async ({ data }: Row) => {
      const created = {
        id: nextId('site'),
        status: 'PLANNED',
        progressPercent: 0,
        closedAt: null,
        finalCost: null,
        createdAt: new Date(),
        ...data
      };
      store.sites.push(created);
      return created;
    }),
    findFirst: jest.fn(
      async ({ where }: Row) => store.sites.find(s => s.id === where.id && s.tenantId === where.tenantId) ?? null
    ),
    findMany: jest.fn(async ({ where, orderBy, skip, take }: Row) => {
      let rows = store.sites.filter(s => s.tenantId === where.tenantId && (!where.status || s.status === where.status));
      if (orderBy?.[0]?.createdAt === 'desc') {
        rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      if (typeof skip === 'number') rows = rows.slice(skip);
      if (typeof take === 'number') rows = rows.slice(0, take);
      return rows;
    }),
    count: jest.fn(
      async ({ where }: Row) =>
        store.sites.filter(s => s.tenantId === where.tenantId && (!where.status || s.status === where.status)).length
    )
  },

  costCategory: {
    count: jest.fn(async ({ where }: Row) => store.categories.filter(c => c.tenantId === where.tenantId).length),
    createMany: jest.fn(async ({ data }: Row) => {
      let created = 0;
      for (const item of data as Row[]) {
        const clash = store.categories.find(c => c.tenantId === item.tenantId && c.label === item.label);
        if (clash) continue; // skipDuplicates
        store.categories.push({ id: nextId('cat'), isActive: true, ...item });
        created += 1;
      }
      return { count: created };
    }),
    create: jest.fn(async ({ data }: Row) => {
      const clash = store.categories.find(c => c.tenantId === data.tenantId && c.label === data.label);
      if (clash) throw uniqueConstraintError(['tenant_id', 'label']);
      const created = { id: nextId('cat'), isActive: true, createdAt: new Date(), ...data };
      store.categories.push(created);
      return created;
    }),
    findMany: jest.fn(async ({ where, orderBy }: Row) => {
      let rows = store.categories.filter(c => c.tenantId === where.tenantId);
      rows = [...rows].sort((a, b) => {
        const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
        if (byCreated !== 0) return byCreated;
        return String(a.id).localeCompare(String(b.id));
      });
      void orderBy;
      return rows;
    }),
    findFirst: jest.fn(
      async ({ where }: Row) => store.categories.find(c => c.id === where.id && c.tenantId === where.tenantId) ?? null
    ),
    update: jest.fn(async ({ where, data }: Row) => {
      const cat = store.categories.find(c => c.id === where.id);
      if (!cat) return null;
      Object.assign(cat, data);
      return { ...cat };
    })
  },

  costAllocation: {
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.allocations.filter(
        a =>
          a.tenantId === where.tenantId &&
          (!where.siteId || a.siteId === where.siteId) &&
          (where.voidedAt === undefined || a.voidedAt === where.voidedAt)
      );
      rows = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return rows.map(a => ({ ...a, costCategory: store.categories.find(c => c.id === a.costCategoryId) ?? null }));
    }),
    aggregate: jest.fn(async ({ where }: Row) => {
      const rows = store.allocations.filter(
        a =>
          a.tenantId === where.tenantId &&
          (!where.siteId || a.siteId === where.siteId) &&
          (where.validatedAt === undefined || (where.validatedAt.not === null ? a.validatedAt !== null : true)) &&
          (where.voidedAt === undefined || a.voidedAt === where.voidedAt)
      );
      const sum = rows.reduce((total, r) => total + Number(r.amount), 0);
      return { _sum: { amount: rows.length ? sum : null } };
    }),
    groupBy: jest.fn(async ({ where }: Row) => {
      const rows = store.allocations.filter(
        a =>
          a.tenantId === where.tenantId &&
          where.siteId.in.includes(a.siteId) &&
          (where.validatedAt === undefined || a.validatedAt !== null) &&
          a.voidedAt === where.voidedAt
      );
      const bySite = new Map<string, number>();
      for (const row of rows) {
        bySite.set(row.siteId, (bySite.get(row.siteId) ?? 0) + Number(row.amount));
      }
      return [...bySite.entries()].map(([siteId, amount]) => ({ siteId, _sum: { amount } }));
    })
  },

  supplierInvoice: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.invoices.filter(i => where.id.in.includes(i.id) && i.tenantId === where.tenantId)
    )
  },

  cashVoucher: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.vouchers.filter(v => where.id.in.includes(v.id) && v.tenantId === where.tenantId)
    )
  }
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

import {
  createConstructionSite,
  listConstructionSites,
  getSiteDetail,
  listCostCategories,
  createCostCategory,
  setCostCategoryActive
} from '../../src/lib/finance/sites';

function seedCategory(overrides: Partial<Row> = {}): Row {
  const category = {
    id: nextId('cat'),
    tenantId: TENANT_ID,
    label: 'Gros œuvre',
    isActive: true,
    createdAt: new Date(),
    ...overrides
  };
  store.categories.push(category);
  return category;
}

function seedSite(overrides: Partial<Row> = {}): Row {
  const site = {
    id: nextId('site'),
    tenantId: TENANT_ID,
    name: 'Villa Kipé — extension',
    zone: 'Dixinn',
    propertyId: null,
    managerId: null,
    status: 'IN_PROGRESS',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    plannedEndDate: null,
    progressPercent: 0,
    closedAt: null,
    finalCost: null,
    createdAt: new Date(),
    ...overrides
  };
  store.sites.push(site);
  return site;
}

function seedAllocation(overrides: Partial<Row> = {}): Row {
  const allocation = {
    id: nextId('alloc'),
    tenantId: TENANT_ID,
    siteId: overrides.siteId,
    costCategoryId: overrides.costCategoryId,
    sourceType: 'CASH_VOUCHER',
    sourceId: overrides.sourceId ?? nextId('src'),
    amount: 0,
    validatedAt: new Date(),
    voidedAt: null,
    createdAt: new Date(),
    ...overrides
  };
  store.allocations.push(allocation);
  return allocation;
}

beforeEach(() => {
  jest.clearAllMocks();
  store.sites = [];
  store.categories = [];
  store.allocations = [];
  store.properties = [];
  store.users = [];
  store.invoices = [];
  store.vouchers = [];
  store.seq = 0;
});

describe('createConstructionSite — chantier sans bien préexistant', () => {
  it('crée un chantier avec propertyId nul et un coût réel de zéro', async () => {
    const site = await createConstructionSite(TENANT_ID, { name: 'Chantier Kaporo', zone: 'Kaporo' });

    expect(site.propertyId).toBeNull();
    expect(site.actualCost).toBe(0);
    expect(site.currency).toBe('XOF');
    expect(store.sites).toHaveLength(1);
  });

  it('refuse un chantier sans nom', async () => {
    await expect(createConstructionSite(TENANT_ID, { name: '   ' })).rejects.toThrow(/nom du chantier/i);
  });

  it('refuse un bien qui n’appartient pas au tenant', async () => {
    store.properties.push({ id: 'prop-x', tenantId: 'autre-tenant' });
    await expect(createConstructionSite(TENANT_ID, { name: 'Chantier X', propertyId: 'prop-x' })).rejects.toThrow(
      /bien introuvable/i
    );
  });
});

describe('coût réel — dérivé, jamais stocké', () => {
  it('suit la somme des imputations validées et ignore les annulées', async () => {
    const category = seedCategory();
    const site = seedSite();
    seedAllocation({
      siteId: site.id,
      costCategoryId: category.id,
      amount: 150000,
      validatedAt: new Date(),
      voidedAt: null
    });
    seedAllocation({
      siteId: site.id,
      costCategoryId: category.id,
      amount: 50000,
      validatedAt: new Date(),
      voidedAt: null
    });
    // Annulée : ne doit pas compter dans le coût réel.
    seedAllocation({
      siteId: site.id,
      costCategoryId: category.id,
      amount: 999999,
      validatedAt: new Date(),
      voidedAt: new Date()
    });

    const { sites } = await listConstructionSites(TENANT_ID);
    const found = sites.find(s => s.id === site.id);

    expect(found?.actualCost).toBe(200000);
  });

  it('un chantier sans imputation affiche un coût réel de zéro dans la liste', async () => {
    seedSite();
    const { sites, total } = await listConstructionSites(TENANT_ID);
    expect(total).toBe(1);
    expect(sites[0].actualCost).toBe(0);
  });
});

describe('getSiteDetail — sous-totaux et libellés lisibles', () => {
  it("resout le libellé de chaque pièce d'origine au lieu d'un identifiant, et calcule les sous-totaux par poste", async () => {
    const grosOeuvre = seedCategory({ label: 'Gros œuvre' });
    const materiaux = seedCategory({ label: 'Matériaux' });
    const site = seedSite();

    const invoiceId = nextId('inv');
    store.invoices.push({
      id: invoiceId,
      tenantId: TENANT_ID,
      reference: 'FAC-2026-014',
      invoiceDate: new Date('2026-02-01T00:00:00.000Z'),
      supplier: { name: 'SARL Ciment Guinée' }
    });

    const voucherId = nextId('bc');
    store.vouchers.push({
      id: voucherId,
      tenantId: TENANT_ID,
      voucherYear: 2026,
      voucherNumber: 4,
      voucherDate: new Date('2026-02-10T00:00:00.000Z'),
      beneficiaryName: 'Mamadou Bah'
    });

    seedAllocation({
      siteId: site.id,
      costCategoryId: materiaux.id,
      sourceType: 'SUPPLIER_INVOICE',
      sourceId: invoiceId,
      amount: 300000
    });
    seedAllocation({
      siteId: site.id,
      costCategoryId: grosOeuvre.id,
      sourceType: 'CASH_VOUCHER',
      sourceId: voucherId,
      amount: 25000
    });

    const detail = await getSiteDetail(TENANT_ID, site.id);

    expect(detail.site.actualCost).toBe(325000);

    const invoiceLine = detail.allocations.find(a => a.sourceId === invoiceId);
    const voucherLine = detail.allocations.find(a => a.sourceId === voucherId);

    // Aucune ligne ne se contente d'un identifiant : le nom du fournisseur et
    // celui du bénéficiaire apparaissent, pas seulement une référence brute.
    expect(invoiceLine?.sourceLabel).toBe('Facture FAC-2026-014 — SARL Ciment Guinée');
    expect(invoiceLine?.sourceLabel).not.toMatch(new RegExp(invoiceId));
    expect(voucherLine?.sourceLabel).toBe('Bon de caisse 2026-0004 — Mamadou Bah');
    expect(voucherLine?.sourceLabel).not.toMatch(new RegExp(voucherId));

    expect(detail.byCostCategory).toEqual([
      { costCategoryId: grosOeuvre.id, label: 'Gros œuvre', amount: 25000 },
      { costCategoryId: materiaux.id, label: 'Matériaux', amount: 300000 }
    ]);
  });

  it('chantier introuvable : refuse plutôt que de renvoyer un détail vide', async () => {
    await expect(getSiteDetail(TENANT_ID, 'site-inconnu')).rejects.toThrow(/introuvable/i);
  });
});

describe('listCostCategories — jeu par défaut', () => {
  it('sème sept postes par défaut au premier appel, jamais une seconde fois', async () => {
    const first = await listCostCategories(TENANT_ID);
    expect(first).toHaveLength(7);
    expect(first.map(c => c.label)).toEqual([
      'Gros œuvre',
      'Toiture',
      'Plomberie',
      'Électricité',
      "Main-d'œuvre",
      'Matériaux',
      'Divers'
    ]);
    expect(first.map(c => c.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);

    const second = await listCostCategories(TENANT_ID);
    expect(second).toHaveLength(7);
    expect(store.categories).toHaveLength(7);
  });

  it('un poste personnalisé rejoint le jeu par défaut sans le dupliquer', async () => {
    await listCostCategories(TENANT_ID);
    await createCostCategory(TENANT_ID, { label: 'Location engins' });

    const all = await listCostCategories(TENANT_ID);
    expect(all).toHaveLength(8);
    expect(all[7].label).toBe('Location engins');
  });

  it('refuse un second poste portant le même libellé', async () => {
    await listCostCategories(TENANT_ID);
    await expect(createCostCategory(TENANT_ID, { label: 'Divers' })).rejects.toThrow(/déjà ce libellé/i);
  });
});

describe('poste de dépense — désactivable, jamais supprimable', () => {
  it('peut être désactivé même s’il porte une imputation, et reste lisible ensuite', async () => {
    const [category] = await listCostCategories(TENANT_ID);
    const site = seedSite();
    seedAllocation({ siteId: site.id, costCategoryId: category.id, amount: 10000 });

    const disabled = await setCostCategoryActive(TENANT_ID, category.id, false);

    expect(disabled.isActive).toBe(false);
    const all = await listCostCategories(TENANT_ID);
    expect(all.find(c => c.id === category.id)?.isActive).toBe(false);
    // Toujours présent : « désactivé » n'est jamais « supprimé ».
    expect(all).toHaveLength(7);
  });

  it("n'expose aucune fonction de suppression de poste", () => {
    // Aucune fonction `deleteCostCategory` n'existe : la règle « jamais
    // supprimé » est garantie par l'absence de la fonction, pas seulement par
    // la discipline de l'appelant.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const siteModule = require('../../src/lib/finance/sites');
    expect(siteModule.deleteCostCategory).toBeUndefined();
  });
});
