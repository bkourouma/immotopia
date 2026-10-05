/**
 * Aveugle du bot (lot 041, spec §8.3, W-D2) et vocabulaire D2 du lot 040.
 *
 * Un parcours complet, sur un chantier dont le stock théorique est de 137 sacs
 * de ciment (coût moyen 5 000) et 211 barres : aucun message du bot, aucun
 * champ de capture, aucune donnée envoyée à l'IA ne contient l'attendu, un
 * solde, une valeur, un coût, un écart, ni le fait qu'une alerte a été levée.
 * Le bot ne cite que ce que le chef a compté.
 */
import fs from 'fs';
import path from 'path';
import { handleInboundMessage, resetEngineMemoryForTests } from '../../src/lib/stock-whatsapp/engine';
import { runSessionTimers } from '../../src/lib/stock-whatsapp/engine/timers';

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
// Doublures des modules voisins (transport W1, vision W2, fichiers, lot 040)
// ---------------------------------------------------------------------------

const mockDb = createMockDb();

type MockSent = { toE164: string; message: any; log: any };
const mockSent: MockSent[] = [];
const mockMedia = new Map<string, Buffer>();
const mockVisionCalls: any[] = [];
let mockVisionImpl: (request: any) => Promise<any> = async request => mockVisionOk(request);
let mockEntitlements: any = null;
const mockAudit: any[] = [];

function mockVisionOk(request: any, overrides: Record<string, unknown> = {}) {
  const first = [...request.candidates].sort((a: any, b: any) => a.reference.localeCompare(b.reference))[0];
  return {
    ok: true,
    provider: 'fake',
    model: 'fake-vision-1',
    latencyMs: 5,
    result: {
      quality: 'OK',
      itemId: request.imposedItemId ?? first?.id ?? null,
      itemConfidence: 0.9,
      visibleUnits: 12,
      layers: null,
      columns: null,
      depthRows: 7,
      proposedTotal: 84,
      confidence: 0.92,
      method: 'SACKS_STACKED',
      explanation: 'Sacs empilés.',
      ...overrides
    }
  };
}

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
  logAuditEvent: (entry: any) => mockAudit.push({ ...entry, critical: false }),
  recordAuditEvent: async (_tx: any, entry: any) => {
    mockAudit.push({ ...entry, critical: true });
  }
}));

jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: async () => mockEntitlements,
  countInventoryPhotosThisMonth: async (_db: any, tenantId: string, now: Date = new Date()) => {
    const month = now.toISOString().slice(0, 7);
    return mockDb.rows('stockWhatsappUsage').find(r => r.tenantId === tenantId && r.month === month)?.used ?? 0;
  }
}));

jest.mock('../../src/lib/stock-whatsapp/transport', () => ({
  getWhatsappTransport: () => ({
    id: 'log',
    send: async (input: any) => {
      mockSent.push(input);
      return { metaMessageId: null, error: null };
    },
    markRead: async () => undefined,
    fetchMedia: async (mediaId: string) => {
      const buffer = mockMedia.get(mediaId);
      if (!buffer) throw new Error('média introuvable');
      return { buffer, declaredMimeType: 'image/jpeg', providerSha256: null };
    }
  })
}));

jest.mock('../../src/lib/stock-whatsapp/vision', () => ({
  getStockVisionProvider: () => ({
    id: 'fake',
    model: 'fake-vision-1',
    analyze: async (request: any) => {
      mockVisionCalls.push(request);
      return mockVisionImpl(request);
    }
  })
}));

jest.mock('../../src/lib/stock-whatsapp/vision/candidates', () => ({
  selectStockVisionCandidates: async (tenantId: string) =>
    mockDb
      .rows('stockItem')
      .filter(item => item.tenantId === tenantId && item.isActive)
      .map(item => ({ id: item.id, reference: item.reference, label: item.label, unit: item.unit, category: null }))
}));

jest.mock('../../src/lib/stock-whatsapp/capture-files', () => ({
  CAPTURE_MAX_BYTES: 10 * 1024 * 1024,
  storeCapturePhoto: async (tenantId: string, buffer: Buffer) => {
    if (buffer.toString('utf8').startsWith('<html')) return { refused: 'TYPE' };
    return {
      fileUrl: `/uploads/stock-whatsapp/${tenantId}/2026/${buffer.length}-${Math.random().toString(16).slice(2)}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: buffer.length,
      sha256: 'a'.repeat(64)
    };
  },
  readCapturePhoto: async () => ({ buffer: Buffer.from('jpeg'), fileName: 'photo.jpg', mimeType: 'image/jpeg' }),
  deleteCapturePhoto: async () => undefined
}));

jest.mock('../../src/lib/stock-whatsapp/lot040-bridge', () => {
  const { AppError, ErrorCode } = jest.requireActual('../../src/middleware/error-middleware');
  const refuse = (code: string) => new AppError('Refus du lot 040', 409, code);
  return {
    createStockCountTx: async (tx: any, tenantId: string, params: any) => {
      const open = await tx.stockCount.findFirst({
        where: { tenantId, locationId: params.locationId, status: { in: ['DRAFT', 'COUNTED'] } }
      });
      if (open) throw refuse(ErrorCode.STOCK_COUNT_ALREADY_OPEN);
      return tx.stockCount.create({
        data: {
          tenantId,
          locationId: params.locationId,
          countedAt: params.countedAt,
          createdByUserId: params.createdByUserId,
          kind: params.kind ?? 'REGULAR',
          status: 'DRAFT',
          source: 'WEB',
          counterUserIds: []
        }
      });
    },
    setStockCountLineTx: async (tx: any, tenantId: string, countId: string, params: any) => {
      const count = await tx.stockCount.findFirst({ where: { id: countId, tenantId } });
      if (!count || count.status !== 'DRAFT') throw refuse(ErrorCode.STOCK_COUNT_WRONG_STATUS);
      const item = await tx.stockItem.findFirst({ where: { id: params.itemId, tenantId, isActive: true } });
      if (!item) throw new AppError('Article introuvable', 404, ErrorCode.NOT_FOUND);
      const balance = await tx.stockBalance.findFirst({
        where: { tenantId, itemId: params.itemId, locationId: count.locationId }
      });
      const expectedQuantity = balance?.quantity ?? 0;
      const existing = await tx.stockCountLine.findFirst({ where: { countId, itemId: params.itemId } });
      const data = {
        expectedQuantity,
        countedQuantity: params.countedQuantity,
        countedByUserId: params.countedByUserId
      };
      const line = existing
        ? await tx.stockCountLine.update({ where: { id: existing.id }, data })
        : await tx.stockCountLine.create({ data: { countId, itemId: params.itemId, ...data } });
      if (!count.counterUserIds.includes(params.countedByUserId)) {
        await tx.stockCount.update({
          where: { id: countId },
          data: { counterUserIds: [...count.counterUserIds, params.countedByUserId] }
        });
      }
      return { lineId: line.id, line };
    },
    closeStockCountTx: async (tx: any, tenantId: string, countId: string, closedByUserId: string) => {
      const count = await tx.stockCount.findFirst({ where: { id: countId, tenantId } });
      if (!count || count.status !== 'DRAFT') throw refuse(ErrorCode.STOCK_COUNT_WRONG_STATUS);
      const lines = await tx.stockCountLine.findMany({ where: { countId, countedQuantity: { not: null } } });
      if (lines.length === 0) throw refuse(ErrorCode.STOCK_COUNT_EMPTY);
      const balances = await tx.stockBalance.findMany({ where: { tenantId, locationId: count.locationId } });
      let uncountedLinesCreated = 0;
      for (const balance of balances) {
        if (Number(balance.quantity) === 0 || lines.some((l: any) => l.itemId === balance.itemId)) continue;
        await tx.stockCountLine.create({
          data: { countId, itemId: balance.itemId, expectedQuantity: balance.quantity, countedQuantity: null }
        });
        uncountedLinesCreated += 1;
      }
      await tx.stockCount.update({
        where: { id: countId },
        data: { status: 'COUNTED', closedByUserId, closedAt: new Date() }
      });
      return { id: countId, status: 'COUNTED', uncountedLinesCreated };
    }
  };
});

// ---------------------------------------------------------------------------
// Jeu de données : une agence, un chef inscrit, des chantiers, des articles
// ---------------------------------------------------------------------------

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const CHEF = 'user-chef';
const MAGASINIER = 'user-magasinier';
const PHONE = '+2250712345678';
const ROLE_ID = 'role-site-manager';

let mockMessageSeq = 0;

function entitlementsWith(limit: number, enforcement: 'enforce' | 'warn' | 'off' = 'enforce') {
  return {
    enforcement,
    readOnly: false,
    moduleAccess: new Proxy({}, { get: () => 'FULL' }),
    capacities: {
      PHOTOS_INVENTAIRE: { limit, used: 0, included: 0, extensions: limit, overrides: 0, remaining: limit, overBy: 0 }
    }
  };
}

function addSite(
  id: string,
  name: string,
  options: { status?: string; stockEnabled?: boolean; locationActive?: boolean } = {}
) {
  mockDb.insert('constructionSite', {
    id,
    tenantId: TENANT,
    name,
    status: options.status ?? 'IN_PROGRESS',
    stockEnabledAt: options.stockEnabled === false ? null : new Date('2026-09-01T00:00:00Z')
  });
  mockDb.insert('stockLocation', {
    id: `loc-${id}`,
    tenantId: TENANT,
    kind: 'SITE',
    label: name,
    siteId: id,
    isActive: options.locationActive ?? true
  });
}

function linkSite(siteId: string, registrationId = 'reg-chef') {
  mockDb.insert('stockWhatsappRegistrationSite', { tenantId: TENANT, registrationId, siteId });
}

function addItem(id: string, reference: string, label: string, unit = 'sac') {
  mockDb.insert('stockItem', { id, tenantId: TENANT, reference, label, unit, isActive: true });
}

/** Agence A, chef actif inscrit sur `siteCount` chantiers (le premier : « Cocody »). */
function seedAgency(options: { siteCount?: number; status?: 'ACTIVE' | 'PENDING_ACTIVATION' } = {}) {
  mockDb.insert('tenant', { id: TENANT, name: 'BTP Awa', status: 'ACTIVE' });
  mockDb.insert('tenant', { id: OTHER_TENANT, name: 'Autre agence', status: 'ACTIVE' });
  mockDb.insert('user', { id: CHEF, email: 'awa@test.ci', fullName: 'Awa', isActive: true, preferredLanguage: null });
  mockDb.insert('user', {
    id: MAGASINIER,
    email: 'mag@test.ci',
    fullName: 'Magasinier',
    isActive: true,
    preferredLanguage: null
  });
  mockDb.insert('membership', { userId: CHEF, tenantId: TENANT, status: 'ACTIVE' });
  mockDb.insert('permission', { id: 'perm-count', key: 'STOCK_COUNT' });
  mockDb.insert('role', { id: ROLE_ID, key: 'TENANT_SITE_MANAGER', name: 'Tenant Site Manager', scope: 'TENANT' });
  mockDb.insert('rolePermission', { roleId: ROLE_ID, permissionId: 'perm-count' });
  mockDb.insert('userRole', { userId: CHEF, roleId: ROLE_ID, tenantId: TENANT });
  mockDb.insert('stockWhatsappRegistration', {
    id: 'reg-chef',
    tenantId: TENANT,
    userId: CHEF,
    phoneE164: PHONE,
    status: options.status ?? 'ACTIVE',
    activationCodeHash: null,
    activationExpiresAt: null,
    activationAttempts: 0,
    createdByUserId: 'user-admin',
    revokedAt: null
  });
  const names = ['Cocody', 'Yopougon', 'Bingerville', 'Abobo', 'Marcory', 'Treichville'];
  for (let index = 0; index < (options.siteCount ?? 1); index += 1) {
    addSite(`site-${index + 1}`, names[index] ?? `Chantier ${index + 1}`);
    linkSite(`site-${index + 1}`);
  }
  addItem('item-cim', 'CIM-45', 'Ciment CPJ 45');
  addItem('item-fer8', 'FER-8', 'Fer 8', 'barre');
  addItem('item-fer10', 'FER-10', 'Fer 10', 'barre');
  addItem('item-fer12', 'FER-12', 'Fer 12', 'barre');
  // Stock théorique de 137 sacs de ciment au coût moyen de 5 000 : JAMAIS cité par le bot.
  mockDb.insert('stockBalance', {
    tenantId: TENANT,
    itemId: 'item-cim',
    locationId: 'loc-site-1',
    quantity: 137,
    value: 685000
  });
}

function inbound(kind: 'TEXT' | 'IMAGE' | 'REPLY' | 'UNSUPPORTED', payload: any = {}, from = PHONE) {
  mockMessageSeq += 1;
  const base = {
    metaMessageId: `sim-${mockMessageSeq}`,
    fromE164: from,
    receivedAt: payload.receivedAt ?? new Date(),
    sentAt: new Date(),
    via: 'SIMULATOR' as const
  };
  if (kind === 'TEXT') return { ...base, kind, text: payload.text ?? '' };
  if (kind === 'IMAGE') {
    const mediaId = `media-${mockMessageSeq}`;
    mockMedia.set(mediaId, payload.buffer ?? Buffer.from(`jpeg-${mockMessageSeq}`));
    return {
      ...base,
      kind,
      media: { mediaId, mimeType: 'image/jpeg', providerSha256: null, caption: payload.caption ?? null }
    };
  }
  if (kind === 'REPLY') {
    return { ...base, kind, replyId: payload.replyId, replyTitle: payload.replyTitle ?? '', contextMessageId: null };
  }
  return { ...base, kind, originalType: payload.originalType ?? 'audio' };
}

const text = (value: string, from?: string) => inbound('TEXT', { text: value }, from);
const photo = (caption?: string) => inbound('IMAGE', { caption });

/** Textes envoyés (dans l'ordre), depuis le dernier `clearSent()`. */
function sentTexts(): string[] {
  return mockSent.map(entry => entry.message.text as string);
}

function lastSent(): any {
  return mockSent[mockSent.length - 1]?.message;
}

function clearSent(): void {
  mockSent.length = 0;
}

function openSession(): MockRow | undefined {
  return mockDb.rows('stockWhatsappSession').find(s => s.registrationId === 'reg-chef' && !s.closedAt);
}

function usageThisMonth(): number {
  const month = new Date().toISOString().slice(0, 7);
  return mockDb.rows('stockWhatsappUsage').find(r => r.tenantId === TENANT && r.month === month)?.used ?? 0;
}

function resetWorld(): void {
  mockDb.reset();
  mockSent.length = 0;
  mockMedia.clear();
  mockVisionCalls.length = 0;
  mockAudit.length = 0;
  mockVisionImpl = async request => mockVisionOk(request);
  mockEntitlements = entitlementsWith(500);
}

// Aides communes : toutes ne servent pas dans chaque suite.
void [
  lastSent,
  usageThisMonth,
  clearSent,
  sentTexts,
  photo,
  text,
  openSession,
  entitlementsWith,
  addSite,
  linkSite,
  addItem,
  OTHER_TENANT,
  MAGASINIER
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const MINUTE = 60 * 1000;
const FORBIDDEN_WORDS =
  /\b(vol|vols|voleur|voleurs|fraude|fraudes|frauduleux|frauduleuse|détournement|détournements|détourné|détournée|détournés)\b/iu;
const BLIND_WORDS = /\b(attendu|attendue|théorique|solde|écart|valeur|coût|seuil|alerte)\b/iu;

async function send(message: any): Promise<void> {
  await handleInboundMessage(message);
}

/** Parcours complet d'un chef : tous les messages du bot passent par ici. */
async function fullJourney(): Promise<void> {
  // Article non reconnu, puis nommé.
  mockVisionImpl = async request => mockVisionOk(request, { itemId: request.imposedItemId ?? null });
  await send(photo());
  await send(text('ciment'));
  await send(text('trois'));
  await send(text('1'));
  // Même article une seconde fois : M30 (quantité COMPTÉE, jamais l'attendu).
  mockVisionImpl = async request => mockVisionOk(request, { confidence: 0.4 });
  await send(photo());
  await send(text('90'));
  await send(text('1'));
  // Photos illisibles, échec, fichier refusé, message vocal, aide.
  mockVisionImpl = async request => mockVisionOk(request, { quality: 'TOO_DARK' });
  await send(photo());
  mockVisionImpl = async request => mockVisionOk(request, { quality: 'NOT_STOCK' });
  await send(photo());
  mockVisionImpl = async () => ({ ok: false, reason: 'TIMEOUT', provider: 'fake', model: 'm', latencyMs: 20000 });
  await send(photo());
  await send(inbound('IMAGE', { buffer: Buffer.from('<html>') }));
  await send(inbound('UNSUPPORTED'));
  await send(text('AIDE'));
  await send(text('bonjour'));
  // Un second article, puis FIN : l'inventaire est clos, une alerte WARNING naît.
  mockVisionImpl = async request =>
    mockVisionOk(request, { itemId: 'item-fer8', proposedTotal: 12, method: 'BARS_BUNDLE' });
  await send(photo());
  await send(text('0'));
  await send(photo());
  await send(text('12'));
  await send(text('FIN'));
  // Nouvelle session, relance puis expiration.
  mockVisionImpl = async request => mockVisionOk(request);
  await send(photo());
  openSession()!.lastInboundAt = new Date(Date.now() - 11 * MINUTE);
  await runSessionTimers();
  openSession()!.lastInboundAt = new Date(Date.now() - 31 * MINUTE);
  await runSessionTimers();
}

beforeEach(() => {
  resetWorld();
  resetEngineMemoryForTests();
});

describe('§8.3 — aveugle du bot', () => {
  it('aucun message d’un parcours complet ne cite le stock théorique (137), une valeur, un coût ni un écart', async () => {
    seedAgency();
    mockDb.insert('stockBalance', {
      tenantId: TENANT,
      itemId: 'item-fer8',
      locationId: 'loc-site-1',
      quantity: 211,
      value: 633000
    });
    await fullJourney();

    const messages = mockSent.map(entry => {
      const message = entry.message;
      const parts = [message.text, message.buttonText ?? ''];
      for (const button of message.buttons ?? []) parts.push(button.title);
      for (const row of message.rows ?? []) parts.push(row.title, row.description ?? '');
      return parts.join(' ');
    });
    // Le parcours a bien produit chaque type de réponse.
    expect(messages.length).toBeGreaterThan(20);
    const all = messages.join('\n');
    expect(all).toContain('déjà compté dans cet inventaire');
    expect(all).toContain("L'inventaire de « Cocody » est transmis au bureau");
    expect(mockDb.rows('stockAlert')[0]).toMatchObject({ severity: 'WARNING' });

    for (const message of messages) {
      expect(message).not.toMatch(/\b137\b/);
      expect(message).not.toMatch(/\b211\b/);
      expect(message).not.toMatch(/685\s?000|633\s?000|5\s?000\b|3\s?000\b/);
      expect(message).not.toMatch(new RegExp(String(mockDb.rows('stockAlert')[0].amount)));
      expect(message).not.toMatch(BLIND_WORDS);
      expect(message).not.toMatch(FORBIDDEN_WORDS);
    }
  });

  it('les captures ne portent aucune quantité théorique ; l’IA ne reçoit aucun solde ni la légende réelle', async () => {
    seedAgency();
    await fullJourney();
    for (const capture of mockDb.rows('stockFieldCapture')) {
      const keys = Object.keys(capture).join(' ');
      expect(keys).not.toMatch(/expected|balance|variance|value|cost/i);
      expect(JSON.stringify(capture)).not.toMatch(/\b137\b/);
    }
    for (const request of mockVisionCalls) {
      for (const candidate of request.candidates) {
        expect(Object.keys(candidate).sort()).toEqual(['category', 'id', 'label', 'reference', 'unit']);
      }
    }
  });

  it('le journal de conversation ne contient ni l’attendu ni le numéro du chef', async () => {
    seedAgency();
    await fullJourney();
    const journal = JSON.stringify(mockDb.rows('stockWhatsappMessage'));
    expect(journal).not.toMatch(/\b137\b/);
    expect(journal).not.toContain('0712345678');
  });
});

describe('vocabulaire D2 du lot 040 dans les textes du bot', () => {
  it('aucun mot interdit ni mot de l’aveugle dans bot-messages.ts', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/lib/stock-whatsapp/bot-messages.ts'), 'utf8');
    // Premier argument de chaque appel `t(…)` : les textes envoyés au chef.
    const texts = [...source.matchAll(/\bt\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/g)].map(match => match[2]);
    expect(texts.length).toBeGreaterThan(40);
    for (const literal of texts) {
      expect(literal).not.toMatch(FORBIDDEN_WORDS);
      expect(literal).not.toMatch(BLIND_WORDS);
    }
  });

  it('aucun mot interdit dans les fichiers du moteur, des inscriptions, du quota et de la tâche', () => {
    const roots = [
      '../../src/lib/stock-whatsapp/engine',
      '../../src/lib/stock-whatsapp/registrations',
      '../../src/lib/stock-whatsapp/quota.ts',
      '../../src/jobs/stock-whatsapp-job.ts'
    ].map(relative => path.join(__dirname, relative));
    const files = roots.flatMap(root =>
      fs.statSync(root).isDirectory() ? fs.readdirSync(root).map(name => path.join(root, name)) : [root]
    );
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      expect(fs.readFileSync(file, 'utf8')).not.toMatch(FORBIDDEN_WORDS);
    }
  });
});
