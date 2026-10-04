/**
 * Moteur de conversation de l'inventaire par WhatsApp (lot 041, spec W4, W5,
 * W8-R8, W9, W12, W3-R7, W3-R10, W11 côté moteur).
 *
 * Chaque transition de la machine à états (spec §7), les commandes, M30, les
 * courses avec le bureau, la clôture et l'alerte. Les fonctions du lot 040 sont
 * SIMULÉES (`lot040-bridge`, plan §1) avec leurs règles : 409 si un inventaire
 * DRAFT ou COUNTED existe déjà, ligne à l'aveugle qui fige l'attendu, clôture
 * qui crée les lignes non comptées. Le transport (W1) et la vision (W2) sont
 * simulés : aucun appel réseau.
 */
import { env } from '../../src/config/env';
import { botMessages } from '../../src/lib/stock-whatsapp/bot-messages';
import { handleInboundMessage, resetEngineMemoryForTests } from '../../src/lib/stock-whatsapp/engine';
import {
  extractActivationDigits,
  isZero,
  parseCommand,
  parseMergeAnswer,
  parseQuantityAnswer
} from '../../src/lib/stock-whatsapp/engine/commands';
import { runSessionTimers } from '../../src/lib/stock-whatsapp/engine/timers';
import { computeFieldVariance, fieldAlertSeverity } from '../../src/lib/stock-whatsapp/engine/field-alert';
import { matchItems } from '../../src/lib/stock-whatsapp/engine/item-matching';
import { checkWhatsappAnalysisBudget, resetQuotaWarningsForTests } from '../../src/lib/stock-whatsapp/quota';
import { MediaFetchError } from '../../src/lib/stock-whatsapp/types';
import { activationCodeHash } from '../../src/lib/stock-whatsapp/registrations/activation';

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
        if (prop === '$executeRaw' || prop === '$executeRawUnsafe') {
          // Prise du verrou consultatif : point où un test simule ce qu'une
          // autre requête a fait entre une lecture et le verrou.
          return async () => {
            const hook = mockLockHooks.shift();
            if (hook) hook();
            return 0;
          };
        }
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

/** Une fonction par prise de verrou à venir (`undefined` : rien), consommées dans l'ordre. */
const mockLockHooks: Array<(() => void) | undefined> = [];
const mockDb = createMockDb();
let mockMediaFailure: Error | null = null;

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
      if (mockMediaFailure) throw mockMediaFailure;
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
  mockLockHooks.length = 0;
  mockMediaFailure = null;
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

async function send(message: any): Promise<void> {
  await handleInboundMessage(message);
}

/** Photo validée telle que proposée (`1`) sur le chantier unique. */
async function countByPhoto(options: { total?: number; itemId?: string; answer?: string } = {}) {
  mockVisionImpl = async request =>
    mockVisionOk(request, {
      proposedTotal: options.total ?? 84,
      ...(options.itemId ? { itemId: options.itemId } : {})
    });
  await send(photo());
  await send(text(options.answer ?? '1'));
}

beforeEach(() => {
  resetWorld();
  resetEngineMemoryForTests();
  resetQuotaWarningsForTests();
});

describe('W4 — session et machine à états', () => {
  it('W4-1 : un seul chantier, la photo passe par ANALYZING puis AWAITING_CONFIRMATION sans question', async () => {
    seedAgency({ siteCount: 1 });
    const states: string[] = [];
    mockVisionImpl = async request => {
      states.push(openSession()!.state);
      return mockVisionOk(request);
    };
    await send(photo());
    expect(states).toEqual(['ANALYZING']);
    expect(openSession()!.state).toBe('AWAITING_CONFIRMATION');
    const texts = sentTexts();
    expect(texts[0]).toBe('Chantier « Cocody ». Envoyez la photo du premier article.');
    expect(texts[1]).toBe('Photo reçue, je compte…');
    expect(texts[2]).toContain('Ciment CPJ 45 (CIM-45)');
    expect(texts[2]).toContain('12 sacs de face × 7 rangée(s) en profondeur');
    expect(texts[2]).toContain('Total proposé : 84 sac');
    expect(lastSent().kind).toBe('BUTTONS');
    expect(lastSent().buttons.map((b: any) => b.title)).toEqual(['Valider', 'Annuler']);
    expect(mockSent.every(entry => entry.message.kind !== 'LIST')).toBe(true);
  });

  it('W4-2 : trois chantiers → trois boutons ; cinq → une liste de cinq lignes', async () => {
    seedAgency({ siteCount: 3 });
    await send(text('Bonjour'));
    expect(lastSent().kind).toBe('BUTTONS');
    expect(lastSent().buttons).toHaveLength(3);
    expect(lastSent().text).toBe('Sur quel chantier êtes-vous ?');

    resetWorld();
    seedAgency({ siteCount: 5 });
    await send(text('Bonjour'));
    expect(lastSent().kind).toBe('LIST');
    expect(lastSent().rows).toHaveLength(5);
    expect(lastSent().buttonText).toBe('Choisir');
  });

  it('W4-2 : la photo envoyée avant le choix est gardée puis analysée dès le choix', async () => {
    seedAgency({ siteCount: 3 });
    await send(photo());
    expect(openSession()!.state).toBe('AWAITING_SITE');
    const kept = mockDb.rows('stockFieldCapture');
    expect(kept).toHaveLength(1);
    expect(kept[0].outcome).toBe('RECEIVED');
    expect(mockVisionCalls).toHaveLength(0);
    expect(usageThisMonth()).toBe(0);

    const choice = lastSent().buttons.find((b: any) => b.title === 'Yopougon');
    await send(inbound('REPLY', { replyId: choice.id, replyTitle: 'Yopougon' }));
    expect(mockVisionCalls).toHaveLength(1);
    const session = openSession()!;
    expect(session.state).toBe('AWAITING_CONFIRMATION');
    expect(session.siteId).toBe('site-2');
    expect(mockDb.rows('stockFieldCapture')[0]).toMatchObject({
      outcome: 'PENDING',
      siteId: 'site-2',
      quotaCounted: true
    });
    expect(usageThisMonth()).toBe(1);
  });

  it('W4-3 : deux photos à une seconde d’intervalle → la seconde reçoit M12, une capture, compteur +1', async () => {
    seedAgency();
    await send(text('Bonjour'));
    clearSent();
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    mockVisionImpl = async request => {
      await gate;
      return mockVisionOk(request);
    };
    const first = send(photo());
    await new Promise(resolve => setTimeout(resolve, 20));
    await send(photo());
    release();
    await first;
    expect(sentTexts()).toContain(
      "Je termine l'analyse de la photo précédente. Renvoyez cette photo après ma réponse."
    );
    expect(mockDb.rows('stockFieldCapture')).toHaveLength(1);
    expect(usageThisMonth()).toBe(1);
    expect(mockVisionCalls).toHaveLength(1);
  });

  it('W4-4 (M12b) : une photo pendant une proposition en attente n’est ni téléchargée ni comptée', async () => {
    seedAgency();
    await send(photo());
    clearSent();
    await send(photo());
    expect(sentTexts()).toEqual([
      "Répondez d'abord à ma question précédente, ou tapez 0 pour l'annuler. Renvoyez ensuite cette photo."
    ]);
    expect(mockDb.rows('stockFieldCapture')).toHaveLength(1);
    expect(usageThisMonth()).toBe(1);
  });

  it.each(['fin', 'Fin', 'FIN', '  fîn  ', 'END'])('W4-5 : « %s » ferme la session', async command => {
    seedAgency();
    await send(text('Bonjour'));
    await send(text(command));
    expect(openSession()).toBeUndefined();
    const closed = mockDb.rows('stockWhatsappSession')[0];
    expect(closed).toMatchObject({ state: 'CLOSED', closeReason: 'FIN' });
    expect(lastSent().text).toBe("Session terminée. Aucun article n'a été compté.");
  });

  it('W4-6 : « 84 sacs » à une proposition de 90 → ligne à 84, capture CORRECTED, M15', async () => {
    seedAgency();
    await countByPhoto({ total: 90, answer: '84 sacs' });
    const line = mockDb.rows('stockCountLine')[0];
    expect(line.countedQuantity).toBe(84);
    expect(mockDb.rows('stockFieldCapture')[0]).toMatchObject({ outcome: 'CORRECTED', confirmedQuantity: 84 });
    expect(lastSent().text).toBe(
      "Enregistré : 84 sac de Ciment CPJ 45 (quantité corrigée). Envoyez la photo de l'article suivant, ou tapez FIN quand vous avez terminé."
    );
    expect(openSession()!.state).toBe('READY');
  });

  it('W4-7 : « 0 » → capture CANCELLED, aucune ligne, M16', async () => {
    seedAgency();
    await countByPhoto({ answer: '0' });
    expect(mockDb.rows('stockCountLine')).toHaveLength(0);
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('CANCELLED');
    expect(lastSent().text).toBe(
      "Comptage de cette photo annulé : rien n'est enregistré. Envoyez une autre photo, ou tapez FIN."
    );
  });

  it('W4-7 : une réponse incomprise → M17, état inchangé', async () => {
    seedAgency();
    await send(photo());
    await send(text('peut-être'));
    expect(lastSent().text).toBe(
      "Je n'ai pas compris. Tapez 1 pour valider 84 sac, le nombre exact (ex. 84), ou 0 pour annuler."
    );
    expect(openSession()!.state).toBe('AWAITING_CONFIRMATION');
  });

  it('W4-8 : un message vocal → M28, état inchangé', async () => {
    seedAgency();
    await send(photo());
    await send(inbound('UNSUPPORTED', { originalType: 'audio' }));
    expect(lastSent().text).toBe(
      'Je lis seulement les photos et les messages écrits. Envoyez une photo de votre stock, ou tapez AIDE.'
    );
    expect(openSession()!.state).toBe('AWAITING_CONFIRMATION');
  });

  it('AIDE répond M26 sans changer d’état ; texte libre en READY → M33', async () => {
    seedAgency();
    await send(text('Bonjour'));
    await send(text('aide'));
    expect(lastSent().text).toContain('Inventaire par photo :');
    expect(lastSent().text).toContain('Un article à zéro se signale au bureau, pas par WhatsApp.');
    await send(text('il fait chaud'));
    expect(lastSent().text).toBe('Envoyez une photo de votre stock, ou tapez AIDE.');
    expect(openSession()!.state).toBe('READY');
  });

  it('« 1 » sans session ouverte (proposition expirée) → nouvelle session et M33', async () => {
    seedAgency();
    await send(text('1'));
    expect(openSession()).toBeDefined();
    expect(lastSent().text).toBe('Envoyez une photo de votre stock, ou tapez AIDE.');
  });

  it('un bouton d’un ancien message (autre capture) → M17', async () => {
    seedAgency();
    await send(photo());
    await send(inbound('REPLY', { replyId: 'confirm:capture-ancienne', replyTitle: 'Valider' }));
    expect(lastSent().text).toContain("Je n'ai pas compris.");
    expect(mockDb.rows('stockCountLine')).toHaveLength(0);
  });

  it('le bouton « Valider » de la proposition en cours enregistre (M14)', async () => {
    seedAgency();
    await send(photo());
    const valider = lastSent().buttons[0];
    await send(inbound('REPLY', { replyId: valider.id, replyTitle: 'Valider' }));
    expect(mockDb.rows('stockCountLine')[0].countedQuantity).toBe(84);
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('ACCEPTED');
    expect(lastSent().text).toBe(
      "Enregistré : 84 sac de Ciment CPJ 45. Envoyez la photo de l'article suivant, ou tapez FIN quand vous avez terminé."
    );
  });

  it('CHANTIER : clôture la règle W5-R5, abandonne la proposition et repropose le choix', async () => {
    seedAgency({ siteCount: 2 });
    await send(text('Bonjour'));
    await send(inbound('REPLY', { replyId: 'site:site-1', replyTitle: 'Cocody' }));
    await send(photo());
    clearSent();
    await send(text('chantier'));
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('EXPIRED');
    expect(openSession()!.state).toBe('AWAITING_SITE');
    expect(lastSent().kind).toBe('BUTTONS');
  });
});

describe('W5 — écriture dans l’inventaire du lot 040', () => {
  it('W5-1 : la première confirmation crée un inventaire DRAFT WHATSAPP au nom du chef', async () => {
    seedAgency();
    await countByPhoto();
    const counts = mockDb.rows('stockCount');
    expect(counts).toHaveLength(1);
    expect(counts[0]).toMatchObject({ status: 'DRAFT', source: 'WHATSAPP', createdByUserId: CHEF, kind: 'REGULAR' });
    expect(counts[0].countedAt.getUTCHours()).toBe(0);
    const line = mockDb.rows('stockCountLine')[0];
    expect(line.countedByUserId).toBe(CHEF);
    const capture = mockDb.rows('stockFieldCapture')[0];
    expect(capture).toMatchObject({
      countId: counts[0].id,
      countLineId: line.id,
      outcome: 'ACCEPTED',
      confirmedQuantity: 84
    });
    expect(capture.confirmedAt).toBeInstanceOf(Date);
    expect(mockAudit.find(a => a.actionKey === 'STOCK_WHATSAPP_COUNT_RECORDED')).toMatchObject({
      tenantId: TENANT,
      actorUserId: CHEF,
      critical: false
    });
  });

  it('W5-2 : un DRAFT ouvert au web est réutilisé ; à FIN il reste ouvert (deux compteurs), M25b', async () => {
    seedAgency();
    mockDb.insert('stockCount', {
      id: 'count-web',
      tenantId: TENANT,
      locationId: 'loc-site-1',
      status: 'DRAFT',
      source: 'WEB',
      kind: 'REGULAR',
      createdByUserId: MAGASINIER,
      counterUserIds: [MAGASINIER]
    });
    mockDb.insert('stockCountLine', {
      countId: 'count-web',
      itemId: 'item-fer8',
      expectedQuantity: 10,
      countedQuantity: 9,
      countedByUserId: MAGASINIER
    });
    await countByPhoto();
    expect(mockDb.rows('stockCount')).toHaveLength(1);
    expect(mockDb.rows('stockCountLine').filter(l => l.countId === 'count-web')).toHaveLength(2);
    await send(text('FIN'));
    expect(mockDb.rows('stockCount')[0].status).toBe('DRAFT');
    expect(lastSent().text).toBe(
      "Merci. Vos 1 article(s) sont enregistrés dans l'inventaire en cours de « Cocody ». Il reste ouvert : le bureau le clôturera."
    );
    expect(mockDb.rows('stockAlert')).toHaveLength(0);
  });

  it('W5-3 : inventaire WhatsApp, deux lignes du chef, FIN → COUNTED, non comptés créés, alerte, M25 « 2 article(s) »', async () => {
    seedAgency();
    mockDb.insert('stockBalance', {
      tenantId: TENANT,
      itemId: 'item-fer12',
      locationId: 'loc-site-1',
      quantity: 30,
      value: 30000
    });
    await countByPhoto({ total: 84 });
    await countByPhoto({ total: 12, itemId: 'item-fer8' });
    await send(text('FIN'));
    const count = mockDb.rows('stockCount')[0];
    expect(count.status).toBe('COUNTED');
    expect(mockDb.rows('stockCountLine').filter(l => l.countedQuantity === null)).toHaveLength(1);
    const alerts = mockDb.rows('stockAlert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      kind: 'FIELD_COUNT_CLOSED',
      dedupeKey: `FIELD_COUNT_CLOSED:${count.id}`,
      subjectType: 'StockCount',
      subjectId: count.id,
      siteId: 'site-1',
      locationId: 'loc-site-1'
    });
    expect(alerts[0].details).toEqual({ linesCount: 2, capturesCount: 2, uncountedLinesCount: 1 });
    expect(JSON.stringify(alerts[0].details)).not.toMatch(/Awa|awa@/);
    expect(lastSent().text).toBe(
      "Merci. L'inventaire de « Cocody » est transmis au bureau : 2 article(s) compté(s). Le bureau le vérifiera et le validera."
    );
    expect(mockAudit.find(a => a.actionKey === 'STOCK_WHATSAPP_COUNT_CLOSED')).toMatchObject({
      critical: true,
      tenantId: TENANT
    });
    expect(mockDb.rows('stockWhatsappSession')[0]).toMatchObject({ closeReason: 'FIN', countOutcome: 'COUNTED' });
  });

  it('W5-4 : gravité de l’alerte (écart brut valorisé)', () => {
    const settings = { countVarianceAlertAmount: 100000, countVarianceAlertPercent: 5 };
    expect(fieldAlertSeverity({ gross: 150000, countedValue: 10_000_000 }, settings)).toBe('WARNING');
    expect(fieldAlertSeverity({ gross: 20000, countedValue: 1_000_000 }, settings)).toBe('INFO');
    expect(fieldAlertSeverity({ gross: 60000, countedValue: 1_000_000 }, settings)).toBe('WARNING');
    expect(
      computeFieldVariance([
        { countedQuantity: 84, expectedQuantity: 137, unitCost: 5000 },
        { countedQuantity: 10, expectedQuantity: 10, unitCost: 1000 }
      ])
    ).toEqual({ gross: 265000, countedValue: 430000 });
  });

  it('W5-4 : 84 sacs comptés pour 137 attendus à 5 000 → alerte WARNING au montant figé', async () => {
    seedAgency();
    await countByPhoto();
    await send(text('FIN'));
    expect(mockDb.rows('stockAlert')[0]).toMatchObject({ severity: 'WARNING', amount: 265000, threshold: 100000 });
  });

  it('W5-5 : lieu portant un inventaire COUNTED → M29 dès la photo, sans quota, sans IA ni capture', async () => {
    seedAgency();
    mockDb.insert('stockCount', {
      id: 'count-clos',
      tenantId: TENANT,
      locationId: 'loc-site-1',
      status: 'COUNTED',
      source: 'WEB',
      createdByUserId: MAGASINIER,
      counterUserIds: [MAGASINIER]
    });
    await countByPhoto();
    expect(mockDb.rows('stockCountLine')).toHaveLength(0);
    expect(mockDb.rows('stockFieldCapture')).toHaveLength(0);
    expect(mockVisionCalls).toHaveLength(0);
    expect(usageThisMonth()).toBe(0);
    expect(sentTexts()).toContain(
      "Un inventaire de ce chantier attend sa validation au bureau. Le comptage par WhatsApp reprendra après cette validation. Rien n'a été enregistré."
    );
    expect(openSession()!.state).toBe('READY');
  });

  it('W5-5 : inventaire COUNTED arrivé entre la proposition et la réponse → M29, aucune ligne, capture CANCELLED', async () => {
    seedAgency();
    await send(photo());
    mockDb.insert('stockCount', {
      id: 'count-clos',
      tenantId: TENANT,
      locationId: 'loc-site-1',
      status: 'COUNTED',
      source: 'WEB',
      createdByUserId: MAGASINIER,
      counterUserIds: [MAGASINIER]
    });
    await send(text('1'));
    expect(mockDb.rows('stockCountLine')).toHaveLength(0);
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('CANCELLED');
    expect(lastSent().text).toContain('Un inventaire de ce chantier attend sa validation au bureau.');
    expect(openSession()!.state).toBe('READY');
  });

  it.each([
    ['1', 124, 'ADD'],
    ['2', 84, 'REPLACE']
  ])(
    'W5-6 : ciment déjà compté 40, nouvelle photo validée à 84, « %s » → ligne à %d',
    async (answer, expected, mode) => {
      seedAgency();
      await countByPhoto({ total: 40 });
      mockVisionImpl = async request => mockVisionOk(request);
      await send(photo());
      clearSent();
      await send(text('1'));
      expect(openSession()!.state).toBe('AWAITING_MERGE');
      expect(lastSent().text).toBe(
        'Ciment CPJ 45 est déjà compté dans cet inventaire : 40 sac. Tapez 1 pour AJOUTER 84 (total 124), 2 pour REMPLACER par 84, 0 pour annuler cette photo.'
      );
      expect(lastSent().buttons.map((b: any) => b.title)).toEqual(['Ajouter', 'Remplacer', 'Annuler']);
      await send(text(answer));
      const lines = mockDb.rows('stockCountLine');
      expect(lines).toHaveLength(1);
      expect(lines[0].countedQuantity).toBe(expected);
      const second = mockDb.rows('stockFieldCapture')[1];
      expect(second).toMatchObject({
        mergeMode: mode,
        confirmedQuantity: 84,
        lineQuantityAfter: expected,
        outcome: 'ACCEPTED'
      });
    }
  );

  it('W5-6 : « 0 » sur M30 annule la photo sans toucher la ligne', async () => {
    seedAgency();
    await countByPhoto({ total: 40 });
    mockVisionImpl = async request => mockVisionOk(request);
    await send(photo());
    await send(text('1'));
    await send(text('0'));
    expect(mockDb.rows('stockCountLine')[0].countedQuantity).toBe(40);
    expect(mockDb.rows('stockFieldCapture')[1].outcome).toBe('CANCELLED');
  });

  it('W5-7 : inventaire clos au bureau entre deux messages → M31, capture CANCELLED, READY sans inventaire', async () => {
    seedAgency();
    await countByPhoto();
    mockDb.rows('stockCount')[0].status = 'VALIDATED';
    await send(photo());
    await send(text('1'));
    expect(lastSent().text).toBe(
      "L'inventaire en cours a été modifié au bureau : ce comptage n'a pas été enregistré. Envoyez à nouveau la photo."
    );
    expect(mockDb.rows('stockFieldCapture')[1].outcome).toBe('CANCELLED');
    expect(openSession()).toMatchObject({ state: 'READY', countId: null });
    // La photo suivante suit W5-2 : un nouvel inventaire s'ouvre.
    await countByPhoto();
    expect(mockDb.rows('stockCount').filter(c => c.status === 'DRAFT')).toHaveLength(1);
  });

  it('W5-7 : un refus du lot 040 pendant l’écriture (article désactivé) → M31', async () => {
    seedAgency();
    await send(photo());
    mockDb.rows('stockItem').find(i => i.id === 'item-cim')!.isActive = false;
    await send(text('1'));
    expect(lastSent().text).toContain("L'inventaire en cours a été modifié au bureau");
    expect(mockDb.rows('stockCountLine')).toHaveLength(0);
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('CANCELLED');
  });

  it('W5-8 : chantier clos pendant la session → M32 puis nouveau choix', async () => {
    seedAgency({ siteCount: 2 });
    await send(text('Bonjour'));
    await send(inbound('REPLY', { replyId: 'site:site-1', replyTitle: 'Cocody' }));
    mockDb.rows('constructionSite').find(s => s.id === 'site-1')!.status = 'CLOSED';
    clearSent();
    await send(text('Bonjour'));
    expect(sentTexts()[0]).toBe("Le chantier « Cocody » n'est plus ouvert au comptage par WhatsApp.");
    expect(sentTexts()[1]).toBe('Chantier « Yopougon ». Envoyez la photo du premier article.');
    expect(openSession()).toMatchObject({ siteId: 'site-2', state: 'READY' });
  });
});

describe('W8 — décision après analyse', () => {
  it.each([
    [
      'TOO_DARK',
      'Photo trop sombre ou floue pour compter précisément. Merci de reprendre la photo en activant le flash.'
    ],
    [
      'BLURRY',
      'Photo trop sombre ou floue pour compter précisément. Merci de reprendre la photo en activant le flash.'
    ],
    ['NOT_STOCK', 'Je ne vois pas de matériau à compter sur cette photo. Photographiez le stock de face, en entier.']
  ])('qualité %s → capture UNREADABLE, READY, quota consommé', async (quality, expected) => {
    seedAgency();
    mockVisionImpl = async request => mockVisionOk(request, { quality });
    await send(photo());
    expect(lastSent().text).toBe(expected);
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('UNREADABLE');
    expect(openSession()!.state).toBe('READY');
    expect(usageThisMonth()).toBe(1);
  });

  it('total proposé nul avec OK → traité comme NOT_STOCK', async () => {
    seedAgency();
    mockVisionImpl = async request => mockVisionOk(request, { proposedTotal: 0 });
    await send(photo());
    expect(lastSent().text).toContain('Je ne vois pas de matériau');
  });

  it('W8-7 / W11-7 : échec de l’IA → FAILED, M22, compteur revenu à sa valeur, photo conservée', async () => {
    seedAgency();
    mockVisionImpl = async () => ({ ok: false, reason: 'INVALID_OUTPUT', provider: 'fake', model: 'm', latencyMs: 3 });
    await send(photo());
    expect(lastSent().text).toBe(
      "Désolé, je n'arrive pas à analyser cette photo pour le moment. Elle est conservée. Réessayez dans quelques minutes, ou prévenez le bureau."
    );
    const capture = mockDb.rows('stockFieldCapture')[0];
    expect(capture).toMatchObject({ outcome: 'FAILED', failureReason: 'INVALID_OUTPUT', quotaCounted: false });
    expect(capture.fileUrl).toBeTruthy();
    expect(usageThisMonth()).toBe(0);
    expect(openSession()!.state).toBe('READY');
  });

  it('confiance < 0,7 : la phrase de prudence est ajoutée à M13', async () => {
    seedAgency();
    mockVisionImpl = async request => mockVisionOk(request, { proposedTotal: 60, confidence: 0.5 });
    await send(photo());
    expect(lastSent().text).toContain('Je ne suis pas sûr de ce total : vérifiez-le avant de valider.');
    expect(lastSent().text).toContain('Total proposé : 60 sac');
  });

  it('W6-6 : un fichier qui n’est pas une image → M18c, rien de compté', async () => {
    seedAgency();
    await send(inbound('IMAGE', { buffer: Buffer.from('<html>pas une photo</html>') }));
    expect(lastSent().text).toBe('Je ne peux pas lire ce fichier. Envoyez une photo (JPEG ou PNG) de moins de 10 Mo.');
    expect(mockDb.rows('stockFieldCapture')).toHaveLength(0);
    expect(usageThisMonth()).toBe(0);
    expect(openSession()!.state).toBe('READY');
  });

  it('la légende de la photo n’est transmise qu’au faux fournisseur', async () => {
    seedAgency();
    await send(photo('fake:item=CIM-45;total=60;conf=0.5'));
    expect(mockVisionCalls[0].fakeDirective).toBe('fake:item=CIM-45;total=60;conf=0.5');
    expect(mockVisionCalls[0].candidates.every((c: any) => !('quantity' in c) && !('value' in c))).toBe(true);
  });
});

describe('W9 — article non reconnu', () => {
  beforeEach(() => {
    mockVisionImpl = async request => mockVisionOk(request, { itemId: request.imposedItemId ?? null });
  });

  it('M19, puis « ciment » → nouvelle analyse de la même photo, M13, compteur inchangé', async () => {
    seedAgency();
    await send(photo());
    expect(lastSent().text).toBe(
      "Photo reçue, mais l'article n'est pas identifiable avec certitude. De quel matériau s'agit-il ? (Ex : Ciment, Fer 10, Parpaing)"
    );
    expect(openSession()!.state).toBe('AWAITING_ITEM');
    expect(usageThisMonth()).toBe(1);
    await send(text('ciment'));
    expect(mockVisionCalls).toHaveLength(2);
    expect(mockVisionCalls[1].imposedItemId).toBe('item-cim');
    expect(lastSent().text).toContain('Ciment CPJ 45 (CIM-45)');
    expect(openSession()!.state).toBe('AWAITING_CONFIRMATION');
    expect(usageThisMonth()).toBe(1);
    expect(mockDb.rows('stockFieldCapture')).toHaveLength(1);
    expect(mockDb.rows('stockFieldCapture')[0]).toMatchObject({ itemId: 'item-cim', itemImposed: true });
  });

  it('« fer » → liste de trois lignes ; le choix impose l’article', async () => {
    seedAgency();
    await send(photo());
    await send(text('fer'));
    expect(lastSent().kind).toBe('LIST');
    expect(lastSent().rows.map((r: any) => r.title)).toEqual(['Fer 10', 'Fer 12', 'Fer 8']);
    const fer10 = lastSent().rows[0];
    await send(inbound('REPLY', { replyId: fer10.id, replyTitle: 'Fer 10' }));
    expect(mockVisionCalls[1].imposedItemId).toBe('item-fer10');
    expect(openSession()!.state).toBe('AWAITING_CONFIRMATION');
  });

  it('« bois » sans correspondance → M21, état AWAITING_ITEM ; aucun article créé', async () => {
    seedAgency();
    await send(photo());
    const itemsBefore = mockDb.rows('stockItem').length;
    await send(text('bois'));
    expect(lastSent().text).toBe(
      'Je ne trouve pas « bois » parmi les articles de votre entreprise. Essayez un autre nom (ex. Ciment, Fer 10), ou tapez 0 pour annuler. Un article nouveau se crée dans ImmoTopia par le bureau.'
    );
    expect(openSession()!.state).toBe('AWAITING_ITEM');
    expect(mockDb.rows('stockItem')).toHaveLength(itemsBefore);
  });

  it('« 0 » → capture UNRECOGNIZED, READY', async () => {
    seedAgency();
    await send(photo());
    await send(text('0'));
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('UNRECOGNIZED');
    expect(openSession()!.state).toBe('READY');
  });

  it('correspondance : référence, mots contenus, distance d’édition ≤ 2', () => {
    const items = [
      { id: '1', reference: 'CIM-45', label: 'Ciment CPJ 45', unit: 'sac' },
      { id: '2', reference: 'FER-10', label: 'Fer 10', unit: 'barre' },
      { id: '3', reference: 'PAR-15', label: 'Parpaing 15', unit: 'bloc' }
    ];
    expect(matchItems(items, 'cim-45').map(i => i.id)).toEqual(['1']);
    expect(matchItems(items, 'Fer 10').map(i => i.id)).toEqual(['2']);
    expect(matchItems(items, 'parpain').map(i => i.id)).toEqual(['3']);
    expect(matchItems(items, 'cimant').map(i => i.id)).toEqual(['1']);
    expect(matchItems(items, 'bois')).toEqual([]);
  });
});

describe('W3 et W12 — accès relu en base à chaque message', () => {
  it('W3-7 : après révocation, une photo reçoit M06 ; aucune capture', async () => {
    seedAgency();
    mockDb.rows('stockWhatsappRegistration')[0].status = 'REVOKED';
    await send(photo());
    expect(lastSent().text).toBe(
      "Votre accès à l'inventaire par WhatsApp n'est plus actif. Contactez votre administrateur."
    );
    expect(mockDb.rows('stockFieldCapture')).toHaveLength(0);
  });

  it('W3-8 : rôle Chef de chantier retiré → M06 au message suivant, session fermée ACCESS_LOST', async () => {
    seedAgency();
    await send(photo());
    const roles = mockDb.rows('userRole');
    roles.splice(0, roles.length);
    await send(text('1'));
    expect(lastSent().text).toBe(
      "Votre accès à l'inventaire par WhatsApp n'est plus actif. Contactez votre administrateur."
    );
    expect(mockDb.rows('stockWhatsappSession')[0]).toMatchObject({ closeReason: 'ACCESS_LOST' });
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('EXPIRED');
    expect(mockDb.rows('stockCountLine')).toHaveLength(0);
  });

  it('W12-1 : agence suspendue pendant une proposition → « 1 » reçoit M06, aucune ligne écrite', async () => {
    seedAgency();
    await countByPhoto();
    await send(photo());
    mockDb.rows('tenant').find(t => t.id === TENANT)!.status = 'SUSPENDED';
    await send(text('1'));
    expect(lastSent().text).toContain("n'est plus actif");
    expect(mockDb.rows('stockCountLine')).toHaveLength(1);
    // Inventaire NON clos par la perte d'accès (W12-R1).
    expect(mockDb.rows('stockCount')[0].status).toBe('DRAFT');
  });

  it('W12-R2 : accès perdu entre la proposition et l’écriture, relu sous verrou → aucune écriture', async () => {
    seedAgency();
    await send(photo());
    mockDb.rows('membership')[0].status = 'DISABLED';
    await send(inbound('REPLY', { replyId: lastSent().buttons[0].id, replyTitle: 'Valider' }));
    expect(mockDb.rows('stockCountLine')).toHaveLength(0);
    expect(mockDb.rows('stockCount')).toHaveLength(0);
  });

  it('inscription révoquée pendant l’analyse → analyse terminée, quota consommé, aucune écriture, M06', async () => {
    seedAgency();
    mockVisionImpl = async request => {
      mockDb.rows('stockWhatsappRegistration')[0].status = 'REVOKED';
      return mockVisionOk(request);
    };
    await send(photo());
    expect(lastSent().text).toContain("n'est plus actif");
    expect(usageThisMonth()).toBe(1);
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('EXPIRED');
    expect(mockDb.rows('stockWhatsappSession')[0].closeReason).toBe('ACCESS_LOST');
  });
});

describe('W11 — quota et option (moteur)', () => {
  it('W11-4 : enforce sans option → M06b, aucune capture', async () => {
    seedAgency();
    mockEntitlements = entitlementsWith(0, 'enforce');
    await send(photo());
    expect(lastSent().text).toBe(
      "L'inventaire par WhatsApp n'est pas activé pour votre entreprise. Contactez votre administrateur."
    );
    expect(mockDb.rows('stockFieldCapture')).toHaveLength(0);
  });

  it('W11-2 / W11-5 : quota atteint → M07, photo non téléchargée, audit une fois par mois', async () => {
    seedAgency();
    mockEntitlements = entitlementsWith(1, 'enforce');
    await countByPhoto();
    clearSent();
    await send(photo());
    await send(photo());
    expect(sentTexts()[0]).toBe(
      'Le nombre de photos analysées ce mois-ci pour votre entreprise est atteint. Contactez votre administrateur. Le bureau peut saisir le comptage dans ImmoTopia.'
    );
    expect(mockDb.rows('stockFieldCapture')).toHaveLength(1);
    expect(usageThisMonth()).toBe(1);
    expect(mockAudit.filter(a => a.actionKey === 'STOCK_WHATSAPP_QUOTA_REACHED')).toHaveLength(1);
    expect(openSession()!.state).toBe('READY');
  });

  it('W11-5 : warn sans option, quota de secours 3 → la 4e photo reçoit M07', async () => {
    seedAgency();
    mockEntitlements = entitlementsWith(0, 'warn');
    const previous = env.WHATSAPP_INVENTORY_WARN_QUOTA;
    (env as any).WHATSAPP_INVENTORY_WARN_QUOTA = 3;
    try {
      for (let index = 0; index < 3; index += 1) await countByPhoto({ answer: '0' });
      clearSent();
      await send(photo());
      expect(sentTexts()[0]).toContain('Le nombre de photos analysées ce mois-ci');
      expect(usageThisMonth()).toBe(3);
    } finally {
      (env as any).WHATSAPP_INVENTORY_WARN_QUOTA = previous;
    }
  });
});

describe('W3 — activation par le code (moteur)', () => {
  const CODE = '482913';

  it('le code d’activation n’est jamais journalisé en clair : seul le type du message est gardé', async () => {
    seedAgency({ status: 'PENDING_ACTIVATION' });
    const registration = mockDb.rows('stockWhatsappRegistration')[0];
    registration.activationCodeHash = activationCodeHash(CODE, registration.id);
    registration.activationExpiresAt = new Date(Date.now() + 72 * 3600 * 1000);
    await send(text('111111'));
    await send(text('Code 482 913'));
    expect(registration.status).toBe('ACTIVE');
    const inboundRows = mockDb.rows('stockWhatsappMessage').filter(m => m.direction === 'INBOUND');
    expect(inboundRows.length).toBeGreaterThan(0);
    for (const row of inboundRows) expect(row).toMatchObject({ kind: 'TEXT', text: null });
    const journal = JSON.stringify(mockDb.rows('stockWhatsappMessage'));
    expect(journal).not.toContain('482');
    expect(journal).not.toContain('111111');
  });

  function seedPending() {
    seedAgency({ status: 'PENDING_ACTIVATION' });
    const registration = mockDb.rows('stockWhatsappRegistration')[0];
    registration.activationCodeHash = activationCodeHash(CODE, registration.id);
    registration.activationExpiresAt = new Date(Date.now() + 72 * 3600 * 1000);
    return registration;
  }

  it('M05 sans code ; M02 avec « Code 482 913 » ; empreinte effacée ; audit critique', async () => {
    const registration = seedPending();
    await send(photo());
    expect(lastSent().text).toBe(
      "Votre inscription n'est pas encore activée. Envoyez d'abord le code à 6 chiffres donné par votre administrateur."
    );
    await send(text('Code 482 913'));
    expect(registration).toMatchObject({ status: 'ACTIVE', activationCodeHash: null });
    expect(registration.activatedAt).toBeInstanceOf(Date);
    expect(lastSent().text).toContain('Bienvenue Awa.');
    expect(lastSent().text).toContain('BTP Awa');
    expect(mockAudit.find(a => a.actionKey === 'STOCK_WHATSAPP_REGISTRATION_ACTIVATED')).toMatchObject({
      critical: true,
      tenantId: TENANT,
      actorUserId: CHEF
    });
    expect(mockDb.rows('stockWhatsappSession')).toHaveLength(0);
  });

  it('W3-5 : cinq mauvais codes → M03 (4, 3, 2, 1) puis M04 ; le bon code ensuite → M04', async () => {
    const registration = seedPending();
    for (let index = 0; index < 5; index += 1) await send(text('111111'));
    expect(sentTexts()).toEqual([
      'Code incorrect. Il vous reste 4 essai(s). Vérifiez le code donné par votre administrateur.',
      'Code incorrect. Il vous reste 3 essai(s). Vérifiez le code donné par votre administrateur.',
      'Code incorrect. Il vous reste 2 essai(s). Vérifiez le code donné par votre administrateur.',
      'Code incorrect. Il vous reste 1 essai(s). Vérifiez le code donné par votre administrateur.',
      "Ce code n'est plus valable. Demandez un nouveau code à votre administrateur."
    ]);
    await send(text(CODE));
    expect(lastSent().text).toBe("Ce code n'est plus valable. Demandez un nouveau code à votre administrateur.");
    expect(registration.status).toBe('PENDING_ACTIVATION');
    expect(mockAudit.filter(a => a.actionKey === 'STOCK_WHATSAPP_ACTIVATION_LOCKED')).toHaveLength(1);
  });

  it('code échu (72 h) → M04, verrouillé et audité une fois', async () => {
    const registration = seedPending();
    registration.activationExpiresAt = new Date(Date.now() - 1000);
    await send(text(CODE));
    await send(text(CODE));
    expect(sentTexts()).toHaveLength(2);
    expect(registration.status).toBe('PENDING_ACTIVATION');
    expect(mockAudit.filter(a => a.actionKey === 'STOCK_WHATSAPP_ACTIVATION_LOCKED')).toHaveLength(1);
  });

  it('W3-6 : le bon code depuis un autre numéro → M01, inscription toujours en attente', async () => {
    const registration = seedPending();
    await send(text(CODE, '+2250799999999'));
    expect(lastSent().text).toBe(
      "Bonjour. Ce numéro n'est pas associé à un compte Chef de chantier ImmoTopia. Contactez votre administrateur."
    );
    expect(lastSent()).toBeDefined();
    expect(mockSent[mockSent.length - 1].log).toBeNull();
    expect(registration.status).toBe('PENDING_ACTIVATION');
  });

  it('W7-1 : trois messages d’un inconnu → une seule réponse M01 (simulateur)', async () => {
    seedAgency();
    for (let index = 0; index < 3; index += 1) await send(text('Bonjour', '+2250100000999'));
    expect(mockSent).toHaveLength(1);
    expect(mockDb.rows('stockWhatsappMessage')).toHaveLength(0);
  });
});

describe('journal et données personnelles', () => {
  it('chaque message entrant est journalisé sans numéro ; aucun journal technique ne contient le numéro', async () => {
    seedAgency();
    await countByPhoto();
    await send(text('FIN'));
    const inboundRows = mockDb.rows('stockWhatsappMessage').filter(m => m.direction === 'INBOUND');
    expect(inboundRows.map(m => m.kind)).toEqual(['IMAGE', 'TEXT', 'TEXT']);
    expect(JSON.stringify(mockDb.rows('stockWhatsappMessage'))).not.toContain('0712345678');
    const { logger } = jest.requireMock('../../src/utils/logger');
    const logged = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls]);
    expect(logged).not.toContain('0712345678');
    expect(JSON.stringify(mockAudit)).not.toContain('0712345678');
  });

  it('les messages sortent dans la langue du chef (en) et les commandes françaises restent comprises', async () => {
    seedAgency();
    mockDb.rows('user').find(u => u.id === CHEF)!.preferredLanguage = 'en';
    await send(text('Bonjour'));
    await send(text('aide'));
    expect(lastSent().text).toBeTruthy();
    // Sans catalogue anglais pour ces clés (intégration), le texte retombe sur le français : la clé est le texte.
    expect(lastSent().text).toContain('FIN');
  });
});

describe('commandes et nombres (commands.ts)', () => {
  it('commandes françaises et anglaises', () => {
    expect(parseCommand(' Fin ')).toBe('FIN');
    expect(parseCommand('end')).toBe('FIN');
    expect(parseCommand('Aide')).toBe('AIDE');
    expect(parseCommand('HELP')).toBe('AIDE');
    expect(parseCommand('chantier')).toBe('CHANTIER');
    expect(parseCommand('site')).toBe('CHANTIER');
    expect(parseCommand('fin du chantier')).toBeNull();
  });

  it('réponses à une proposition', () => {
    expect(parseQuantityAnswer('1')).toEqual({ kind: 'ACCEPT' });
    expect(parseQuantityAnswer('0')).toEqual({ kind: 'CANCEL' });
    expect(parseQuantityAnswer('84')).toEqual({ kind: 'NUMBER', value: 84 });
    expect(parseQuantityAnswer('84,5')).toEqual({ kind: 'NUMBER', value: 84.5 });
    expect(parseQuantityAnswer('84.25 sacs')).toEqual({ kind: 'NUMBER', value: 84.25 });
    expect(parseQuantityAnswer('84 sacs')).toEqual({ kind: 'NUMBER', value: 84 });
    expect(parseQuantityAnswer('1 sac')).toEqual({ kind: 'NUMBER', value: 1 });
    expect(parseQuantityAnswer('1000000')).toEqual({ kind: 'NUMBER', value: 1_000_000 });
    expect(parseQuantityAnswer('1000001')).toBeNull();
    expect(parseQuantityAnswer('84,12345')).toBeNull();
    expect(parseQuantityAnswer('-3')).toBeNull();
    expect(parseQuantityAnswer('oui')).toBeNull();
    expect(parseQuantityAnswer('1 000')).toBeNull();
  });

  it('chiffres d’activation', () => {
    expect(extractActivationDigits('482 913')).toBe('482913');
    expect(extractActivationDigits('Code 482913')).toBe('482913');
    expect(extractActivationDigits('Bonjour')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Constats de relecture du lot 041 (moteur et quota)
// ---------------------------------------------------------------------------

const M22_TEXT =
  "Désolé, je n'arrive pas à analyser cette photo pour le moment. Elle est conservée. Réessayez dans quelques minutes, ou prévenez le bureau.";
const M07_TEXT =
  'Le nombre de photos analysées ce mois-ci pour votre entreprise est atteint. Contactez votre administrateur. Le bureau peut saisir le comptage dans ImmoTopia.';

function insertCapture(data: Record<string, unknown>): MockRow {
  return mockDb.insert('stockFieldCapture', {
    tenantId: TENANT,
    registrationId: 'reg-chef',
    sessionId: 'session-ancienne',
    userId: CHEF,
    via: 'SIMULATOR',
    mimeType: 'image/jpeg',
    sizeBytes: 10,
    sha256: 'a'.repeat(64),
    fileUrl: '/uploads/stock-whatsapp/tenant-a/2026/x.jpg',
    receivedAt: new Date(),
    analyzedAt: null,
    failureReason: null,
    quotaCounted: false,
    ...data
  });
}

describe('analyse interrompue (try/finally) et analyse bloquée (minuterie)', () => {
  it('exception de l’IA → capture FAILED, place rendue, READY, M22', async () => {
    seedAgency();
    mockVisionImpl = async () => {
      throw new Error('panne inattendue');
    };
    await send(photo());
    expect(mockDb.rows('stockFieldCapture')[0]).toMatchObject({ outcome: 'FAILED', quotaCounted: false });
    expect(usageThisMonth()).toBe(0);
    expect(openSession()).toMatchObject({ state: 'READY', pendingCaptureId: null });
    expect(lastSent().text).toBe(M22_TEXT);
    // La photo suivante repart normalement.
    mockVisionImpl = async request => mockVisionOk(request);
    await send(photo());
    expect(openSession()!.state).toBe('AWAITING_CONFIRMATION');
  });

  it('exception pendant une nouvelle analyse (article imposé) → FAILED, place de la 1re analyse gardée, M22', async () => {
    seedAgency();
    mockVisionImpl = async request => mockVisionOk(request, { itemId: null });
    await send(photo());
    expect(openSession()!.state).toBe('AWAITING_ITEM');
    mockVisionImpl = async () => {
      throw new Error('panne inattendue');
    };
    await send(text('ciment'));
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('FAILED');
    expect(usageThisMonth()).toBe(1);
    expect(openSession()!.state).toBe('READY');
    expect(lastSent().text).toBe(M22_TEXT);
  });

  function stuckSession(options: { ageMs: number; analyzedAt?: Date | null }) {
    const session = openSession()!;
    const now = new Date();
    const capture = insertCapture({
      id: 'cap-bloquee',
      sessionId: session.id,
      outcome: 'PENDING',
      quotaCounted: true,
      analyzedAt: options.analyzedAt ?? null,
      updatedAt: new Date(now.getTime() - options.ageMs)
    });
    Object.assign(session, {
      state: 'ANALYZING',
      pendingCaptureId: capture.id,
      updatedAt: new Date(now.getTime() - options.ageMs)
    });
    mockDb.insert('stockWhatsappUsage', { tenantId: TENANT, month: now.toISOString().slice(0, 7), used: 1 });
    return { session, capture, now };
  }

  it('session ANALYZING sans mise à jour depuis le délai de l’IA + 60 s → FAILED, quota rendu, READY, M22', async () => {
    seedAgency();
    await send(text('Bonjour'));
    const { session, capture, now } = stuckSession({ ageMs: env.STOCK_VISION_TIMEOUT_MS + 61_000 });
    clearSent();
    await runSessionTimers({ now });
    expect(session).toMatchObject({ state: 'READY', pendingCaptureId: null });
    expect(session.closedAt ?? null).toBeNull();
    expect(capture).toMatchObject({ outcome: 'FAILED', quotaCounted: false });
    expect(usageThisMonth()).toBe(0);
    expect(sentTexts()).toEqual([M22_TEXT]);
  });

  it('analyse en cours depuis moins que le délai + 60 s : la minuterie n’y touche pas', async () => {
    seedAgency();
    await send(text('Bonjour'));
    const { session, capture, now } = stuckSession({ ageMs: 30_000 });
    clearSent();
    await runSessionTimers({ now });
    expect(session.state).toBe('ANALYZING');
    expect(capture.outcome).toBe('PENDING');
    expect(usageThisMonth()).toBe(1);
    expect(mockSent).toHaveLength(0);
  });

  it('nouvelle analyse bloquée (capture déjà analysée une fois) : FAILED, la place n’est pas rendue', async () => {
    seedAgency();
    await send(text('Bonjour'));
    const { capture, now } = stuckSession({
      ageMs: env.STOCK_VISION_TIMEOUT_MS + 61_000,
      analyzedAt: new Date(Date.now() - 600_000)
    });
    await runSessionTimers({ now });
    expect(capture).toMatchObject({ outcome: 'FAILED', quotaCounted: true });
    expect(usageThisMonth()).toBe(1);
  });
});

describe('courses de la minuterie avec un message frais', () => {
  it('expiration : un message arrivé entre la lecture et le verrou → rien n’est fermé', async () => {
    seedAgency();
    await send(photo());
    const session = openSession()!;
    const now = new Date();
    session.lastInboundAt = new Date(now.getTime() - 31 * 60 * 1000);
    mockLockHooks.push(() => {
      session.lastInboundAt = now;
    });
    clearSent();
    await runSessionTimers({ now });
    expect(session.closedAt).toBeUndefined();
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('PENDING');
    expect(mockSent).toHaveLength(0);
  });

  it('expiration sans message frais → fermée TIMEOUT, M24', async () => {
    seedAgency();
    await send(photo());
    const session = openSession()!;
    const now = new Date();
    session.lastInboundAt = new Date(now.getTime() - 31 * 60 * 1000);
    await runSessionTimers({ now });
    expect(session.closeReason).toBe('TIMEOUT');
    expect(lastSent().text).toContain('Session terminée après 30 minutes sans réponse.');
  });

  it('accès perdu : un message arrivé entre la lecture et le verrou → la minuterie ne ferme pas', async () => {
    seedAgency();
    await send(photo());
    const session = openSession()!;
    const now = new Date();
    session.lastInboundAt = new Date(now.getTime() - 11 * 60 * 1000);
    mockDb.rows('stockWhatsappRegistration')[0].status = 'REVOKED';
    mockLockHooks.push(() => {
      session.lastInboundAt = now;
    });
    await runSessionTimers({ now });
    expect(session.closedAt).toBeUndefined();
  });

  it('accès perdu sans message frais → fermée ACCESS_LOST, sans message', async () => {
    seedAgency();
    await send(photo());
    const session = openSession()!;
    const now = new Date();
    session.lastInboundAt = new Date(now.getTime() - 11 * 60 * 1000);
    mockDb.rows('stockWhatsappRegistration')[0].status = 'REVOKED';
    clearSent();
    await runSessionTimers({ now });
    expect(session.closeReason).toBe('ACCESS_LOST');
    expect(mockSent).toHaveLength(0);
  });
});

describe('AIDE et choix du chantier', () => {
  it('AIDE en premier message avec trois chantiers → M26 puis M08', async () => {
    seedAgency({ siteCount: 3 });
    await send(text('aide'));
    expect(sentTexts()[0]).toContain('Inventaire par photo :');
    expect(lastSent().kind).toBe('BUTTONS');
    expect(lastSent().buttons).toHaveLength(3);
    expect(openSession()!.state).toBe('AWAITING_SITE');
  });

  it('chantier perdu (M32) puis AIDE → M32, M26, M08', async () => {
    seedAgency({ siteCount: 3 });
    await send(text('Bonjour'));
    await send(inbound('REPLY', { replyId: 'site:site-1', replyTitle: 'Cocody' }));
    mockDb.rows('constructionSite').find(s => s.id === 'site-1')!.status = 'CLOSED';
    clearSent();
    await send(text('AIDE'));
    expect(sentTexts()[0]).toBe("Le chantier « Cocody » n'est plus ouvert au comptage par WhatsApp.");
    expect(sentTexts()[1]).toContain('Inventaire par photo :');
    expect(lastSent().kind).toBe('BUTTONS');
    expect(lastSent().buttons.map((b: any) => b.title)).toEqual(['Bingerville', 'Yopougon']);
  });

  it('photo gardée alors que la question n’a jamais été posée dans la session → M08', async () => {
    seedAgency({ siteCount: 2 });
    await send(text('Bonjour'));
    clearSent();
    await send(photo());
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('RECEIVED');
    expect(lastSent().kind).toBe('BUTTONS');
  });

  it('photo gardée, question déjà posée (journal) → aucune réponse en double', async () => {
    seedAgency({ siteCount: 2 });
    await send(text('Bonjour'));
    mockDb.insert('stockWhatsappMessage', {
      tenantId: TENANT,
      registrationId: 'reg-chef',
      sessionId: openSession()!.id,
      direction: 'OUTBOUND',
      kind: 'BUTTONS',
      text: 'Sur quel chantier êtes-vous ?'
    });
    clearSent();
    await send(photo());
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('RECEIVED');
    expect(mockSent).toHaveLength(0);
  });

  it('premier message vocal : M28 puis M10 (un chantier) ou M08 (plusieurs)', async () => {
    seedAgency({ siteCount: 1 });
    await send(inbound('UNSUPPORTED', { originalType: 'audio' }));
    expect(sentTexts()).toEqual([
      'Je lis seulement les photos et les messages écrits. Envoyez une photo de votre stock, ou tapez AIDE.',
      'Chantier « Cocody ». Envoyez la photo du premier article.'
    ]);
    resetWorld();
    seedAgency({ siteCount: 2 });
    await send(inbound('UNSUPPORTED', { originalType: 'audio' }));
    expect(sentTexts()[0]).toContain('Je lis seulement les photos');
    expect(lastSent().kind).toBe('BUTTONS');
  });
});

describe('titres de boutons et de listes', () => {
  it('deux noms identiques une fois coupés à 20 caractères → liste aux titres distincts', () => {
    const message = botMessages.chooseSite([
      { siteId: 'a', name: 'Résidence Les Palmiers A' },
      { siteId: 'b', name: 'Résidence Les Palmiers B' }
    ]) as any;
    expect(message.kind).toBe('LIST');
    const titles = message.rows.map((row: any) => row.title);
    expect(new Set(titles).size).toBe(2);
    for (const title of titles) expect(Array.from(title as string).length).toBeLessThanOrEqual(24);
  });

  it('noms identiques même à 24 caractères → suffixe distinctif, nom complet en description', () => {
    const names = ['Immeuble administratif du centre-ville 1', 'Immeuble administratif du centre-ville 2'];
    const message = botMessages.chooseSite(names.map((name, index) => ({ siteId: `s${index}`, name }))) as any;
    expect(message.kind).toBe('LIST');
    const titles = message.rows.map((row: any) => row.title);
    expect(new Set(titles).size).toBe(2);
    expect(titles[1]).toMatch(/\(2\)$/);
    for (const title of titles) expect(Array.from(title as string).length).toBeLessThanOrEqual(24);
    expect(message.rows.map((row: any) => row.description)).toEqual(names);
  });

  it('noms courts et distincts → boutons inchangés', () => {
    const message = botMessages.chooseSite([
      { siteId: 'a', name: 'Cocody' },
      { siteId: 'b', name: 'Yopougon' }
    ]) as any;
    expect(message.kind).toBe('BUTTONS');
    expect(message.buttons.map((b: any) => b.title)).toEqual(['Cocody', 'Yopougon']);
  });

  it('M20 : deux articles au même libellé → titres distincts', () => {
    const message = botMessages.severalItems('cap', [
      { id: 'i1', label: 'Ciment', reference: 'CIM-1', unit: 'sac' },
      { id: 'i2', label: 'Ciment', reference: 'CIM-2', unit: 'sac' }
    ]) as any;
    expect(message.rows.map((row: any) => row.title)).toEqual(['Ciment', 'Ciment (2)']);
  });
});

describe('premières confirmations simultanées (index un inventaire ouvert par lieu)', () => {
  const bridge = jest.requireMock('../../src/lib/stock-whatsapp/lot040-bridge');
  const { AppError, ErrorCode } = jest.requireActual('../../src/middleware/error-middleware');
  let original: any;
  beforeEach(() => {
    original = bridge.createStockCountTx;
  });
  afterEach(() => {
    bridge.createStockCountTx = original;
  });

  function countOpenedMeanwhile(status: 'DRAFT' | 'COUNTED', error: () => Error) {
    bridge.createStockCountTx = async () => {
      bridge.createStockCountTx = original;
      // Ouvert par une autre transaction, validée pendant que celle-ci échoue.
      mockLockHooks.push(() =>
        mockDb.insert('stockCount', {
          id: 'count-concurrent',
          tenantId: TENANT,
          locationId: 'loc-site-1',
          status,
          source: 'WEB',
          createdByUserId: MAGASINIER,
          counterUserIds: []
        })
      );
      throw error();
    };
  }

  it('P2002 : retentée une fois, le DRAFT ouvert entre-temps est réutilisé, M14', async () => {
    seedAgency();
    await send(photo());
    countOpenedMeanwhile('DRAFT', () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    await send(text('1'));
    const lines = mockDb.rows('stockCountLine');
    expect(lines).toHaveLength(1);
    expect(lines[0].countId).toBe('count-concurrent');
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('ACCEPTED');
    expect(lastSent().text).toContain('Enregistré : 84 sac de Ciment CPJ 45.');
  });

  it('409 STOCK_COUNT_ALREADY_OPEN dû à un DRAFT : même réutilisation', async () => {
    seedAgency();
    await send(photo());
    countOpenedMeanwhile('DRAFT', () => new AppError('Refus', 409, ErrorCode.STOCK_COUNT_ALREADY_OPEN));
    await send(text('1'));
    expect(mockDb.rows('stockCountLine')[0].countId).toBe('count-concurrent');
    expect(lastSent().text).toContain('Enregistré :');
  });

  it('inventaire bloquant COUNTED → M29, capture CANCELLED, aucune ligne', async () => {
    seedAgency();
    await send(photo());
    countOpenedMeanwhile('COUNTED', () => new AppError('Refus', 409, ErrorCode.STOCK_COUNT_ALREADY_OPEN));
    await send(text('1'));
    expect(mockDb.rows('stockCountLine')).toHaveLength(0);
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('CANCELLED');
    expect(lastSent().text).toContain('Un inventaire de ce chantier attend sa validation au bureau.');
  });
});

describe('défense en profondeur : agence attendue (simulateur)', () => {
  it('inscription d’une autre agence que l’appelant → abandon sans réponse ni journal', async () => {
    seedAgency();
    await handleInboundMessage(text('Bonjour') as any, { expectedTenantId: OTHER_TENANT });
    expect(mockSent).toHaveLength(0);
    expect(mockDb.rows('stockWhatsappMessage')).toHaveLength(0);
    expect(mockDb.rows('stockWhatsappSession')).toHaveLength(0);
    const { logger } = jest.requireMock('../../src/utils/logger');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('0712345678');
  });

  it('même agence → traitement normal ; sans option → inchangé', async () => {
    seedAgency();
    await handleInboundMessage(text('Bonjour') as any, { expectedTenantId: TENANT });
    expect(lastSent().text).toBe('Chantier « Cocody ». Envoyez la photo du premier article.');
    await handleInboundMessage(text('aide') as any);
    expect(lastSent().text).toContain('Inventaire par photo :');
  });
});

describe('plafond des appels à l’IA', () => {
  it('5 analyses en échec dans l’heure → M22 sans appel à l’IA ni quota', async () => {
    seedAgency();
    for (let index = 0; index < 5; index += 1) {
      insertCapture({ outcome: 'FAILED', failureReason: 'INVALID_OUTPUT', receivedAt: new Date(Date.now() - 600_000) });
    }
    await send(text('Bonjour'));
    clearSent();
    await send(photo());
    expect(mockVisionCalls).toHaveLength(0);
    expect(usageThisMonth()).toBe(0);
    expect(sentTexts()).toEqual([M22_TEXT]);
    expect(openSession()!.state).toBe('READY');
  });

  it('4 échecs dans l’heure, ou 5 plus anciens → l’analyse part', async () => {
    seedAgency();
    for (let index = 0; index < 4; index += 1) insertCapture({ outcome: 'FAILED' });
    insertCapture({ outcome: 'FAILED', receivedAt: new Date(Date.now() - 2 * 3600_000) });
    await send(photo());
    expect(mockVisionCalls).toHaveLength(1);
  });

  it('appels du mois ≥ 2 × le quota → M07 sans appel à l’IA', async () => {
    seedAgency();
    mockEntitlements = entitlementsWith(3);
    for (let index = 0; index < 6; index += 1) insertCapture({ outcome: 'FAILED', analyzedAt: new Date() });
    // Échecs d'une autre inscription : seul le plafond mensuel de l'agence joue.
    for (const row of mockDb.rows('stockFieldCapture')) row.registrationId = 'reg-autre';
    await send(photo());
    expect(mockVisionCalls).toHaveLength(0);
    expect(lastSent().text).toBe(M07_TEXT);
  });

  it('checkWhatsappAnalysisBudget : un fournisseur désactivé ne compte pas comme un appel', async () => {
    seedAgency();
    for (let index = 0; index < 6; index += 1) {
      insertCapture({
        outcome: 'FAILED',
        analyzedAt: new Date(),
        failureReason: 'DISABLED',
        registrationId: 'reg-autre'
      });
    }
    await expect(
      checkWhatsappAnalysisBudget({ tenantId: TENANT, registrationId: 'reg-chef', limit: 3 })
    ).resolves.toEqual({ ok: true });
    insertCapture({ outcome: 'ACCEPTED', analyzedAt: new Date(), registrationId: 'reg-autre' });
    for (let index = 0; index < 5; index += 1) insertCapture({ outcome: 'ACCEPTED', analyzedAt: new Date() });
    await expect(
      checkWhatsappAnalysisBudget({ tenantId: TENANT, registrationId: 'reg-chef', limit: 3 })
    ).resolves.toEqual({ ok: false, reason: 'MONTHLY_CALLS' });
    await expect(
      checkWhatsappAnalysisBudget({ tenantId: OTHER_TENANT, registrationId: 'reg-chef', limit: 3 })
    ).resolves.toEqual({ ok: true });
  });
});

describe('corrections mineures du moteur', () => {
  it('inscription révoquée : M06, message entrant journalisé sans son texte', async () => {
    seedAgency();
    mockDb.rows('stockWhatsappRegistration')[0].status = 'REVOKED';
    await send(text('texte confidentiel du chef'));
    expect(lastSent().text).toContain("Votre accès à l'inventaire par WhatsApp n'est plus actif.");
    const inboundRows = mockDb.rows('stockWhatsappMessage').filter(m => m.direction === 'INBOUND');
    expect(inboundRows).toHaveLength(1);
    expect(inboundRows[0]).toMatchObject({ kind: 'TEXT', text: null });
    expect(JSON.stringify(mockDb.rows('stockWhatsappMessage'))).not.toContain('confidentiel');
  });

  it('chantier perdu : W5-R5 appliquée à l’inventaire du bot avant de l’oublier (M32, M25, M10)', async () => {
    seedAgency({ siteCount: 2 });
    await send(text('Bonjour'));
    await send(inbound('REPLY', { replyId: 'site:site-1', replyTitle: 'Cocody' }));
    await countByPhoto();
    const count = mockDb.rows('stockCount')[0];
    expect(count).toMatchObject({ status: 'DRAFT', source: 'WHATSAPP' });
    mockDb.rows('constructionSite').find(s => s.id === 'site-1')!.status = 'CLOSED';
    clearSent();
    await send(text('Bonjour'));
    expect(count.status).toBe('COUNTED');
    expect(sentTexts()).toEqual([
      "Le chantier « Cocody » n'est plus ouvert au comptage par WhatsApp.",
      "Merci. L'inventaire de « Cocody » est transmis au bureau : 1 article(s) compté(s). Le bureau le vérifiera et le validera.",
      'Chantier « Yopougon ». Envoyez la photo du premier article.'
    ]);
    expect(openSession()).toMatchObject({ siteId: 'site-2', countId: null });
  });

  it('lieu désactivé entre la proposition et l’écriture → M32 et nouveau choix, capture CANCELLED', async () => {
    seedAgency({ siteCount: 2 });
    await send(text('Bonjour'));
    await send(inbound('REPLY', { replyId: 'site:site-1', replyTitle: 'Cocody' }));
    await send(photo());
    clearSent();
    // Verrou 1 : ouverture de session (lieu encore actif) ; verrou 2 : confirmation.
    mockLockHooks.push(undefined, () => {
      mockDb.rows('stockLocation').find(l => l.id === 'loc-site-1')!.isActive = false;
    });
    await send(text('1'));
    expect(mockDb.rows('stockCountLine')).toHaveLength(0);
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('CANCELLED');
    expect(sentTexts()).toEqual([
      "Le chantier « Cocody » n'est plus ouvert au comptage par WhatsApp.",
      'Chantier « Yopougon ». Envoyez la photo du premier article.'
    ]);
    expect(openSession()).toMatchObject({ siteId: 'site-2', state: 'READY' });
  });

  it('fusion : le mode CORRECTED décidé avant M30 est gardé (« 84 » tapé pour 84 proposés)', async () => {
    seedAgency();
    await countByPhoto({ total: 40 });
    mockVisionImpl = async request => mockVisionOk(request);
    await send(photo());
    await send(text('84'));
    expect(openSession()!.state).toBe('AWAITING_MERGE');
    await send(text('2'));
    expect(mockDb.rows('stockFieldCapture')[1]).toMatchObject({ outcome: 'CORRECTED', mergeMode: 'REPLACE' });
    expect(lastSent().text).toContain('(quantité corrigée)');
  });

  it('panne Meta passagère (HTTP, délai, introuvable) → M22, place rendue ; fichier trop lourd → M18c', async () => {
    seedAgency();
    for (const reason of ['HTTP', 'TIMEOUT', 'NOT_FOUND'] as const) {
      mockMediaFailure = new MediaFetchError(reason, 'panne');
      await send(photo());
      expect(lastSent().text).toBe(M22_TEXT);
    }
    mockMediaFailure = new MediaFetchError('TOO_LARGE', 'trop lourd');
    await send(photo());
    expect(lastSent().text).toBe('Je ne peux pas lire ce fichier. Envoyez une photo (JPEG ou PNG) de moins de 10 Mo.');
    expect(usageThisMonth()).toBe(0);
    expect(mockDb.rows('stockFieldCapture')).toHaveLength(0);
    expect(openSession()!.state).toBe('READY');
  });

  it('lastInboundAt ne recule jamais (message traité en retard)', async () => {
    seedAgency();
    const recent = new Date();
    await send(inbound('TEXT', { text: 'Bonjour', receivedAt: recent }));
    await send(inbound('TEXT', { text: 'il fait chaud', receivedAt: new Date(recent.getTime() - 5 * 60 * 1000) }));
    expect(openSession()!.lastInboundAt.getTime()).toBe(recent.getTime());
    expect(mockDb.rows('stockWhatsappRegistration')[0].lastInboundAt.getTime()).toBe(recent.getTime());
  });

  it('chiffres arabes orientaux acceptés dans les nombres', () => {
    expect(parseQuantityAnswer('٨٤')).toEqual({ kind: 'NUMBER', value: 84 });
    expect(parseQuantityAnswer('٨٤٫٥')).toEqual({ kind: 'NUMBER', value: 84.5 });
    expect(parseQuantityAnswer('٨٤,٢٥ كيس')).toEqual({ kind: 'NUMBER', value: 84.25 });
    expect(parseQuantityAnswer('١')).toEqual({ kind: 'ACCEPT' });
    expect(parseQuantityAnswer('۸۴')).toEqual({ kind: 'NUMBER', value: 84 });
    expect(isZero('٠')).toBe(true);
    expect(parseMergeAnswer('٢')).toBe('REPLACE');
    expect(extractActivationDigits('٤٨٢ ٩١٣')).toBe('482913');
  });

  it('une réponse « ٨٤ » à une proposition corrige la quantité (M15)', async () => {
    seedAgency();
    await send(photo());
    await send(text('٨٤'));
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('CORRECTED');
    expect(lastSent().text).toContain('(quantité corrigée)');
  });
});
