/**
 * Tâche planifiée et minuteries de l'inventaire par WhatsApp (lot 041, spec
 * W4-R5, W6-R7, W10, W14-R6) : relance unique, expiration, reprise des
 * événements du webhook, effacement des copies, purges, deux exécutions
 * simultanées. Lot 040, transport et vision simulés (aucun appel réseau).
 */
import {
  clearStaleEventPayloads,
  purgeStockWhatsappHistory,
  retryStaleWebhookEvents,
  runStockWhatsappMinute
} from '../../src/jobs/stock-whatsapp-job';
import { handleInboundMessage, resetEngineMemoryForTests } from '../../src/lib/stock-whatsapp/engine';
import { runSessionTimers } from '../../src/lib/stock-whatsapp/engine/timers';

const mockProcessed: string[] = [];

jest.mock('../../src/lib/stock-whatsapp/webhook/process-event', () => ({
  processWebhookEvent: async (eventId: string) => {
    mockProcessed.push(eventId);
  }
}));

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

async function send(message: any): Promise<void> {
  await handleInboundMessage(message);
}

/** Recule l'horloge de la session ouverte : dernier message du chef il y a `minutes`. */
function ageSession(minutes: number): MockRow {
  const session = openSession()!;
  session.lastInboundAt = new Date(Date.now() - minutes * MINUTE);
  return session;
}

beforeEach(() => {
  resetWorld();
  resetEngineMemoryForTests();
  mockProcessed.length = 0;
});

describe('W4-R5 — relance et expiration (runSessionTimers)', () => {
  it('W4-4 : proposition sans réponse 10 min → M23 une seule fois', async () => {
    seedAgency();
    await send(photo());
    clearSent();
    ageSession(11);
    await runSessionTimers();
    await runSessionTimers();
    expect(sentTexts()).toEqual([
      "J'attends votre réponse à ma question précédente. Sans réponse dans 20 minutes, cette photo ne sera pas enregistrée."
    ]);
    expect(openSession()!.reminderSentAt).toBeInstanceOf(Date);
  });

  it('un nouveau message du chef remet la relance à zéro', async () => {
    seedAgency();
    await send(photo());
    ageSession(11);
    await runSessionTimers();
    await send(text('peut-être'));
    expect(openSession()!.reminderSentAt).toBeNull();
  });

  it('W4-4 : 30 min → capture EXPIRED, aucune ligne nouvelle, M24 « la dernière photo »', async () => {
    seedAgency();
    await send(photo());
    clearSent();
    ageSession(31);
    await runSessionTimers();
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('EXPIRED');
    expect(mockDb.rows('stockCountLine')).toHaveLength(0);
    expect(mockDb.rows('stockWhatsappSession')[0]).toMatchObject({ state: 'CLOSED', closeReason: 'TIMEOUT' });
    expect(sentTexts()).toEqual([
      "Session terminée après 30 minutes sans réponse. La dernière photo n'a pas été enregistrée. Envoyez une photo pour recommencer."
    ]);
  });

  it('expiration d’un inventaire ouvert par WhatsApp et compté par le seul chef : clos, M24 « transmis au bureau »', async () => {
    seedAgency();
    await send(photo());
    await send(text('1'));
    clearSent();
    ageSession(31);
    await runSessionTimers();
    expect(mockDb.rows('stockCount')[0].status).toBe('COUNTED');
    expect(mockDb.rows('stockAlert')).toHaveLength(1);
    expect(sentTexts()).toEqual([
      "Session terminée après 30 minutes sans réponse. L'inventaire de « Cocody » est transmis au bureau (1 article(s)). Envoyez une photo pour recommencer."
    ]);
    expect(mockDb.rows('stockWhatsappSession')[0].countOutcome).toBe('COUNTED');
  });

  it('READY : pas de relance à 10 min ; fermeture à 30 min sans phrase sur la photo', async () => {
    seedAgency();
    await send(text('Bonjour'));
    clearSent();
    ageSession(15);
    await runSessionTimers();
    expect(mockSent).toHaveLength(0);
    ageSession(31);
    await runSessionTimers();
    expect(sentTexts()).toEqual([
      'Session terminée après 30 minutes sans réponse. Envoyez une photo pour recommencer.'
    ]);
  });

  it('W10-1 : deux exécutions simultanées sur une session expirée → un seul M24', async () => {
    seedAgency();
    await send(photo());
    clearSent();
    ageSession(31);
    await Promise.all([runSessionTimers(), runSessionTimers()]);
    expect(mockSent).toHaveLength(1);
    expect(mockDb.rows('stockWhatsappSession').filter(s => s.closedAt)).toHaveLength(1);
  });

  it('W10-1 : deux exécutions simultanées à 10 min → une seule relance', async () => {
    seedAgency();
    await send(photo());
    clearSent();
    ageSession(11);
    await Promise.all([runSessionTimers(), runSessionTimers()]);
    expect(mockSent).toHaveLength(1);
  });

  it('W10-2 : agence suspendue entre-temps → session fermée sans message, inventaire non clos', async () => {
    seedAgency();
    await send(photo());
    await send(text('1'));
    await send(photo());
    clearSent();
    mockDb.rows('tenant').find(t => t.id === TENANT)!.status = 'SUSPENDED';
    ageSession(31);
    await runSessionTimers();
    expect(mockSent).toHaveLength(0);
    expect(mockDb.rows('stockWhatsappSession')[0].closeReason).toBe('ACCESS_LOST');
    expect(mockDb.rows('stockFieldCapture')[1].outcome).toBe('EXPIRED');
    expect(mockDb.rows('stockCount')[0].status).toBe('DRAFT');
  });

  it('W13-R5 : `sessionId` ne traite que cette session', async () => {
    seedAgency();
    await send(photo());
    const session = ageSession(31);
    mockDb.insert('stockWhatsappSession', {
      id: 'autre-session',
      tenantId: TENANT,
      registrationId: 'reg-autre',
      state: 'READY',
      lastInboundAt: new Date(Date.now() - 40 * MINUTE),
      closedAt: null,
      reminderSentAt: null,
      pendingCaptureId: null
    });
    await runSessionTimers({ sessionId: session.id });
    expect(mockDb.rows('stockWhatsappSession').find(s => s.id === 'autre-session')!.closedAt).toBeNull();
    expect(mockDb.rows('stockWhatsappSession').find(s => s.id === session.id)!.closedAt).toBeInstanceOf(Date);
  });

  it('la relance et l’expiration sortent dans la langue du chef, sans le numéro au journal', async () => {
    seedAgency();
    await send(photo());
    ageSession(31);
    await runSessionTimers();
    const { logger } = jest.requireMock('../../src/utils/logger');
    expect(JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls])).not.toContain(
      '0712345678'
    );
  });
});

describe('W6-R7, W10-R3 — reprise et purges (stock-whatsapp-job)', () => {
  function event(id: string, data: Record<string, unknown>) {
    mockDb.insert('whatsappCloudEvent', {
      id,
      kind: 'MESSAGE',
      status: 'RECEIVED',
      attempts: 0,
      receivedAt: new Date(),
      claimedAt: null,
      payload: { copie: true },
      ...data
    });
  }

  it('W6-8 : un événement resté RECEIVED plus de 2 min ou PROCESSING plus de 5 min est repris, une fois par passage', async () => {
    const now = new Date();
    event('frais', { receivedAt: new Date(now.getTime() - 30 * 1000) });
    event('oublie', { receivedAt: new Date(now.getTime() - 3 * MINUTE) });
    event('bloque', {
      status: 'PROCESSING',
      receivedAt: new Date(now.getTime() - 10 * MINUTE),
      claimedAt: new Date(now.getTime() - 6 * MINUTE)
    });
    event('en-cours', { status: 'PROCESSING', claimedAt: new Date(now.getTime() - 1 * MINUTE) });
    event('fait', { status: 'PROCESSED', receivedAt: new Date(now.getTime() - 10 * MINUTE) });
    event('statut', { kind: 'STATUS', receivedAt: new Date(now.getTime() - 10 * MINUTE) });
    const count = await retryStaleWebhookEvents(now);
    expect(count).toBe(2);
    expect(mockProcessed).toEqual(['bloque', 'oublie']);
  });

  it('les copies `payload` de plus d’une heure sont effacées', async () => {
    const now = new Date();
    event('vieux', { status: 'FAILED', receivedAt: new Date(now.getTime() - 61 * MINUTE) });
    event('recent', { status: 'RECEIVED', receivedAt: new Date(now.getTime() - 10 * MINUTE) });
    const cleared = await clearStaleEventPayloads(now);
    expect(cleared).toBe(1);
    expect(mockDb.rows('whatsappCloudEvent').find(e => e.id === 'vieux')!.payload).toBeNull();
    expect(mockDb.rows('whatsappCloudEvent').find(e => e.id === 'recent')!.payload).toEqual({ copie: true });
  });

  it('purge nocturne : messages à 180 jours, événements à 30 jours, captures jamais', async () => {
    const now = new Date();
    const day = 24 * 60 * MINUTE;
    mockDb.insert('stockWhatsappMessage', {
      id: 'm-vieux',
      tenantId: TENANT,
      createdAt: new Date(now.getTime() - 181 * day)
    });
    mockDb.insert('stockWhatsappMessage', {
      id: 'm-recent',
      tenantId: TENANT,
      createdAt: new Date(now.getTime() - 179 * day)
    });
    event('e-vieux', { status: 'PROCESSED', receivedAt: new Date(now.getTime() - 31 * day) });
    event('e-recent', { status: 'PROCESSED', receivedAt: new Date(now.getTime() - 29 * day) });
    mockDb.insert('stockFieldCapture', {
      id: 'c-vieille',
      tenantId: TENANT,
      receivedAt: new Date(now.getTime() - 400 * day)
    });
    const purged = await purgeStockWhatsappHistory(now);
    expect(purged).toEqual({ messages: 1, events: 1 });
    expect(mockDb.rows('stockWhatsappMessage').map(m => m.id)).toEqual(['m-recent']);
    expect(mockDb.rows('whatsappCloudEvent').map(e => e.id)).toEqual(['e-recent']);
    expect(mockDb.rows('stockFieldCapture')).toHaveLength(1);
  });

  it('une étape en échec n’empêche pas les suivantes', async () => {
    const now = new Date();
    event('oublie', { receivedAt: new Date(now.getTime() - 3 * MINUTE) });
    const findMany = mockDb.client.stockWhatsappSession.findMany;
    mockDb.client.stockWhatsappSession.findMany = async () => {
      throw new Error('panne');
    };
    try {
      await runStockWhatsappMinute(now);
    } finally {
      mockDb.client.stockWhatsappSession.findMany = findMany;
    }
    expect(mockProcessed).toEqual(['oublie']);
  });
});
