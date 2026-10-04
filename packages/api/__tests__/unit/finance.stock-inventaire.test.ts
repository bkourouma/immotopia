/**
 * Tests des transferts et de l'inventaire physique
 * (`lib/finance/stock-inventaire.ts`) — lot 5, troisième sous-lot.
 *
 * Modèle : `__tests__/unit/finance.stock-mouvements.test.ts` (sous-lot 2).
 *
 * `accounting.ts` (moteur comptable général) est mocké, même geste qu'aux
 * sous-lots précédents : ce fichier ne teste pas comment une écriture
 * s'équilibre, seulement comment `stock-inventaire.ts` l'appelle — et surtout
 * **quand il ne l'appelle pas du tout**.
 *
 * **`site-cost.ts` (`sumSiteActualCost`) N'EST PAS mocké.** C'est le VRAI
 * calcul qui doit prouver le critère le plus piégeux du sous-lot : un transfert
 * vers le lieu d'un chantier n'impute rien, et le coût réel du chantier ne
 * bouge pas d'un franc. Une doublure qui l'affirmerait à sa place ne
 * prouverait rien.
 *
 * `site-closing.ts` n'est pas mocké non plus, et pour cause : ce fichier ne
 * l'appelle jamais. Le test « un transfert vers un chantier CLOS est accepté »
 * documente ce choix, pour que personne ne le « corrige ».
 */

const postDocumentEntryTx = jest.fn();

const COMPTES_OPERATIONNELS = new Map<string, string>([
  ['311', 'compte-311'],
  ['603', 'compte-603'],
  ['605', 'compte-605']
]);

jest.mock('../../src/lib/finance/accounting', () => ({
  postDocumentEntryTx: (...args: any[]) => postDocumentEntryTx(...args),
  ensureOperationalJournalTx: async () => 'journal-operationnel',
  ensureOperationalChartOfAccountsTx: async () => COMPTES_OPERATIONNELS
}));

// ---------------------------------------------------------------------------
// Magasin en mémoire
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

const store = {
  sites: [] as Row[],
  items: [] as Row[],
  locations: [] as Row[],
  balances: [] as Row[],
  movements: [] as Row[],
  counts: [] as Row[],
  countLines: [] as Row[],
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
  if (include.createdBy) enriched.createdBy = store.users.find(u => u.id === row.createdByUserId) ?? null;
  return enriched;
}

/** Les lignes d'un inventaire, enrichies de leur article. */
function linesOf(countId: string): Row[] {
  return store.countLines
    .filter(line => line.countId === countId)
    .map(line => ({ ...line, item: store.items.find(i => i.id === line.itemId) ?? null }));
}

function enrichCount(row: Row, include?: Row): Row {
  if (!include) {
    return row;
  }
  const enriched: Row = { ...row };
  if (include.location) enriched.location = store.locations.find(l => l.id === row.locationId) ?? null;
  if (include.createdBy) enriched.createdBy = store.users.find(u => u.id === row.createdByUserId) ?? null;
  if (include.lines) enriched.lines = linesOf(row.id);
  return enriched;
}

/** `{ in: [...] }` ou valeur scalaire : les deux formes du filtre Prisma. */
function matchesFilter(value: any, filter: any): boolean {
  if (filter === undefined) return true;
  if (filter && typeof filter === 'object' && Array.isArray(filter.in)) return filter.in.includes(value);
  return value === filter;
}

const mockPrisma: Row = {
  stockItem: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.items.find(i => i.id === where.id && i.tenantId === where.tenantId) ?? null
    )
  },

  stockLocation: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.locations.find(l => l.id === where.id && l.tenantId === where.tenantId) ?? null
    )
  },

  stockBalance: {
    findFirst: jest.fn(
      async ({ where }: Row) =>
        store.balances.find(
          b => b.tenantId === where.tenantId && b.itemId === where.itemId && b.locationId === where.locationId
        ) ?? null
    ),
    findMany: jest.fn(async ({ where }: Row) =>
      store.balances.filter(
        b =>
          b.tenantId === where.tenantId &&
          matchesFilter(b.locationId, where.locationId) &&
          matchesFilter(b.itemId, where.itemId)
      )
    ),
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
    })
  },

  stockCount: {
    findFirst: jest.fn(async ({ where, include }: Row) => {
      const row = store.counts.find(
        c =>
          c.tenantId === where.tenantId &&
          (where.id === undefined || c.id === where.id) &&
          (where.locationId === undefined || c.locationId === where.locationId) &&
          (where.status === undefined || c.status === where.status)
      );
      return row ? enrichCount(row, include) : null;
    }),
    findMany: jest.fn(async ({ where, include }: Row) => {
      const rows = store.counts.filter(
        c =>
          c.tenantId === where.tenantId &&
          (where.locationId === undefined || c.locationId === where.locationId) &&
          (where.status === undefined || c.status === where.status)
      );
      return [...rows]
        .sort((a, b) => b.countedAt.getTime() - a.countedAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime())
        .map(row => enrichCount(row, include));
    }),
    create: jest.fn(async ({ data }: Row) => {
      const created = {
        id: nextId('inventaire'),
        validatedAt: null,
        validatedByUserId: null,
        createdAt: new Date(Date.now() + store.counts.length),
        updatedAt: new Date(),
        ...data
      };
      store.counts.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.counts.find(c => c.id === where.id)!;
      Object.assign(row, data);
      return row;
    })
  },

  stockCountLine: {
    findFirst: jest.fn(
      async ({ where }: Row) =>
        store.countLines.find(l => l.countId === where.countId && l.itemId === where.itemId) ?? null
    ),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('ligne'), reason: null, ...data };
      store.countLines.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.countLines.find(l => l.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    delete: jest.fn(async ({ where }: Row) => {
      const index = store.countLines.findIndex(l => l.id === where.id);
      const [removed] = store.countLines.splice(index, 1);
      return removed;
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
    counts: structuredClone(store.counts),
    countLines: structuredClone(store.countLines),
    allocations: structuredClone(store.allocations),
    seq: store.seq
  };
  try {
    return await callback(mockPrisma);
  } catch (error) {
    store.balances = snapshot.balances;
    store.movements = snapshot.movements;
    store.counts = snapshot.counts;
    store.countLines = snapshot.countLines;
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

import {
  createStockCountTx,
  getStockCount,
  listStockCounts,
  removeStockCountLineTx,
  setStockCountLineTx,
  validateStockCountTx
} from '../../src/lib/finance/stock-inventaire';
// Le transfert vit dans son propre fichier depuis le lot 040 (fondations) ; les
// tests de l'inventaire s'en servent pour faire bouger le stock entre comptage
// et validation.
import { recordStockTransferTx } from '../../src/lib/finance/stock-transferts';
// Coût réel d'un chantier — VRAI calcul, non mocké (voir l'en-tête).
import { sumSiteActualCost } from '../../src/lib/finance/site-cost';

const TENANT_ID = 'tenant-1';
const MAGASINIER_ID = 'user-magasinier';
const VALIDATEUR_ID = 'user-validateur';

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

function seedItem(overrides: Partial<Row> = {}): Row {
  const item = {
    id: nextId('article'),
    tenantId: TENANT_ID,
    reference: `ART-${String(store.items.length + 1).padStart(3, '0')}`,
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

/**
 * Pose un solde tel qu'il serait après des réceptions — `stock-mouvements.ts`
 * n'est pas rejoué ici, il est livré et vert. Ce qui est testé, c'est ce que
 * transferts et ajustements FONT d'un solde, pas comment il est né.
 */
function seedBalance(location: Row, item: Row, quantity: number, value: number): Row {
  const balance = {
    id: nextId('solde'),
    tenantId: TENANT_ID,
    itemId: item.id,
    locationId: location.id,
    quantity,
    value,
    currency: 'XOF',
    updatedAt: new Date()
  };
  store.balances.push(balance);
  return balance;
}

function soldeDe(location: Row, item: Row): Row | undefined {
  return store.balances.find(b => b.locationId === location.id && b.itemId === item.id);
}

function valeurDe(location: Row, item: Row): number {
  return Number(soldeDe(location, item)?.value ?? 0);
}

async function transfer(from: Row, to: Row, item: Row, quantity: number, transferDate = new Date('2026-04-05')) {
  return runTransaction((tx: any) =>
    recordStockTransferTx(tx, TENANT_ID, {
      fromLocationId: from.id,
      toLocationId: to.id,
      itemId: item.id,
      quantity,
      transferDate,
      createdByUserId: MAGASINIER_ID
    })
  );
}

async function openCount(location: Row, countedAt = new Date('2026-04-10')) {
  return runTransaction((tx: any) =>
    createStockCountTx(tx, TENANT_ID, { locationId: location.id, countedAt, createdByUserId: MAGASINIER_ID })
  );
}

async function setLine(countId: string, item: Row, countedQuantity: number, reason?: string | null) {
  return runTransaction((tx: any) =>
    setStockCountLineTx(tx, TENANT_ID, countId, { itemId: item.id, countedQuantity, reason })
  );
}

async function validateCount(countId: string) {
  return runTransaction((tx: any) => validateStockCountTx(tx, TENANT_ID, countId, VALIDATEUR_ID));
}

beforeEach(() => {
  jest.clearAllMocks();
  store.sites = [];
  store.items = [];
  store.locations = [];
  store.balances = [];
  store.movements = [];
  store.counts = [];
  store.countLines = [];
  store.allocations = [];
  store.users = [
    { id: MAGASINIER_ID, fullName: 'Aïssatou Barry', email: 'a.barry@example.gn' },
    { id: VALIDATEUR_ID, fullName: 'Mamadou Diallo', email: 'm.diallo@example.gn' }
  ];
  store.seq = 0;

  postDocumentEntryTx.mockImplementation(async () => ({ entryId: nextId('ecriture'), totalDebit: 0, totalCredit: 0 }));
});

// ---------------------------------------------------------------------------
// B. Ouvrir un inventaire
// ---------------------------------------------------------------------------

describe('createStockCountTx', () => {
  it('ouvre un inventaire en brouillon, sans aucune ligne', async () => {
    const magasin = seedLocation({ label: 'Magasin central' });

    const count = await openCount(magasin);

    expect(count).toMatchObject({
      tenantId: TENANT_ID,
      locationId: magasin.id,
      locationLabel: 'Magasin central',
      status: 'DRAFT',
      lines: [],
      varianceCount: 0,
      varianceValue: 0,
      currency: 'XOF',
      createdByLabel: 'Aïssatou Barry',
      validatedAt: null
    });
  });

  it('REFUSE un second inventaire en brouillon sur le même lieu', async () => {
    const magasin = seedLocation();
    await openCount(magasin);

    // Deux comptages simultanés du même dépôt produiraient deux vérités, et le
    // second validé écraserait le premier sans que personne ne le voie.
    await expect(openCount(magasin)).rejects.toMatchObject({ status: 409 });
    expect(store.counts).toHaveLength(1);
  });

  it('accepte un inventaire sur un AUTRE lieu, et un nouveau une fois le premier validé', async () => {
    const magasin = seedLocation();
    const depot = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);

    const premier = await openCount(magasin);
    await expect(openCount(depot)).resolves.toMatchObject({ status: 'DRAFT' });

    await setLine(premier.id, ciment, 10);
    await validateCount(premier.id);

    await expect(openCount(magasin)).resolves.toMatchObject({ status: 'DRAFT' });
  });

  it('refuse un lieu désactivé, et un lieu d’une autre agence', async () => {
    const inactif = seedLocation({ isActive: false });
    const etranger = seedLocation({ tenantId: 'tenant-2' });

    await expect(openCount(inactif)).rejects.toMatchObject({ status: 409 });
    await expect(openCount(etranger)).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// C. Saisir une ligne — la quantité attendue est FIGÉE ici
// ---------------------------------------------------------------------------

describe('setStockCountLineTx', () => {
  it('FIGE `expectedQuantity` depuis le stock, et ne la reçoit jamais en paramètre (P-4)', async () => {
    const magasin = seedLocation();
    const ciment = seedItem({ reference: 'CIM-45', label: 'Ciment CPJ 45', unit: 'sac' });
    seedBalance(magasin, ciment, 100, 500_000);

    const count = await openCount(magasin);
    const apres = await setLine(count.id, ciment, 92, 'Casse au déchargement');

    expect(apres.lines).toHaveLength(1);
    expect(apres.lines[0]).toMatchObject({
      itemId: ciment.id,
      itemReference: 'CIM-45',
      itemLabel: 'Ciment CPJ 45',
      itemUnit: 'sac',
      expectedQuantity: 100,
      countedQuantity: 92,
      variance: -8,
      reason: 'Casse au déchargement'
    });
    expect(apres.varianceCount).toBe(1);
    // Négative quand il manque : 8 sacs à 5 000.
    expect(apres.varianceValue).toBe(-40_000);
  });

  it('donne une quantité attendue NULLE sur un article jamais entré à cet endroit', async () => {
    const magasin = seedLocation();
    const fer = seedItem({ label: 'Fer à béton HA12', unit: 'barre' });

    const count = await openCount(magasin);
    const apres = await setLine(count.id, fer, 12, 'Retour de chantier non enregistré');

    expect(apres.lines[0]).toMatchObject({ expectedQuantity: 0, countedQuantity: 12, variance: 12 });
    // Coût moyen nul sur un stock vide : l'écart ne vaut rien, et c'est
    // consigné, pas caché.
    expect(apres.varianceValue).toBe(0);
  });

  it('REMPLACE le comptage quand le même article est rappelé — jamais une seconde ligne', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);

    const count = await openCount(magasin);
    await setLine(count.id, ciment, 92, 'Casse');
    const apres = await setLine(count.id, ciment, 95, 'Recomptage, deux sacs retrouvés');

    expect(apres.lines).toHaveLength(1);
    expect(apres.lines[0]).toMatchObject({
      countedQuantity: 95,
      variance: -5,
      reason: 'Recomptage, deux sacs retrouvés'
    });
    expect(store.countLines).toHaveLength(1);
  });

  it('accepte une quantité comptée NULLE — « il n’y a rien » est un résultat de comptage', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 40, 200_000);

    const count = await openCount(magasin);
    const apres = await setLine(count.id, ciment, 0, 'Vol présumé');

    expect(apres.lines[0]).toMatchObject({ countedQuantity: 0, variance: -40 });
    expect(apres.varianceValue).toBe(-200_000);
  });

  it('refuse une quantité comptée NÉGATIVE', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    const count = await openCount(magasin);

    await expect(setLine(count.id, ciment, -1, 'Erreur de saisie')).rejects.toMatchObject({ status: 400 });
    expect(store.countLines).toHaveLength(0);
  });

  it('refuse un inventaire introuvable, ou celui d’une autre agence, et un article inconnu', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    const etranger = seedItem({ tenantId: 'tenant-2' });
    const count = await openCount(magasin);

    await expect(setLine('inventaire-inexistant', ciment, 1)).rejects.toMatchObject({ status: 404 });
    await expect(setLine(count.id, etranger, 1)).rejects.toMatchObject({ status: 404 });
  });

  it('refuse toute saisie sur un inventaire DÉJÀ VALIDÉ', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);

    const count = await openCount(magasin);
    await setLine(count.id, ciment, 10);
    await validateCount(count.id);

    await expect(setLine(count.id, ciment, 9, 'Casse')).rejects.toMatchObject({ status: 409 });
  });
});

describe('removeStockCountLineTx', () => {
  it('retire une ligne du comptage', async () => {
    const magasin = seedLocation();
    const ciment = seedItem({ reference: 'CIM-45' });
    const fer = seedItem({ reference: 'FER-12' });
    seedBalance(magasin, ciment, 10, 50_000);
    seedBalance(magasin, fer, 5, 60_000);

    const count = await openCount(magasin);
    await setLine(count.id, ciment, 10);
    await setLine(count.id, fer, 5);

    const apres = await runTransaction((tx: any) => removeStockCountLineTx(tx, TENANT_ID, count.id, ciment.id));

    expect(apres.lines).toHaveLength(1);
    expect(apres.lines[0].itemId).toBe(fer.id);
    expect(store.countLines).toHaveLength(1);
  });

  it('refuse un article absent du comptage, et un inventaire déjà validé', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    const fer = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);

    const count = await openCount(magasin);
    await setLine(count.id, ciment, 10);

    await expect(
      runTransaction((tx: any) => removeStockCountLineTx(tx, TENANT_ID, count.id, fer.id))
    ).rejects.toMatchObject({ status: 404 });

    await validateCount(count.id);
    await expect(
      runTransaction((tx: any) => removeStockCountLineTx(tx, TENANT_ID, count.id, ciment.id))
    ).rejects.toMatchObject({ status: 409 });
  });
});

// ---------------------------------------------------------------------------
// D. Valider — les écarts deviennent des ajustements
// ---------------------------------------------------------------------------

describe('validateStockCountTx — où passe l’argent', () => {
  it('ON A TROUVÉ MOINS : débit 603, crédit 311, et le solde retombe au compté', async () => {
    const magasin = seedLocation();
    const ciment = seedItem({ label: 'Ciment CPJ 45' });
    seedBalance(magasin, ciment, 100, 500_000);

    const count = await openCount(magasin);
    await setLine(count.id, ciment, 92, 'Casse au déchargement');
    const valide = await validateCount(count.id);

    expect(valide.status).toBe('VALIDATED');
    expect(valide.validatedAt).toBeInstanceOf(Date);

    const ajustements = store.movements.filter(m => m.type === 'ADJUSTMENT');
    expect(ajustements).toHaveLength(1);
    expect(ajustements[0]).toMatchObject({
      isDecrease: true,
      quantity: 8,
      totalValue: 40_000,
      quantityAfter: 92,
      valueAfter: 460_000,
      stockCountId: count.id,
      reason: 'Casse au déchargement',
      createdByUserId: VALIDATEUR_ID
    });

    expect(postDocumentEntryTx).toHaveBeenCalledTimes(1);
    const params = postDocumentEntryTx.mock.calls[0][1];
    expect(params.documentType).toBe('STOCK_ADJUSTMENT');
    expect(params.documentId).toBe(ajustements[0].id);
    expect(params.lines).toEqual([
      expect.objectContaining({ accountId: 'compte-603', debit: 40_000 }),
      expect.objectContaining({ accountId: 'compte-311', credit: 40_000 })
    ]);

    expect(Number(soldeDe(magasin, ciment)!.quantity)).toBe(92);
    expect(valeurDe(magasin, ciment)).toBe(460_000);
  });

  it('ON A TROUVÉ PLUS : l’inverse — débit 311, crédit 603. Le 603 va dans les deux sens', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);

    const count = await openCount(magasin);
    await setLine(count.id, ciment, 106, 'Livraison non enregistrée retrouvée');
    await validateCount(count.id);

    const [ajustement] = store.movements.filter(m => m.type === 'ADJUSTMENT');
    expect(ajustement).toMatchObject({ isDecrease: false, quantity: 6, totalValue: 30_000, quantityAfter: 106 });

    const params = postDocumentEntryTx.mock.calls[0][1];
    expect(params.lines).toEqual([
      expect.objectContaining({ accountId: 'compte-311', debit: 30_000 }),
      expect.objectContaining({ accountId: 'compte-603', credit: 30_000 })
    ]);
  });

  it('N’IMPUTE JAMAIS UN CHANTIER : `CostAllocation` reste vide, même sur le lieu d’un chantier ouvert', async () => {
    const chantier = seedSite({ name: 'Résidence Kipé' });
    const lieuDuChantier = seedLocation({ kind: 'SITE', label: 'Chantier Kipé', siteId: chantier.id });
    const ciment = seedItem();
    seedBalance(lieuDuChantier, ciment, 80, 400_000);

    const count = await openCount(lieuDuChantier);
    await setLine(count.id, ciment, 60, 'Vol présumé sur le chantier');
    await validateCount(count.id);

    // Personne n'a décidé de consommer ce qui a disparu : un écart n'est pas
    // une dépense de chantier, et l'imputer ferait porter au chantier le coût
    // d'un vol.
    expect(store.allocations).toHaveLength(0);
    expect(mockPrisma.costAllocation.create).not.toHaveBeenCalled();
    expect(await sumSiteActualCost(mockPrisma as any, TENANT_ID, chantier.id)).toBe(0);

    // L'ajustement a bien eu lieu, lui.
    expect(store.movements.filter(m => m.type === 'ADJUSTMENT')).toHaveLength(1);
  });

  it('valorise au coût moyen COURANT du lieu, et vaut zéro sur un stock à quantité nulle', async () => {
    const magasin = seedLocation();
    const fer = seedItem({ label: 'Fer à béton HA12', unit: 'barre' });

    const count = await openCount(magasin);
    await setLine(count.id, fer, 15, 'Barres retrouvées derrière le hangar');
    await validateCount(count.id);

    const [ajustement] = store.movements.filter(m => m.type === 'ADJUSTMENT');
    // Sur un stock à quantité nulle, le coût moyen est nul et l'entrée vaut
    // zéro : c'est consigné, pas caché (contrat).
    expect(ajustement).toMatchObject({
      isDecrease: false,
      quantity: 15,
      unitCost: 0,
      totalValue: 0,
      quantityAfter: 15
    });
    expect(Number(soldeDe(magasin, fer)!.quantity)).toBe(15);
    expect(valeurDe(magasin, fer)).toBe(0);
  });

  it('emporte toute la valeur restante quand le comptage ramène le solde à zéro', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    // 7 sacs pour 3 004 : coût moyen indivisible.
    seedBalance(magasin, ciment, 7, 3_004);

    const count = await openCount(magasin);
    await setLine(count.id, ciment, 0, 'Dépôt vidé, rien retrouvé');
    await validateCount(count.id);

    const [ajustement] = store.movements.filter(m => m.type === 'ADJUSTMENT');
    expect(ajustement).toMatchObject({
      isDecrease: true,
      quantity: 7,
      totalValue: 3_004,
      quantityAfter: 0,
      valueAfter: 0
    });
    expect(valeurDe(magasin, ciment)).toBe(0);
  });
});

describe('validateStockCountTx — ce qui est écrit, et ce qui ne l’est pas', () => {
  it('N’ÉCRIT UN AJUSTEMENT QUE POUR LES LIGNES EN ÉCART — une ligne qui tombe juste ne produit rien', async () => {
    const magasin = seedLocation();
    const ciment = seedItem({ reference: 'CIM-45', label: 'Ciment CPJ 45' });
    const fer = seedItem({ reference: 'FER-12', label: 'Fer à béton HA12' });
    seedBalance(magasin, ciment, 100, 500_000);
    seedBalance(magasin, fer, 40, 480_000);

    const count = await openCount(magasin);
    await setLine(count.id, ciment, 100); // conforme, aucun motif nécessaire
    await setLine(count.id, fer, 37, 'Trois barres cassées');

    const valide = await validateCount(count.id);

    expect(valide.varianceCount).toBe(1);
    const ajustements = store.movements.filter(m => m.type === 'ADJUSTMENT');
    expect(ajustements).toHaveLength(1);
    expect(ajustements[0].itemId).toBe(fer.id);
    expect(postDocumentEntryTx).toHaveBeenCalledTimes(1);

    // Le solde conforme n'a pas été touché.
    expect(Number(soldeDe(magasin, ciment)!.quantity)).toBe(100);
    expect(valeurDe(magasin, ciment)).toBe(500_000);
  });

  it('REFUSE tant qu’une ligne en écart n’a pas de motif (besoin S6), et n’écrit alors RIEN', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    const fer = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);
    seedBalance(magasin, fer, 40, 480_000);

    const count = await openCount(magasin);
    await setLine(count.id, ciment, 95, 'Casse');
    await setLine(count.id, fer, 37); // écart muet

    await expect(validateCount(count.id)).rejects.toMatchObject({ status: 409 });

    // Refusé AVANT le premier ajustement : une validation à moitié écrite
    // laisserait un écart ajusté dans un comptage encore en brouillon.
    expect(store.movements).toHaveLength(0);
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
    expect(store.counts[0].status).toBe('DRAFT');
    expect(valeurDe(magasin, ciment)).toBe(500_000);
  });

  it('refuse un motif réduit à des espaces', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);

    const count = await openCount(magasin);
    await setLine(count.id, ciment, 95, '   ');

    await expect(validateCount(count.id)).rejects.toMatchObject({ status: 409 });
  });

  it('refuse un inventaire SANS AUCUNE LIGNE — un comptage vide ne dit rien', async () => {
    const magasin = seedLocation();
    const count = await openCount(magasin);

    // Le laisser passer se lirait comme « tout est conforme », la pire des
    // lectures possibles.
    await expect(validateCount(count.id)).rejects.toMatchObject({ status: 409 });
    expect(store.counts[0].status).toBe('DRAFT');
  });

  it('refuse un inventaire DÉJÀ VALIDÉ, et un inventaire introuvable', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);

    const count = await openCount(magasin);
    await setLine(count.id, ciment, 9, 'Casse');
    await validateCount(count.id);

    await expect(validateCount(count.id)).rejects.toMatchObject({ status: 409 });
    await expect(validateCount('inventaire-inexistant')).rejects.toMatchObject({ status: 404 });
    expect(store.movements.filter(m => m.type === 'ADJUSTMENT')).toHaveLength(1);
  });

  it('un inventaire entièrement conforme se valide sans écrire aucun mouvement ni aucune écriture', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);

    const count = await openCount(magasin);
    await setLine(count.id, ciment, 100);
    const valide = await validateCount(count.id);

    expect(valide.status).toBe('VALIDATED');
    expect(valide.varianceCount).toBe(0);
    expect(store.movements).toHaveLength(0);
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
  });
});

describe('validateStockCountTx — la quantité attendue est figée, le comptage fait foi', () => {
  it('L’AJUSTEMENT RAMÈNE AU COMPTÉ, pas à un écart recalculé : `expectedQuantity` n’est jamais relue', async () => {
    const magasin = seedLocation();
    const ailleurs = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);

    const count = await openCount(magasin);
    // Comptage : le système disait 100, on en a trouvé 90.
    await setLine(count.id, ciment, 90, 'Casse constatée en allée 3');

    // PUIS le stock bouge : 20 sacs partent vers un autre lieu. Le solde
    // descend à 80, alors que la quantité attendue reste figée à 100.
    await transfer(magasin, ailleurs, ciment, 20);
    expect(Number(soldeDe(magasin, ciment)!.quantity)).toBe(80);

    const valide = await validateCount(count.id);

    // L'écart AFFICHÉ reste celui du comptage : −10, jamais −20 recalculé sur
    // le stock d'aujourd'hui. Relire comparerait le comptage d'hier au stock
    // d'aujourd'hui, et une sortie enregistrée entre-temps se lirait comme une
    // perte.
    expect(valide.lines[0]).toMatchObject({ expectedQuantity: 100, countedQuantity: 90, variance: -10 });

    // Et l'AJUSTEMENT ramène le solde à la quantité COMPTÉE : 90. Le comptage
    // physique fait foi, quitte à écraser le mouvement survenu depuis
    // (conséquence assumée du contrat). Ici, cela veut dire une ENTRÉE de 10,
    // alors que l'écart constaté était un manque : c'est exactement ce qui
    // distingue « ramener au compté » de « rejouer l'écart ».
    const [ajustement] = store.movements.filter(m => m.type === 'ADJUSTMENT');
    expect(ajustement).toMatchObject({ isDecrease: false, quantity: 10, quantityAfter: 90 });
    expect(Number(soldeDe(magasin, ciment)!.quantity)).toBe(90);
  });

  it('refige `expectedQuantity` quand la ligne est ressaisie — une correction est une NOUVELLE saisie', async () => {
    const magasin = seedLocation();
    const ailleurs = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);

    const count = await openCount(magasin);
    await setLine(count.id, ciment, 90, 'Casse');

    await transfer(magasin, ailleurs, ciment, 20);

    const apres = await setLine(count.id, ciment, 78, 'Recomptage après transfert');
    expect(apres.lines[0]).toMatchObject({ expectedQuantity: 80, countedQuantity: 78, variance: -2 });
  });
});

// ---------------------------------------------------------------------------
// E. Les lectures
// ---------------------------------------------------------------------------

describe('listStockCounts et getStockCount', () => {
  it('filtre par lieu et par statut, le plus récent en tête', async () => {
    const magasin = seedLocation({ label: 'Magasin central' });
    const depot = seedLocation({ label: 'Dépôt de Kaloum' });
    const ciment = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);

    const ancien = await openCount(magasin, new Date('2026-01-15'));
    await setLine(ancien.id, ciment, 10);
    await validateCount(ancien.id);

    const recent = await openCount(depot, new Date('2026-04-20'));

    const tous = await listStockCounts(TENANT_ID, {});
    expect(tous.map(c => c.id)).toEqual([recent.id, ancien.id]);

    expect(await listStockCounts(TENANT_ID, { locationId: depot.id })).toHaveLength(1);
    expect((await listStockCounts(TENANT_ID, { status: 'VALIDATED' }))[0].id).toBe(ancien.id);
    expect((await listStockCounts(TENANT_ID, { status: 'DRAFT' }))[0].id).toBe(recent.id);
  });

  it('rend le détail avec ses lignes triées, l’écart chiffré et le libellé du lieu', async () => {
    const magasin = seedLocation({ label: 'Magasin central' });
    const fer = seedItem({ reference: 'FER-12', label: 'Fer à béton HA12', unit: 'barre' });
    const ciment = seedItem({ reference: 'CIM-45', label: 'Ciment CPJ 45', unit: 'sac' });
    seedBalance(magasin, fer, 40, 480_000);
    seedBalance(magasin, ciment, 100, 500_000);

    const count = await openCount(magasin);
    await setLine(count.id, fer, 37, 'Trois barres cassées');
    await setLine(count.id, ciment, 100);

    const detail = await getStockCount(TENANT_ID, count.id);

    expect(detail.locationLabel).toBe('Magasin central');
    expect(detail.lines.map(l => l.itemReference)).toEqual(['CIM-45', 'FER-12']);
    expect(detail.varianceCount).toBe(1);
    // Négative quand il manque : 3 barres à 12 000.
    expect(detail.varianceValue).toBe(-36_000);
  });

  it('refuse un inventaire d’une autre agence', async () => {
    const magasin = seedLocation();
    const count = await openCount(magasin);

    await expect(getStockCount('tenant-2', count.id)).rejects.toMatchObject({ status: 404 });
  });
});
