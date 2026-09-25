/**
 * Service d'abonnement par packs (services/subscription-v2-service.ts) :
 * ajout / retrait / changement de pack (D6, D7), prorata, avoirs, modules
 * synchronises. Faux client Prisma en memoire (modele :
 * tenant-provisioning-service.test.ts), aucune base.
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
  if (filter && typeof filter === 'object' && Array.isArray((filter as Row).in)) return (filter as Row).in.includes(value);
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

function matchStatus(row: Row, where: Row) {
  if (where.status === undefined) return true;
  if (typeof where.status === 'string') return row.status === where.status;
  if (where.status.not) return row.status !== where.status.not;
  return true;
}

const fake: Row = {
  subscription: {
    findUnique: jest.fn(async ({ where }: Row) => db.subscriptions.find(s => s.tenantId === where.tenantId) ?? null)
  },
  catalogItem: {
    findMany: jest.fn(async ({ where }: Row) => CATALOG.filter(c => where.code.in.includes(c.code)))
  },
  subscriptionItem: {
    findMany: jest.fn(async ({ where }: Row) => db.items.filter(i => matchItem(i, where)).map(withCatalog)),
    findFirst: jest.fn(async ({ where }: Row) => {
      const row = db.items.find(i => i.id === where.id && i.tenantId === where.tenantId);
      return row ? withCatalog(row) : null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      const row = { id: id('item'), createdAt: new Date(), discountPercent: 0, unitSetupPrice: 0, endsAt: null, billedThrough: null, replacesItemId: null, parentItemId: null, endReason: null, ...data };
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
    findMany: jest.fn(async ({ where }: Row) => db.lines.filter(l => l.tenantId === where.tenantId && l.invoiceId === null))
  },
  usageSnapshot: {
    groupBy: jest.fn(async () => db.peaks ?? [])
  },
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
  return { ...actual, logAuditEvent: (entry: Row) => auditEvents.push(entry) };
});

import {
  addSubscriptionItem,
  applyDueItemTransitionsTx,
  changePack,
  monthlyOverageWindow,
  previewNextInvoice,
  registerUsageProvider,
  removeSubscriptionItem,
  syncTenantModulesTx
} from '../../src/services/subscription-v2-service';
import { unitKeyFor } from '../../src/services/lot-registry-service';

const T = 'tenant-1';
const PERIOD_START = new Date('2026-09-01T00:00:00Z');
const PERIOD_END = new Date('2026-10-01T00:00:00Z');
const ON_16TH = new Date('2026-09-16T10:00:00Z');

function seed(status: 'ACTIVE' | 'TRIALING', packs: string[]) {
  db = { subscriptions: [], items: [], modules: [], lines: [], overrides: [] };
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
      createdAt: new Date('2026-08-01T00:00:00Z')
    });
    for (const m of c.modules) {
      if (!db.modules.some(r => r.moduleKey === m)) {
        db.modules.push({ id: id('tm'), tenantId: T, moduleKey: m, enabled: true, source: 'PACK', expiresAt: null, disabledAt: null });
      }
    }
  }
}

beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout'] });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  jest.setSystemTime(ON_16TH);
  auditEvents.length = 0;
});

describe('addSubscriptionItem (D7 : ajout immediat, prorata)', () => {
  it('+3 blocs de lots le 16 d’un mois de 30 jours -> ligne PRORATA de 2 250 en attente', async () => {
    seed('ACTIVE', ['AGENCE']);
    const result = await addSubscriptionItem(T, { code: 'EXT_LOTS_10', quantity: 3 }, 'admin-1');
    expect(result.items).toEqual([expect.objectContaining({ code: 'EXT_LOTS_10', quantity: 3, unitMonthlyPrice: 1_500 })]);
    expect(result.pendingLines).toEqual([expect.objectContaining({ kind: 'PRORATA', amount: 2_250 })]);
    expect(db.lines[0]).toMatchObject({ invoiceId: null, tenantId: T });
    expect(auditEvents.map(e => e.actionKey)).toEqual(['SUBSCRIPTION_ITEM_ADDED']);
  });

  it('deuxieme pack : prorata du pack + prorata de la remise de combinaison, module ouvert', async () => {
    seed('ACTIVE', ['AGENCE']);
    const result = await addSubscriptionItem(T, { code: 'SYNDIC' }, 'admin-1');
    expect(result.pendingLines.map(l => [l.kind, l.amount])).toEqual([
      ['PRORATA', 24_950], // 49 900 x 15/30
      ['DISCOUNT', -1_495] // 10 % x 29 900 x 15/30
    ]);
    expect(result.modules).toEqual({ enabled: ['MODULE_SYNDIC'], disabled: [] });
    expect(db.modules.find(m => m.moduleKey === 'MODULE_SYNDIC')).toMatchObject({ enabled: true, source: 'PACK' });
  });

  it('pendant l’essai : aucun prorata', async () => {
    seed('TRIALING', ['AGENCE']);
    const result = await addSubscriptionItem(T, { code: 'EXT_LOTS_10', quantity: 2 }, 'admin-1');
    expect(result.pendingLines).toEqual([]);
  });

  it("Integre + Agence refuse (400) ; pack deja souscrit (409) ; extension sans son pack (400)", async () => {
    seed('ACTIVE', ['INTEGRE']);
    await expect(addSubscriptionItem(T, { code: 'AGENCE' }, 'admin-1')).rejects.toMatchObject({ statusCode: 400 });
    await expect(addSubscriptionItem(T, { code: 'INTEGRE' }, 'admin-1')).rejects.toMatchObject({ statusCode: 409 });
    seed('ACTIVE', ['AGENCE']);
    await expect(addSubscriptionItem(T, { code: 'EXT_COPRO' }, 'admin-1')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('chantier supplementaire avec l’Integre : prix fige a 35 000', async () => {
    seed('ACTIVE', ['INTEGRE']);
    const result = await addSubscriptionItem(T, { code: 'EXT_CHANTIER' }, 'admin-1');
    expect(result.items[0].unitMonthlyPrice).toBe(35_000);
  });
});

describe('removeSubscriptionItem (D7 : a l’echeance, sans remboursement)', () => {
  it('par defaut : reste actif jusqu’a la fin de periode', async () => {
    seed('ACTIVE', ['AGENCE', 'SYNDIC']);
    const syndic = db.items[1];
    const result = await removeSubscriptionItem(T, syndic.id, {}, 'admin-1');
    expect(result.immediate).toBe(false);
    expect(syndic).toMatchObject({ status: 'ACTIVE', endsAt: PERIOD_END, endReason: 'END_OF_PERIOD' });
    expect(db.lines).toEqual([]); // aucun remboursement
    expect(db.modules.find(m => m.moduleKey === 'MODULE_SYNDIC')!.enabled).toBe(true);
  });

  it('immediat : exige une raison, puis termine l’element et retire le module (lecture seule)', async () => {
    seed('ACTIVE', ['AGENCE', 'SYNDIC']);
    const syndic = db.items[1];
    await expect(removeSubscriptionItem(T, syndic.id, { immediate: true }, 'admin-1')).rejects.toMatchObject({ statusCode: 400 });
    const result = await removeSubscriptionItem(T, syndic.id, { immediate: true, reason: 'Résiliation amiable' }, 'admin-1');
    expect(result.immediate).toBe(true);
    expect(syndic.status).toBe('ENDED');
    expect(db.modules.find(m => m.moduleKey === 'MODULE_SYNDIC')).toMatchObject({ enabled: false, disabledAt: ON_16TH });
  });

  it('retrait partiel d’extension : le reste repart au meme prix a l’echeance', async () => {
    seed('ACTIVE', ['AGENCE']);
    await addSubscriptionItem(T, { code: 'EXT_LOTS_10', quantity: 5 }, 'admin-1');
    const ext = db.items.find(i => catalogById(i.catalogItemId).code === 'EXT_LOTS_10')!;
    const result = await removeSubscriptionItem(T, ext.id, { quantity: 2 }, 'admin-1');
    expect(result.remainder).toMatchObject({ quantity: 3, unitMonthlyPrice: 1_500, status: 'SCHEDULED', startsAt: PERIOD_END });
    expect(ext.endsAt).toEqual(PERIOD_END);
  });

  it('element d’une autre agence : 404', async () => {
    seed('ACTIVE', ['AGENCE']);
    await expect(removeSubscriptionItem('autre-agence', db.items[0].id, {}, 'admin-1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('changePack (D7 : montee immediate avec avoir, descente a l’echeance)', () => {
  it('Agence + Syndic -> Integre le 16 : avoirs, prorata, remise perdue, trois modules', async () => {
    seed('ACTIVE', ['AGENCE', 'SYNDIC']);
    const result = await changePack(T, { fromCodes: ['AGENCE', 'SYNDIC'], toCode: 'INTEGRE' }, 'admin-1');
    expect(result).toMatchObject({ upgrade: true, immediate: true });
    expect(result.pendingLines.map(l => [l.kind, l.amount])).toEqual([
      ['CREDIT', -14_950],
      ['CREDIT', -24_950],
      ['PRORATA', 124_950],
      ['DISCOUNT', 1_495] // la remise de combinaison disparait pour la fin de periode
    ]);
    expect(db.items.filter(i => i.status === 'ENDED').length).toBe(2);
    expect(db.modules.filter(m => m.enabled).map(m => m.moduleKey).sort()).toEqual([
      'MODULE_AGENCY',
      'MODULE_PROMOTER',
      'MODULE_SYNDIC'
    ]);
  });

  it('Integre -> Agence : programme a l’echeance, rien a facturer maintenant', async () => {
    seed('ACTIVE', ['INTEGRE']);
    const result = await changePack(T, { fromCodes: ['INTEGRE'], toCode: 'AGENCE' }, 'admin-1');
    expect(result).toMatchObject({ upgrade: false, immediate: false });
    expect(result.item).toMatchObject({ code: 'AGENCE', status: 'SCHEDULED', startsAt: PERIOD_END });
    expect(result.pendingLines).toEqual([]);
    expect(db.items[0]).toMatchObject({ status: 'ACTIVE', endsAt: PERIOD_END, endReason: 'DOWNGRADE' });
  });
});

describe('syncTenantModulesTx', () => {
  it('ne touche pas une derogation OVERRIDE en vigueur ; en reprend une expiree', async () => {
    seed('ACTIVE', ['AGENCE']);
    db.modules.push(
      { id: 'o1', tenantId: T, moduleKey: 'MODULE_PROMOTER', enabled: true, source: 'OVERRIDE', expiresAt: new Date('2026-12-01'), disabledAt: null },
      { id: 'o2', tenantId: T, moduleKey: 'MODULE_SYNDIC', enabled: true, source: 'OVERRIDE', expiresAt: new Date('2026-09-01'), disabledAt: null }
    );
    const result = await syncTenantModulesTx(fake as any, T);
    expect(result).toEqual({ enabled: [], disabled: ['MODULE_SYNDIC'] });
    expect(db.modules.find(m => m.id === 'o1')).toMatchObject({ enabled: true, source: 'OVERRIDE' });
    expect(db.modules.find(m => m.id === 'o2')).toMatchObject({ enabled: false, source: 'PACK', disabledAt: ON_16TH });
  });
});

describe('Registre des lots : cle d’unite', () => {
  it('P: des qu’un bien existe, sinon SL: / PL:', () => {
    expect(unitKeyFor({ propertyId: 'p1', syndicateLotId: 's1' })).toBe('P:p1');
    expect(unitKeyFor({ syndicateLotId: 's1' })).toBe('SL:s1');
    expect(unitKeyFor({ siteLotId: 'l1' })).toBe('PL:l1');
    expect(() => unitKeyFor({})).toThrow();
  });
});

// ------------------------------------------------------------------ vague 2, lot B

describe('extensions liees a leur pack (decision de Baba du 25/09)', () => {
  it('une extension achetee est liee au pack qui l’autorise', async () => {
    seed('ACTIVE', ['AGENCE', 'SYNDIC']);
    const syndic = db.items.find(i => catalogById(i.catalogItemId).code === 'SYNDIC')!;
    const agence = db.items.find(i => catalogById(i.catalogItemId).code === 'AGENCE')!;
    await addSubscriptionItem(T, { code: 'EXT_COPRO' }, 'admin-1');
    await addSubscriptionItem(T, { code: 'EXT_LOTS_10', quantity: 2 }, 'admin-1');
    const copro = db.items.find(i => catalogById(i.catalogItemId).code === 'EXT_COPRO')!;
    const lots = db.items.find(i => catalogById(i.catalogItemId).code === 'EXT_LOTS_10')!;
    expect(copro.parentItemId).toBe(syndic.id); // seul le Syndic autorise une copropriete
    expect(lots.parentItemId).toBe(agence.id); // le plus ancien pack pour des lots
  });

  it('retrait d’un pack a l’echeance : ses extensions partent a la MEME echeance, les autres restent', async () => {
    seed('ACTIVE', ['AGENCE', 'SYNDIC']);
    const syndic = db.items.find(i => catalogById(i.catalogItemId).code === 'SYNDIC')!;
    await addSubscriptionItem(T, { code: 'EXT_COPRO' }, 'admin-1');
    await addSubscriptionItem(T, { code: 'EXT_LOTS_10' }, 'admin-1');
    const copro = db.items.find(i => catalogById(i.catalogItemId).code === 'EXT_COPRO')!;
    const lots = db.items.find(i => catalogById(i.catalogItemId).code === 'EXT_LOTS_10')!;

    const result = await removeSubscriptionItem(T, syndic.id, {}, 'admin-1');

    expect(result.extensionsEnded).toEqual([copro.id]);
    expect(copro).toMatchObject({ endsAt: PERIOD_END, endReason: 'PACK_REMOVED', status: 'ACTIVE' });
    expect(lots.endsAt).toBeNull();

    // A l'echeance, le pack ET son extension s'arretent ensemble.
    await applyDueItemTransitionsTx(fake as any, T, PERIOD_END);
    expect(syndic.status).toBe('ENDED');
    expect(copro.status).toBe('ENDED');
    expect(lots.status).toBe('ACTIVE');
  });

  it('retrait immediat (super-admin) : extensions liees terminees immediatement', async () => {
    seed('ACTIVE', ['AGENCE', 'SYNDIC']);
    const syndic = db.items.find(i => catalogById(i.catalogItemId).code === 'SYNDIC')!;
    await addSubscriptionItem(T, { code: 'EXT_COPRO' }, 'admin-1');
    const copro = db.items.find(i => catalogById(i.catalogItemId).code === 'EXT_COPRO')!;
    await removeSubscriptionItem(T, syndic.id, { immediate: true, reason: 'Résiliation' }, 'admin-1');
    expect(copro).toMatchObject({ status: 'ENDED', endReason: 'PACK_REMOVED', endsAt: ON_16TH });
  });

  it('montee Syndic -> Integre : l’extension copropriete suit le nouveau pack au lieu de partir', async () => {
    seed('ACTIVE', ['SYNDIC']);
    await addSubscriptionItem(T, { code: 'EXT_COPRO' }, 'admin-1');
    const copro = db.items.find(i => catalogById(i.catalogItemId).code === 'EXT_COPRO')!;
    const result = await changePack(T, { fromCodes: ['SYNDIC'], toCode: 'INTEGRE' }, 'admin-1');
    expect(copro.parentItemId).toBe(result.item.id);
    expect(copro.endsAt).toBeNull();
  });
});

describe('depassement mensuel en abonnement ANNUEL (regle de Baba du 25/09)', () => {
  const ANNUAL_START = new Date('2026-01-15T00:00:00Z');
  const ANNUAL_END = new Date('2027-01-15T00:00:00Z');

  function seedAnnual(lotsUsed: number) {
    seed('ACTIVE', ['AGENCE']);
    Object.assign(db.subscriptions[0], {
      billingCycle: 'ANNUAL',
      currentPeriodStart: ANNUAL_START,
      currentPeriodEnd: ANNUAL_END,
      quotaPolicy: 'BILL_OVERAGE'
    });
    registerUsageProvider('LOTS', async () => lotsUsed);
    registerUsageProvider('COPROPRIETES', async () => 0);
    registerUsageProvider('CHANTIERS', async () => 0);
  }

  it('fenetre mensuelle ancree sur le debut de la periode annuelle', () => {
    expect(monthlyOverageWindow(ANNUAL_START, ON_16TH)).toEqual({
      start: new Date('2026-09-15T00:00:00Z'),
      end: new Date('2026-10-15T00:00:00Z')
    });
  });

  it('le pack est facture a l’annee (x11) SANS depassement ; le depassement part dans une facture mensuelle a part', async () => {
    seedAnnual(112); // Agence : 100 lots inclus, 12 de trop
    const preview = await previewNextInvoice(T, { now: ON_16TH });

    expect(preview.billingCycle).toBe('ANNUAL');
    expect(preview.overageBilling).toBe('MONTHLY_SEPARATE');
    expect(preview.lines.filter(l => l.kind === 'OVERAGE')).toHaveLength(0);
    expect(preview.amountExclTax).toBe(29_900 * 11);

    const overage = preview.overageInvoice!;
    expect(overage.periodStart).toEqual(new Date('2026-09-15T00:00:00Z'));
    expect(overage.periodEnd).toEqual(new Date('2026-10-15T00:00:00Z'));
    // 12 lots au prix du lot (bloc de 1 500 / 10 = 150), une seule fois : jamais x11.
    expect(overage.amountExclTax).toBe(12 * 150);
    expect(overage.taxAmount).toBe(Math.round((12 * 150 * 18) / 100));
  });

  it('retient le PIC du mois (releves quotidiens) quand il depasse la consommation du jour', async () => {
    seedAnnual(105);
    db.peaks = [{ capacityKey: 'LOTS', _max: { used: 120 } }];
    const preview = await previewNextInvoice(T, { now: ON_16TH });
    expect(preview.overageInvoice!.usage.LOTS.used).toBe(120);
    expect(preview.overageInvoice!.amountExclTax).toBe(20 * 150);
  });

  it('en MENSUEL, le depassement reste dans la facture de la periode', async () => {
    seedAnnual(112);
    Object.assign(db.subscriptions[0], { billingCycle: 'MONTHLY', currentPeriodStart: PERIOD_START, currentPeriodEnd: PERIOD_END });
    const preview = await previewNextInvoice(T, { now: ON_16TH });
    expect(preview.overageBilling).toBe('IN_PERIOD_INVOICE');
    expect(preview.overageInvoice).toBeNull();
    expect(preview.lines.filter(l => l.kind === 'OVERAGE').reduce((sum, l) => sum + l.amount, 0)).toBe(12 * 150);
  });
});
