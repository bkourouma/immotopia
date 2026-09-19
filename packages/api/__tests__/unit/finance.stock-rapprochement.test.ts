/**
 * Tests de la bascule au stock et du rapprochement
 * (`lib/finance/stock-rapprochement.ts`) — lot 5, quatrième et dernier
 * sous-lot.
 *
 * Modèle : `__tests__/unit/finance.stock-mouvements.test.ts` (deuxième
 * sous-lot), magasin en mémoire derrière un faux client Prisma.
 *
 * **`site-closing.ts` (`assertSiteOpenTx`) N'EST PAS mocké.** C'est le VRAI
 * refus du lot 4 qui doit prouver qu'un chantier clos ne bascule pas : une
 * doublure qui l'affirmerait à sa place ne prouverait rien.
 *
 * Rien d'autre n'a besoin de l'être : ce sous-lot n'écrit ni écriture
 * comptable, ni imputation, ni solde. Il date une colonne, crée un lieu, et
 * lit.
 */

type Row = Record<string, any>;

const store = {
  sites: [] as Row[],
  locations: [] as Row[],
  invoices: [] as Row[],
  movements: [] as Row[],
  balances: [] as Row[],
  items: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function sommeOuNull(values: number[]): number | null {
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

const mockPrisma: Row = {
  constructionSite: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.sites.find(s => s.id === where.id && s.tenantId === where.tenantId) ?? null
    ),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.sites.filter(
        s =>
          s.id === where.id &&
          s.tenantId === where.tenantId &&
          (where.stockEnabledAt === null ? s.stockEnabledAt === null : true)
      );
      rows.forEach(row => Object.assign(row, data));
      return { count: rows.length };
    })
  },

  stockLocation: {
    findFirst: jest.fn(async ({ where }: Row) => {
      let rows = store.locations.filter(l => l.tenantId === where.tenantId);
      if (where.siteId !== undefined) rows = rows.filter(l => l.siteId === where.siteId);
      if (where.label !== undefined) rows = rows.filter(l => l.label === where.label);
      return rows[0] ?? null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('lieu'), isActive: true, ...data };
      store.locations.push(created);
      return created;
    })
  },

  supplierInvoice: {
    aggregate: jest.fn(async ({ where }: Row) => {
      let rows = store.invoices.filter(f => f.tenantId === where.tenantId);
      if (where.siteId !== undefined) rows = rows.filter(f => f.siteId === where.siteId);
      if (where.status !== undefined) rows = rows.filter(f => f.status === where.status);
      if (where.invoiceDate?.gte) rows = rows.filter(f => f.invoiceDate >= where.invoiceDate.gte);
      return { _sum: { amount: sommeOuNull(rows.map(f => Number(f.amount))) } };
    })
  },

  stockMovement: {
    groupBy: jest.fn(async ({ by, where }: Row) => {
      expect(by).toEqual(['itemId']);

      let rows = store.movements.filter(m => m.tenantId === where.tenantId);
      if (where.locationId !== undefined) rows = rows.filter(m => m.locationId === where.locationId);
      if (where.siteId !== undefined) rows = rows.filter(m => m.siteId === where.siteId);
      if (where.isDecrease !== undefined) rows = rows.filter(m => m.isDecrease === where.isDecrease);
      if (where.type !== undefined) {
        const types: string[] = where.type?.in ?? [where.type];
        rows = rows.filter(m => types.includes(m.type));
      }
      if (where.movementDate?.gte) rows = rows.filter(m => m.movementDate >= where.movementDate.gte);

      const groups = new Map<string, Row[]>();
      for (const row of rows) {
        groups.set(row.itemId, [...(groups.get(row.itemId) ?? []), row]);
      }
      return [...groups.entries()].map(([itemId, group]) => ({
        itemId,
        _sum: {
          quantity: sommeOuNull(group.map(m => Number(m.quantity))),
          totalValue: sommeOuNull(group.map(m => Number(m.totalValue)))
        }
      }));
    })
  },

  stockBalance: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.balances.filter(b => b.tenantId === where.tenantId && b.locationId === where.locationId)
    )
  },

  stockItem: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.items.filter(i => i.tenantId === where.tenantId && where.id.in.includes(i.id))
    )
  },

  // `assertSiteOpenTx` n'en a pas besoin, mais `site-closing.ts` en importe le
  // module : la doublure doit offrir ce que le fichier touche au chargement.
  costAllocation: {
    aggregate: jest.fn(async () => ({ _sum: { amount: null } })),
    groupBy: jest.fn(async () => [])
  }
};

/** Rollback par copie profonde en cas d'erreur — même esprit qu'aux sous-lots précédents. */
async function runTransaction<T>(callback: (tx: Row) => Promise<T>): Promise<T> {
  const snapshot = {
    sites: structuredClone(store.sites),
    locations: structuredClone(store.locations),
    seq: store.seq
  };
  try {
    return await callback(mockPrisma);
  } catch (error) {
    store.sites = snapshot.sites;
    store.locations = snapshot.locations;
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

import * as rapprochement from '../../src/lib/finance/stock-rapprochement';
import {
  enableStockOnSiteTx,
  getSiteStockReconciliation,
  getSiteStockStatus,
  isSiteStockEnabledTx
} from '../../src/lib/finance/stock-rapprochement';

const TENANT_ID = 'tenant-1';

const BASCULE = new Date('2026-03-15T00:00:00.000Z');
const AVANT = new Date('2026-02-20T00:00:00.000Z');
const APRES = new Date('2026-04-02T00:00:00.000Z');

function seedSite(overrides: Partial<Row> = {}): Row {
  const site = {
    id: nextId('chantier'),
    tenantId: TENANT_ID,
    name: `Chantier ${store.sites.length + 1}`,
    status: 'IN_PROGRESS',
    closedAt: null,
    finalCost: null,
    stockEnabledAt: null,
    ...overrides
  };
  store.sites.push(site);
  return site;
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

function seedItem(overrides: Partial<Row> = {}): Row {
  const item = {
    id: nextId('article'),
    tenantId: TENANT_ID,
    reference: `ART-${String(store.items.length + 1).padStart(2, '0')}`,
    label: 'Ciment CPJ 45',
    unit: 'sac',
    ...overrides
  };
  store.items.push(item);
  return item;
}

function seedInvoice(site: Row, amount: number, overrides: Partial<Row> = {}): Row {
  const invoice = {
    id: nextId('facture'),
    tenantId: TENANT_ID,
    siteId: site.id,
    reference: `FAC-${store.invoices.length + 1}`,
    status: 'VALIDATED',
    invoiceDate: APRES,
    amount,
    ...overrides
  };
  store.invoices.push(invoice);
  return invoice;
}

function seedMovement(overrides: Partial<Row> = {}): Row {
  const movement = {
    id: nextId('mouvement'),
    tenantId: TENANT_ID,
    type: 'RECEIPT',
    itemId: null,
    locationId: null,
    siteId: null,
    isDecrease: false,
    quantity: 0,
    totalValue: 0,
    movementDate: APRES,
    ...overrides
  };
  store.movements.push(movement);
  return movement;
}

function seedBalance(overrides: Partial<Row> = {}): Row {
  const balance = {
    id: nextId('solde'),
    tenantId: TENANT_ID,
    itemId: null,
    locationId: null,
    quantity: 0,
    value: 0,
    ...overrides
  };
  store.balances.push(balance);
  return balance;
}

/** Un chantier déjà basculé, avec son lieu de stockage. */
function seedSwitchedSite(): { site: Row; location: Row } {
  const site = seedSite({ stockEnabledAt: BASCULE });
  const location = seedLocation({ kind: 'SITE', label: `Chantier ${site.name}`, siteId: site.id });
  return { site, location };
}

function bascule(site: Row, enabledAt = new Date('2026-05-01T00:00:00.000Z')) {
  return runTransaction((tx: any) => enableStockOnSiteTx(tx, TENANT_ID, site.id, { enabledAt }));
}

beforeEach(() => {
  jest.clearAllMocks();
  store.sites = [];
  store.locations = [];
  store.invoices = [];
  store.movements = [];
  store.balances = [];
  store.items = [];
  store.seq = 0;
});

// ---------------------------------------------------------------------------
// A. La bascule — irréversible, et elle crée le lieu
// ---------------------------------------------------------------------------

describe('enableStockOnSiteTx', () => {
  it('date `stockEnabledAt` et CRÉE LE LIEU DE STOCKAGE du chantier', async () => {
    const site = seedSite({ name: 'Résidence Kipé' });
    const quand = new Date('2026-05-01T10:00:00.000Z');

    const status = await bascule(site, quand);

    expect(status.stockEnabledAt).toEqual(quand);
    expect(store.sites[0].stockEnabledAt).toEqual(quand);

    // Sans lieu, une réception pour ce chantier n'aurait nulle part où
    // atterrir, et l'utilisateur découvrirait le manque au pire moment.
    expect(store.locations).toHaveLength(1);
    expect(store.locations[0]).toMatchObject({ tenantId: TENANT_ID, kind: 'SITE', siteId: site.id });
    expect(status.stockLocationId).toBe(store.locations[0].id);
    expect(status.stockLocationLabel).toBe(store.locations[0].label);
  });

  it('RÉUTILISE le lieu du chantier quand il en a déjà un', async () => {
    const site = seedSite();
    const existant = seedLocation({ kind: 'SITE', label: 'Dépôt de chantier Kaloum', siteId: site.id });

    const status = await bascule(site);

    // Un second lieu partagerait le stock du chantier en deux soldes dont
    // aucun ne dirait la vérité (`@unique` sur `StockLocation.siteId`).
    expect(store.locations).toHaveLength(1);
    expect(status.stockLocationId).toBe(existant.id);
    expect(status.stockLocationLabel).toBe('Dépôt de chantier Kaloum');
  });

  it('donne un libellé libre à deux chantiers homonymes plutôt que d’échouer sur l’unicité', async () => {
    const premier = seedSite({ name: 'Villa Kipé' });
    const second = seedSite({ name: 'Villa Kipé' });

    const a = await bascule(premier);
    const b = await bascule(second);

    expect(a.stockLocationLabel).toBe('Chantier Villa Kipé');
    expect(b.stockLocationLabel).not.toBe(a.stockLocationLabel);
    expect(store.locations).toHaveLength(2);
  });

  it('REFUSE un chantier déjà basculé — redater changerait rétroactivement les imputations', async () => {
    const { site } = seedSwitchedSite();

    await expect(bascule(site)).rejects.toMatchObject({ status: 409 });
    await expect(bascule(site)).rejects.toThrow(/déjà/);

    // La date d'origine n'a pas bougé.
    expect(store.sites[0].stockEnabledAt).toEqual(BASCULE);
  });

  it('REFUSE un chantier clos (`assertSiteOpenTx`, garde du lot 4)', async () => {
    const clos = seedSite({ name: 'Cité Matoto', closedAt: new Date('2026-02-28'), finalCost: 4_000_000 });

    await expect(bascule(clos)).rejects.toMatchObject({ status: 409 });
    await expect(bascule(clos)).rejects.toThrow(/clôturé/);

    expect(store.sites[0].stockEnabledAt).toBeNull();
    expect(store.locations).toHaveLength(0);
  });

  it('refuse un chantier inexistant, et un chantier d’une autre agence', async () => {
    const etranger = seedSite({ tenantId: 'tenant-2' });

    await expect(
      runTransaction((tx: any) => enableStockOnSiteTx(tx, TENANT_ID, 'chantier-fantome', { enabledAt: new Date() }))
    ).rejects.toMatchObject({ status: 404 });

    await expect(bascule(etranger)).rejects.toMatchObject({ status: 404 });
  });

  it('n’expose AUCUNE fonction de retour en arrière — pas même pour les tests', async () => {
    // Le contrat est explicite : revenir en arrière obligerait à rejouer
    // l'imputation de toutes les factures postérieures, et le coût du chantier
    // changerait sous les pieds de celui qui le regarde.
    const retours = Object.keys(rapprochement).filter(nom =>
      /disable|disabl|revert|undo|rollback|annul|desactiv|reset/i.test(nom)
    );
    expect(retours).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// B. `isSiteStockEnabledTx` — LA DATE DE LA PIÈCE, pas l'instant présent
// ---------------------------------------------------------------------------

describe('isSiteStockEnabledTx', () => {
  it('tranche sur la DATE DE LA PIÈCE : avant la bascule non, après oui, le jour même oui', async () => {
    const { site } = seedSwitchedSite();

    // Une facture du mois dernier, saisie aujourd'hui sur un chantier basculé
    // hier, appartient à l'avant — et doit s'imputer comme avant.
    await expect(isSiteStockEnabledTx(mockPrisma as any, TENANT_ID, site.id, AVANT)).resolves.toBe(false);
    await expect(isSiteStockEnabledTx(mockPrisma as any, TENANT_ID, site.id, APRES)).resolves.toBe(true);
    // La date de bascule elle-même compte comme « après ».
    await expect(isSiteStockEnabledTx(mockPrisma as any, TENANT_ID, site.id, BASCULE)).resolves.toBe(true);
  });

  it('ne se laisse pas décider par l’instant présent', async () => {
    const { site } = seedSwitchedSite();

    // La pièce est antérieure à la bascule, alors que « maintenant » lui est
    // largement postérieur : c'est la pièce qui commande.
    const maintenant = new Date('2027-01-01T00:00:00.000Z');
    expect(maintenant.getTime()).toBeGreaterThan(BASCULE.getTime());
    await expect(isSiteStockEnabledTx(mockPrisma as any, TENANT_ID, site.id, AVANT)).resolves.toBe(false);
  });

  it('renvoie faux pour un chantier qui n’a pas basculé', async () => {
    const site = seedSite();
    await expect(isSiteStockEnabledTx(mockPrisma as any, TENANT_ID, site.id, APRES)).resolves.toBe(false);
  });

  it('renvoie faux pour un chantier inexistant plutôt que de lever', async () => {
    await expect(isSiteStockEnabledTx(mockPrisma as any, TENANT_ID, 'chantier-fantome', APRES)).resolves.toBe(false);

    const etranger = seedSite({ tenantId: 'tenant-2', stockEnabledAt: BASCULE });
    await expect(isSiteStockEnabledTx(mockPrisma as any, TENANT_ID, etranger.id, APRES)).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C. L'écart du besoin S7 — le cœur du sous-lot
// ---------------------------------------------------------------------------

describe('getSiteStockReconciliation — l’écart', () => {
  it('UN MILLION FACTURÉ, NEUF CENT MILLE REÇU : l’écart vaut cent mille', async () => {
    const { site, location } = seedSwitchedSite();
    const ciment = seedItem();

    seedInvoice(site, 1_000_000);
    seedMovement({ itemId: ciment.id, locationId: location.id, quantity: 90, totalValue: 900_000 });

    const rapport = await getSiteStockReconciliation(TENANT_ID, site.id);

    expect(rapport.invoicedAmount).toBe(1_000_000);
    expect(rapport.receivedValue).toBe(900_000);
    expect(rapport.unreconciledAmount).toBe(100_000);
  });

  it('quand la réception couvre tout, l’écart vaut ZÉRO', async () => {
    const { site, location } = seedSwitchedSite();
    const ciment = seedItem();

    seedInvoice(site, 1_000_000);
    seedMovement({ itemId: ciment.id, locationId: location.id, quantity: 100, totalValue: 1_000_000 });

    const rapport = await getSiteStockReconciliation(TENANT_ID, site.id);

    expect(rapport.unreconciledAmount).toBe(0);
  });

  it('N’EST PAS entré − sorti − restant, qui vaudrait zéro par construction', async () => {
    const { site, location } = seedSwitchedSite();
    const ciment = seedItem();

    // 100 sacs entrés à 10 000, 40 sortis, 60 restants : l'identité comptable
    // « entré − sorti − restant » vaut zéro ici, et pourtant l'écart réel vaut
    // 200 000 — c'est exactement le piège que le contrat décrit.
    seedInvoice(site, 1_200_000);
    seedMovement({ itemId: ciment.id, locationId: location.id, quantity: 100, totalValue: 1_000_000 });
    seedMovement({
      type: 'ISSUE',
      itemId: ciment.id,
      locationId: location.id,
      siteId: site.id,
      isDecrease: true,
      quantity: 40,
      totalValue: 400_000
    });
    seedBalance({ itemId: ciment.id, locationId: location.id, quantity: 60, value: 600_000 });

    const rapport = await getSiteStockReconciliation(TENANT_ID, site.id);
    const ligne = rapport.lines[0];

    expect(ligne.receivedQuantity - ligne.issuedQuantity - ligne.remainingQuantity).toBe(0);
    expect(rapport.unreconciledAmount).toBe(200_000);
  });

  it('ne compte QUE les factures validées, non annulées, du chantier, ET postérieures à la bascule', async () => {
    const { site } = seedSwitchedSite();
    const autre = seedSite({ stockEnabledAt: BASCULE });

    seedInvoice(site, 500_000); // celle qui compte
    seedInvoice(site, 900_000, { status: 'DRAFT' });
    seedInvoice(site, 700_000, { status: 'VOIDED' });
    // Une facture d'AVANT la bascule s'est imputée normalement : la compter
    // ici inventerait un écart qui n'existe pas.
    seedInvoice(site, 300_000, { invoiceDate: AVANT });
    seedInvoice(autre, 800_000);

    const rapport = await getSiteStockReconciliation(TENANT_ID, site.id);

    expect(rapport.invoicedAmount).toBe(500_000);
    expect(rapport.unreconciledAmount).toBe(500_000);
  });

  it('NE QUALIFIE JAMAIS l’écart — ni perte, ni vol, ni anomalie', async () => {
    const { site, location } = seedSwitchedSite();
    const ciment = seedItem();

    seedInvoice(site, 1_000_000);
    seedMovement({ itemId: ciment.id, locationId: location.id, quantity: 50, totalValue: 500_000 });

    const rapport = await getSiteStockReconciliation(TENANT_ID, site.id);
    const rendu = JSON.stringify(rapport).toLowerCase();

    // Un vol et des frais de transport se ressemblent dans une soustraction.
    for (const mot of ['perte', 'vol', 'anomalie', 'manquant', 'suspect', 'fraude']) {
      expect(rendu).not.toContain(mot);
    }
    // Et aucun libellé comptable (principe P-1).
    for (const mot of ['débit', 'debit', 'crédit', 'credit']) {
      expect(rendu).not.toContain(mot);
    }
  });
});

// ---------------------------------------------------------------------------
// D. Les quantités par article, et l'asymétrie voulue
// ---------------------------------------------------------------------------

describe('getSiteStockReconciliation — par article', () => {
  it('compte le CONSOMMÉ depuis n’importe quel lieu, et le REÇU/RESTANT au seul lieu du chantier', async () => {
    const { site, location } = seedSwitchedSite();
    const magasinCentral = seedLocation({ label: 'Magasin central' });
    const ciment = seedItem({ reference: 'CIM-45', label: 'Ciment CPJ 45', unit: 'sac' });

    // Reçu SUR LE CHANTIER : 40 sacs.
    seedMovement({ itemId: ciment.id, locationId: location.id, quantity: 40, totalValue: 400_000 });
    // Sorti vers ce chantier DEPUIS LE CHANTIER : 10 sacs.
    seedMovement({
      type: 'ISSUE',
      itemId: ciment.id,
      locationId: location.id,
      siteId: site.id,
      isDecrease: true,
      quantity: 10,
      totalValue: 100_000
    });
    // Sorti vers ce chantier DEPUIS LE MAGASIN CENTRAL : 25 sacs. On sort
    // couramment d'un magasin central vers un chantier — ces 25 sacs sont
    // consommés par le chantier, même s'ils ne sont jamais passés par son lieu.
    seedMovement({
      type: 'ISSUE',
      itemId: ciment.id,
      locationId: magasinCentral.id,
      siteId: site.id,
      isDecrease: true,
      quantity: 25,
      totalValue: 250_000
    });
    // Une réception AU MAGASIN CENTRAL n'est pas entrée sur le chantier.
    seedMovement({ itemId: ciment.id, locationId: magasinCentral.id, quantity: 500, totalValue: 5_000_000 });
    seedBalance({ itemId: ciment.id, locationId: location.id, quantity: 30, value: 300_000 });
    seedBalance({ itemId: ciment.id, locationId: magasinCentral.id, quantity: 500, value: 5_000_000 });

    const rapport = await getSiteStockReconciliation(TENANT_ID, site.id);

    expect(rapport.lines).toHaveLength(1);
    expect(rapport.lines[0]).toMatchObject({
      itemId: ciment.id,
      itemReference: 'CIM-45',
      itemLabel: 'Ciment CPJ 45',
      itemUnit: 'sac',
      receivedQuantity: 40,
      issuedQuantity: 35,
      remainingQuantity: 30,
      issuedValue: 350_000,
      remainingValue: 300_000,
      currency: 'XOF'
    });
    expect(rapport.receivedValue).toBe(400_000);
    expect(rapport.issuedValue).toBe(350_000);
    expect(rapport.remainingValue).toBe(300_000);
  });

  it('compte un TRANSFERT REÇU comme une entrée, et pas sa moitié sortante', async () => {
    const { site, location } = seedSwitchedSite();
    const magasin = seedLocation({ label: 'Magasin central' });
    const fer = seedItem({ reference: 'FER-12' });
    const groupe = 'transfert-1';

    seedMovement({
      type: 'TRANSFER',
      itemId: fer.id,
      locationId: magasin.id,
      isDecrease: true,
      quantity: 20,
      totalValue: 240_000,
      transferGroupId: groupe
    });
    seedMovement({
      type: 'TRANSFER',
      itemId: fer.id,
      locationId: location.id,
      isDecrease: false,
      quantity: 20,
      totalValue: 240_000,
      transferGroupId: groupe
    });

    const rapport = await getSiteStockReconciliation(TENANT_ID, site.id);

    expect(rapport.lines[0].receivedQuantity).toBe(20);
    expect(rapport.receivedValue).toBe(240_000);
  });

  it('ne compte PAS un ajustement d’inventaire comme une entrée, alors qu’il reste dans le restant', async () => {
    const { site, location } = seedSwitchedSite();
    const ciment = seedItem();

    seedInvoice(site, 500_000);
    seedMovement({ itemId: ciment.id, locationId: location.id, quantity: 50, totalValue: 500_000 });
    // Un excédent de comptage n'a été ni facturé ni livré : le compter comme
    // une entrée réduirait l'écart sans qu'aucun fournisseur n'ait rien apporté.
    seedMovement({
      type: 'ADJUSTMENT',
      itemId: ciment.id,
      locationId: location.id,
      isDecrease: false,
      quantity: 5,
      totalValue: 50_000
    });
    seedBalance({ itemId: ciment.id, locationId: location.id, quantity: 55, value: 550_000 });

    const rapport = await getSiteStockReconciliation(TENANT_ID, site.id);

    expect(rapport.receivedValue).toBe(500_000);
    expect(rapport.unreconciledAmount).toBe(0);
    expect(rapport.lines[0].receivedQuantity).toBe(50);
    expect(rapport.lines[0].remainingQuantity).toBe(55);
  });

  it('BORNE les flux à la bascule QUAND il y en a une — l’avant relève de l’avant', async () => {
    const { site, location } = seedSwitchedSite();
    const ciment = seedItem();

    // Une sortie d'AVANT la bascule : elle s'est imputée sous l'ancien régime
    // et n'entre pas dans le rapprochement, exactement comme une facture
    // d'avant. Garder la borne d'un seul côté ferait confronter deux périodes
    // différentes.
    seedMovement({
      type: 'ISSUE',
      itemId: ciment.id,
      locationId: location.id,
      siteId: site.id,
      isDecrease: true,
      quantity: 12,
      totalValue: 120_000,
      movementDate: AVANT
    });
    seedMovement({
      type: 'ISSUE',
      itemId: ciment.id,
      locationId: location.id,
      siteId: site.id,
      isDecrease: true,
      quantity: 8,
      totalValue: 80_000,
      movementDate: APRES
    });

    const rapport = await getSiteStockReconciliation(TENANT_ID, site.id);

    expect(rapport.issuedValue).toBe(80_000);
    expect(rapport.lines[0].issuedQuantity).toBe(8);
  });

  it('conserve les quatre décimales d’une quantité — une quantité n’est pas un montant', async () => {
    const { site, location } = seedSwitchedSite();
    const sable = seedItem({ label: 'Sable', unit: 'm3' });

    seedMovement({ itemId: sable.id, locationId: location.id, quantity: 12.5025, totalValue: 100_000 });
    seedBalance({ itemId: sable.id, locationId: location.id, quantity: 12.5025, value: 100_000 });

    const rapport = await getSiteStockReconciliation(TENANT_ID, site.id);

    expect(rapport.lines[0].receivedQuantity).toBe(12.5025);
    expect(rapport.lines[0].remainingQuantity).toBe(12.5025);
  });

  it('range les lignes par référence d’article, et n’émet aucune requête par article', async () => {
    const { site, location } = seedSwitchedSite();
    const fer = seedItem({ reference: 'FER-12', label: 'Fer à béton HA12', unit: 'barre' });
    const ciment = seedItem({ reference: 'CIM-45', label: 'Ciment CPJ 45', unit: 'sac' });

    seedMovement({ itemId: fer.id, locationId: location.id, quantity: 10, totalValue: 120_000 });
    seedMovement({ itemId: ciment.id, locationId: location.id, quantity: 10, totalValue: 50_000 });

    const rapport = await getSiteStockReconciliation(TENANT_ID, site.id);

    expect(rapport.lines.map(l => l.itemReference)).toEqual(['CIM-45', 'FER-12']);
    // Le référentiel est résolu PAR LOT : une seule lecture des articles,
    // quel que soit leur nombre.
    expect(mockPrisma.stockItem.findMany).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// E. Les cas de bord du rapprochement
// ---------------------------------------------------------------------------

describe('getSiteStockReconciliation — cas de bord', () => {
  it('RÉPOND sur un chantier qui n’a pas basculé, sans rien exiger de l’écran', async () => {
    const site = seedSite();
    // Une facture validée existe, et elle ne compte PAS : sans période de
    // bascule, il n'y a aucune facture à confronter.
    seedInvoice(site, 900_000);

    const rapport = await getSiteStockReconciliation(TENANT_ID, site.id);

    // Refuser obligerait l'écran à savoir d'avance ce qu'il vient demander.
    expect(rapport.stockEnabledAt).toBeNull();
    expect(rapport).toMatchObject({
      siteId: site.id,
      siteLabel: site.name,
      invoicedAmount: 0,
      receivedValue: 0,
      unreconciledAmount: 0,
      issuedValue: 0,
      remainingValue: 0,
      currency: 'XOF',
      lines: []
    });
  });

  it('MONTRE LE CONSOMMÉ d’un chantier JAMAIS BASCULÉ — ce n’est pas zéro, et ça ne l’a jamais été', async () => {
    // `recordStockIssueTx` ne regarde pas `stockEnabledAt` : on peut sortir
    // d'un magasin central vers un chantier qui n'a pas basculé, et cette
    // sortie a bel et bien imputé son coût réel. L'afficher à zéro ferait
    // mentir l'écran sur un chiffre qui existe — c'est la correction portée
    // au contrat après le premier jet de ce fichier.
    const site = seedSite({ name: 'Cité Kobaya' });
    const magasinCentral = seedLocation({ label: 'Magasin central' });
    const ciment = seedItem({ reference: 'CIM-45', label: 'Ciment CPJ 45', unit: 'sac' });

    // Une facture validée du chantier : elle ne doit PAS entrer dans l'écart.
    seedInvoice(site, 900_000);
    // Et une sortie réelle vers ce chantier, datée d'avant toute idée de
    // bascule : sans bascule il n'y a pas de borne de période, on prend tout.
    seedMovement({
      type: 'ISSUE',
      itemId: ciment.id,
      locationId: magasinCentral.id,
      siteId: site.id,
      isDecrease: true,
      quantity: 35,
      totalValue: 350_000,
      movementDate: AVANT
    });

    const rapport = await getSiteStockReconciliation(TENANT_ID, site.id);

    expect(rapport.stockEnabledAt).toBeNull();

    // LE CONSOMMÉ DIT LA VÉRITÉ, bascule ou pas.
    expect(rapport.issuedValue).toBe(350_000);
    expect(rapport.lines).toHaveLength(1);
    expect(rapport.lines[0]).toMatchObject({
      itemId: ciment.id,
      itemReference: 'CIM-45',
      issuedQuantity: 35,
      issuedValue: 350_000
    });

    // LES DEUX SEULS CHIFFRES QUI DÉPENDENT DE LA BASCULE restent nuls : sans
    // période de bascule, il n'y a aucune facture à confronter, et donc aucun
    // écart à montrer.
    expect(rapport.invoicedAmount).toBe(0);
    expect(rapport.unreconciledAmount).toBe(0);
  });

  it('montre aussi le reçu et le restant d’un chantier non basculé qui a déjà un lieu', async () => {
    // Le référentiel permet de créer un lieu de chantier à la main, sans
    // bascule : ce qui y est entré et ce qui y reste sont des faits.
    const site = seedSite();
    const lieu = seedLocation({ kind: 'SITE', label: 'Dépôt de chantier', siteId: site.id });
    const fer = seedItem({ reference: 'FER-12' });

    seedMovement({ itemId: fer.id, locationId: lieu.id, quantity: 20, totalValue: 240_000, movementDate: AVANT });
    seedBalance({ itemId: fer.id, locationId: lieu.id, quantity: 20, value: 240_000 });

    const rapport = await getSiteStockReconciliation(TENANT_ID, site.id);

    expect(rapport.stockEnabledAt).toBeNull();
    expect(rapport.receivedValue).toBe(240_000);
    expect(rapport.remainingValue).toBe(240_000);
    expect(rapport.lines[0]).toMatchObject({ receivedQuantity: 20, remainingQuantity: 20 });
    // Et toujours aucun écart à montrer.
    expect(rapport.invoicedAmount).toBe(0);
    expect(rapport.unreconciledAmount).toBe(0);
  });

  it('répond sur un chantier basculé qui n’a encore ni facture ni mouvement', async () => {
    const { site } = seedSwitchedSite();

    const rapport = await getSiteStockReconciliation(TENANT_ID, site.id);

    expect(rapport.stockEnabledAt).toEqual(BASCULE);
    expect(rapport.lines).toEqual([]);
    expect(rapport.unreconciledAmount).toBe(0);
  });

  it('répond sur un chantier basculé qui n’a pas encore de lieu, sans lever', async () => {
    const site = seedSite({ stockEnabledAt: BASCULE });
    seedInvoice(site, 400_000);

    const rapport = await getSiteStockReconciliation(TENANT_ID, site.id);

    expect(rapport.invoicedAmount).toBe(400_000);
    expect(rapport.receivedValue).toBe(0);
    expect(rapport.unreconciledAmount).toBe(400_000);
  });

  it('refuse un chantier inexistant, et un chantier d’une autre agence', async () => {
    await expect(getSiteStockReconciliation(TENANT_ID, 'chantier-fantome')).rejects.toMatchObject({ status: 404 });

    const etranger = seedSite({ tenantId: 'tenant-2', stockEnabledAt: BASCULE });
    await expect(getSiteStockReconciliation(TENANT_ID, etranger.id)).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// F. L'état de la bascule
// ---------------------------------------------------------------------------

describe('getSiteStockStatus', () => {
  it('rend la date de bascule et le lieu du chantier', async () => {
    const { site, location } = seedSwitchedSite();

    const status = await getSiteStockStatus(TENANT_ID, site.id);

    expect(status).toEqual({
      siteId: site.id,
      siteLabel: site.name,
      stockEnabledAt: BASCULE,
      stockLocationId: location.id,
      stockLocationLabel: location.label
    });
  });

  it('rend une date nulle sur un chantier qui n’a pas basculé', async () => {
    const site = seedSite();

    const status = await getSiteStockStatus(TENANT_ID, site.id);

    expect(status.stockEnabledAt).toBeNull();
    expect(status.stockLocationId).toBeNull();
  });

  it('refuse un chantier inexistant', async () => {
    await expect(getSiteStockStatus(TENANT_ID, 'chantier-fantome')).rejects.toMatchObject({ status: 404 });
  });
});
