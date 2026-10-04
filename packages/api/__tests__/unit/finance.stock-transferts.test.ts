/**
 * Tests des transferts entre lieux (`lib/finance/stock-transferts.ts`) —
 * déplacés de `finance.stock-inventaire.test.ts` par l'étape des fondations du
 * lot 040, avec le banc de données en mémoire qui les porte, sans changement
 * de résultat. Le code testé est celui du lot 5, troisième sous-lot.
 *
 * Modèle : `__tests__/unit/finance.stock-mouvements.test.ts` (sous-lot 2).
 *
 * `accounting.ts` (moteur comptable général) est mocké, même geste qu'aux
 * sous-lots précédents : ce fichier ne teste pas comment une écriture
 * s'équilibre, seulement comment `stock-transferts.ts` l'appelle — et surtout
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
// A. Le transfert — l'invariant, et le piège
// ---------------------------------------------------------------------------

describe('recordStockTransferTx — transférer ne crée ni ne détruit de valeur', () => {
  it('LE TEST LE PLUS IMPORTANT : la somme des valeurs des deux lieux ne bouge pas d’un franc, sur un coût moyen qui ne tombe pas rond', async () => {
    const magasin = seedLocation({ label: 'Magasin central' });
    const depot = seedLocation({ label: 'Dépôt de Kaloum' });
    const ciment = seedItem();

    // 7 sacs pour 3 004 XOF : coût moyen 429,142857… — volontairement
    // indivisible. En face, 10 sacs à 5 000, un coût moyen tout autre : le
    // transfert doit réconcilier les deux sans rien créer ni rien perdre.
    seedBalance(magasin, ciment, 7, 3_004);
    seedBalance(depot, ciment, 10, 50_000);

    const totalAvant = valeurDe(magasin, ciment) + valeurDe(depot, ciment);
    expect(totalAvant).toBe(53_004);

    const resultat = await transfer(magasin, depot, ciment, 3);

    // 3 x 429,142857… = 1 287,42857 -> 1 287.
    expect(resultat.value).toBe(1_287);
    expect(valeurDe(magasin, ciment)).toBe(1_717);
    expect(valeurDe(depot, ciment)).toBe(51_287);

    // L'INVARIANT. Pas un franc de plus, pas un franc de moins.
    expect(valeurDe(magasin, ciment) + valeurDe(depot, ciment)).toBe(totalAvant);

    // Les quantités suivent, elles aussi, sans perte.
    expect(Number(soldeDe(magasin, ciment)!.quantity)).toBe(4);
    expect(Number(soldeDe(depot, ciment)!.quantity)).toBe(13);
  });

  it('tient l’invariant quand le transfert VIDE le lieu d’origine — la valeur résiduelle part avec', async () => {
    const magasin = seedLocation();
    const depot = seedLocation();
    const ciment = seedItem();

    seedBalance(magasin, ciment, 7, 3_004);
    seedBalance(depot, ciment, 2, 1_000);

    const resultat = await transfer(magasin, depot, ciment, 7);

    // Le mouvement emporte TOUTE la valeur restante, écart d'arrondi compris,
    // et le solde d'origine retombe à zéro des deux côtés.
    expect(resultat.value).toBe(3_004);
    expect(Number(soldeDe(magasin, ciment)!.quantity)).toBe(0);
    expect(valeurDe(magasin, ciment)).toBe(0);
    expect(valeurDe(depot, ciment)).toBe(4_004);
    expect(valeurDe(magasin, ciment) + valeurDe(depot, ciment)).toBe(3_004 + 1_000);
  });

  it('crée le solde d’arrivée quand le lieu n’avait encore jamais rien reçu', async () => {
    const magasin = seedLocation();
    const depot = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);

    await transfer(magasin, depot, ciment, 40);

    expect(Number(soldeDe(depot, ciment)!.quantity)).toBe(40);
    expect(valeurDe(depot, ciment)).toBe(200_000);
    expect(valeurDe(magasin, ciment) + valeurDe(depot, ciment)).toBe(500_000);
  });

  it('conserve les quatre décimales d’une quantité — une quantité n’est pas un montant', async () => {
    const magasin = seedLocation();
    const chantier = seedLocation();
    const sable = seedItem({ label: 'Sable', unit: 'm3' });
    seedBalance(magasin, sable, 12.5, 100_000);

    const resultat = await transfer(magasin, chantier, sable, 0.25);

    expect(resultat.quantity).toBe(0.25);
    expect(Number(soldeDe(magasin, sable)!.quantity)).toBe(12.25);
    expect(Number(soldeDe(chantier, sable)!.quantity)).toBe(0.25);
  });
});

describe('recordStockTransferTx — deux mouvements, une transaction, un groupe', () => {
  it('écrit DEUX mouvements liés par un même `transferGroupId`, la sortie d’abord', async () => {
    const magasin = seedLocation({ label: 'Magasin central' });
    const depot = seedLocation({ label: 'Dépôt de Kaloum' });
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);

    const resultat = await transfer(magasin, depot, ciment, 30);

    expect(resultat.movements).toHaveLength(2);
    const [sortie, entree] = resultat.movements;

    expect(sortie.type).toBe('TRANSFER');
    expect(sortie.isDecrease).toBe(true);
    expect(sortie.locationId).toBe(magasin.id);
    expect(sortie.quantityAfter).toBe(70);
    expect(sortie.valueAfter).toBe(350_000);

    expect(entree.type).toBe('TRANSFER');
    expect(entree.isDecrease).toBe(false);
    expect(entree.locationId).toBe(depot.id);
    expect(entree.quantityAfter).toBe(30);
    expect(entree.valueAfter).toBe(150_000);

    // Le signe ne dit jamais le sens : les deux quantités sont positives.
    expect(sortie.quantity).toBe(30);
    expect(entree.quantity).toBe(30);

    // LE MÊME identifiant de groupe : c'est lui, et lui seul, qui dit qu'il
    // s'agit d'un déplacement et non d'une perte suivie d'une apparition.
    const groupes = store.movements.map(m => m.transferGroupId);
    expect(groupes[0]).toBe(resultat.transferGroupId);
    expect(groupes[1]).toBe(resultat.transferGroupId);
    expect(resultat.transferGroupId).toEqual(expect.any(String));

    expect(resultat.fromLocationLabel).toBe('Magasin central');
    expect(resultat.toLocationLabel).toBe('Dépôt de Kaloum');
    expect(resultat.currency).toBe('XOF');
  });

  it('les deux moitiés portent la MÊME valeur — c’est ce qui rend l’invariant exact', async () => {
    const magasin = seedLocation();
    const depot = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 7, 3_004);

    const resultat = await transfer(magasin, depot, ciment, 3);

    expect(resultat.movements[0].totalValue).toBe(resultat.movements[1].totalValue);
    expect(resultat.movements[0].totalValue).toBe(resultat.value);
  });

  it('n’écrit AUCUNE moitié quand le transfert est refusé', async () => {
    const magasin = seedLocation();
    const depot = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);

    await expect(transfer(magasin, depot, ciment, 11)).rejects.toMatchObject({ status: 409 });

    // Sans la transaction, une panne entre les deux mouvements ferait
    // disparaître de la matière.
    expect(store.movements).toHaveLength(0);
    expect(valeurDe(magasin, ciment)).toBe(50_000);
    expect(soldeDe(depot, ciment)).toBeUndefined();
  });
});

describe('recordStockTransferTx — LE PIÈGE : déplacer n’est pas consommer', () => {
  it('N’IMPUTE RIEN ET N’ÉCRIT AUCUNE ÉCRITURE, même vers le lieu d’un chantier', async () => {
    const magasin = seedLocation({ label: 'Magasin central' });
    const chantier = seedSite({ name: 'Résidence Kipé' });
    const lieuDuChantier = seedLocation({ kind: 'SITE', label: 'Chantier Kipé', siteId: chantier.id });
    const ciment = seedItem();
    seedBalance(magasin, ciment, 200, 1_200_000);

    // Le chantier porte déjà un coût réel, venu d'une sortie antérieure : le
    // test doit montrer qu'il ne bouge pas, pas seulement qu'il reste nul.
    store.allocations.push({
      id: nextId('imputation'),
      tenantId: TENANT_ID,
      siteId: chantier.id,
      costCategoryId: 'poste-gros-oeuvre',
      sourceType: 'STOCK_ISSUE',
      sourceId: 'mouvement-anterieur',
      amount: 1_200_000,
      validatedAt: new Date('2026-04-01'),
      voidedAt: null
    });

    // Le VRAI `sumSiteActualCost` (`site-cost.ts`), jamais une doublure.
    const avant = await sumSiteActualCost(mockPrisma as any, TENANT_ID, chantier.id);
    expect(avant).toBe(1_200_000);

    await transfer(magasin, lieuDuChantier, ciment, 100);

    const apres = await sumSiteActualCost(mockPrisma as any, TENANT_ID, chantier.id);

    // LIVRER SUR UN CHANTIER RESSEMBLE À UNE DÉPENSE, ET N'EN EST PAS UNE.
    // Compter la livraison ferait monter le coût de matériaux qui dorment
    // encore sous la bâche. Seule la SORTIE impute (principe P-7).
    expect(apres).toBe(avant);
    expect(store.allocations).toHaveLength(1);
    expect(mockPrisma.costAllocation.create).not.toHaveBeenCalled();
    expect(postDocumentEntryTx).not.toHaveBeenCalled();

    // Le 311 ne bouge pas non plus : la matière est toujours à l'actif,
    // simplement ailleurs. La valeur totale du stock est inchangée.
    expect(valeurDe(magasin, ciment) + valeurDe(lieuDuChantier, ciment)).toBe(1_200_000);
  });

  it('ACCEPTE un transfert vers le lieu d’un chantier CLOS — et ce test existe pour qu’on ne le « corrige » pas', async () => {
    const magasin = seedLocation();
    const clos = seedSite({ name: 'Villa Coyah', closedAt: new Date('2026-02-28'), finalCost: 4_000_000 });
    const lieuDuChantierClos = seedLocation({ kind: 'SITE', label: 'Chantier Coyah', siteId: clos.id });
    const ciment = seedItem();
    seedBalance(magasin, ciment, 50, 250_000);

    // `assertSiteOpenTx` n'est PAS appelé ici, et son absence est un choix :
    // y déposer du matériel n'impute rien, et un chantier clos peut
    // légitimement servir de lieu de stockage le temps qu'on l'évacue. C'est
    // la SORTIE qui est refusée, pas la livraison (contrat).
    const resultat = await transfer(magasin, lieuDuChantierClos, ciment, 20);

    expect(resultat.movements).toHaveLength(2);
    expect(Number(soldeDe(lieuDuChantierClos, ciment)!.quantity)).toBe(20);
    expect(await sumSiteActualCost(mockPrisma as any, TENANT_ID, clos.id)).toBe(0);
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
  });
});

describe('recordStockTransferTx — les refus', () => {
  it('refuse un transfert vers LE MÊME lieu', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);

    await expect(transfer(magasin, magasin, ciment, 10)).rejects.toMatchObject({ status: 400 });
    expect(store.movements).toHaveLength(0);
  });

  it('refuse une quantité nulle ou négative', async () => {
    const magasin = seedLocation();
    const depot = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);

    await expect(transfer(magasin, depot, ciment, 0)).rejects.toMatchObject({ status: 400 });
    await expect(transfer(magasin, depot, ciment, -5)).rejects.toMatchObject({ status: 400 });
    expect(store.movements).toHaveLength(0);
  });

  it('REFUSE une quantité supérieure au stock d’origine — un stock négatif n’a pas de coût moyen', async () => {
    const magasin = seedLocation();
    const depot = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 30, 150_000);

    await expect(transfer(magasin, depot, ciment, 31)).rejects.toThrow(/inventaire/);
    await expect(transfer(magasin, depot, ciment, 31)).rejects.toMatchObject({ status: 409 });
  });

  it('refuse un transfert depuis un lieu jamais approvisionné', async () => {
    const magasin = seedLocation();
    const depot = seedLocation();
    const ciment = seedItem();

    await expect(transfer(magasin, depot, ciment, 1)).rejects.toMatchObject({ status: 409 });
  });

  it('refuse un lieu désactivé, à l’origine comme à l’arrivée', async () => {
    const actif = seedLocation();
    const inactif = seedLocation({ isActive: false });
    const ciment = seedItem();
    seedBalance(actif, ciment, 100, 500_000);
    seedBalance(inactif, ciment, 100, 500_000);

    await expect(transfer(inactif, actif, ciment, 10)).rejects.toMatchObject({ status: 409 });
    await expect(transfer(actif, inactif, ciment, 10)).rejects.toMatchObject({ status: 409 });
    expect(store.movements).toHaveLength(0);
  });

  it('refuse un article introuvable, et un lieu d’une autre agence', async () => {
    const magasin = seedLocation();
    const depot = seedLocation();
    const etranger = seedLocation({ tenantId: 'tenant-2' });
    const ciment = seedItem();
    const inconnu = seedItem({ tenantId: 'tenant-2' });
    seedBalance(magasin, ciment, 100, 500_000);

    await expect(transfer(magasin, depot, inconnu, 1)).rejects.toMatchObject({ status: 404 });
    await expect(transfer(magasin, etranger, ciment, 1)).rejects.toMatchObject({ status: 404 });
  });
});
