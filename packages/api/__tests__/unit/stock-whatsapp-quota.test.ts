/**
 * Option payante et quota mensuel de photos analysées (lot 041, spec W11) :
 * modes `enforce` / `warn` / `off`, réservation atomique et restitution, mois
 * civil UTC, audit une fois par mois, vue du quota (blocs souscrits).
 * Le test de concurrence sur base réelle est
 * `__tests__/integration/stock-whatsapp-quota-concurrence.test.ts`.
 */
import { env } from '../../src/config/env';
import { DEFAULT_CATALOG, PACK } from '../../src/lib/subscription/catalog';
import {
  countWhatsappPhotosThisMonth,
  getWhatsappQuotaState,
  isWhatsappQuotaExhausted,
  noteWhatsappQuotaReached,
  releaseWhatsappPhoto,
  reserveWhatsappPhoto,
  resetQuotaWarningsForTests,
  resolveWhatsappQuotaPolicy
} from '../../src/lib/stock-whatsapp/quota';

// ---------------------------------------------------------------------------
// Base Prisma en mémoire (recopiée dans chaque suite du lot 041 : un fichier
// d'aide partagé sortirait du territoire W3 ; à factoriser à l'intégration).
// Couvre ce que le moteur utilise : filtres simples et de relation, `select`
// imbriqués, incréments, `createMany({ skipDuplicates })`, transactions avec
// retour arrière sur exception.
// ---------------------------------------------------------------------------

type MockRow = Record<string, any>;
type MockStore = Record<string, MockRow[]>;

const MOCK_UNIQUES: Record<string, string[][]> = {
  stockWhatsappUsage: [['tenantId', 'month']],
  stockAlert: [['tenantId', 'dedupeKey']],
  stockCountLine: [['countId', 'itemId']],
  stockWhatsappRegistrationSite: [['registrationId', 'siteId']]
};

type MockRelation = { model: string; many: boolean; match: (row: MockRow, other: MockRow) => boolean };

const MOCK_RELATIONS: Record<string, Record<string, MockRelation>> = {
  stockFieldCapture: { item: { model: 'stockItem', many: false, match: (r, o) => o.id === r.itemId } },
  stockWhatsappRegistrationSite: {
    site: { model: 'constructionSite', many: false, match: (r, o) => o.id === r.siteId }
  },
  constructionSite: { stockLocation: { model: 'stockLocation', many: false, match: (r, o) => o.siteId === r.id } },
  stockCountLine: { count: { model: 'stockCount', many: false, match: (r, o) => o.id === r.countId } },
  stockWhatsappRegistration: {
    user: { model: 'user', many: false, match: (r, o) => o.id === r.userId },
    sites: { model: 'stockWhatsappRegistrationSite', many: true, match: (r, o) => o.registrationId === r.id },
    sessions: { model: 'stockWhatsappSession', many: true, match: (r, o) => o.registrationId === r.id }
  },
  stockWhatsappSession: {
    registration: { model: 'stockWhatsappRegistration', many: false, match: (r, o) => o.id === r.registrationId }
  },
  userRole: {
    role: { model: 'role', many: false, match: (r, o) => o.id === r.roleId },
    user: { model: 'user', many: false, match: (r, o) => o.id === r.userId }
  },
  role: { permissions: { model: 'rolePermission', many: true, match: (r, o) => o.roleId === r.id } },
  rolePermission: { permission: { model: 'permission', many: false, match: (r, o) => o.id === r.permissionId } },
  user: { memberships: { model: 'membership', many: true, match: (r, o) => o.userId === r.id } },
  subscriptionItem: { catalogItem: { model: 'catalogItem', many: false, match: (r, o) => o.id === r.catalogItemId } }
};

function mockCompare(value: any): any {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && typeof value.toNumber === 'function') return value.toNumber();
  return value;
}

function mockIsDbNull(value: any): boolean {
  return value === null || (value && typeof value === 'object' && String(value.constructor?.name).includes('Null'));
}

function mockScalarMatches(actual: any, filter: any): boolean {
  if (filter === null) return actual === null || actual === undefined;
  if (filter instanceof Date || typeof filter !== 'object' || Array.isArray(filter)) {
    return mockCompare(actual) === mockCompare(filter);
  }
  if (mockIsDbNull(filter)) return actual === null || actual === undefined;
  for (const [op, expected] of Object.entries(filter)) {
    const a = mockCompare(actual);
    const e = mockCompare(expected);
    if (op === 'equals' && !(mockIsDbNull(expected) ? a === null || a === undefined : a === e)) return false;
    if (op === 'in' && !(expected as any[]).map(mockCompare).includes(a)) return false;
    if (op === 'notIn' && (expected as any[]).map(mockCompare).includes(a)) return false;
    if (op === 'not') {
      if (expected === null || mockIsDbNull(expected)) {
        if (a === null || a === undefined) return false;
      } else if (typeof expected === 'object' && !(expected instanceof Date)) {
        if (mockScalarMatches(actual, expected)) return false;
      } else if (a === e) return false;
    }
    if (op === 'lt' && !(a !== null && a !== undefined && a < e)) return false;
    if (op === 'lte' && !(a !== null && a !== undefined && a <= e)) return false;
    if (op === 'gt' && !(a !== null && a !== undefined && a > e)) return false;
    if (op === 'gte' && !(a !== null && a !== undefined && a >= e)) return false;
    if (op === 'has' && !(Array.isArray(actual) && actual.includes(expected))) return false;
  }
  return true;
}

function createMockDb() {
  let store: MockStore = {};
  let seq = 0;
  const table = (model: string): MockRow[] => (store[model] ??= []);

  function related(model: string, _row: MockRow, key: string): MockRelation | undefined {
    return MOCK_RELATIONS[model]?.[key];
  }

  function matches(model: string, row: MockRow, where: any): boolean {
    if (!where) return true;
    for (const [key, filter] of Object.entries(where)) {
      if (filter === undefined) continue;
      if (key === 'AND') {
        if (!(filter as any[]).every(w => matches(model, row, w))) return false;
        continue;
      }
      if (key === 'OR') {
        if (!(filter as any[]).some(w => matches(model, row, w))) return false;
        continue;
      }
      if (key === 'NOT') {
        const list = Array.isArray(filter) ? filter : [filter];
        if (list.some(w => matches(model, row, w))) return false;
        continue;
      }
      const relation = related(model, row, key);
      if (relation) {
        const others = table(relation.model).filter(o => relation.match(row, o));
        const f = filter as any;
        if (relation.many) {
          if (f.some && !others.some(o => matches(relation.model, o, f.some))) return false;
          if (f.every && !others.every(o => matches(relation.model, o, f.every))) return false;
          if (f.none && others.some(o => matches(relation.model, o, f.none))) return false;
        } else if (!others[0] || !matches(relation.model, others[0], f)) return false;
        continue;
      }
      if (filter && typeof filter === 'object' && !(filter instanceof Date) && !Array.isArray(filter)) {
        const compound = Object.keys(filter).every(
          k => !['equals', 'in', 'notIn', 'not', 'lt', 'lte', 'gt', 'gte', 'has'].includes(k)
        );
        if (compound && !mockIsDbNull(filter)) {
          if (!matches(model, row, filter)) return false;
          continue;
        }
      }
      if (!mockScalarMatches(row[key], filter)) return false;
    }
    return true;
  }

  function project(model: string, row: MockRow, select?: any, include?: any): MockRow {
    if (!select && !include) return { ...row };
    const out: MockRow = select ? {} : { ...row };
    const spec = select ?? include;
    for (const [key, value] of Object.entries(spec)) {
      if (!value) continue;
      const relation = related(model, row, key);
      if (relation) {
        const sub = value === true ? {} : (value as any);
        let others = table(relation.model).filter(o => relation.match(row, o));
        if (relation.many) {
          if (sub.where) others = others.filter(o => matches(relation.model, o, sub.where));
          if (sub.take !== undefined) others = others.slice(0, sub.take);
          out[key] = others.map(o => project(relation.model, o, sub.select, sub.include));
        } else {
          out[key] = others[0] ? project(relation.model, others[0], sub.select, sub.include) : null;
        }
      } else if (select) {
        out[key] = row[key];
      }
    }
    return out;
  }

  function sortRows(rows: MockRow[], orderBy: any): MockRow[] {
    if (!orderBy) return rows;
    const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
    return [...rows].sort((a, b) => {
      for (const order of orders) {
        const [key, direction] = Object.entries(order)[0] as [string, any];
        const dir = (typeof direction === 'string' ? direction : direction.sort) === 'desc' ? -1 : 1;
        const x = mockCompare(a[key]);
        const y = mockCompare(b[key]);
        if (x === y) continue;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return x < y ? -dir : dir;
      }
      return 0;
    });
  }

  function flattenUnique(where: any): any {
    const flat: any = {};
    for (const [key, value] of Object.entries(where ?? {})) {
      if (key.includes('_') && value && typeof value === 'object' && !(value instanceof Date))
        Object.assign(flat, value);
      else flat[key] = value;
    }
    return flat;
  }

  function applyData(row: MockRow, data: any): void {
    for (const [key, value] of Object.entries(data ?? {})) {
      if (value === undefined) continue;
      if (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
        const v = value as any;
        if ('increment' in v) {
          row[key] = (Number(row[key]) || 0) + v.increment;
          continue;
        }
        if ('decrement' in v) {
          row[key] = (Number(row[key]) || 0) - v.decrement;
          continue;
        }
        if ('set' in v) {
          row[key] = v.set;
          continue;
        }
        if (mockIsDbNull(v)) {
          row[key] = null;
          continue;
        }
      }
      row[key] = value;
    }
  }

  function violatesUnique(model: string, candidate: MockRow): boolean {
    return (MOCK_UNIQUES[model] ?? []).some(keys =>
      table(model).some(
        existing => existing !== candidate && keys.every(k => mockCompare(existing[k]) === mockCompare(candidate[k]))
      )
    );
  }

  function create(model: string, data: any): MockRow {
    const row: MockRow = { id: data.id ?? `${model}-${++seq}`, createdAt: new Date(), updatedAt: new Date() };
    applyData(row, data);
    if (violatesUnique(model, row)) {
      const error: any = new Error(`Unique constraint failed on ${model}`);
      error.code = 'P2002';
      throw error;
    }
    table(model).push(row);
    return row;
  }

  function delegate(model: string) {
    return {
      findMany: async (args: any = {}) => {
        let rows = sortRows(
          table(model).filter(r => matches(model, r, args.where)),
          args.orderBy
        );
        if (args.distinct) {
          const seen = new Set<string>();
          rows = rows.filter(r => {
            const k = args.distinct.map((d: string) => String(r[d])).join('|');
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        }
        if (args.skip) rows = rows.slice(args.skip);
        if (args.take !== undefined) rows = rows.slice(0, args.take);
        return rows.map(r => project(model, r, args.select, args.include));
      },
      findFirst: async (args: any = {}) => {
        const rows = sortRows(
          table(model).filter(r => matches(model, r, args.where)),
          args.orderBy
        );
        return rows[0] ? project(model, rows[0], args.select, args.include) : null;
      },
      findUnique: async (args: any = {}) => {
        const where = flattenUnique(args.where);
        const row = table(model).find(r => matches(model, r, where));
        return row ? project(model, row, args.select, args.include) : null;
      },
      count: async (args: any = {}) => table(model).filter(r => matches(model, r, args.where)).length,
      create: async (args: any) => project(model, create(model, args.data), args.select, args.include),
      createMany: async (args: any) => {
        let count = 0;
        for (const data of Array.isArray(args.data) ? args.data : [args.data]) {
          const probe: MockRow = { ...data };
          if (args.skipDuplicates && violatesUnique(model, probe)) continue;
          create(model, data);
          count += 1;
        }
        return { count };
      },
      update: async (args: any) => {
        const row = table(model).find(r => matches(model, r, flattenUnique(args.where)));
        if (!row) throw Object.assign(new Error(`Record not found in ${model}`), { code: 'P2025' });
        applyData(row, args.data);
        return project(model, row, args.select, args.include);
      },
      updateMany: async (args: any) => {
        const rows = table(model).filter(r => matches(model, r, args.where));
        for (const row of rows) applyData(row, args.data);
        return { count: rows.length };
      },
      deleteMany: async (args: any = {}) => {
        const before = table(model).length;
        store[model] = table(model).filter(r => !matches(model, r, args.where));
        return { count: before - store[model].length };
      },
      upsert: async (args: any) => {
        const row = table(model).find(r => matches(model, r, flattenUnique(args.where)));
        if (row) {
          applyData(row, args.update);
          return project(model, row, args.select);
        }
        return project(model, create(model, args.create), args.select);
      }
    };
  }

  const delegates = new Map<string, ReturnType<typeof delegate>>();
  const client: any = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === '$transaction') {
          return async (arg: any) => {
            if (Array.isArray(arg)) return Promise.all(arg);
            const snapshot = structuredClone(store);
            try {
              return await arg(client);
            } catch (error) {
              store = snapshot;
              throw error;
            }
          };
        }
        if (prop === '$executeRaw' || prop === '$executeRawUnsafe') return async () => 0;
        if (prop === '$queryRaw' || prop === '$queryRawUnsafe') return async () => [];
        if (prop === 'then') return undefined;
        if (!delegates.has(prop)) delegates.set(prop, delegate(prop));
        return delegates.get(prop);
      }
    }
  );

  return {
    client,
    rows: (model: string): MockRow[] => table(model),
    insert: (model: string, data: MockRow): MockRow => create(model, data),
    reset: (): void => {
      store = {};
      seq = 0;
    }
  };
}

// ---------------------------------------------------------------------------
// Doublures
// ---------------------------------------------------------------------------

const mockDb = createMockDb();
let mockEntitlements: any = null;
const mockAudit: any[] = [];

jest.mock('../../src/utils/database', () => ({
  get prisma() {
    return mockDb.client;
  }
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../src/services/audit-service', () => ({
  AuditActionKey: jest.requireActual('../../src/types/audit-types').AuditActionKey,
  logAuditEvent: (entry: any) => mockAudit.push(entry),
  recordAuditEvent: async (_tx: any, entry: any) => {
    mockAudit.push(entry);
  }
}));

jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: async () => mockEntitlements,
  countInventoryPhotosThisMonth: async (db: any, tenantId: string, now: Date = new Date()) => {
    const month = now.toISOString().slice(0, 7);
    const row = await db.stockWhatsappUsage.findUnique({ where: { tenantId_month: { tenantId, month } } });
    return row?.used ?? 0;
  }
}));

const TENANT = 'tenant-a';

function entitlements(limit: number, enforcement: 'enforce' | 'warn' | 'off', moduleAccess = 'FULL', readOnly = false) {
  return {
    enforcement,
    readOnly,
    moduleAccess: new Proxy({}, { get: () => moduleAccess }),
    capacities: { PHOTOS_INVENTAIRE: { limit, used: 0 } }
  };
}

function used(month = new Date().toISOString().slice(0, 7)): number {
  return mockDb.rows('stockWhatsappUsage').find(r => r.tenantId === TENANT && r.month === month)?.used ?? 0;
}

beforeEach(() => {
  mockDb.reset();
  mockAudit.length = 0;
  resetQuotaWarningsForTests();
  jest.requireMock('../../src/utils/logger').logger.warn.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('W11-R1 — catalogue', () => {
  it('EXT_INVENTAIRE_WHATSAPP : 500 photos par bloc, 25 000 FCFA, réservée aux packs Promoteur et Intégré', () => {
    const item = DEFAULT_CATALOG.find(entry => entry.code === 'EXT_INVENTAIRE_WHATSAPP')!;
    expect(item).toMatchObject({ kind: 'EXTENSION', monthlyPrice: 25_000, capacities: { PHOTOS_INVENTAIRE: 500 } });
    expect(item.rules).toEqual({ requiresAnyOf: [PACK.PROMOTEUR, PACK.INTEGRE] });
  });
});

describe('W11-R4 — mode d’application', () => {
  it('enforce avec option : quota = plafond (2 blocs → 1 000)', async () => {
    mockEntitlements = entitlements(1000, 'enforce');
    expect(await resolveWhatsappQuotaPolicy(TENANT)).toEqual({ ok: true, limit: 1000, source: 'OPTION' });
  });

  it('enforce sans option, ou CONSTRUCTION fermé / en lecture seule → OPTION_MISSING', async () => {
    mockEntitlements = entitlements(0, 'enforce');
    expect(await resolveWhatsappQuotaPolicy(TENANT)).toEqual({ ok: false, reason: 'OPTION_MISSING' });
    mockEntitlements = entitlements(500, 'enforce', 'NONE');
    expect(await resolveWhatsappQuotaPolicy(TENANT)).toEqual({ ok: false, reason: 'OPTION_MISSING' });
    mockEntitlements = entitlements(500, 'enforce', 'FULL', true);
    expect(await resolveWhatsappQuotaPolicy(TENANT)).toEqual({ ok: false, reason: 'OPTION_MISSING' });
  });

  it('warn sans option : quota de secours et avertissement une fois par agence et par jour', async () => {
    mockEntitlements = entitlements(0, 'warn');
    const { logger } = jest.requireMock('../../src/utils/logger');
    const first = await resolveWhatsappQuotaPolicy(TENANT, new Date('2026-10-04T08:00:00Z'));
    await resolveWhatsappQuotaPolicy(TENANT, new Date('2026-10-04T18:00:00Z'));
    expect(first).toEqual({ ok: true, limit: env.WHATSAPP_INVENTORY_WARN_QUOTA, source: 'WARN_FALLBACK' });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    await resolveWhatsappQuotaPolicy(TENANT, new Date('2026-10-05T08:00:00Z'));
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('warn avec option : quota = plafond, sans avertissement', async () => {
    mockEntitlements = entitlements(500, 'warn');
    expect(await resolveWhatsappQuotaPolicy(TENANT)).toEqual({ ok: true, limit: 500, source: 'OPTION' });
    expect(jest.requireMock('../../src/utils/logger').logger.warn).not.toHaveBeenCalled();
  });

  it('off : quota de secours, sans avertissement', async () => {
    mockEntitlements = entitlements(0, 'off');
    expect(await resolveWhatsappQuotaPolicy(TENANT)).toEqual({
      ok: true,
      limit: env.WHATSAPP_INVENTORY_WARN_QUOTA,
      source: 'OFF_FALLBACK'
    });
    expect(jest.requireMock('../../src/utils/logger').logger.warn).not.toHaveBeenCalled();
  });
});

describe('W11-R3 — réservation atomique et restitution', () => {
  it('W11-2 : 500 photos sur un bloc → la 501e est refusée, compteur à 500', async () => {
    for (let index = 0; index < 500; index += 1) {
      expect((await reserveWhatsappPhoto(TENANT, 500)).ok).toBe(true);
    }
    expect((await reserveWhatsappPhoto(TENANT, 500)).ok).toBe(false);
    expect(used()).toBe(500);
  });

  it('deux réservations simultanées à 499 : une seule passe', async () => {
    mockDb.insert('stockWhatsappUsage', { tenantId: TENANT, month: new Date().toISOString().slice(0, 7), used: 499 });
    const results = await Promise.all([reserveWhatsappPhoto(TENANT, 500), reserveWhatsappPhoto(TENANT, 500)]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(used()).toBe(500);
  });

  it('W11-7 : la restitution rend la place, jamais sous zéro', async () => {
    const reservation = await reserveWhatsappPhoto(TENANT, 10);
    expect(used()).toBe(1);
    await releaseWhatsappPhoto(TENANT, reservation.month);
    await releaseWhatsappPhoto(TENANT, reservation.month);
    expect(used()).toBe(0);
  });

  it('mois civil UTC : le compteur repart de zéro le mois suivant', async () => {
    await reserveWhatsappPhoto(TENANT, 1, new Date('2026-10-31T23:59:00Z'));
    expect((await reserveWhatsappPhoto(TENANT, 1, new Date('2026-10-31T23:59:30Z'))).ok).toBe(false);
    expect((await reserveWhatsappPhoto(TENANT, 1, new Date('2026-11-01T00:00:10Z'))).ok).toBe(true);
    expect(used('2026-10')).toBe(1);
    expect(used('2026-11')).toBe(1);
  });

  it('plafond nul : rien n’est réservé', async () => {
    expect((await reserveWhatsappPhoto(TENANT, 0)).ok).toBe(false);
    expect(await isWhatsappQuotaExhausted(TENANT, 0)).toBe(true);
  });
});

describe('W11-R5 — quota atteint', () => {
  it('audit STOCK_WHATSAPP_QUOTA_REACHED une fois par agence et par mois', async () => {
    await noteWhatsappQuotaReached(TENANT, 'user-chef', 500, new Date('2026-10-04T10:00:00Z'));
    await noteWhatsappQuotaReached(TENANT, 'user-chef', 500, new Date('2026-10-20T10:00:00Z'));
    await noteWhatsappQuotaReached(TENANT, 'user-chef', 500, new Date('2026-11-02T10:00:00Z'));
    const audits = mockAudit.filter(a => a.actionKey === 'STOCK_WHATSAPP_QUOTA_REACHED');
    expect(audits).toHaveLength(2);
    expect(audits[0]).toMatchObject({
      tenantId: TENANT,
      actorUserId: 'user-chef',
      payload: { month: '2026-10', limit: 500 }
    });
  });
});

describe('vue du quota et compteur de consommation', () => {
  it('getWhatsappQuotaState : mois, consommé, plafond, source, blocs souscrits en vigueur', async () => {
    mockEntitlements = entitlements(1000, 'enforce');
    mockDb.insert('catalogItem', { id: 'cat-wa', code: 'EXT_INVENTAIRE_WHATSAPP' });
    mockDb.insert('catalogItem', { id: 'cat-autre', code: 'EXT_CHANTIER' });
    const now = new Date();
    mockDb.insert('subscriptionItem', {
      tenantId: TENANT,
      catalogItemId: 'cat-wa',
      quantity: 2,
      status: 'ACTIVE',
      startsAt: new Date('2026-01-01'),
      endsAt: null
    });
    mockDb.insert('subscriptionItem', {
      tenantId: TENANT,
      catalogItemId: 'cat-wa',
      quantity: 1,
      status: 'ENDED',
      startsAt: new Date('2026-01-01'),
      endsAt: new Date('2026-02-01')
    });
    mockDb.insert('subscriptionItem', {
      tenantId: TENANT,
      catalogItemId: 'cat-autre',
      quantity: 3,
      status: 'ACTIVE',
      startsAt: new Date('2026-01-01'),
      endsAt: null
    });
    await reserveWhatsappPhoto(TENANT, 1000, now);
    expect(await getWhatsappQuotaState(TENANT, now)).toEqual({
      month: now.toISOString().slice(0, 7),
      used: 1,
      limit: 1000,
      source: 'OPTION',
      blocks: 2
    });
    expect(await countWhatsappPhotosThisMonth(mockDb.client, TENANT)).toBe(1);
  });

  it('enforce sans option : source NONE, plafond 0', async () => {
    mockEntitlements = entitlements(0, 'enforce');
    expect(await getWhatsappQuotaState(TENANT)).toMatchObject({ limit: 0, source: 'NONE', blocks: 0 });
  });
});
