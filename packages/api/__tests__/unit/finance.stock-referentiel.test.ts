/**
 * Tests du référentiel du stock (`lib/finance/stock-referentiel.ts`) — lot 5,
 * premier sous-lot.
 *
 * Modèle : `__tests__/unit/finance.salaries.test.ts` (lot 4). Magasin en
 * mémoire derrière un faux client Prisma, transaction à rollback par copie
 * profonde. Rien n'est mocké côté domaine : ce sous-lot n'appelle ni
 * `accounting.ts`, ni le journal, ni un compte de tiers — il n'y a donc aucun
 * moteur à simuler, et tout ce que ces tests observent est le vrai code.
 *
 * Ce que ce fichier épingle en priorité :
 *   - la LECTURE avant écriture sur les trois unicités (référence d'article,
 *     libellé de lieu, un seul lieu par chantier) ;
 *   - `siteId` exigé quand `kind` vaut SITE, et REFUSÉ sinon — les deux sens ;
 *   - `ensureStockSettingsTx` qui ne lève jamais pour réglages absents ;
 *   - le motif exigé pour arrêter la méthode de valorisation ;
 *   - la correction de l'unité, DANGEREUSE et pourtant permise : le test
 *     existe pour que personne ne la « corrige » par surprise.
 */

type Row = Record<string, any>;

const store = {
  items: [] as Row[],
  locations: [] as Row[],
  settings: [] as Row[],
  sites: [] as Row[],
  categories: [] as Row[],
  // Lot 040 : inventaires et lignes, pour le refus de désactivation et la vue d'un lieu.
  counts: [] as Row[],
  countLines: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function withDefaultCostCategory(row: Row): Row {
  return {
    ...row,
    defaultCostCategory: row.defaultCostCategoryId
      ? (store.categories.find(c => c.id === row.defaultCostCategoryId) ?? null)
      : null
  };
}

function withSite(row: Row): Row {
  return { ...row, site: row.siteId ? (store.sites.find(s => s.id === row.siteId) ?? null) : null };
}

const mockPrisma: Row = {
  costCategory: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.categories.find(c => c.id === where.id && c.tenantId === where.tenantId) ?? null
    )
  },

  constructionSite: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.sites.find(s => s.id === where.id && s.tenantId === where.tenantId) ?? null
    ),
    findMany: jest.fn(async ({ where }: Row) =>
      store.sites.filter(s => s.tenantId === where.tenantId && where.id.in.includes(s.id))
    )
  },

  // Lot 040 : `where` réduits à ce que le référentiel et `stock-controles.ts` envoient.
  stockCount: {
    findFirst: jest.fn(
      async ({ where }: Row) =>
        store.counts.find(
          c => c.tenantId === where.tenantId && c.locationId === where.locationId && where.status.in.includes(c.status)
        ) ?? null
    ),
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.counts.filter(c => c.tenantId === where.tenantId && where.locationId.in.includes(c.locationId));
      if (where.status?.not) rows = rows.filter(c => c.status !== where.status.not);
      if (typeof where.status === 'string') rows = rows.filter(c => c.status === where.status);
      return [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    })
  },

  stockCountLine: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.countLines
        .filter(l => where.countId.in.includes(l.countId) && l.setAsideAt)
        .map(l => ({ ...l, item: store.items.find(i => i.id === l.itemId) ?? null }))
    )
  },

  stockItem: {
    create: jest.fn(async ({ data, include }: Row) => {
      const created = {
        id: nextId('article'),
        category: null,
        defaultCostCategoryId: null,
        isActive: true,
        createdAt: new Date(),
        ...data
      };
      store.items.push(created);
      return include?.defaultCostCategory ? withDefaultCostCategory(created) : created;
    }),
    findUnique: jest.fn(async ({ where }: Row) => {
      const key = where.tenantId_reference;
      if (!key) return null;
      return store.items.find(i => i.tenantId === key.tenantId && i.reference === key.reference) ?? null;
    }),
    findFirst: jest.fn(async ({ where, include }: Row) => {
      const row = store.items.find(i => i.id === where.id && i.tenantId === where.tenantId);
      if (!row) return null;
      return include?.defaultCostCategory ? withDefaultCostCategory(row) : row;
    }),
    findMany: jest.fn(async ({ where, include }: Row) => {
      let rows = store.items.filter(i => i.tenantId === where.tenantId);
      if (where.isActive !== undefined) rows = rows.filter(i => i.isActive === where.isActive);
      if (where.OR) {
        const needle = String(where.OR[0].reference.contains).toLowerCase();
        rows = rows.filter(i => i.reference.toLowerCase().includes(needle) || i.label.toLowerCase().includes(needle));
      }
      rows = [...rows].sort((a, b) => a.reference.localeCompare(b.reference));
      return include?.defaultCostCategory ? rows.map(withDefaultCostCategory) : rows;
    }),
    update: jest.fn(async ({ where, data, include }: Row) => {
      const row = store.items.find(i => i.id === where.id)!;
      Object.assign(row, data);
      return include?.defaultCostCategory ? withDefaultCostCategory(row) : row;
    })
  },

  stockLocation: {
    create: jest.fn(async ({ data, include }: Row) => {
      const created = { id: nextId('lieu'), siteId: null, isActive: true, createdAt: new Date(), ...data };
      store.locations.push(created);
      return include?.site ? withSite(created) : created;
    }),
    findUnique: jest.fn(async ({ where }: Row) => {
      const key = where.tenantId_label;
      if (!key) return null;
      return store.locations.find(l => l.tenantId === key.tenantId && l.label === key.label) ?? null;
    }),
    findFirst: jest.fn(async ({ where, include }: Row) => {
      const row = store.locations.find(
        l =>
          (where.id === undefined || l.id === where.id) &&
          (where.tenantId === undefined || l.tenantId === where.tenantId) &&
          (where.siteId === undefined || l.siteId === where.siteId)
      );
      if (!row) return null;
      return include?.site ? withSite(row) : row;
    }),
    findMany: jest.fn(async ({ where, include }: Row) => {
      let rows = store.locations.filter(l => l.tenantId === where.tenantId);
      if (where.isActive !== undefined) rows = rows.filter(l => l.isActive === where.isActive);
      if (where.kind !== undefined) rows = rows.filter(l => l.kind === where.kind);
      rows = [...rows].sort((a, b) => a.label.localeCompare(b.label));
      return include?.site ? rows.map(withSite) : rows;
    }),
    update: jest.fn(async ({ where, data, include }: Row) => {
      const row = store.locations.find(l => l.id === where.id)!;
      Object.assign(row, data);
      return include?.site ? withSite(row) : row;
    })
  },

  stockSettings: {
    findUnique: jest.fn(async ({ where }: Row) => store.settings.find(s => s.tenantId === where.tenantId) ?? null),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('reglages'), decisionNote: null, ...data };
      store.settings.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.settings.find(s => s.tenantId === where.tenantId)!;
      Object.assign(row, data);
      return row;
    })
  }
};

/** Rollback par copie profonde en cas d'erreur — même esprit qu'aux sous-lots précédents. */
async function runTransaction<T>(callback: (tx: Row) => Promise<T>): Promise<T> {
  const snapshot = {
    items: structuredClone(store.items),
    locations: structuredClone(store.locations),
    settings: structuredClone(store.settings),
    seq: store.seq
  };
  try {
    return await callback(mockPrisma);
  } catch (error) {
    store.items = snapshot.items;
    store.locations = snapshot.locations;
    store.settings = snapshot.settings;
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
  createStockItemTx,
  createStockLocationTx,
  ensureStockSettingsTx,
  getStockItem,
  getStockSettings,
  listStockItems,
  listStockLocations,
  buildLocationViews,
  setStockValuationMethodTx,
  updateStockItemTx,
  updateStockItemWithChangesTx,
  updateStockLocationTx,
  updateStockLocationWithChangesTx
} from '../../src/lib/finance/stock-referentiel';

const TENANT_ID = 'tenant-1';
const AUTRE_TENANT = 'tenant-2';

function seedSite(overrides: Partial<Row> = {}): Row {
  const site = {
    id: nextId('chantier'),
    tenantId: TENANT_ID,
    name: `Chantier ${store.sites.length + 1}`,
    status: 'IN_PROGRESS',
    ...overrides
  };
  store.sites.push(site);
  return site;
}

function seedCostCategory(overrides: Partial<Row> = {}): Row {
  const category = {
    id: nextId('poste'),
    tenantId: TENANT_ID,
    label: 'Matériaux',
    isActive: true,
    ...overrides
  };
  store.categories.push(category);
  return category;
}

async function seedItem(overrides: Partial<Row> = {}): Promise<Row> {
  return runTransaction((tx: any) =>
    createStockItemTx(tx, TENANT_ID, {
      reference: 'CIM-42',
      label: 'Ciment CPJ 42.5',
      unit: 'sac',
      ...overrides
    } as any)
  );
}

async function seedLocation(overrides: Partial<Row> = {}): Promise<Row> {
  return runTransaction((tx: any) =>
    createStockLocationTx(tx, TENANT_ID, {
      kind: 'WAREHOUSE',
      label: `Magasin ${store.locations.length + 1}`,
      ...overrides
    } as any)
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  store.items = [];
  store.locations = [];
  store.settings = [];
  store.sites = [];
  store.categories = [];
  store.counts = [];
  store.countLines = [];
  store.seq = 0;
});

// ---------------------------------------------------------------------------
// A. L'article
// ---------------------------------------------------------------------------

describe('createStockItemTx — enregistrement d’un article', () => {
  it('enregistre un article actif, sans poste proposé', async () => {
    const item = await seedItem();

    expect(item.reference).toBe('CIM-42');
    expect(item.label).toBe('Ciment CPJ 42.5');
    expect(item.unit).toBe('sac');
    expect(item.category).toBeNull();
    expect(item.defaultCostCategoryId).toBeNull();
    expect(item.defaultCostCategoryLabel).toBeNull();
    expect(item.isActive).toBe(true);
  });

  it('accepte n’importe quelle unité : c’est du TEXTE LIBRE, jamais une énumération', async () => {
    // Le PRD donne des exemples, pas une liste fermée : les unités d'une
    // agence ivoirienne ne sont pas celles d'une agence guinéenne.
    for (const unit of ['sac', 'tonne', 'barre', 'm³', 'fût', 'botte de 12']) {
      const item = await seedItem({ reference: `REF-${unit}`, unit });
      expect(item.unit).toBe(unit);
    }
  });

  it('élague les espaces et refuse une référence, une désignation ou une unité vides', async () => {
    const item = await seedItem({ reference: '  CIM-42  ', label: '  Ciment  ', unit: '  sac  ' });
    expect(item.reference).toBe('CIM-42');
    expect(item.label).toBe('Ciment');
    expect(item.unit).toBe('sac');

    await expect(seedItem({ reference: '   ' })).rejects.toThrow(/référence/i);
    await expect(seedItem({ reference: 'R2', label: '   ' })).rejects.toThrow(/désignation/i);
    await expect(seedItem({ reference: 'R3', unit: '   ' })).rejects.toThrow(/unité/i);
  });

  it('REFUSE une référence déjà prise, en LISANT d’abord (409, pas un P2002 rattrapé)', async () => {
    await seedItem({ reference: 'CIM-42' });

    const promesse = seedItem({ reference: 'CIM-42', label: 'Autre ciment' });

    await expect(promesse).rejects.toThrow(/référence/i);
    await expect(promesse).rejects.toMatchObject({ status: 409 });
    // La lecture a bien eu lieu AVANT toute tentative d'écriture : un seul
    // article créé, et `create` appelé une seule fois en tout.
    expect(store.items).toHaveLength(1);
    expect(mockPrisma.stockItem.findUnique).toHaveBeenCalled();
  });

  it('laisse la même référence libre pour une AUTRE agence', async () => {
    await seedItem({ reference: 'CIM-42' });

    const autre = await runTransaction((tx: any) =>
      createStockItemTx(tx, AUTRE_TENANT, { reference: 'CIM-42', label: 'Ciment', unit: 'sac' })
    );

    expect(autre.tenantId).toBe(AUTRE_TENANT);
    expect(store.items).toHaveLength(2);
  });

  it('résout le poste de dépense PROPOSÉ et renvoie son libellé', async () => {
    const category = seedCostCategory({ label: 'Matériaux' });

    const item = await seedItem({ defaultCostCategoryId: category.id });

    expect(item.defaultCostCategoryId).toBe(category.id);
    expect(item.defaultCostCategoryLabel).toBe('Matériaux');
  });

  it('refuse un poste de dépense inconnu (404) ou désactivé (409)', async () => {
    await expect(seedItem({ defaultCostCategoryId: 'poste-fantome' })).rejects.toMatchObject({ status: 404 });

    const desactive = seedCostCategory({ label: 'Ancien poste', isActive: false });
    await expect(seedItem({ reference: 'R9', defaultCostCategoryId: desactive.id })).rejects.toMatchObject({
      status: 409
    });
  });

  it('ne mentionne jamais un libellé comptable dans ses messages (principe P-1)', async () => {
    await seedItem({ reference: 'CIM-42' });

    const messages: string[] = [];
    for (const tentative of [
      () => seedItem({ reference: 'CIM-42' }),
      () => seedItem({ reference: '  ' }),
      () => seedLocation({ kind: 'SITE', label: 'Dépôt' }),
      () =>
        runTransaction((tx: any) =>
          setStockValuationMethodTx(tx, TENANT_ID, { valuationMethod: 'WEIGHTED_AVERAGE', decisionNote: '' })
        )
    ]) {
      const erreur = await tentative().then(
        () => null,
        (e: Error) => e
      );
      expect(erreur).not.toBeNull();
      messages.push(erreur!.message);
    }

    for (const message of messages) {
      expect(message).not.toMatch(/d[ée]bit|cr[ée]dit/i);
    }
  });
});

describe('updateStockItemTx — correction d’un article', () => {
  it('corrige la désignation sans toucher au reste', async () => {
    const item = await seedItem({ category: 'Ciment' });

    const corrige = await runTransaction((tx: any) =>
      updateStockItemTx(tx, TENANT_ID, item.id, { label: 'Ciment CPJ 45' })
    );

    expect(corrige.label).toBe('Ciment CPJ 45');
    expect(corrige.reference).toBe('CIM-42');
    expect(corrige.unit).toBe('sac');
    expect(corrige.category).toBe('Ciment');
  });

  it(
    'L’UNITÉ SE CORRIGE, ET AUCUNE QUANTITÉ N’EST RECONVERTIE : comportement dangereux, ' +
      'assumé par le contrat, épinglé ici pour que personne ne le « corrige » par surprise',
    async () => {
      const item = await seedItem({ unit: 'sac' });

      const corrige = await runTransaction((tx: any) => updateStockItemTx(tx, TENANT_ID, item.id, { unit: 'tonne' }));

      // Le domaine LAISSE FAIRE : ni refus, ni facteur de conversion inventé,
      // ni trace d'une quelconque reconversion. L'écran doit prévenir ; le
      // domaine ne peut pas deviner qu'un sac fait 50 kg.
      expect(corrige.unit).toBe('tonne');
      expect(store.items[0].unit).toBe('tonne');
    }
  );

  it('efface la famille et le poste proposé avec null, et les laisse intacts si absents', async () => {
    const category = seedCostCategory();
    const item = await seedItem({ category: 'Ciment', defaultCostCategoryId: category.id });

    const inchange = await runTransaction((tx: any) => updateStockItemTx(tx, TENANT_ID, item.id, { label: 'Ciment' }));
    expect(inchange.category).toBe('Ciment');
    expect(inchange.defaultCostCategoryId).toBe(category.id);

    const efface = await runTransaction((tx: any) =>
      updateStockItemTx(tx, TENANT_ID, item.id, { category: null, defaultCostCategoryId: null })
    );
    expect(efface.category).toBeNull();
    expect(efface.defaultCostCategoryId).toBeNull();
    expect(efface.defaultCostCategoryLabel).toBeNull();
  });

  it('désactive un article sans le supprimer', async () => {
    const item = await seedItem();

    const desactive = await runTransaction((tx: any) => updateStockItemTx(tx, TENANT_ID, item.id, { isActive: false }));

    expect(desactive.isActive).toBe(false);
    // Désactiver n'est pas supprimer : la ligne est toujours là.
    expect(store.items).toHaveLength(1);
  });

  it('refuse une désignation ou une unité vidée, et un article d’une autre agence', async () => {
    const item = await seedItem();

    await expect(
      runTransaction((tx: any) => updateStockItemTx(tx, TENANT_ID, item.id, { label: '  ' }))
    ).rejects.toThrow(/désignation/i);
    await expect(
      runTransaction((tx: any) => updateStockItemTx(tx, TENANT_ID, item.id, { unit: '  ' }))
    ).rejects.toThrow(/unité/i);
    await expect(
      runTransaction((tx: any) => updateStockItemTx(tx, AUTRE_TENANT, item.id, { label: 'Vol' }))
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('listStockItems / getStockItem', () => {
  it('liste par référence croissante, filtre les actifs et cherche sur la référence ET la désignation', async () => {
    const a = await seedItem({ reference: 'ACIER-8', label: 'Fer à béton 8' });
    await seedItem({ reference: 'CIM-42', label: 'Ciment CPJ 42.5' });
    await runTransaction((tx: any) => updateStockItemTx(tx, TENANT_ID, a.id, { isActive: false }));

    const toutes = await listStockItems(TENANT_ID, {});
    expect(toutes.map(i => i.reference)).toEqual(['ACIER-8', 'CIM-42']);

    const actifs = await listStockItems(TENANT_ID, { onlyActive: true });
    expect(actifs.map(i => i.reference)).toEqual(['CIM-42']);

    // « CIM » sur la référence, « ciment » sur la désignation : les deux
    // trouvent, parce que sur le terrain on cherche l'un comme l'autre.
    expect((await listStockItems(TENANT_ID, { search: 'cim' })).map(i => i.reference)).toEqual(['CIM-42']);
    expect((await listStockItems(TENANT_ID, { search: 'béton' })).map(i => i.reference)).toEqual(['ACIER-8']);
  });

  it('getStockItem lève 404 pour un article d’une autre agence', async () => {
    const item = await seedItem();

    await expect(getStockItem(AUTRE_TENANT, item.id)).rejects.toMatchObject({ status: 404 });
    await expect(getStockItem(TENANT_ID, item.id)).resolves.toMatchObject({ reference: 'CIM-42' });
  });
});

// ---------------------------------------------------------------------------
// B. Le lieu de stockage
// ---------------------------------------------------------------------------

describe('createStockLocationTx — magasin et lieu de chantier', () => {
  it('crée un magasin sans chantier', async () => {
    const lieu = await seedLocation({ label: 'Magasin central' });

    expect(lieu.kind).toBe('WAREHOUSE');
    expect(lieu.label).toBe('Magasin central');
    expect(lieu.siteId).toBeNull();
    expect(lieu.siteLabel).toBeNull();
    expect(lieu.isActive).toBe(true);
  });

  it('crée le lieu d’un chantier et renvoie le nom du chantier', async () => {
    const site = seedSite({ name: 'Villa Kipé' });

    const lieu = await seedLocation({ kind: 'SITE', label: 'Dépôt Villa Kipé', siteId: site.id });

    expect(lieu.kind).toBe('SITE');
    expect(lieu.siteId).toBe(site.id);
    expect(lieu.siteLabel).toBe('Villa Kipé');
  });

  it('EXIGE siteId quand kind vaut SITE', async () => {
    await expect(seedLocation({ kind: 'SITE', label: 'Dépôt sans chantier' })).rejects.toThrow(/chantier/i);
    await expect(seedLocation({ kind: 'SITE', label: 'Dépôt sans chantier' })).rejects.toMatchObject({ status: 400 });
    expect(store.locations).toHaveLength(0);
  });

  it('REFUSE siteId quand kind ne vaut pas SITE — refusé, pas ignoré', async () => {
    const site = seedSite();

    // Accepter un champ qui ne servira à rien laisserait croire qu'il a servi :
    // le magasin serait créé, l'appelant croirait l'avoir rattaché au
    // chantier, et rien ne le détromperait.
    const promesse = seedLocation({ kind: 'WAREHOUSE', label: 'Magasin central', siteId: site.id });

    await expect(promesse).rejects.toMatchObject({ status: 400 });
    expect(store.locations).toHaveLength(0);
  });

  it('refuse un chantier inconnu ou appartenant à une autre agence (404)', async () => {
    const site = seedSite({ tenantId: AUTRE_TENANT });

    await expect(seedLocation({ kind: 'SITE', label: 'Dépôt', siteId: 'chantier-fantome' })).rejects.toMatchObject({
      status: 404
    });
    await expect(seedLocation({ kind: 'SITE', label: 'Dépôt', siteId: site.id })).rejects.toMatchObject({
      status: 404
    });
  });

  it('UN SEUL LIEU PAR CHANTIER : le second est refusé en 409, après lecture', async () => {
    const site = seedSite({ name: 'Villa Kipé' });
    await seedLocation({ kind: 'SITE', label: 'Dépôt A', siteId: site.id });

    const promesse = seedLocation({ kind: 'SITE', label: 'Dépôt B', siteId: site.id });

    await expect(promesse).rejects.toThrow(/déjà/i);
    await expect(promesse).rejects.toMatchObject({ status: 409 });
    // Deux lieux partageraient le stock du chantier en deux soldes dont aucun
    // ne dirait la vérité : un seul a été écrit.
    expect(store.locations).toHaveLength(1);
  });

  it('refuse un libellé déjà pris dans l’agence (409), et l’autorise dans une autre', async () => {
    await seedLocation({ label: 'Magasin central' });

    await expect(seedLocation({ label: 'Magasin central' })).rejects.toMatchObject({ status: 409 });

    const autre = await runTransaction((tx: any) =>
      createStockLocationTx(tx, AUTRE_TENANT, { kind: 'WAREHOUSE', label: 'Magasin central' })
    );
    expect(autre.tenantId).toBe(AUTRE_TENANT);
  });

  it('refuse un libellé vide', async () => {
    await expect(seedLocation({ label: '   ' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('updateStockLocationTx — correction d’un lieu', () => {
  it('corrige le libellé, et le laisse inchangé s’il est réenregistré à l’identique', async () => {
    const lieu = await seedLocation({ label: 'Magasin central' });

    const renomme = await runTransaction((tx: any) =>
      updateStockLocationTx(tx, TENANT_ID, lieu.id, { label: 'Magasin Matoto' })
    );
    expect(renomme.label).toBe('Magasin Matoto');

    // Réenregistrer son propre libellé n'est pas un conflit avec soi-même.
    const identique = await runTransaction((tx: any) =>
      updateStockLocationTx(tx, TENANT_ID, lieu.id, { label: 'Magasin Matoto' })
    );
    expect(identique.label).toBe('Magasin Matoto');
  });

  it('refuse le libellé d’un AUTRE lieu (409)', async () => {
    await seedLocation({ label: 'Magasin central' });
    const second = await seedLocation({ label: 'Magasin Matoto' });

    await expect(
      runTransaction((tx: any) => updateStockLocationTx(tx, TENANT_ID, second.id, { label: 'Magasin central' }))
    ).rejects.toMatchObject({ status: 409 });
  });

  it('désactive un lieu de chantier sans perdre son rattachement ni le supprimer', async () => {
    const site = seedSite({ name: 'Villa Kipé' });
    const lieu = await seedLocation({ kind: 'SITE', label: 'Dépôt Villa Kipé', siteId: site.id });

    const desactive = await runTransaction((tx: any) =>
      updateStockLocationTx(tx, TENANT_ID, lieu.id, { isActive: false })
    );

    expect(desactive.isActive).toBe(false);
    expect(desactive.siteId).toBe(site.id);
    expect(desactive.kind).toBe('SITE');
    expect(store.locations).toHaveLength(1);
  });

  it(
    'NI LA NATURE NI LE CHANTIER ne se corrigent : même passés de force, ils ne sont pas écrits ' +
      '(la frontière HTTP les refuse en 400, schéma `.strict()`)',
    async () => {
      const site = seedSite();
      const lieu = await seedLocation({ kind: 'WAREHOUSE', label: 'Magasin central' });

      const corrige = await runTransaction((tx: any) =>
        updateStockLocationTx(tx, TENANT_ID, lieu.id, { kind: 'SITE', siteId: site.id, label: 'Magasin' } as any)
      );

      // « Un magasin qui deviendrait le lieu d'un chantier emporterait avec
      // lui un stock qui n'y a jamais été. »
      expect(corrige.kind).toBe('WAREHOUSE');
      expect(corrige.siteId).toBeNull();
      expect(store.locations[0].kind).toBe('WAREHOUSE');
      expect(store.locations[0].siteId).toBeNull();
    }
  );

  it('refuse un lieu d’une autre agence (404)', async () => {
    const lieu = await seedLocation();

    await expect(
      runTransaction((tx: any) => updateStockLocationTx(tx, AUTRE_TENANT, lieu.id, { isActive: false }))
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('listStockLocations', () => {
  it('liste par libellé croissant, filtre par activité et par nature', async () => {
    const site = seedSite({ name: 'Villa Kipé' });
    await seedLocation({ label: 'Magasin central' });
    const surSite = await seedLocation({ kind: 'SITE', label: 'Dépôt Villa Kipé', siteId: site.id });

    expect((await listStockLocations(TENANT_ID, {})).map(l => l.label)).toEqual([
      'Dépôt Villa Kipé',
      'Magasin central'
    ]);
    expect((await listStockLocations(TENANT_ID, { kind: 'SITE' })).map(l => l.label)).toEqual(['Dépôt Villa Kipé']);

    await runTransaction((tx: any) => updateStockLocationTx(tx, TENANT_ID, surSite.id, { isActive: false }));
    expect((await listStockLocations(TENANT_ID, { onlyActive: true })).map(l => l.label)).toEqual(['Magasin central']);
  });
});

// ---------------------------------------------------------------------------
// C. La méthode de valorisation
// ---------------------------------------------------------------------------

describe('ensureStockSettingsTx — les réglages absents ne sont jamais une erreur', () => {
  it('CRÉE les réglages au défaut plutôt que de lever, pour une agence qui n’a rien paramétré', async () => {
    // Une agence qui n'a jamais ouvert l'écran de paramétrage doit pouvoir
    // enregistrer sa première réception : le coût moyen pondéré est le défaut
    // du PRD, et l'imposer en silence est plus honnête qu'un refus.
    const reglages = await runTransaction((tx: any) => ensureStockSettingsTx(tx, TENANT_ID));

    expect(reglages.tenantId).toBe(TENANT_ID);
    expect(reglages.valuationMethod).toBe('WEIGHTED_AVERAGE');
    expect(reglages.decidedAt).toBeInstanceOf(Date);
    // Nul : personne n'a encore rien décidé, et une phrase inventée le
    // cacherait. C'est ce qui distingue un défaut subi d'un choix arrêté.
    expect(reglages.decisionNote).toBeNull();
  });

  it('est idempotente : un second appel relit, il ne recrée pas', async () => {
    const premier = await runTransaction((tx: any) => ensureStockSettingsTx(tx, TENANT_ID));
    const second = await runTransaction((tx: any) => ensureStockSettingsTx(tx, TENANT_ID));

    expect(second.decidedAt).toEqual(premier.decidedAt);
    expect(store.settings).toHaveLength(1);
    expect(mockPrisma.stockSettings.create).toHaveBeenCalledTimes(1);
  });

  it('getStockSettings sème le défaut au premier regard, et ne lève jamais', async () => {
    const reglages = await getStockSettings(TENANT_ID);

    expect(reglages.valuationMethod).toBe('WEIGHTED_AVERAGE');
    expect(reglages.decisionNote).toBeNull();
    expect(store.settings).toHaveLength(1);
  });

  it('isole les agences : chacune a ses propres réglages', async () => {
    await getStockSettings(TENANT_ID);
    await getStockSettings(AUTRE_TENANT);

    expect(store.settings.map(s => s.tenantId).sort()).toEqual([TENANT_ID, AUTRE_TENANT].sort());
  });
});

describe('setStockValuationMethodTx — une décision datée et motivée', () => {
  it('EXIGE le motif : un motif vide ou blanc est refusé en 400', async () => {
    await expect(
      runTransaction((tx: any) =>
        setStockValuationMethodTx(tx, TENANT_ID, { valuationMethod: 'WEIGHTED_AVERAGE', decisionNote: '' })
      )
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      runTransaction((tx: any) =>
        setStockValuationMethodTx(tx, TENANT_ID, { valuationMethod: 'WEIGHTED_AVERAGE', decisionNote: '   ' })
      )
    ).rejects.toThrow(/motif/i);

    // Rien n'a été écrit : le refus précède toute création de réglages.
    expect(store.settings).toHaveLength(0);
  });

  it('enregistre la décision, son motif et sa date, même sans réglages préalables', async () => {
    const avant = Date.now();

    const reglages = await runTransaction((tx: any) =>
      setStockValuationMethodTx(tx, TENANT_ID, {
        valuationMethod: 'WEIGHTED_AVERAGE',
        decisionNote: '  Décision du conseil du 12 mars : coût moyen pondéré  '
      })
    );

    expect(reglages.valuationMethod).toBe('WEIGHTED_AVERAGE');
    expect(reglages.decisionNote).toBe('Décision du conseil du 12 mars : coût moyen pondéré');
    expect(reglages.decidedAt.getTime()).toBeGreaterThanOrEqual(avant);
    expect(store.settings).toHaveLength(1);
  });

  it('redate la décision à chaque enregistrement — c’est sa raison d’être', async () => {
    const premier = await runTransaction((tx: any) =>
      setStockValuationMethodTx(tx, TENANT_ID, { valuationMethod: 'WEIGHTED_AVERAGE', decisionNote: 'Premier choix' })
    );

    // Une seule méthode existe aujourd'hui : cette fonction ne change donc
    // rien en pratique, elle ENREGISTRE la décision. Le motif et la date sont
    // tout ce qui reste six mois plus tard.
    const second = await runTransaction((tx: any) =>
      setStockValuationMethodTx(tx, TENANT_ID, {
        valuationMethod: 'WEIGHTED_AVERAGE',
        decisionNote: 'Confirmé après audit'
      })
    );

    expect(second.decisionNote).toBe('Confirmé après audit');
    expect(second.decidedAt.getTime()).toBeGreaterThanOrEqual(premier.decidedAt.getTime());
    expect(store.settings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// D. Lot 040 — désactivation d'un lieu en inventaire, changements audités, vue d'un lieu
// ---------------------------------------------------------------------------

describe('Lot 040 — désactiver un lieu qui porte un inventaire en cours (spec §9)', () => {
  it.each(['DRAFT', 'COUNTED'])(
    'refuse la désactivation pendant un inventaire %s : 409 STOCK_COUNT_IN_PROGRESS',
    async status => {
      const lieu = await seedLocation({ label: 'Magasin central' });
      store.counts.push({
        id: 'inv-1',
        tenantId: TENANT_ID,
        locationId: lieu.id,
        status,
        kind: 'REGULAR',
        createdAt: new Date()
      });

      await expect(
        runTransaction((tx: any) => updateStockLocationTx(tx, TENANT_ID, lieu.id, { isActive: false }))
      ).rejects.toMatchObject({ statusCode: 409, code: 'STOCK_COUNT_IN_PROGRESS', data: { countId: 'inv-1' } });
      expect(store.locations[0].isActive).toBe(true);
    }
  );

  it('accepte la désactivation après un inventaire validé ou abandonné, et le renommage pendant un inventaire', async () => {
    const lieu = await seedLocation({ label: 'Magasin central' });
    store.counts.push({
      id: 'inv-v',
      tenantId: TENANT_ID,
      locationId: lieu.id,
      status: 'VALIDATED',
      createdAt: new Date()
    });
    store.counts.push({
      id: 'inv-c',
      tenantId: TENANT_ID,
      locationId: lieu.id,
      status: 'CANCELLED',
      createdAt: new Date()
    });

    const desactive = await runTransaction((tx: any) =>
      updateStockLocationTx(tx, TENANT_ID, lieu.id, { isActive: false })
    );
    expect(desactive.isActive).toBe(false);

    store.counts.push({
      id: 'inv-d',
      tenantId: TENANT_ID,
      locationId: lieu.id,
      status: 'DRAFT',
      createdAt: new Date()
    });
    const renomme = await runTransaction((tx: any) =>
      updateStockLocationTx(tx, TENANT_ID, lieu.id, { label: 'Magasin Nord' })
    );
    expect(renomme.label).toBe('Magasin Nord');
  });

  it('un inventaire d’une autre agence sur un même identifiant ne bloque rien', async () => {
    const lieu = await seedLocation({ label: 'Magasin central' });
    store.counts.push({
      id: 'inv-x',
      tenantId: AUTRE_TENANT,
      locationId: lieu.id,
      status: 'DRAFT',
      createdAt: new Date()
    });
    await expect(
      runTransaction((tx: any) => updateStockLocationTx(tx, TENANT_ID, lieu.id, { isActive: false }))
    ).resolves.toMatchObject({ isActive: false });
  });
});

describe('Lot 040 — les changements audités (B6-R1)', () => {
  it('STOCK_ITEM_UPDATED porte l’unité dans ses changements, et rien de ce qui n’a pas changé', async () => {
    const article = await seedItem({ unit: 'sac', label: 'Ciment CPJ 42.5' });

    const { item, changes } = await runTransaction((tx: any) =>
      updateStockItemWithChangesTx(tx, TENANT_ID, article.id, { unit: 'tonne', label: 'Ciment CPJ 42.5' })
    );

    expect(item.unit).toBe('tonne');
    expect(changes).toEqual({ unit: { before: 'sac', after: 'tonne' } });
  });

  it('un article d’une autre agence se corrige en 404', async () => {
    const article = await seedItem();
    store.items[0].tenantId = AUTRE_TENANT;
    await expect(
      runTransaction((tx: any) => updateStockItemWithChangesTx(tx, TENANT_ID, article.id, { label: 'X' }))
    ).rejects.toMatchObject({ status: 404 });
  });

  it('STOCK_LOCATION_UPDATED porte le libellé et l’activité changés', async () => {
    const lieu = await seedLocation({ label: 'Magasin central' });
    const { changes } = await runTransaction((tx: any) =>
      updateStockLocationWithChangesTx(tx, TENANT_ID, lieu.id, { label: 'Magasin Nord', isActive: false })
    );
    expect(changes).toEqual({
      label: { before: 'Magasin central', after: 'Magasin Nord' },
      isActive: { before: true, after: false }
    });
  });
});

describe('Lot 040 — buildLocationViews (LocationView)', () => {
  it('signale l’inventaire en cours, le chantier clos, l’ouverture suggérée et les articles à recompter', async () => {
    const now = new Date('2026-10-04T00:00:00.000Z');
    const ouvert = seedSite({ closedAt: null, stockEnabledAt: new Date('2026-09-20T00:00:00.000Z') });
    const clos = seedSite({ closedAt: new Date('2026-09-01'), stockEnabledAt: new Date('2026-01-01') });
    const magasin = await seedLocation({ label: 'Magasin central' });
    const lieuOuvert = await seedLocation({ kind: 'SITE', label: 'Dépôt ouvert', siteId: ouvert.id });
    const lieuClos = await seedLocation({ kind: 'SITE', label: 'Dépôt clos', siteId: clos.id });
    const article = await seedItem({ label: 'Fer de 10' });

    store.counts.push({
      id: 'inv-draft',
      tenantId: TENANT_ID,
      locationId: magasin.id,
      status: 'DRAFT',
      kind: 'REGULAR',
      createdAt: now
    });
    store.counts.push({
      id: 'inv-ok',
      tenantId: TENANT_ID,
      locationId: lieuClos.id,
      status: 'VALIDATED',
      kind: 'CLOSING',
      validatedAt: now,
      createdAt: now
    });
    store.countLines.push({ countId: 'inv-ok', itemId: article.id, setAsideAt: now });

    const records = await listStockLocations(TENANT_ID, {});
    const views = await buildLocationViews(mockPrisma as any, TENANT_ID, records, now);
    const byId = new Map(views.map(view => [view.id, view]));

    expect(byId.get(magasin.id)).toMatchObject({
      countInProgress: { countId: 'inv-draft', status: 'DRAFT', kind: 'REGULAR' },
      siteClosed: false,
      openingCountSuggested: false,
      toRecount: []
    });
    expect(byId.get(lieuOuvert.id)).toMatchObject({
      siteClosed: false,
      openingCountSuggested: true,
      countInProgress: null
    });
    expect(byId.get(lieuClos.id)).toMatchObject({ siteClosed: true, openingCountSuggested: false });
    expect(byId.get(lieuClos.id)!.toRecount).toEqual([
      { itemId: article.id, itemLabel: 'Fer de 10', countId: 'inv-ok', setAsideAt: now }
    ]);
  });

  it('aucune quantité ni valeur dans la vue d’un lieu', async () => {
    await seedLocation({ label: 'Magasin central' });
    const [view] = await buildLocationViews(mockPrisma as any, TENANT_ID, await listStockLocations(TENANT_ID, {}));
    expect(Object.keys(view).sort()).toEqual(
      [
        'countInProgress',
        'id',
        'isActive',
        'kind',
        'label',
        'openingCountSuggested',
        'siteClosed',
        'siteId',
        'siteLabel',
        'tenantId',
        'toRecount'
      ].sort()
    );
  });
});
