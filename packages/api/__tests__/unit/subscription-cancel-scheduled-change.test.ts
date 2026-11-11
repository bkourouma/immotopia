/**
 * Annulation d'un changement de pack programme (E-S3-1) :
 * `removeSubscriptionItem` sur un pack SCHEDULED qui en remplace un autre
 * (`replacesItemId`) remet les packs remplaces (et leurs extensions arretees
 * avec eux) « sans fin ». `changePack` refuse un second changement tant qu'un
 * premier est en attente. Faux client Prisma en memoire (copie autonome du
 * modele de subscription-v2-service.test.ts), aucune base.
 *
 * Les etats sont produits par de VRAIS appels (`changePack`,
 * `removeSubscriptionItem`, `addSubscriptionItem`) ; les rares etats poses a la
 * main sont signales et ne servent qu'a des gardes defensives.
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

let db: {
  subscriptions: Row[];
  items: Row[];
  modules: Row[];
  lines: Row[];
  overrides: Row[];
  invoices: Row[];
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
  // Egalite stricte (garde d'etat de la restauration : `endsAt: replaced.endsAt`).
  if (filter instanceof Date) return !!value && value.getTime() === filter.getTime();
  if (filter?.lte) return !!value && value.getTime() <= filter.lte.getTime();
  return true;
}

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

/** Instantane des tableaux de `db` et du contenu de chaque ligne (rollback du faux `$transaction`). */
function takeSnapshot() {
  const arrays: Array<[Row[], Array<[Row, Row]>]> = [];
  for (const arr of [db.subscriptions, db.items, db.modules, db.lines, db.overrides, db.invoices]) {
    arrays.push([arr, arr.map(r => [r, structuredClone(r)] as [Row, Row])]);
  }
  return arrays;
}

function restoreSnapshot(snapshot: ReturnType<typeof takeSnapshot>) {
  for (const [arr, entries] of snapshot) {
    arr.splice(0, arr.length, ...entries.map(([ref]) => ref));
    for (const [ref, copy] of entries) {
      for (const key of Object.keys(ref)) delete ref[key];
      Object.assign(ref, copy);
    }
  }
}

const updateManyItems = async ({ where, data }: Row) => {
  const rows = db.items.filter(i => matchItem(i, where));
  for (const row of rows) Object.assign(row, data);
  return { count: rows.length };
};

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
      const row = db.items.find(
        i => i.id === where.id && (where.tenantId === undefined || i.tenantId === where.tenantId)
      )!;
      Object.assign(row, data);
      return withCatalog(row);
    }),
    updateMany: jest.fn(updateManyItems)
  },
  invoice: {
    // Factures PERIOD qui couvrent une date : periodStart <= date < periodEnd.
    findMany: jest.fn(async ({ where }: Row) =>
      db.invoices.filter(
        i =>
          i.tenantId === where.tenantId &&
          i.kind === where.kind &&
          i.billingNature === where.billingNature &&
          i.periodStart.getTime() <= where.periodStart.lte.getTime() &&
          i.periodEnd.getTime() > where.periodEnd.gt.getTime()
      )
    )
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
  usageSnapshot: { groupBy: jest.fn(async () => []) },
  property: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
  syndicate: { count: jest.fn(async () => 0) },
  constructionSite: { count: jest.fn(async () => 0) },
  propertyMandate: { count: jest.fn(async () => 0) },
  syndicateLot: { findMany: jest.fn(async () => []) },
  siteLot: { findMany: jest.fn(async () => []) },
  lotActivation: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
  asset: { count: jest.fn(async () => 0) },
  stockWhatsappUsage: { findFirst: jest.fn(async () => null) },
  signatureUsage: { findFirst: jest.fn(async () => null) },
  // Faux rollback : instantane avant le callback, restaure si le callback leve.
  $transaction: async (cb: (tx: Row) => Promise<any>) => {
    const snapshot = takeSnapshot();
    try {
      return await cb(fake);
    } catch (error) {
      restoreSnapshot(snapshot);
      throw error;
    }
  }
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
    recordAuditEvent: async (tx: Row, entry: Row) => {
      auditEvents.push({ ...entry, tx });
    }
  };
});

import {
  addSubscriptionItem,
  applyDueItemTransitionsTx,
  changePack,
  getEntitlements,
  invalidateEntitlements,
  removeSubscriptionItem
} from '../../src/services/subscription-v2-service';
import { AuditActionKey } from '../../src/services/audit-service';

const T = 'tenant-1';
const PERIOD_START = new Date('2026-09-01T00:00:00Z');
const PERIOD_END = new Date('2026-10-01T00:00:00Z');
const NEXT_PERIOD_END = new Date('2026-11-01T00:00:00Z');
const ON_16TH = new Date('2026-09-16T10:00:00Z');
const AFTER_PERIOD_END = new Date('2026-10-02T00:00:00Z');

function seed(status: 'ACTIVE' | 'TRIALING', packs: string[]) {
  db = { subscriptions: [], items: [], modules: [], lines: [], overrides: [], invoices: [] };
  db.subscriptions.push({
    id: 'sub-1',
    tenantId: T,
    status,
    billingCycle: 'MONTHLY',
    currentPeriodStart: PERIOD_START,
    currentPeriodEnd: PERIOD_END,
    trialEndsAt: status === 'TRIALING' ? PERIOD_END : null,
    comboDiscountPercent: 10
  });
  for (const code of packs) {
    const c = catalogByCode(code);
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
      startsAt: new Date('2026-08-01T00:00:00Z'),
      endsAt: null,
      billedThrough: null,
      replacesItemId: null,
      parentItemId: null,
      endReason: null,
      createdAt: new Date('2026-08-01T00:00:00Z')
    });
    for (const m of c.modules) {
      if (!db.modules.some(r => r.moduleKey === m)) {
        db.modules.push({
          id: id('tm'),
          tenantId: T,
          moduleKey: m,
          enabled: true,
          source: 'PACK',
          expiresAt: null,
          disabledAt: null
        });
      }
    }
  }
}

/** Ajoute un element a la main : etat de depart (extension souscrite) ou garde defensive signalee. */
function pushItem(code: string, overrides: Row = {}): Row {
  const c = catalogByCode(code);
  const row: Row = {
    id: id('item'),
    subscriptionId: 'sub-1',
    tenantId: T,
    catalogItemId: c.id,
    quantity: 1,
    unitMonthlyPrice: c.monthlyPrice,
    unitSetupPrice: 0,
    discountPercent: 0,
    status: 'ACTIVE',
    startsAt: new Date('2026-08-01T00:00:00Z'),
    endsAt: null,
    billedThrough: null,
    replacesItemId: null,
    parentItemId: null,
    endReason: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides
  };
  db.items.push(row);
  return row;
}

function pushInvoice(status: string, periodStart: Date, periodEnd: Date): Row {
  const row = {
    id: id('inv'),
    tenantId: T,
    kind: 'PLATFORM',
    billingNature: 'PERIOD',
    status,
    periodStart,
    periodEnd
  };
  db.invoices.push(row);
  return row;
}

const itemByCode = (code: string) => db.items.find(i => catalogById(i.catalogItemId).code === code)!;
const removedAudit = () => auditEvents.filter(e => e.actionKey === AuditActionKey.SUBSCRIPTION_ITEM_REMOVED);
const livePackCodes = () =>
  db.items
    .filter(i => i.status !== 'ENDED' && catalogById(i.catalogItemId).kind === 'PACK')
    .map(i => catalogById(i.catalogItemId).code)
    .sort();

/** Remplit le cache de droits ; apres, `getEntitlements` ne relit la base que si le cache a ete invalide. */
async function primeEntitlementsCache() {
  await getEntitlements(T);
  fake.subscription.findUnique.mockClear();
}
async function entitlementsWereRecomputed() {
  fake.subscription.findUnique.mockClear();
  await getEntitlements(T);
  return fake.subscription.findUnique.mock.calls.length > 0;
}

/**
 * Etat HERITE d'avant le refus des changements simultanes : PROMOTEUR +
 * PATRIMOINE_PRO, puis deux vrais `changePack` programmes a la meme echeance
 * (PATRIMOINE_PRO -> ESSENTIEL, PROMOTEUR -> SYNDIC). Le premier pack
 * programme est masque le temps du second appel : l'ancien code ne le voyait
 * pas davantage (il n'est pas en vigueur et le pack remplace a deja une fin).
 */
async function seedLegacyDoubleChange() {
  seed('ACTIVE', ['PROMOTEUR', 'PATRIMOINE_PRO']);
  await changePack(T, { fromCodes: ['PATRIMOINE_PRO'], toCode: 'PATRIMOINE_ESSENTIEL' }, 'admin-1');
  const essentiel = itemByCode('PATRIMOINE_ESSENTIEL');
  db.items.splice(db.items.indexOf(essentiel), 1);
  await changePack(T, { fromCodes: ['PROMOTEUR'], toCode: 'SYNDIC' }, 'admin-1');
  db.items.push(essentiel);
  return {
    promoteur: itemByCode('PROMOTEUR'),
    pro: itemByCode('PATRIMOINE_PRO'),
    essentiel,
    syndic: itemByCode('SYNDIC')
  };
}

beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout'] });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  jest.setSystemTime(ON_16TH);
  auditEvents.length = 0;
  invalidateEntitlements();
  fake.subscriptionItem.update.mockClear();
  fake.subscriptionItem.updateMany.mockClear();
});

describe('removeSubscriptionItem : annulation d’un changement de pack programmé (E-S3-1)', () => {
  it.each([
    ['atteinte', PERIOD_END],
    ['dépassée', AFTER_PERIOD_END]
  ])(
    'échéance du pack remplacé %s (transitions pas encore appliquées) : pas de restauration',
    async (_label, later) => {
      seed('ACTIVE', ['INTEGRE']);
      await changePack(T, { fromCodes: ['INTEGRE'], toCode: 'AGENCE' }, 'admin-1');
      const integre = itemByCode('INTEGRE');
      const agence = itemByCode('AGENCE');
      jest.setSystemTime(later);
      auditEvents.length = 0;

      const result = await removeSubscriptionItem(T, agence.id, {}, 'admin-1');

      expect(result.restoredItemIds).toEqual([]);
      expect(integre).toMatchObject({ endsAt: PERIOD_END, endReason: 'DOWNGRADE', endedByUserId: 'admin-1' });
      expect(removedAudit()[0].payload.restoredItemIds).toEqual([]);
    }
  );

  it('descente Intégré -> Agence : retirer l’Agence programmée restaure l’Intégré, qui survit à l’échéance', async () => {
    seed('ACTIVE', ['INTEGRE']);
    await changePack(T, { fromCodes: ['INTEGRE'], toCode: 'AGENCE' }, 'admin-1');
    const integre = itemByCode('INTEGRE');
    const agence = itemByCode('AGENCE');
    expect(agence.status).toBe('SCHEDULED');
    expect(integre).toMatchObject({ endsAt: PERIOD_END, endReason: 'DOWNGRADE', status: 'ACTIVE' });
    expect(integre.endedByUserId).toBe('admin-1');

    await primeEntitlementsCache();
    auditEvents.length = 0;
    const result = await removeSubscriptionItem(T, agence.id, {}, 'admin-1');

    expect(result.restoredItemIds).toEqual([integre.id]);
    expect(agence).toMatchObject({ status: 'ENDED', endReason: 'CHANGE_CANCELED' });
    expect(agence.endsAt).toEqual(ON_16TH);
    expect(integre).toMatchObject({ status: 'ACTIVE', endsAt: null, endReason: null, endedByUserId: null });

    const audit = removedAudit();
    expect(audit).toHaveLength(1);
    expect(audit[0].payload.restoredItemIds).toEqual([integre.id]);
    // Cache de droits invalide : le calcul suivant relit la base.
    expect(await entitlementsWereRecomputed()).toBe(true);

    // Preuve du bug corrige : a l'echeance, l'agence garde son pack.
    const transitions = await applyDueItemTransitionsTx(fake as never, T, AFTER_PERIOD_END);
    expect(transitions.ended).toBe(0);
    expect(integre.status).toBe('ACTIVE');
    expect(livePackCodes()).toEqual(['INTEGRE']);
  });

  it('une extension arrêtée avec le changement (PACK_REMOVED) est restaurée avec son pack', async () => {
    seed('ACTIVE', ['INTEGRE']);
    const integre = itemByCode('INTEGRE');
    // EXT_COPRO exige Syndic ou Integre : l'Agence ne l'autorise pas, elle part avec le changement.
    const ext = pushItem('EXT_COPRO', { parentItemId: integre.id });
    await changePack(T, { fromCodes: ['INTEGRE'], toCode: 'AGENCE' }, 'admin-1');
    expect(ext).toMatchObject({ endsAt: PERIOD_END, endReason: 'PACK_REMOVED', parentItemId: integre.id });

    const agence = itemByCode('AGENCE');
    const result = await removeSubscriptionItem(T, agence.id, {}, 'admin-1');

    expect(result.restoredItemIds.sort()).toEqual([integre.id, ext.id].sort());
    expect(ext).toMatchObject({ endsAt: null, endReason: null, endedByUserId: null, status: 'ACTIVE' });
    expect(ext.parentItemId).toBe(integre.id);
    expect(integre.endsAt).toBeNull();
    // Garde d'etat de la restauration : lignes non terminees et a la meme echeance seulement.
    expect(fake.subscriptionItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: T, status: { not: 'ENDED' }, endsAt: PERIOD_END }),
        data: { endsAt: null, endReason: null, endedByUserId: null }
      })
    );

    const transitions = await applyDueItemTransitionsTx(fake as never, T, AFTER_PERIOD_END);
    expect(transitions.ended).toBe(0);
    expect(ext.status).toBe('ACTIVE');
  });

  it('une extension passée sur le pack programmé revient sur le pack restauré, par une écriture filtrée sur l’agence', async () => {
    seed('ACTIVE', ['INTEGRE']);
    const integre = itemByCode('INTEGRE');
    // EXT_LOTS_10 est autorisee par l'Agence : changePack la rattache au pack programme.
    const ext = pushItem('EXT_LOTS_10', { parentItemId: integre.id });
    await changePack(T, { fromCodes: ['INTEGRE'], toCode: 'AGENCE' }, 'admin-1');
    const agence = itemByCode('AGENCE');
    expect(ext.parentItemId).toBe(agence.id);
    fake.subscriptionItem.update.mockClear();

    const result = await removeSubscriptionItem(T, agence.id, {}, 'admin-1');

    expect(result.restoredItemIds).toEqual([integre.id]);
    expect(ext.parentItemId).toBe(integre.id);
    expect(ext.status).toBe('ACTIVE');
    expect(ext.endsAt).toBeNull();
    expect(fake.subscriptionItem.update).toHaveBeenCalledWith({
      where: { id: ext.id, tenantId: T },
      data: { parentItemId: integre.id }
    });
  });

  it('montée immédiate puis retrait du nouveau pack : rien n’est restauré (le pack remplacé est terminé)', async () => {
    seed('ACTIVE', ['AGENCE']);
    const agence = itemByCode('AGENCE');
    const up = await changePack(T, { fromCodes: ['AGENCE'], toCode: 'INTEGRE' }, 'admin-1');
    expect(up).toMatchObject({ upgrade: true, immediate: true });
    const integre = itemByCode('INTEGRE');
    expect(integre).toMatchObject({ status: 'ACTIVE', replacesItemId: agence.id });
    expect(agence).toMatchObject({ status: 'ENDED', endReason: 'UPGRADE' });

    const result = await removeSubscriptionItem(T, integre.id, {}, 'admin-1');

    expect(result.restoredItemIds).toEqual([]);
    expect(integre).toMatchObject({ status: 'ACTIVE', endsAt: PERIOD_END, endReason: 'END_OF_PERIOD' });
    expect(agence).toMatchObject({ status: 'ENDED', endReason: 'UPGRADE' });
  });

  it('multi-packs : Agence + Syndic -> Patrimoine Essentiel, l’annulation rend les deux packs', async () => {
    seed('ACTIVE', ['AGENCE', 'SYNDIC']);
    const agence = itemByCode('AGENCE');
    const syndic = itemByCode('SYNDIC');
    const change = await changePack(T, { fromCodes: ['AGENCE', 'SYNDIC'], toCode: 'PATRIMOINE_ESSENTIEL' }, 'admin-1');
    expect(change).toMatchObject({ upgrade: false, immediate: false });
    const scheduled = itemByCode('PATRIMOINE_ESSENTIEL');
    // changePack ne garde le lien que vers le premier pack remplace.
    expect(scheduled.replacesItemId).toBe(agence.id);

    const result = await removeSubscriptionItem(T, scheduled.id, {}, 'admin-1');

    expect(result.restoredItemIds.sort()).toEqual([agence.id, syndic.id].sort());
    for (const p of [agence, syndic]) {
      expect(p).toMatchObject({ status: 'ACTIVE', endsAt: null, endReason: null, endedByUserId: null });
    }
    expect(scheduled).toMatchObject({ status: 'ENDED', endReason: 'CHANGE_CANCELED' });
  });

  it('un pack retiré à la même échéance (END_OF_PERIOD) n’est pas restauré avec le changement', async () => {
    seed('ACTIVE', ['AGENCE', 'SYNDIC']);
    const agence = itemByCode('AGENCE');
    const syndic = itemByCode('SYNDIC');
    await removeSubscriptionItem(T, syndic.id, {}, 'admin-1');
    expect(syndic).toMatchObject({ endsAt: PERIOD_END, endReason: 'END_OF_PERIOD' });
    await changePack(T, { fromCodes: ['AGENCE'], toCode: 'PATRIMOINE_ESSENTIEL' }, 'admin-1');
    const scheduled = itemByCode('PATRIMOINE_ESSENTIEL');

    const result = await removeSubscriptionItem(T, scheduled.id, {}, 'admin-1');

    expect(result.restoredItemIds).toEqual([agence.id]);
    expect(agence.endsAt).toBeNull();
    expect(syndic).toMatchObject({ status: 'ACTIVE', endsAt: PERIOD_END, endReason: 'END_OF_PERIOD' });
  });

  it('SCHEDULED sans remplacé (posé à la main, garde défensive) : comportement historique', async () => {
    seed('ACTIVE', ['AGENCE']);
    const agence = itemByCode('AGENCE');
    const scheduled = pushItem('SYNDIC', { status: 'SCHEDULED', startsAt: PERIOD_END, replacesItemId: null });
    const agenceBefore = structuredClone(agence);

    await primeEntitlementsCache();
    const result = await removeSubscriptionItem(T, scheduled.id, {}, 'admin-1');

    expect(result.restoredItemIds).toEqual([]);
    expect(scheduled).toMatchObject({ status: 'ENDED', endReason: 'IMMEDIATE' });
    expect(agence).toEqual(agenceBefore);
    expect(removedAudit()[0].payload.restoredItemIds).toEqual([]);
    expect(await entitlementsWereRecomputed()).toBe(true);
  });

  it('remplacé retiré immédiatement entre-temps (ENDED) : pas d’erreur, rien n’est restauré', async () => {
    seed('ACTIVE', ['INTEGRE']);
    await changePack(T, { fromCodes: ['INTEGRE'], toCode: 'AGENCE' }, 'admin-1');
    const integre = itemByCode('INTEGRE');
    const agence = itemByCode('AGENCE');
    await removeSubscriptionItem(T, integre.id, { immediate: true, reason: 'Résiliation' }, 'admin-1');
    expect(integre.status).toBe('ENDED');
    const integreBefore = structuredClone(integre);

    const result = await removeSubscriptionItem(T, agence.id, {}, 'admin-1');

    expect(result.restoredItemIds).toEqual([]);
    expect(agence).toMatchObject({ status: 'ENDED', endReason: 'IMMEDIATE' });
    expect(integre).toEqual(integreBefore);
  });

  it('reste d’un retrait partiel d’extension (élément SCHEDULED non pack) : son retrait n’annule rien', async () => {
    seed('ACTIVE', ['AGENCE']);
    const ext = pushItem('EXT_LOTS_10', { quantity: 3, parentItemId: itemByCode('AGENCE').id });
    const partial = await removeSubscriptionItem(T, ext.id, { quantity: 1 }, 'admin-1');
    const rest = db.items.find(i => i.id === partial.remainder!.id)!;
    expect(rest).toMatchObject({ status: 'SCHEDULED', replacesItemId: ext.id, quantity: 2 });
    expect(ext).toMatchObject({ endsAt: PERIOD_END, endReason: 'END_OF_PERIOD' });

    const result = await removeSubscriptionItem(T, rest.id, {}, 'admin-1');

    expect(result.restoredItemIds).toEqual([]);
    expect(rest.status).toBe('ENDED');
    expect(ext).toMatchObject({ status: 'ACTIVE', endsAt: PERIOD_END, endReason: 'END_OF_PERIOD' });
  });

  // Garde defensive : seul le motif differe entre les deux cas, ce qui prouve
  // que c'est lui (et non le type d'element) qui decide de la restauration.
  it.each([
    ['END_OF_PERIOD', false],
    ['DOWNGRADE', true]
  ])('pack remplacé terminé pour %s (état posé à la main) : restauré = %s', async (endReason, restored) => {
    seed('ACTIVE', ['PROMOTEUR']);
    const promoteur = itemByCode('PROMOTEUR');
    Object.assign(promoteur, { endsAt: PERIOD_END, endReason, endedByUserId: 'admin-1' });
    const scheduled = pushItem('SYNDIC', { status: 'SCHEDULED', startsAt: PERIOD_END, replacesItemId: promoteur.id });

    const result = await removeSubscriptionItem(T, scheduled.id, {}, 'admin-1');

    expect(result.restoredItemIds).toEqual(restored ? [promoteur.id] : []);
    expect(promoteur.endsAt).toEqual(restored ? null : PERIOD_END);
    expect(promoteur.endReason).toBe(restored ? null : endReason);
    expect(scheduled.status).toBe('ENDED');
  });

  it('atomicité : si l’écriture finale échoue, la restauration est annulée et rien n’est publié', async () => {
    seed('ACTIVE', ['INTEGRE']);
    await changePack(T, { fromCodes: ['INTEGRE'], toCode: 'AGENCE' }, 'admin-1');
    const integre = itemByCode('INTEGRE');
    const agence = itemByCode('AGENCE');
    await primeEntitlementsCache();
    auditEvents.length = 0;

    // Le premier `update` du retrait est celui du pack programme : il survient apres la restauration (updateMany).
    fake.subscriptionItem.update.mockImplementationOnce(async () => {
      throw new Error('panne base');
    });
    await expect(removeSubscriptionItem(T, agence.id, {}, 'admin-1')).rejects.toThrow('panne base');

    expect(fake.subscriptionItem.updateMany).toHaveBeenCalled();
    expect(integre).toMatchObject({
      status: 'ACTIVE',
      endsAt: PERIOD_END,
      endReason: 'DOWNGRADE',
      endedByUserId: 'admin-1'
    });
    expect(agence).toMatchObject({ status: 'SCHEDULED', endsAt: null });
    expect(auditEvents).toHaveLength(0);
    // Cache de droits intact : aucune invalidation.
    expect(await entitlementsWereRecomputed()).toBe(false);
  });

  it('écriture concurrente sur le pack remplacé : 409, la transaction annule tout', async () => {
    seed('ACTIVE', ['INTEGRE']);
    await changePack(T, { fromCodes: ['INTEGRE'], toCode: 'AGENCE' }, 'admin-1');
    const integre = itemByCode('INTEGRE');
    const agence = itemByCode('AGENCE');
    auditEvents.length = 0;

    // Une autre transaction termine l'Integre juste avant la restauration.
    fake.subscriptionItem.updateMany.mockImplementationOnce(async (args: Row) => {
      integre.status = 'ENDED';
      return updateManyItems(args);
    });

    await expect(removeSubscriptionItem(T, agence.id, {}, 'admin-1')).rejects.toMatchObject({
      statusCode: 409,
      message: 'L’abonnement a changé pendant l’annulation du changement de pack : réessayez.'
    });
    expect(agence).toMatchObject({ status: 'SCHEDULED', endsAt: null });
    expect(removedAudit()).toHaveLength(0);
  });

  it('isolation agence : un autre tenant reçoit 404 et rien n’est restauré', async () => {
    seed('ACTIVE', ['INTEGRE']);
    await changePack(T, { fromCodes: ['INTEGRE'], toCode: 'AGENCE' }, 'admin-1');
    const integre = itemByCode('INTEGRE');
    const agence = itemByCode('AGENCE');
    db.subscriptions.push({ ...db.subscriptions[0], id: 'sub-2', tenantId: 'tenant-2' });

    await expect(removeSubscriptionItem('tenant-2', agence.id, {}, 'admin-2')).rejects.toMatchObject({
      statusCode: 404
    });

    expect(integre).toMatchObject({ endsAt: PERIOD_END, endReason: 'DOWNGRADE' });
    expect(agence.status).toBe('SCHEDULED');
    expect(removedAudit()).toHaveLength(0);
  });
});

describe('changePack : un seul changement de pack en attente', () => {
  it('second changement programmé refusé (409) ; accepté de nouveau après annulation du premier', async () => {
    seed('ACTIVE', ['PROMOTEUR', 'PATRIMOINE_PRO']);
    const promoteur = itemByCode('PROMOTEUR');
    const pro = itemByCode('PATRIMOINE_PRO');
    await changePack(T, { fromCodes: ['PATRIMOINE_PRO'], toCode: 'PATRIMOINE_ESSENTIEL' }, 'admin-1');
    const essentiel = itemByCode('PATRIMOINE_ESSENTIEL');
    const itemsBefore = structuredClone(db.items);

    await expect(changePack(T, { fromCodes: ['PROMOTEUR'], toCode: 'SYNDIC' }, 'admin-1')).rejects.toMatchObject({
      statusCode: 409,
      message:
        'Un changement de pack est déjà programmé (Patrimoine Essentiel) : annulez-le avant d’en demander un autre.'
    });
    expect(db.items).toEqual(itemsBefore);
    expect(promoteur.endsAt).toBeNull();

    // Annuler le changement programme rend PATRIMOINE_PRO, et lui seul.
    const cancel = await removeSubscriptionItem(T, essentiel.id, {}, 'admin-1');
    expect(cancel.restoredItemIds).toEqual([pro.id]);
    expect(livePackCodes()).toEqual(['PATRIMOINE_PRO', 'PROMOTEUR']);

    // Plus rien en attente : le changement Promoteur -> Syndic passe.
    const second = await changePack(T, { fromCodes: ['PROMOTEUR'], toCode: 'SYNDIC' }, 'admin-1');
    expect(second).toMatchObject({ upgrade: false, immediate: false });
    expect(itemByCode('SYNDIC')).toMatchObject({ status: 'SCHEDULED', replacesItemId: promoteur.id });
  });

  it('ne bloque pas les changements immédiats : deux montées de suite, ou deux changements pendant l’essai', async () => {
    seed('ACTIVE', ['AGENCE']);
    await changePack(T, { fromCodes: ['AGENCE'], toCode: 'SYNDIC' }, 'admin-1');
    const second = await changePack(T, { fromCodes: ['SYNDIC'], toCode: 'PROMOTEUR' }, 'admin-1');
    expect(second).toMatchObject({ upgrade: true, immediate: true });
    expect(livePackCodes()).toEqual(['PROMOTEUR']);

    seed('TRIALING', ['INTEGRE']);
    await changePack(T, { fromCodes: ['INTEGRE'], toCode: 'AGENCE' }, 'admin-1');
    const trial = await changePack(T, { fromCodes: ['AGENCE'], toCode: 'SYNDIC' }, 'admin-1');
    expect(trial).toMatchObject({ immediate: true });
    expect(livePackCodes()).toEqual(['SYNDIC']);
  });

  it('extension dont la fin est déjà programmée : changePack garde son motif, l’annulation ne la ressuscite pas', async () => {
    seed('ACTIVE', ['INTEGRE']);
    const integre = itemByCode('INTEGRE');
    // EXT_COPRO : non autorisee par l'Agence. EXT_LOTS_10 : autorisee (serait rattachee au pack programme).
    const copro = pushItem('EXT_COPRO', { parentItemId: integre.id });
    const lots = pushItem('EXT_LOTS_10', { parentItemId: integre.id });
    await removeSubscriptionItem(T, copro.id, {}, 'admin-1');
    await removeSubscriptionItem(T, lots.id, {}, 'admin-1');
    for (const ext of [copro, lots]) {
      expect(ext).toMatchObject({ endsAt: PERIOD_END, endReason: 'END_OF_PERIOD' });
    }

    await changePack(T, { fromCodes: ['INTEGRE'], toCode: 'AGENCE' }, 'admin-1');
    for (const ext of [copro, lots]) {
      expect(ext).toMatchObject({ endsAt: PERIOD_END, endReason: 'END_OF_PERIOD', parentItemId: integre.id });
    }

    const result = await removeSubscriptionItem(T, itemByCode('AGENCE').id, {}, 'admin-1');

    expect(result.restoredItemIds).toEqual([integre.id]);
    for (const ext of [copro, lots]) {
      expect(ext).toMatchObject({ status: 'ACTIVE', endsAt: PERIOD_END, endReason: 'END_OF_PERIOD' });
    }
    await applyDueItemTransitionsTx(fake as never, T, AFTER_PERIOD_END);
    expect(copro.status).toBe('ENDED');
    expect(lots.status).toBe('ENDED');
    expect(integre.status).toBe('ACTIVE');
  });
});

describe('annulation refusée (409) : rien n’est écrit', () => {
  it('deux changements hérités à la même échéance : ni l’un ni l’autre ne s’annule', async () => {
    const { promoteur, pro, essentiel, syndic } = await seedLegacyDoubleChange();
    expect([essentiel.status, syndic.status]).toEqual(['SCHEDULED', 'SCHEDULED']);
    expect(promoteur).toMatchObject({ endsAt: PERIOD_END, endReason: 'DOWNGRADE' });
    expect(pro).toMatchObject({ endsAt: PERIOD_END, endReason: 'DOWNGRADE' });
    const itemsBefore = structuredClone(db.items);
    auditEvents.length = 0;

    for (const scheduled of [essentiel, syndic]) {
      // eslint-disable-next-line no-await-in-loop -- deux annulations, l'une apres l'autre.
      await expect(removeSubscriptionItem(T, scheduled.id, {}, 'admin-1')).rejects.toMatchObject({
        statusCode: 409,
        message:
          'Plusieurs changements de pack sont programmés à la même échéance : annulation impossible sans arbitrage du support.'
      });
    }
    expect(db.items).toEqual(itemsBefore);
    expect(removedAudit()).toHaveLength(0);
  });

  it.each([
    ['facture de la période suivante émise', false, () => pushInvoice('ISSUED', PERIOD_END, NEXT_PERIOD_END)],
    ['facture de la période suivante payée', false, () => pushInvoice('PAID', PERIOD_END, NEXT_PERIOD_END)],
    [
      'pack programmé marqué facturé (billedThrough) sans facture annulée',
      false,
      () => Object.assign(itemByCode('AGENCE'), { billedThrough: NEXT_PERIOD_END })
    ],
    [
      'facture annulée par avoir (billedThrough resté posé)',
      true,
      () => {
        pushInvoice('CANCELED', PERIOD_END, NEXT_PERIOD_END);
        Object.assign(itemByCode('AGENCE'), { billedThrough: NEXT_PERIOD_END });
      }
    ],
    ['seule la période en cours est facturée', true, () => pushInvoice('PAID', PERIOD_START, PERIOD_END)]
  ])('%s : annulation acceptée = %s', async (_label, accepted, arrange) => {
    seed('ACTIVE', ['INTEGRE']);
    await changePack(T, { fromCodes: ['INTEGRE'], toCode: 'AGENCE' }, 'admin-1');
    const integre = itemByCode('INTEGRE');
    const agence = itemByCode('AGENCE');
    arrange();

    if (accepted) {
      const result = await removeSubscriptionItem(T, agence.id, {}, 'admin-1');
      expect(result.restoredItemIds).toEqual([integre.id]);
      expect(integre.endsAt).toBeNull();
      return;
    }
    const itemsBefore = structuredClone(db.items);
    await expect(removeSubscriptionItem(T, agence.id, {}, 'admin-1')).rejects.toMatchObject({
      statusCode: 409,
      message: 'Période suivante déjà facturée : émettre un avoir d’abord, puis annuler le changement de pack.'
    });
    expect(db.items).toEqual(itemsBefore);
    expect(integre).toMatchObject({ endsAt: PERIOD_END, endReason: 'DOWNGRADE' });
    expect(agence.status).toBe('SCHEDULED');
  });

  it('pack ajouté pendant le changement, incompatible avec le pack rétabli : 409', async () => {
    seed('ACTIVE', ['INTEGRE']);
    await changePack(T, { fromCodes: ['INTEGRE'], toCode: 'AGENCE' }, 'admin-1');
    const integre = itemByCode('INTEGRE');
    const agence = itemByCode('AGENCE');
    // L'Integre a une fin et l'Agence n'a pas demarre : l'ajout du Syndic est accepte aujourd'hui.
    await addSubscriptionItem(T, { code: 'SYNDIC' }, 'admin-1');
    expect(itemByCode('SYNDIC').status).toBe('ACTIVE');
    const itemsBefore = structuredClone(db.items);

    await expect(removeSubscriptionItem(T, agence.id, {}, 'admin-1')).rejects.toMatchObject({
      statusCode: 409,
      message:
        'Annulation impossible : le pack rétabli serait incompatible avec l’abonnement actuel (INTEGRE / SYNDIC). Retirez d’abord le pack en conflit.'
    });
    expect(db.items).toEqual(itemsBefore);
    expect(integre).toMatchObject({ endsAt: PERIOD_END, endReason: 'DOWNGRADE' });
  });
});
