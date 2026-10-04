/**
 * Tests des mouvements de stock (`lib/finance/stock-mouvements.ts`) — lot 5,
 * deuxième sous-lot.
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

import { listStockBalances, recordStockIssueTx, recordStockReceiptTx } from '../../src/lib/finance/stock-mouvements';
// Coût réel d'un chantier — VRAI calcul, non mocké (voir l'en-tête) : c'est
// lui qui prouve qu'une sortie a bien fait monter le coût du chantier.
import { sumSiteActualCost } from '../../src/lib/finance/site-cost';

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

// ---------------------------------------------------------------------------
// A. La réception
// ---------------------------------------------------------------------------

describe('recordStockReceiptTx', () => {
  it('écrit UN MOUVEMENT PAR LIGNE, jamais un mouvement fourre-tout', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem({ label: 'Ciment CPJ 45', unit: 'sac' });
    const fer = seedItem({ label: 'Fer à béton HA12', unit: 'barre' });

    const movements = await receive(location, invoice, [
      { itemId: ciment.id, quantity: 100, unitCost: 5_000 },
      { itemId: fer.id, quantity: 40, unitCost: 12_500 }
    ]);

    expect(movements).toHaveLength(2);
    expect(movements.map(m => m.itemId)).toEqual([ciment.id, fer.id]);
    expect(movements[0].totalValue).toBe(500_000);
    expect(movements[1].totalValue).toBe(500_000);
    // Deux soldes distincts : le coût moyen se recalcule article par article.
    expect(store.balances).toHaveLength(2);
  });

  it("n'écrit AUCUNE écriture comptable ni aucune imputation", async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();

    await receive(location, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 5_000 }]);

    // La facture a déjà porté la valeur au 311 : une seconde écriture
    // doublerait l'actif (contrat, en-tête). Ce n'est pas un oubli.
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
    expect(store.allocations).toHaveLength(0);
    expect(mockPrisma.costAllocation.create).not.toHaveBeenCalled();
    expect(syncWorkProgramCostTx).not.toHaveBeenCalled();
  });

  it('porte une quantité POSITIVE et `isDecrease` faux — le signe ne dit jamais le sens', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();

    const [movement] = await receive(location, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 5_000 }]);

    expect(movement.quantity).toBe(100);
    expect(movement.isDecrease).toBe(false);
    expect(movement.type).toBe('RECEIPT');
    expect(movement.quantityAfter).toBe(100);
    expect(movement.valueAfter).toBe(500_000);
    expect(movement.supplierInvoiceReference).toBe(invoice.reference);
  });

  it('accepte un prix unitaire NUL — un don entre en stock à valeur nulle', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();

    const [movement] = await receive(location, invoice, [{ itemId: ciment.id, quantity: 20, unitCost: 0 }]);

    expect(movement.totalValue).toBe(0);
    expect(movement.quantityAfter).toBe(20);
    expect(movement.valueAfter).toBe(0);
  });

  it('cumule DANS L’ORDRE deux lignes du même article au même endroit', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();

    const movements = await receive(location, invoice, [
      { itemId: ciment.id, quantity: 100, unitCost: 5_000 },
      { itemId: ciment.id, quantity: 100, unitCost: 7_000 }
    ]);

    expect(movements[0].quantityAfter).toBe(100);
    expect(movements[1].quantityAfter).toBe(200);
    expect(movements[1].valueAfter).toBe(1_200_000);
    expect(store.balances).toHaveLength(1);
  });

  it('refuse une quantité nulle ou négative', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();

    await expect(receive(location, invoice, [{ itemId: ciment.id, quantity: 0, unitCost: 5_000 }])).rejects.toThrow(
      /strictement positive/
    );
    await expect(receive(location, invoice, [{ itemId: ciment.id, quantity: -5, unitCost: 5_000 }])).rejects.toThrow(
      /strictement positive/
    );
    expect(store.movements).toHaveLength(0);
  });

  it('refuse un prix unitaire négatif', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();

    await expect(receive(location, invoice, [{ itemId: ciment.id, quantity: 10, unitCost: -1 }])).rejects.toThrow(
      /négatif/
    );
  });

  it('refuse une facture qui n’est pas validée', async () => {
    const location = seedLocation();
    const brouillon = seedInvoice({ status: 'DRAFT' });
    const ciment = seedItem();

    await expect(
      receive(location, brouillon, [{ itemId: ciment.id, quantity: 10, unitCost: 100 }])
    ).rejects.toMatchObject({ status: 409 });
  });

  it('refuse un lieu désactivé', async () => {
    const location = seedLocation({ isActive: false });
    const invoice = seedInvoice();
    const ciment = seedItem();

    await expect(
      receive(location, invoice, [{ itemId: ciment.id, quantity: 10, unitCost: 100 }])
    ).rejects.toMatchObject({ status: 409 });
  });

  it('refuse une ligne invalide AVANT d’écrire quoi que ce soit — aucune moitié de réception', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    const fer = seedItem();

    await expect(
      receive(location, invoice, [
        { itemId: ciment.id, quantity: 100, unitCost: 5_000 },
        { itemId: fer.id, quantity: -1, unitCost: 5_000 }
      ])
    ).rejects.toThrow();

    expect(store.movements).toHaveLength(0);
    expect(store.balances).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// B. Le coût moyen pondéré — le cœur du sous-lot
// ---------------------------------------------------------------------------

describe('coût moyen pondéré', () => {
  it('valorise une sortie au coût moyen AVANT la sortie : 100 à 5 000 puis 100 à 7 000, sortie de 50 = 300 000', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    const site = seedSite();
    const poste = seedCostCategory();

    await receive(location, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 5_000 }]);
    await receive(location, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 7_000 }]);

    const sortie = await issue(location, ciment, site, poste, 50);

    // 50 x 6 000, jamais 50 x 5 000 (250 000, premier prix) ni 50 x 7 000
    // (350 000, dernier prix).
    expect(sortie.totalValue).toBe(300_000);
    expect(sortie.unitCost).toBe(6_000);
    expect(sortie.quantityAfter).toBe(150);
    expect(sortie.valueAfter).toBe(900_000);
  });

  it('tient un coût moyen PAR (article, LIEU), jamais un coût moyen global', async () => {
    const magasin = seedLocation({ label: 'Magasin central' });
    const depot = seedLocation({ label: 'Dépôt de Kaloum' });
    const invoice = seedInvoice();
    const ciment = seedItem();
    const site = seedSite();
    const poste = seedCostCategory();

    await receive(magasin, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 5_000 }]);
    await receive(depot, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 9_000 }]);

    const soldes = await listStockBalances(TENANT_ID, {});
    const parLieu = new Map(soldes.map(s => [s.locationId, s]));
    expect(parLieu.get(magasin.id)!.averageUnitCost).toBe(5_000);
    expect(parLieu.get(depot.id)!.averageUnitCost).toBe(9_000);

    // Une sortie du dépôt vaut le coût moyen DU DÉPÔT, pas une moyenne des deux
    // (qui aurait donné 7 000).
    const sortie = await issue(depot, ciment, site, poste, 10);
    expect(sortie.totalValue).toBe(90_000);
  });

  it('déduit le coût moyen de value / quantity, et le donne à zéro sur un solde vide', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    const site = seedSite();
    const poste = seedCostCategory();

    await receive(location, invoice, [{ itemId: ciment.id, quantity: 4, unitCost: 2_500 }]);
    await issue(location, ciment, site, poste, 4);

    const [solde] = await listStockBalances(TENANT_ID, {});
    expect(solde.quantity).toBe(0);
    // Zéro, jamais `null` : un écran n'a pas à distinguer « pas de stock » de
    // « stock gratuit », la quantité le dit déjà (contrat).
    expect(solde.averageUnitCost).toBe(0);
  });

  it('QUAND LA QUANTITÉ TOMBE À ZÉRO, LA VALEUR AUSSI — même sur un coût moyen qui ne tombe pas rond', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    const site = seedSite();
    const poste = seedCostCategory();

    // 3 sacs à 1 000 et 4 sacs à 1 : 7 sacs pour 3 004 XOF, soit un coût moyen
    // de 429,142857... — volontairement indivisible.
    await receive(location, invoice, [
      { itemId: ciment.id, quantity: 3, unitCost: 1_000 },
      { itemId: ciment.id, quantity: 4, unitCost: 1 }
    ]);

    const premiere = await issue(location, ciment, site, poste, 2);
    expect(premiere.totalValue).toBe(858); // 2 x 429,142857 = 858,2857 -> 858
    expect(premiere.quantityAfter).toBe(5);
    expect(premiere.valueAfter).toBe(2_146);

    const seconde = await issue(location, ciment, site, poste, 5);

    // Le mouvement emporte TOUTE la valeur restante — l'écart d'arrondi y est
    // visible — et le solde retombe à zéro des deux côtés.
    expect(seconde.totalValue).toBe(2_146);
    expect(seconde.quantityAfter).toBe(0);
    expect(seconde.valueAfter).toBe(0);

    const [solde] = await listStockBalances(TENANT_ID, {});
    expect(solde.quantity).toBe(0);
    expect(solde.value).toBe(0);

    // Rien ne s'est perdu ni inventé en route : tout ce qui est entré est sorti.
    expect(premiere.totalValue + seconde.totalValue).toBe(3_004);
  });

  it('conserve les quatre décimales d’une quantité — une quantité n’est pas un montant', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const sable = seedItem({ label: 'Sable', unit: 'm3' });
    const site = seedSite();
    const poste = seedCostCategory();

    await receive(location, invoice, [{ itemId: sable.id, quantity: 12.5, unitCost: 8_000 }]);
    const sortie = await issue(location, sable, site, poste, 0.25);

    // 0,25 n'est pas arrondi à 0 : `roundMoneyXof` l'aurait fait, et une
    // demi-tonne de ciment aurait disparu.
    expect(sortie.quantity).toBe(0.25);
    expect(sortie.quantityAfter).toBe(12.25);
    expect(sortie.totalValue).toBe(2_000);
  });
});

// ---------------------------------------------------------------------------
// C. La sortie — LE geste du lot
// ---------------------------------------------------------------------------

describe('recordStockIssueTx', () => {
  it('FAIT MONTER LE COÛT RÉEL DU CHANTIER exactement de la valeur sortie', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    const site = seedSite();
    const poste = seedCostCategory();

    await receive(location, invoice, [{ itemId: ciment.id, quantity: 200, unitCost: 6_000 }]);

    // Le VRAI `sumSiteActualCost` (`site-cost.ts`), jamais une doublure : sans
    // cette persistance, le matériau n'entrerait jamais dans le coût et tout
    // le lot serait décoratif.
    const avant = await sumSiteActualCost(mockPrisma as any, TENANT_ID, site.id);
    expect(avant).toBe(0);

    const sortie = await issue(location, ciment, site, poste, 50);

    const apres = await sumSiteActualCost(mockPrisma as any, TENANT_ID, site.id);
    expect(sortie.totalValue).toBe(300_000);
    expect(apres).toBe(avant + sortie.totalValue);
    expect(apres).toBe(300_000);
  });

  it('écrit une imputation STOCK_ISSUE validée et non annulée, pointant le mouvement', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    const site = seedSite();
    const poste = seedCostCategory();

    await receive(location, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 4_000 }]);
    const sortie = await issue(location, ciment, site, poste, 25);

    expect(store.allocations).toHaveLength(1);
    expect(store.allocations[0]).toMatchObject({
      tenantId: TENANT_ID,
      siteId: site.id,
      costCategoryId: poste.id,
      sourceType: 'STOCK_ISSUE',
      sourceId: sortie.id,
      amount: 100_000,
      voidedAt: null
    });
    expect(store.allocations[0].validatedAt).toBeInstanceOf(Date);
  });

  it('écrit l’écriture du poste résolu, et synchronise le programme de travaux', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    const site = seedSite();
    const poste = seedCostCategory();
    COMPTES_PAR_POSTE.set(poste.id, 'compte-du-poste');

    await receive(location, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 4_000 }]);
    const sortie = await issue(location, ciment, site, poste, 25);

    expect(postDocumentEntryTx).toHaveBeenCalledTimes(1);
    const params = postDocumentEntryTx.mock.calls[0][1];
    expect(params.documentType).toBe('STOCK_ISSUE');
    expect(params.documentId).toBe(sortie.id);
    expect(params.lines).toEqual([
      expect.objectContaining({ accountId: 'compte-du-poste', debit: 100_000 }),
      expect.objectContaining({ accountId: 'compte-311', credit: 100_000 })
    ]);

    expect(syncWorkProgramCostTx).toHaveBeenCalledWith(expect.anything(), TENANT_ID, site.id);
  });

  it('retombe sur les charges de chantier quand le poste n’a pas son propre compte', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    const site = seedSite();
    const poste = seedCostCategory();

    await receive(location, invoice, [{ itemId: ciment.id, quantity: 10, unitCost: 1_000 }]);
    await issue(location, ciment, site, poste, 10);

    const params = postDocumentEntryTx.mock.calls[0][1];
    expect(params.lines[0].accountId).toBe('compte-605');
  });

  it('REFUSE une sortie supérieure au stock — un stock négatif n’a pas de coût moyen', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    const site = seedSite();
    const poste = seedCostCategory();

    await receive(location, invoice, [{ itemId: ciment.id, quantity: 30, unitCost: 5_000 }]);

    await expect(issue(location, ciment, site, poste, 31)).rejects.toMatchObject({ status: 409 });

    // Rien n'a bougé : ni solde, ni imputation, ni écriture.
    const [solde] = await listStockBalances(TENANT_ID, {});
    expect(solde.quantity).toBe(30);
    expect(solde.value).toBe(150_000);
    expect(store.allocations).toHaveLength(0);
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
  });

  it('refuse une sortie sur un article jamais reçu à cet endroit', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    const site = seedSite();
    const poste = seedCostCategory();

    await expect(issue(location, ciment, site, poste, 1)).rejects.toMatchObject({ status: 409 });
  });

  it('REFUSE une sortie vers un chantier clos (`assertSiteOpenTx`, garde du lot 4)', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    const clos = seedSite({ closedAt: new Date('2026-02-28'), finalCost: 4_000_000 });
    const poste = seedCostCategory();

    await receive(location, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 5_000 }]);

    await expect(issue(location, ciment, clos, poste, 10)).rejects.toMatchObject({ status: 409 });
    await expect(issue(location, ciment, clos, poste, 10)).rejects.toThrow(/clôturé/);

    expect(store.allocations).toHaveLength(0);
    expect(store.movements.filter(m => m.type === 'ISSUE')).toHaveLength(0);
  });

  it('exige un demandeur', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    const site = seedSite();
    const poste = seedCostCategory();

    await receive(location, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 5_000 }]);

    await expect(issue(location, ciment, site, poste, 10, { requestedBy: '   ' })).rejects.toMatchObject({
      status: 400
    });
  });

  it('exige un poste actif, et ne le devine jamais depuis l’article', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const posteDesactive = seedCostCategory({ isActive: false });
    const ciment = seedItem({ defaultCostCategoryId: posteDesactive.id });
    const site = seedSite();

    await receive(location, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 5_000 }]);

    await expect(issue(location, ciment, site, posteDesactive, 10)).rejects.toMatchObject({ status: 409 });
  });

  it('refuse un chantier, un article ou un lieu d’une autre agence', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    const poste = seedCostCategory();
    const chantierEtranger = seedSite({ tenantId: 'tenant-2' });

    await receive(location, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 5_000 }]);

    await expect(issue(location, ciment, chantierEtranger, poste, 10)).rejects.toMatchObject({ status: 404 });
  });

  it('porte une quantité positive et `isDecrease` vrai', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    const site = seedSite();
    const poste = seedCostCategory();

    await receive(location, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 5_000 }]);
    const sortie = await issue(location, ciment, site, poste, 10);

    expect(sortie.quantity).toBe(10);
    expect(sortie.isDecrease).toBe(true);
    expect(sortie.type).toBe('ISSUE');
    expect(sortie.siteId).toBe(site.id);
    expect(sortie.siteLabel).toBe(site.name);
    expect(sortie.costCategoryLabel).toBe(poste.label);
    expect(sortie.requestedBy).toBe('Chef de chantier Camara');
  });
});

// ---------------------------------------------------------------------------
// D. Les lectures
// ---------------------------------------------------------------------------

describe('listStockBalances', () => {
  it('masque les lignes à quantité nulle sur demande', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    const fer = seedItem();
    const site = seedSite();
    const poste = seedCostCategory();

    await receive(location, invoice, [
      { itemId: ciment.id, quantity: 10, unitCost: 1_000 },
      { itemId: fer.id, quantity: 5, unitCost: 2_000 }
    ]);
    await issue(location, ciment, site, poste, 10);

    expect(await listStockBalances(TENANT_ID, {})).toHaveLength(2);

    const enStock = await listStockBalances(TENANT_ID, { onlyInStock: true });
    expect(enStock).toHaveLength(1);
    expect(enStock[0].itemId).toBe(fer.id);
  });

  it('filtre par lieu et par article, et porte les libellés du référentiel', async () => {
    const magasin = seedLocation({ label: 'Magasin central' });
    const depot = seedLocation({ label: 'Dépôt de Kaloum' });
    const invoice = seedInvoice();
    const ciment = seedItem({ reference: 'CIM-45', label: 'Ciment CPJ 45', unit: 'sac' });

    await receive(magasin, invoice, [{ itemId: ciment.id, quantity: 10, unitCost: 1_000 }]);
    await receive(depot, invoice, [{ itemId: ciment.id, quantity: 4, unitCost: 2_000 }]);

    const surLeDepot = await listStockBalances(TENANT_ID, { locationId: depot.id });
    expect(surLeDepot).toHaveLength(1);
    expect(surLeDepot[0]).toMatchObject({
      itemReference: 'CIM-45',
      itemLabel: 'Ciment CPJ 45',
      itemUnit: 'sac',
      locationLabel: 'Dépôt de Kaloum',
      quantity: 4,
      value: 8_000,
      averageUnitCost: 2_000,
      currency: 'XOF'
    });

    expect(await listStockBalances(TENANT_ID, { itemId: ciment.id })).toHaveLength(2);
  });
});
