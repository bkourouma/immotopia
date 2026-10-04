/**
 * Tests du journal des mouvements (`lib/finance/stock-journal.ts`) — déplacés
 * de `finance.stock-mouvements.test.ts` par l'étape des fondations du lot 040,
 * avec le banc de données en mémoire qui les porte, sans changement de
 * résultat. Les réceptions et sorties qui alimentent le journal passent par le
 * vrai `stock-mouvements.ts`.
 *
 * Modèle : `__tests__/unit/finance.contractors.test.ts` (lot 4, sous-lot 4).
 *
 * `accounting.ts` (moteur comptable général) et `cost-allocation.ts`
 * (`syncWorkProgramCostTx`) sont mockés, même geste qu'aux sous-lots
 * précédents : ce fichier ne teste pas comment une écriture s'équilibre,
 * seulement comment `stock-mouvements.ts` l'appelle (comptes, montants), ni
 * comment `WorkProgram` se resynchronise, seulement qu'il est appelé pour le
 * bon chantier.
 *
 * `resolveExpenseAccountsByCostCategoryTx` est mocké de façon à pouvoir
 * prouver que le compte de charge suit le POSTE, avec repli sur le 605 :
 * `COMPTES_PAR_POSTE` permet à un test d'enregistrer un compte propre à un
 * poste ; sans entrée, la doublure renvoie le compte par défaut — exactement
 * le contrat de la vraie fonction.
 *
 * **`site-closing.ts` (`assertSiteOpenTx`) et `site-cost.ts`
 * (`sumSiteActualCost`) NE SONT PAS mockés.** Ce sont les VRAIS calculs qui
 * doivent prouver les deux critères les plus importants du sous-lot : une
 * sortie vers un chantier clos est refusée, et une sortie fait monter le coût
 * réel du chantier exactement de la valeur sortie. Une doublure qui
 * l'affirmerait à leur place ne prouverait rien.
 */

const postDocumentEntryTx = jest.fn();

const COMPTES_OPERATIONNELS = new Map<string, string>([
  ['311', 'compte-311'],
  ['605', 'compte-605'],
  ['603', 'compte-603']
]);

/** Voir l'en-tête : permet à un test de faire porter un compte propre à un poste. */
const COMPTES_PAR_POSTE = new Map<string, string>();

const resolveExpenseAccountsByCostCategoryTx = jest.fn(
  async (_tx: unknown, _tenantId: string, ids: string[], parDefaut: string) =>
    new Map(ids.map(id => [id, COMPTES_PAR_POSTE.get(id) ?? parDefaut]))
);

jest.mock('../../src/lib/finance/accounting', () => ({
  postDocumentEntryTx: (...args: any[]) => postDocumentEntryTx(...args),
  ensureOperationalJournalTx: async () => 'journal-operationnel',
  ensureOperationalChartOfAccountsTx: async () => COMPTES_OPERATIONNELS,
  resolveExpenseAccountsByCostCategoryTx: (...args: any[]) => (resolveExpenseAccountsByCostCategoryTx as any)(...args)
}));

const syncWorkProgramCostTx = jest.fn();

jest.mock('../../src/lib/finance/cost-allocation', () => ({
  syncWorkProgramCostTx: (...args: any[]) => syncWorkProgramCostTx(...args)
}));

// ---------------------------------------------------------------------------
// Magasin en mémoire
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

const store = {
  sites: [] as Row[],
  categories: [] as Row[],
  items: [] as Row[],
  locations: [] as Row[],
  invoices: [] as Row[],
  balances: [] as Row[],
  movements: [] as Row[],
  allocations: [] as Row[],
  users: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function enrichMovement(row: Row, include?: Row): Row {
  if (!include) {
    return row;
  }
  const enriched: Row = { ...row };
  if (include.item) enriched.item = store.items.find(i => i.id === row.itemId) ?? null;
  if (include.location) enriched.location = store.locations.find(l => l.id === row.locationId) ?? null;
  if (include.site) enriched.site = store.sites.find(s => s.id === row.siteId) ?? null;
  if (include.costCategory) enriched.costCategory = store.categories.find(c => c.id === row.costCategoryId) ?? null;
  if (include.supplierInvoice)
    enriched.supplierInvoice = store.invoices.find(f => f.id === row.supplierInvoiceId) ?? null;
  if (include.createdBy) enriched.createdBy = store.users.find(u => u.id === row.createdByUserId) ?? null;
  return enriched;
}

function enrichBalance(row: Row, include?: Row): Row {
  if (!include) {
    return row;
  }
  const enriched: Row = { ...row };
  if (include.item) enriched.item = store.items.find(i => i.id === row.itemId) ?? null;
  if (include.location) enriched.location = store.locations.find(l => l.id === row.locationId) ?? null;
  return enriched;
}

const mockPrisma: Row = {
  constructionSite: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.sites.find(s => s.id === where.id && s.tenantId === where.tenantId) ?? null
    )
  },

  costCategory: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.categories.find(c => c.id === where.id && c.tenantId === where.tenantId) ?? null
    )
  },

  stockItem: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.items.find(i => i.id === where.id && i.tenantId === where.tenantId) ?? null
    ),
    findMany: jest.fn(async ({ where }: Row) =>
      store.items.filter(i => i.tenantId === where.tenantId && where.id.in.includes(i.id))
    )
  },

  stockLocation: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.locations.find(l => l.id === where.id && l.tenantId === where.tenantId) ?? null
    )
  },

  supplierInvoice: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.invoices.find(f => f.id === where.id && f.tenantId === where.tenantId) ?? null
    )
  },

  stockBalance: {
    findFirst: jest.fn(
      async ({ where }: Row) =>
        store.balances.find(
          b => b.tenantId === where.tenantId && b.itemId === where.itemId && b.locationId === where.locationId
        ) ?? null
    ),
    findMany: jest.fn(async ({ where, include }: Row) => {
      let rows = store.balances.filter(b => b.tenantId === where.tenantId);
      if (where.locationId) rows = rows.filter(b => b.locationId === where.locationId);
      if (where.itemId) rows = rows.filter(b => b.itemId === where.itemId);
      if (where.quantity?.gt !== undefined) rows = rows.filter(b => b.quantity > where.quantity.gt);
      return rows.map(row => enrichBalance(row, include));
    }),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('solde'), updatedAt: new Date(), ...data };
      store.balances.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.balances.find(b => b.id === where.id)!;
      Object.assign(row, data);
      return row;
    })
  },

  stockMovement: {
    create: jest.fn(async ({ data, include }: Row) => {
      const created = {
        id: nextId('mouvement'),
        journalEntryId: null,
        siteId: null,
        costCategoryId: null,
        requestedBy: null,
        supplierInvoiceId: null,
        transferGroupId: null,
        stockCountId: null,
        reason: null,
        createdAt: new Date(Date.now() + store.movements.length),
        ...data
      };
      store.movements.push(created);
      return enrichMovement(created, include);
    }),
    update: jest.fn(async ({ where, data, include }: Row) => {
      const row = store.movements.find(m => m.id === where.id)!;
      Object.assign(row, data);
      return enrichMovement(row, include);
    }),
    findMany: jest.fn(async ({ where, include }: Row) => {
      let rows = store.movements.filter(m => m.tenantId === where.tenantId);
      if (where.itemId) rows = rows.filter(m => m.itemId === where.itemId);
      if (where.locationId) rows = rows.filter(m => m.locationId === where.locationId);
      if (where.siteId) rows = rows.filter(m => m.siteId === where.siteId);
      if (where.type) rows = rows.filter(m => m.type === where.type);
      if (where.movementDate?.gte) rows = rows.filter(m => m.movementDate >= where.movementDate.gte);
      if (where.movementDate?.lte) rows = rows.filter(m => m.movementDate <= where.movementDate.lte);
      rows = [...rows].sort(
        (a, b) => b.movementDate.getTime() - a.movementDate.getTime() || b.createdAt.getTime() - a.createdAt.getTime()
      );
      return rows.map(row => enrichMovement(row, include));
    })
  },

  costAllocation: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('imputation'), voidedAt: null, createdAt: new Date(), ...data };
      store.allocations.push(created);
      return created;
    }),
    aggregate: jest.fn(async ({ where }: Row) => {
      let rows = store.allocations.filter(a => a.tenantId === where.tenantId && a.siteId === where.siteId);
      if (where.validatedAt && where.validatedAt.not === null) rows = rows.filter(a => a.validatedAt !== null);
      if (where.voidedAt === null) rows = rows.filter(a => a.voidedAt === null);
      const sum = rows.reduce(
        (total, row) => total + (typeof row.amount === 'number' ? row.amount : Number(row.amount)),
        0
      );
      return { _sum: { amount: rows.length ? sum : null } };
    })
  }
};

/** Rollback par copie profonde en cas d'erreur — même esprit qu'aux sous-lots précédents. */
async function runTransaction<T>(callback: (tx: Row) => Promise<T>): Promise<T> {
  const snapshot = {
    balances: structuredClone(store.balances),
    movements: structuredClone(store.movements),
    allocations: structuredClone(store.allocations),
    seq: store.seq
  };
  try {
    return await callback(mockPrisma);
  } catch (error) {
    store.balances = snapshot.balances;
    store.movements = snapshot.movements;
    store.allocations = snapshot.allocations;
    store.seq = snapshot.seq;
    throw error;
  }
}

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === '$transaction') {
          return (callback: any) => runTransaction(callback);
        }
        return (mockPrisma as any)[prop];
      }
    }
  )
}));

import { recordStockIssueTx, recordStockReceiptTx } from '../../src/lib/finance/stock-mouvements';
import { listStockMovements } from '../../src/lib/finance/stock-journal';

const TENANT_ID = 'tenant-1';
const MAGASINIER_ID = 'user-magasinier';

function seedSite(overrides: Partial<Row> = {}): Row {
  const site = {
    id: nextId('chantier'),
    tenantId: TENANT_ID,
    name: `Chantier ${store.sites.length + 1}`,
    status: 'IN_PROGRESS',
    closedAt: null,
    finalCost: null,
    ...overrides
  };
  store.sites.push(site);
  return site;
}

function seedCostCategory(overrides: Partial<Row> = {}): Row {
  const category = {
    id: nextId('poste'),
    tenantId: TENANT_ID,
    label: 'Gros œuvre',
    isActive: true,
    ...overrides
  };
  store.categories.push(category);
  return category;
}

function seedItem(overrides: Partial<Row> = {}): Row {
  const item = {
    id: nextId('article'),
    tenantId: TENANT_ID,
    reference: `ART-${store.items.length + 1}`,
    label: 'Ciment CPJ 45',
    unit: 'sac',
    category: 'Ciment',
    defaultCostCategoryId: null,
    isActive: true,
    ...overrides
  };
  store.items.push(item);
  return item;
}

function seedLocation(overrides: Partial<Row> = {}): Row {
  const location = {
    id: nextId('lieu'),
    tenantId: TENANT_ID,
    kind: 'WAREHOUSE',
    label: `Magasin ${store.locations.length + 1}`,
    siteId: null,
    isActive: true,
    ...overrides
  };
  store.locations.push(location);
  return location;
}

function seedInvoice(overrides: Partial<Row> = {}): Row {
  const invoice = {
    id: nextId('facture'),
    tenantId: TENANT_ID,
    reference: `FAC-${store.invoices.length + 1}`,
    status: 'VALIDATED',
    ...overrides
  };
  store.invoices.push(invoice);
  return invoice;
}

async function receive(
  location: Row,
  invoice: Row,
  lines: Array<{ itemId: string; quantity: number; unitCost: number }>,
  receiptDate = new Date('2026-03-01')
) {
  return runTransaction((tx: any) =>
    recordStockReceiptTx(tx, TENANT_ID, {
      locationId: location.id,
      supplierInvoiceId: invoice.id,
      receiptDate,
      lines,
      createdByUserId: MAGASINIER_ID
    })
  );
}

async function issue(
  location: Row,
  item: Row,
  site: Row,
  category: Row,
  quantity: number,
  overrides: Partial<Row> = {}
) {
  return runTransaction((tx: any) =>
    recordStockIssueTx(tx, TENANT_ID, {
      locationId: location.id,
      itemId: item.id,
      quantity,
      siteId: site.id,
      costCategoryId: category.id,
      requestedBy: 'Chef de chantier Camara',
      issueDate: new Date('2026-03-10'),
      createdByUserId: MAGASINIER_ID,
      ...overrides
    } as any)
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  store.sites = [];
  store.categories = [];
  store.items = [];
  store.locations = [];
  store.invoices = [];
  store.balances = [];
  store.movements = [];
  store.allocations = [];
  store.users = [{ id: MAGASINIER_ID, fullName: 'Aïssatou Barry', email: 'a.barry@example.gn' }];
  store.seq = 0;
  COMPTES_PAR_POSTE.clear();

  postDocumentEntryTx.mockImplementation(async () => ({ entryId: nextId('ecriture'), totalDebit: 0, totalCredit: 0 }));
});

describe('listStockMovements', () => {
  it('filtre par nature, par chantier et par période', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    const site = seedSite();
    const autre = seedSite();
    const poste = seedCostCategory();

    await receive(location, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 5_000 }], new Date('2026-03-01'));
    await issue(location, ciment, site, poste, 10);

    expect(await listStockMovements(TENANT_ID, {})).toHaveLength(2);
    expect(await listStockMovements(TENANT_ID, { type: 'ISSUE' })).toHaveLength(1);
    expect(await listStockMovements(TENANT_ID, { siteId: site.id })).toHaveLength(1);
    expect(await listStockMovements(TENANT_ID, { siteId: autre.id })).toHaveLength(0);
    expect(
      await listStockMovements(TENANT_ID, { from: new Date('2026-03-05'), to: new Date('2026-03-31') })
    ).toHaveLength(1);
  });

  it('renvoie le plus récent en tête, avec le demandeur et la facture d’origine', async () => {
    const location = seedLocation();
    const invoice = seedInvoice({ reference: 'FAC-2026-014' });
    const ciment = seedItem();
    const site = seedSite();
    const poste = seedCostCategory();

    await receive(location, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 5_000 }], new Date('2026-03-01'));
    await issue(location, ciment, site, poste, 10);

    const mouvements = await listStockMovements(TENANT_ID, {});
    expect(mouvements[0].type).toBe('ISSUE');
    expect(mouvements[0].requestedBy).toBe('Chef de chantier Camara');
    expect(mouvements[0].createdByLabel).toBe('Aïssatou Barry');
    expect(mouvements[1].type).toBe('RECEIPT');
    expect(mouvements[1].supplierInvoiceReference).toBe('FAC-2026-014');
    expect(mouvements[1].siteId).toBeNull();
  });
});
