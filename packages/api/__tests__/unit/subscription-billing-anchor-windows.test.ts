/**
 * Regle de fin de mois : fenetres de depassement et apercu de facture.
 * `previewNextInvoice`, `monthlyOverageWindow` (subscription-v2-service) et
 * `dueOverageWindows` (platform-invoice-service) enchainent des periodes sur
 * le jour d'ancrage (31/01 -> 28/02 -> 31/03), sans derive vers le 28.
 * Faux client Prisma en memoire (modele : subscription-v2-service.test.ts).
 */

type Row = Record<string, any>;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DEFAULT_CATALOG } = require('../../src/lib/subscription/catalog');
const CATALOG: Row[] = DEFAULT_CATALOG.map((d: Row, i: number) => ({
  id: `cat-${i + 1}`,
  ...d,
  capacities: Object.entries(d.capacities).map(([capacityKey, amount]) => ({ capacityKey, amount }))
}));
const catalogById = (id: string) => CATALOG.find(c => c.id === id)!;
const catalogByCode = (code: string) => CATALOG.find(c => c.code === code)!;

let seq = 0;
const id = (p: string) => `${p}-${++seq}`;

/** Donnees de l'agence dans les modules (D11 : lecture seule seulement s'il y en a). */
const extraData = { properties: 0, syndicates: 0, sites: 0 };

let db: {
  peaks?: Row[];
  subscriptions: Row[];
  items: Row[];
  modules: Row[];
  lines: Row[];
  overrides: Row[];
};

function withCatalog(row: Row) {
  return { ...row, catalogItem: catalogById(row.catalogItemId) };
}

function matchIn(value: unknown, filter: unknown) {
  if (filter === undefined) return true;
  if (filter && typeof filter === 'object' && Array.isArray((filter as Row).in))
    return (filter as Row).in.includes(value);
  return value === filter;
}

function matchItem(row: Row, where: Row) {
  return (
    row.tenantId === where.tenantId &&
    matchStatus(row, where) &&
    matchIn(row.parentItemId ?? null, where.parentItemId) &&
    matchIn(row.id, where.id) &&
    matchDate(row.endsAt, where, 'endsAt') &&
    matchDate(row.startsAt, where, 'startsAt') &&
    (!where.parentItem || db.items.find(p => p.id === row.parentItemId)?.status === where.parentItem.status)
  );
}

function matchDate(value: Date | null, where: Row, key: string) {
  if (!(key in where)) return true;
  const filter = where[key];
  if (filter === null) return value === null || value === undefined;
  if (filter?.lte) return !!value && value.getTime() <= filter.lte.getTime();
  return true;
}

/** `where: { catalogItem: { kind: 'PACK' } }` (tenantCountsHeldProperties). */
function matchCatalogWhere(row: Row, filter?: Row) {
  if (!filter) return true;
  const catalog = catalogById(row.catalogItemId);
  return !filter.kind || catalog.kind === filter.kind;
}

function matchStatus(row: Row, where: Row) {
  if (where.status === undefined) return true;
  if (typeof where.status === 'string') return row.status === where.status;
  if (where.status.not) return row.status !== where.status.not;
  return true;
}

const fake: Row = {
  subscription: {
    findUnique: jest.fn(async ({ where }: Row) => db.subscriptions.find(s => s.tenantId === where.tenantId) ?? null),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = db.subscriptions.find(s => s.tenantId === where.tenantId)!;
      Object.assign(row, data);
      return row;
    })
  },
  catalogItem: {
    findMany: jest.fn(async ({ where }: Row) => CATALOG.filter(c => where.code.in.includes(c.code)))
  },
  subscriptionItem: {
    findMany: jest.fn(async ({ where, select }: Row) => {
      const rows = db.items.filter(i => matchItem(i, where) && matchCatalogWhere(i, where.catalogItem));
      // tenantCountsHeldProperties : select.catalogItem.select.capacities.where.capacityKey (Prisma filtre la relation).
      const capacityKey = select?.catalogItem?.select?.capacities?.where?.capacityKey;
      if (capacityKey) {
        return rows.map(r => ({
          catalogItem: {
            capacities: catalogById(r.catalogItemId).capacities.filter((c: Row) => c.capacityKey === capacityKey)
          }
        }));
      }
      return rows.map(withCatalog);
    }),
    findFirst: jest.fn(async ({ where }: Row) => {
      const row = db.items.find(i => i.id === where.id && i.tenantId === where.tenantId);
      return row ? withCatalog(row) : null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      const row = {
        id: id('item'),
        createdAt: new Date(),
        discountPercent: 0,
        unitSetupPrice: 0,
        endsAt: null,
        billedThrough: null,
        replacesItemId: null,
        parentItemId: null,
        endReason: null,
        ...data
      };
      db.items.push(row);
      return withCatalog(row);
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = db.items.find(i => i.id === where.id)!;
      Object.assign(row, data);
      return withCatalog(row);
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = db.items.filter(i => matchItem(i, where));
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    })
  },
  capacityOverride: {
    findMany: jest.fn(async ({ where }: Row) => db.overrides.filter(o => o.tenantId === where.tenantId))
  },
  tenantModule: {
    findMany: jest.fn(async ({ where }: Row) => db.modules.filter(m => m.tenantId === where.tenantId)),
    create: jest.fn(async ({ data }: Row) => {
      const row = { id: id('tm'), expiresAt: null, disabledAt: null, ...data };
      db.modules.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const key = where.tenantId_moduleKey;
      const row = db.modules.find(m => m.tenantId === key.tenantId && m.moduleKey === key.moduleKey)!;
      Object.assign(row, data);
      return row;
    })
  },
  invoiceLine: {
    create: jest.fn(async ({ data }: Row) => {
      const row = { id: id('line'), createdAt: new Date(), ...data };
      db.lines.push(row);
      return row;
    }),
    findMany: jest.fn(async ({ where }: Row) =>
      db.lines.filter(l => l.tenantId === where.tenantId && l.invoiceId === null)
    )
  },
  usageSnapshot: {
    groupBy: jest.fn(async () => db.peaks ?? [])
  },
  // Registre des lots : aucun bien dans ce faux client, seulement le pack Patrimoine
  // et le reclassement declenche (reconcileHeldPropertiesIfChangedTx). Les listes vides
  // suffisent : computeQualifyingUnits() rend [] et reconcileLotActivationsTx n'ecrit rien.
  property: { findMany: jest.fn(async () => []), count: jest.fn(async () => extraData.properties) },
  syndicate: { count: jest.fn(async () => extraData.syndicates) },
  constructionSite: { count: jest.fn(async () => extraData.sites) },
  propertyMandate: { count: jest.fn(async () => 0) },
  syndicateLot: { findMany: jest.fn(async () => []) },
  siteLot: { findMany: jest.fn(async () => []) },
  lotActivation: { findMany: jest.fn(async () => []) },
  // Capacite ACTIFS (lot 4A) : actifs non archives + biens non archives sans actif lie.
  asset: { count: jest.fn(async () => 0) },
  // Capacite PHOTOS_INVENTAIRE (lot 041) : `countInventoryPhotosThisMonth`, 0 sans ligne du mois.
  stockWhatsappUsage: { findFirst: jest.fn(async () => null) },
  signatureUsage: { findFirst: jest.fn(async () => null) },
  $transaction: async (cb: (tx: Row) => Promise<any>) => cb(fake)
};

jest.mock('../../src/utils/database', () => ({
  get prisma() {
    return fake;
  }
}));

const auditEvents: Row[] = [];
jest.mock('../../src/services/audit-service', () => {
  const actual = jest.requireActual('../../src/services/audit-service');
  return {
    ...actual,
    logAuditEvent: (entry: Row) => auditEvents.push(entry),
    // Evenement critique : ecrit via le client de transaction, que l'on garde pour l'assertion.
    recordAuditEvent: async (tx: Row, entry: Row) => {
      auditEvents.push({ ...entry, tx });
    }
  };
});

jest.mock('../../src/services/email-service', () => ({ emailService: { sendEmail: jest.fn(async () => undefined) } }));

import {
  monthlyOverageWindow,
  previewNextInvoice,
  registerUsageProvider
} from '../../src/services/subscription-v2-service';
import { dueOverageWindows } from '../../src/services/platform-invoice-service';

const T = 'tenant-1';
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const win = (start: string, end: string) => ({ start: d(start), end: d(end) });

function seedSubscription(sub: Row) {
  for (const key of ['LOTS', 'COPROPRIETES', 'CHANTIERS', 'BIENS_DETENUS'] as const) {
    registerUsageProvider(key, async () => 0);
  }
  Object.assign(extraData, { properties: 0, syndicates: 0, sites: 0 });
  db = { subscriptions: [], items: [], modules: [], lines: [], overrides: [] };
  db.subscriptions.push({
    id: 'sub-1',
    tenantId: T,
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    trialEndsAt: null,
    comboDiscountPercent: 0,
    ...sub
  });
  const c = catalogByCode('AGENCE');
  db.items.push({
    id: id('item'),
    subscriptionId: 'sub-1',
    tenantId: T,
    catalogItemId: c.id,
    quantity: 1,
    unitMonthlyPrice: c.monthlyPrice,
    unitSetupPrice: 0,
    discountPercent: 0,
    status: 'ACTIVE',
    startsAt: d('2026-01-01'),
    endsAt: null,
    billedThrough: null,
    replacesItemId: null,
    createdAt: d('2026-01-01')
  });
}

describe('previewNextInvoice : periodEnd suit l’ancre', () => {
  const NOW = new Date('2027-02-10T10:00:00Z');

  it('mensuel, ancre 31 memorisee : 28/02 -> 31/03', async () => {
    seedSubscription({
      currentPeriodStart: d('2027-01-31'),
      currentPeriodEnd: d('2027-02-28'),
      metadata: { billingAnchorDay: 31 }
    });
    const preview = await previewNextInvoice(T, { now: NOW });
    expect(preview.periodStart.toISOString()).toBe('2027-02-28T00:00:00.000Z');
    expect(preview.periodEnd.toISOString()).toBe('2027-03-31T00:00:00.000Z');
  });

  it('periode heritee de l’ancien calcul (31/01 -> 03/03), sans ancre : jamais reecrite, suivante 03/03 -> 03/04', async () => {
    // L'ancien setUTCMonth(+1) faisait finir au 03/03 une periode commencee le
    // 31/01 : cette periode deja emise n'est pas reecrite, la suivante part de
    // sa fin, au jour 3 (<= 28 : resultat identique a l'ancien calcul).
    seedSubscription({
      currentPeriodStart: d('2027-01-31'),
      currentPeriodEnd: d('2027-03-03'),
      metadata: null
    });
    const preview = await previewNextInvoice(T, { now: NOW });
    expect(preview.periodStart.toISOString()).toBe('2027-03-03T00:00:00.000Z');
    expect(preview.periodEnd.toISOString()).toBe('2027-04-03T00:00:00.000Z');
  });

  it('annuel, ancre 31 : 31/01/2028 -> 31/01/2029', async () => {
    seedSubscription({
      billingCycle: 'ANNUAL',
      currentPeriodStart: d('2027-01-31'),
      currentPeriodEnd: d('2028-01-31'),
      metadata: { billingAnchorDay: 31 }
    });
    const preview = await previewNextInvoice(T, { now: NOW });
    expect(preview.periodStart.toISOString()).toBe('2028-01-31T00:00:00.000Z');
    expect(preview.periodEnd.toISOString()).toBe('2029-01-31T00:00:00.000Z');
  });
});

describe('monthlyOverageWindow : fenetres ancrees sur le jour', () => {
  const START = d('2027-01-31');

  it('ancre implicite 31 : 31/01 -> 28/02', () => {
    expect(monthlyOverageWindow(START, new Date('2027-02-10T10:00:00Z'))).toEqual(win('2027-01-31', '2027-02-28'));
  });

  it('puis 28/02 -> 31/03 (et non 28/03)', () => {
    expect(monthlyOverageWindow(START, new Date('2027-03-05T10:00:00Z'))).toEqual(win('2027-02-28', '2027-03-31'));
  });

  it('puis 31/03 -> 30/04', () => {
    expect(monthlyOverageWindow(START, new Date('2027-04-05T10:00:00Z'))).toEqual(win('2027-03-31', '2027-04-30'));
  });

  it('ancre explicite 31 depuis un debut 28/02 : la fenetre finit le 31/03', () => {
    expect(monthlyOverageWindow(d('2027-02-28'), new Date('2027-03-05T10:00:00Z'), 31)).toEqual(
      win('2027-02-28', '2027-03-31')
    );
    expect(monthlyOverageWindow(d('2027-02-28'), new Date('2027-03-31T10:00:00Z'), 31)).toEqual(
      win('2027-03-31', '2027-04-30')
    );
  });

  it('annee bissextile : 31/01/2028 -> 29/02 -> 31/03', () => {
    const start = d('2028-01-31');
    expect(monthlyOverageWindow(start, new Date('2028-02-10T10:00:00Z'))).toEqual(win('2028-01-31', '2028-02-29'));
    expect(monthlyOverageWindow(start, new Date('2028-03-05T10:00:00Z'))).toEqual(win('2028-02-29', '2028-03-31'));
  });

  it('sans fin de mois (15/01) : comportement inchange', () => {
    expect(monthlyOverageWindow(d('2027-01-15'), new Date('2027-03-20T10:00:00Z'))).toEqual(
      win('2027-03-15', '2027-04-15')
    );
  });
});

describe('dueOverageWindows : chaine 31/01 -> 28/02 -> 31/03 -> 30/04', () => {
  const START = d('2027-01-31');
  const END = d('2028-01-31');

  it('now 02/04, rien de verifie : 31/01->28/02 et 28/02->31/03 (plancher 26/02)', () => {
    expect(dueOverageWindows(START, END, new Date('2027-04-02T00:00:00Z'), null)).toEqual([
      win('2027-01-31', '2027-02-28'),
      win('2027-02-28', '2027-03-31')
    ]);
  });

  it('now 01/05, verifie jusqu’au 28/02 : 28/02->31/03 et 31/03->30/04', () => {
    expect(dueOverageWindows(START, END, new Date('2027-05-01T00:00:00Z'), d('2027-02-28'))).toEqual([
      win('2027-02-28', '2027-03-31'),
      win('2027-03-31', '2027-04-30')
    ]);
  });

  it('now 01/05, verifie jusqu’au 31/03 : seulement 31/03->30/04', () => {
    expect(dueOverageWindows(START, END, new Date('2027-05-01T00:00:00Z'), d('2027-03-31'))).toEqual([
      win('2027-03-31', '2027-04-30')
    ]);
  });

  it('now 05/05, verifie jusqu’au 27/02 : plancher now-35j = 31/03, seule 31/03->30/04 reste', () => {
    expect(dueOverageWindows(START, END, new Date('2027-05-05T00:00:00Z'), d('2027-02-27'))).toEqual([
      win('2027-03-31', '2027-04-30')
    ]);
  });

  it('ancre explicite 31 depuis un debut 28/02 : 28/02->31/03', () => {
    expect(dueOverageWindows(d('2027-02-28'), d('2028-02-28'), new Date('2027-04-02T00:00:00Z'), null, 31)).toEqual([
      win('2027-02-28', '2027-03-31')
    ]);
  });

  it('periode annuelle <= 28 (15/01) : fenetres inchangees', () => {
    expect(dueOverageWindows(d('2027-01-15'), d('2028-01-15'), new Date('2027-03-20T00:00:00Z'), null)).toEqual([
      win('2027-01-15', '2027-02-15'),
      win('2027-02-15', '2027-03-15')
    ]);
  });

  it('jamais de fenetre dont la fin depasse la fin de la periode annuelle', () => {
    const windows = dueOverageWindows(START, END, new Date('2028-03-01T00:00:00Z'), d('2027-12-31'));
    expect(windows).toEqual([win('2027-12-31', '2028-01-31')]);
    for (const w of windows) expect(w.end.getTime()).toBeLessThanOrEqual(END.getTime());
    // Rien non plus quand tout est deja verifie jusqu'a la fin.
    expect(dueOverageWindows(START, END, new Date('2028-03-01T00:00:00Z'), END)).toEqual([]);
  });
});
