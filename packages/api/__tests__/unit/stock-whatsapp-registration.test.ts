/**
 * Inscriptions des chefs de chantier (lot 041, spec W3 : R2, R4 à R10 côté
 * service) : éligibilité lue en base, unicité du numéro sur toute la
 * plateforme, code haché rendu une seule fois, essais, régénération,
 * révocation, vues du contrat. Base en mémoire ; aucun réseau.
 */
import {
  createRegistration,
  getRegistration,
  listEligibleMembers,
  listEligibleSites,
  listRegistrations,
  regenerateActivationCode,
  revokeRegistration,
  updateRegistrationSites
} from '../../src/lib/stock-whatsapp/registrations/service';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import {
  ACTIVATION_MAX_ATTEMPTS,
  activationCodeHash,
  handlePendingRegistrationMessage,
  type PendingRegistration
} from '../../src/lib/stock-whatsapp/registrations/activation';

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
  let mockTxQueue: Promise<void> = Promise.resolve();
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

  /**
   * Index uniques partiels des inscriptions (`WHERE status <> 'REVOKED'`) : la
   * base réelle lève un P2002 qui nomme l'index ; le service s'y fie (W3-R4).
   */
  function violatedPartialIndex(model: string, candidate: MockRow): string | null {
    if (model !== 'stockWhatsappRegistration' || candidate.status === 'REVOKED') return null;
    const live = table(model).filter(existing => existing !== candidate && existing.status !== 'REVOKED');
    if (live.some(existing => existing.tenantId === candidate.tenantId && existing.userId === candidate.userId)) {
      return 'stock_whatsapp_registrations_one_live_member';
    }
    if (live.some(existing => existing.phoneE164 === candidate.phoneE164)) {
      return 'stock_whatsapp_registrations_one_live_phone';
    }
    return null;
  }

  function create(model: string, data: any): MockRow {
    const row: MockRow = { id: data.id ?? `${model}-${++seq}`, createdAt: new Date(), updatedAt: new Date() };
    applyData(row, data);
    const partialIndex = violatedPartialIndex(model, row);
    if (partialIndex) {
      throw new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on ${partialIndex}`, {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: partialIndex }
      });
    }
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
            // Transactions interactives exécutées l'une après l'autre : la base
            // réelle sérialise par le verrou de ligne que pose la mise à jour
            // (réservation d'un essai d'activation, W3-R7).
            const previous = mockTxQueue;
            let release!: () => void;
            mockTxQueue = new Promise<void>(resolve => (release = resolve));
            await previous;
            const snapshot = structuredClone(store);
            try {
              return await arg(client);
            } catch (error) {
              store = snapshot;
              throw error;
            } finally {
              release();
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

const ADMIN = 'user-admin';
const MOUSSA = 'user-moussa';

/** Agence A sans inscription : Awa est chef, Moussa simple agent ; un chantier d'une autre agence. */
function seedWithoutRegistration() {
  seedAgency({ siteCount: 2 });
  mockDb.rows('stockWhatsappRegistration').splice(0);
  mockDb.rows('stockWhatsappRegistrationSite').splice(0);
  addSite('site-clos', 'Ancien chantier', { status: 'CLOSED' });
  addSite('site-sans-stock', 'Chantier sans stock', { stockEnabled: false });
  mockDb.insert('constructionSite', {
    id: 'site-b',
    tenantId: OTHER_TENANT,
    name: 'Chantier B',
    status: 'IN_PROGRESS',
    stockEnabledAt: new Date()
  });
  mockDb.insert('user', { id: MOUSSA, email: 'moussa@test.ci', fullName: 'Moussa', isActive: true });
  mockDb.insert('membership', { userId: MOUSSA, tenantId: TENANT, status: 'ACTIVE' });
  mockDb.insert('role', { id: 'role-agent', key: 'TENANT_AGENT', name: 'Tenant Agent', scope: 'TENANT' });
  mockDb.insert('userRole', { userId: MOUSSA, roleId: 'role-agent', tenantId: TENANT });
  // Un chef de l'agence B, pour l'unicité du numéro sur toute la plateforme.
  mockDb.insert('user', { id: 'user-chef-b', email: 'chefb@test.ci', fullName: 'Chef B', isActive: true });
  mockDb.insert('membership', { userId: 'user-chef-b', tenantId: OTHER_TENANT, status: 'ACTIVE' });
  mockDb.insert('userRole', { userId: 'user-chef-b', roleId: ROLE_ID, tenantId: OTHER_TENANT });
  mockDb.insert('stockLocation', {
    id: 'loc-site-b',
    tenantId: OTHER_TENANT,
    kind: 'SITE',
    label: 'B',
    siteId: 'site-b',
    isActive: true
  });
  mockDb.insert('constructionSite', {
    id: 'site-b2',
    tenantId: OTHER_TENANT,
    name: 'Chantier B2',
    status: 'IN_PROGRESS',
    stockEnabledAt: new Date()
  });
  mockDb.insert('stockLocation', {
    id: 'loc-site-b2',
    tenantId: OTHER_TENANT,
    kind: 'SITE',
    label: 'B2',
    siteId: 'site-b2',
    isActive: true
  });
}

async function rejection(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Une erreur était attendue.');
}

function createAwa(phone = '07 12 34 56 78', siteIds = ['site-1']) {
  return createRegistration(TENANT, ADMIN, { userId: CHEF, phone, siteIds });
}

beforeEach(() => {
  resetWorld();
  seedWithoutRegistration();
});

describe('W3 — inscription d’un chef', () => {
  it('W3-1 : numéro stocké en E.164, code de 6 chiffres rendu une fois, jamais stocké en clair', async () => {
    const created = await createAwa();
    expect(created.phoneE164).toBe('+2250712345678');
    expect(created.phoneMasked).toBe('+225 07 •• •• •• 78');
    expect(created.activationCode).toMatch(/^\d{6}$/);
    expect(created.status).toBe('PENDING_ACTIVATION');
    expect(created.activationAttemptsLeft).toBe(5);
    expect(created.sites.map(site => site.siteId)).toEqual(['site-1']);
    const row = mockDb.rows('stockWhatsappRegistration')[0];
    expect(JSON.stringify(row)).not.toContain(created.activationCode);
    expect(row.activationCodeHash).toBe(activationCodeHash(created.activationCode, row.id));
    const validity = row.activationExpiresAt.getTime() - Date.now();
    expect(validity).toBeGreaterThan(71.9 * 3600 * 1000);
    expect(validity).toBeLessThanOrEqual(72 * 3600 * 1000);
    const audit = mockAudit.find(a => a.actionKey === 'STOCK_WHATSAPP_REGISTRATION_CREATED');
    expect(audit).toMatchObject({ critical: true, tenantId: TENANT, actorUserId: ADMIN });
    expect(JSON.stringify(audit)).not.toContain('0712345678');
    // Relu : le code n'est plus jamais rendu.
    const view = await getRegistration(TENANT, ADMIN, { registrationId: created.id });
    expect('activationCode' in view).toBe(false);
  });

  it('W3-2 : le même numéro dans une autre agence → 409 PHONE_UNAVAILABLE, même message qu’un doublon local', async () => {
    await createAwa();
    const local = await rejection(
      createRegistration(TENANT, ADMIN, { userId: MOUSSA, phone: '+225 07 12 34 56 78', siteIds: ['site-1'] })
    );
    const other = await rejection(
      createRegistration(OTHER_TENANT, ADMIN, { userId: 'user-chef-b', phone: '0712345678', siteIds: ['site-b'] })
    );
    expect(other).toMatchObject({
      statusCode: 409,
      code: 'STOCK_WHATSAPP_PHONE_UNAVAILABLE',
      message: 'Ce numéro ne peut pas être inscrit.'
    });
    // Rien n'a été écrit dans l'agence B (transaction annulée).
    expect(mockDb.rows('stockWhatsappRegistration').filter(r => r.tenantId === OTHER_TENANT)).toHaveLength(0);
    expect(mockDb.rows('stockWhatsappRegistrationSite').filter(r => r.tenantId === OTHER_TENANT)).toHaveLength(0);
    // Refus audité dans l'agence qui essaie, sans le numéro ni l'agence détentrice.
    const denied = mockAudit.filter(a => a.outcome === 'DENIED');
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({
      tenantId: OTHER_TENANT,
      actorUserId: ADMIN,
      actionKey: 'STOCK_WHATSAPP_REGISTRATION_CREATED',
      payload: { reason: 'PHONE_UNAVAILABLE', userId: 'user-chef-b' }
    });
    const deniedJson = JSON.stringify(denied[0]);
    expect(deniedJson).not.toContain('0712345678');
    expect(deniedJson).not.toContain('phone');
    expect(deniedJson).not.toContain(`"${TENANT}"`);
    // Moussa est inéligible : l'éligibilité passe avant ; le doublon local se teste avec un chef éligible.
    expect(local.code).toBe('STOCK_WHATSAPP_MEMBER_NOT_ELIGIBLE');
    mockDb.rows('stockWhatsappRegistration')[0].status = 'REVOKED';
    const again = await createRegistration(OTHER_TENANT, ADMIN, {
      userId: 'user-chef-b',
      phone: '0712345678',
      siteIds: ['site-b']
    });
    expect(again.status).toBe('PENDING_ACTIVATION');
  });

  it('W3-3 : un agent sans le rôle, ou un utilisateur d’une autre agence → 409 MEMBER_NOT_ELIGIBLE', async () => {
    const agent = await rejection(
      createRegistration(TENANT, ADMIN, { userId: MOUSSA, phone: '0700000001', siteIds: ['site-1'] })
    );
    const foreign = await rejection(
      createRegistration(TENANT, ADMIN, { userId: 'user-chef-b', phone: '0700000002', siteIds: ['site-1'] })
    );
    expect(agent).toMatchObject({ statusCode: 409, code: 'STOCK_WHATSAPP_MEMBER_NOT_ELIGIBLE' });
    expect(foreign).toMatchObject({
      statusCode: 409,
      code: 'STOCK_WHATSAPP_MEMBER_NOT_ELIGIBLE',
      message: agent.message
    });
    mockDb.rows('membership').find(m => m.userId === CHEF)!.status = 'DISABLED';
    const disabled = await rejection(createAwa());
    expect(disabled.code).toBe('STOCK_WHATSAPP_MEMBER_NOT_ELIGIBLE');
  });

  it('W3-4 : chantier clos ou non basculé → 409 SITE_NOT_ELIGIBLE avec ses identifiants ; autre agence → 404', async () => {
    const closed = await rejection(createAwa('0712345678', ['site-1', 'site-clos', 'site-sans-stock']));
    expect(closed).toMatchObject({ statusCode: 409, code: 'STOCK_WHATSAPP_SITE_NOT_ELIGIBLE' });
    expect([...closed.data.siteIds].sort()).toEqual(['site-clos', 'site-sans-stock']);
    const foreign = await rejection(createAwa('0712345678', ['site-b']));
    expect(foreign).toMatchObject({ statusCode: 404 });
    const missing = await rejection(createAwa('0712345678', ['site-inexistant']));
    expect(missing.statusCode).toBe(404);
    expect(missing.message).toBe(foreign.message);
    expect(mockDb.rows('stockWhatsappRegistration')).toHaveLength(0);
  });

  it('numéro invalide → 400 PHONE_INVALID ; aucun chantier → 400 SITES_REQUIRED ; plus de 10 → 400', async () => {
    expect(await rejection(createAwa('12'))).toMatchObject({ statusCode: 400, code: 'STOCK_WHATSAPP_PHONE_INVALID' });
    expect(await rejection(createAwa('0712345678', []))).toMatchObject({
      statusCode: 400,
      code: 'STOCK_WHATSAPP_SITES_REQUIRED'
    });
    const eleven = Array.from({ length: 11 }, (_, index) => `site-${index}`);
    expect((await rejection(createAwa('0712345678', eleven))).statusCode).toBe(400);
  });

  it('W3-R4 : un membre n’a qu’une inscription non révoquée → 409 MEMBER_ALREADY_REGISTERED', async () => {
    await createAwa();
    const second = await rejection(createAwa('0799999999'));
    expect(second).toMatchObject({ statusCode: 409, code: 'STOCK_WHATSAPP_MEMBER_ALREADY_REGISTERED' });
  });

  it('W3-R6 : régénérer remet les essais à zéro et invalide l’ancien code ; seulement en attente', async () => {
    const created = await createAwa();
    const row = mockDb.rows('stockWhatsappRegistration')[0];
    row.activationAttempts = 4;
    const regenerated = await regenerateActivationCode(TENANT, ADMIN, { registrationId: created.id });
    expect(regenerated.activationCode).toMatch(/^\d{6}$/);
    expect(regenerated.activationAttemptsLeft).toBe(5);
    const current = mockDb.rows('stockWhatsappRegistration')[0];
    expect(current.activationCodeHash).toBe(activationCodeHash(regenerated.activationCode, created.id));
    if (regenerated.activationCode !== created.activationCode) {
      expect(current.activationCodeHash).not.toBe(activationCodeHash(created.activationCode, created.id));
    }
    expect(mockAudit.some(a => a.actionKey === 'STOCK_WHATSAPP_ACTIVATION_CODE_REGENERATED')).toBe(true);
    current.status = 'ACTIVE';
    const refused = await rejection(regenerateActivationCode(TENANT, ADMIN, { registrationId: created.id }));
    expect(refused).toMatchObject({ statusCode: 409, code: 'STOCK_WHATSAPP_REGISTRATION_WRONG_STATUS' });
  });

  it('W3-R9 : révocation → session fermée REVOKED, proposition EXPIRED, aucun message, numéro réinscriptible', async () => {
    const created = await createAwa();
    const row = mockDb.rows('stockWhatsappRegistration')[0];
    row.status = 'ACTIVE';
    mockDb.insert('stockFieldCapture', { id: 'cap-1', tenantId: TENANT, registrationId: row.id, outcome: 'PENDING' });
    mockDb.insert('stockWhatsappSession', {
      id: 'ses-1',
      tenantId: TENANT,
      registrationId: row.id,
      state: 'AWAITING_CONFIRMATION',
      pendingCaptureId: 'cap-1',
      lastInboundAt: new Date(),
      closedAt: null
    });
    const revoked = await revokeRegistration(TENANT, ADMIN, {
      registrationId: created.id,
      reason: 'Départ du chantier'
    });
    expect(revoked).toMatchObject({ status: 'REVOKED', revokeReason: 'Départ du chantier', openSessionId: null });
    expect(mockDb.rows('stockWhatsappSession')[0]).toMatchObject({ state: 'CLOSED', closeReason: 'REVOKED' });
    expect(mockDb.rows('stockFieldCapture')[0].outcome).toBe('EXPIRED');
    expect(mockSent).toHaveLength(0);
    expect(mockAudit.find(a => a.actionKey === 'STOCK_WHATSAPP_REGISTRATION_REVOKED')).toMatchObject({
      critical: true
    });
    const again = await rejection(revokeRegistration(TENANT, ADMIN, { registrationId: created.id }));
    expect(again).toMatchObject({ statusCode: 409, code: 'STOCK_WHATSAPP_REGISTRATION_WRONG_STATUS' });
    const reRegistered = await createAwa();
    expect(reRegistered.status).toBe('PENDING_ACTIVATION');
  });

  it('PATCH : chantiers remplacés (audit des changements) ; refusé sur une inscription révoquée', async () => {
    const created = await createAwa();
    const updated = await updateRegistrationSites(TENANT, ADMIN, {
      registrationId: created.id,
      siteIds: ['site-2', 'site-1']
    });
    expect(updated.sites.map(site => site.name)).toEqual(['Cocody', 'Yopougon']);
    expect(mockAudit.find(a => a.actionKey === 'STOCK_WHATSAPP_REGISTRATION_UPDATED')!.changes).toEqual({
      siteIds: { before: ['site-1'], after: ['site-1', 'site-2'] }
    });
    expect(
      (await rejection(updateRegistrationSites(TENANT, ADMIN, { registrationId: created.id, siteIds: ['site-b'] })))
        .statusCode
    ).toBe(404);
    mockDb.rows('stockWhatsappRegistration')[0].status = 'REVOKED';
    const refused = await rejection(
      updateRegistrationSites(TENANT, ADMIN, { registrationId: created.id, siteIds: ['site-1'] })
    );
    expect(refused.code).toBe('STOCK_WHATSAPP_REGISTRATION_WRONG_STATUS');
  });

  it('vue : accès relu (rôle retiré), chantier devenu inéligible signalé, autre agence → 404', async () => {
    const created = await createAwa('0712345678', ['site-1', 'site-2']);
    mockDb.rows('constructionSite').find(s => s.id === 'site-2')!.status = 'CLOSED';
    const roles = mockDb.rows('userRole');
    roles.splice(
      roles.findIndex(r => r.userId === CHEF),
      1
    );
    const view = await getRegistration(TENANT, ADMIN, { registrationId: created.id });
    expect(view.access).toEqual({ ok: false, reason: 'ROLE_MISSING' });
    expect(view.sites.find(site => site.siteId === 'site-2')).toMatchObject({
      eligible: false,
      ineligibleReason: 'CLOSED'
    });
    expect((await rejection(getRegistration(OTHER_TENANT, ADMIN, { registrationId: created.id }))).statusCode).toBe(
      404
    );
    const list = await listRegistrations(TENANT, ADMIN, { status: 'PENDING_ACTIVATION' });
    expect(list.map(r => r.id)).toEqual([created.id]);
    expect(await listRegistrations(OTHER_TENANT, ADMIN)).toEqual([]);
  });

  it('vue : option absente en enforce → accès OPTION_MISSING', async () => {
    const created = await createAwa();
    mockEntitlements = entitlementsWith(0, 'enforce');
    const view = await getRegistration(TENANT, ADMIN, { registrationId: created.id });
    expect(view.access).toEqual({ ok: false, reason: 'OPTION_MISSING' });
  });

  it('membres éligibles : seulement les chefs actifs de l’agence, avec le drapeau « inscrit »', async () => {
    let members = await listEligibleMembers(TENANT, ADMIN);
    expect(members).toEqual([{ userId: CHEF, label: 'Awa', registered: false }]);
    await createAwa();
    members = await listEligibleMembers(TENANT, ADMIN);
    expect(members).toEqual([{ userId: CHEF, label: 'Awa', registered: true }]);
    mockDb.rows('user').find(u => u.id === CHEF)!.isActive = false;
    expect(await listEligibleMembers(TENANT, ADMIN)).toEqual([]);
  });

  it('chantiers éligibles : ouverts, basculés au stock, lieu actif, de l’agence seulement', async () => {
    mockDb.rows('stockLocation').find(l => l.id === 'loc-site-2')!.isActive = false;
    const sites = await listEligibleSites(TENANT, ADMIN);
    expect(sites.map(site => site.siteId)).toEqual(['site-1']);
  });
});

describe('Garde tenant : aucune lecture d’agence sans `tenantId` en clair', () => {
  it('création (y compris refus du numéro) : chaque `where` sur une table d’agence nomme `tenantId`', async () => {
    const seen: Array<{ model: string; where: any }> = [];
    const spied = ['stockWhatsappRegistration', 'membership', 'userRole', 'constructionSite'];
    const originals = new Map<string, Record<string, any>>();
    for (const model of spied) {
      const delegate = mockDb.client[model];
      originals.set(model, { ...delegate });
      for (const op of ['findFirst', 'findMany', 'findUnique', 'count']) {
        const original = delegate[op];
        delegate[op] = async (args: any = {}) => {
          seen.push({ model, where: args.where });
          return original(args);
        };
      }
    }
    try {
      await createAwa();
      await rejection(
        createRegistration(OTHER_TENANT, ADMIN, { userId: 'user-chef-b', phone: '0712345678', siteIds: ['site-b'] })
      );
    } finally {
      for (const model of spied) Object.assign(mockDb.client[model], originals.get(model));
    }
    expect(seen.length).toBeGreaterThan(0);
    for (const { model, where } of seen) {
      expect({ model, hasTenant: Boolean(where && 'tenantId' in where) }).toEqual({ model, hasTenant: true });
      expect(JSON.stringify(where)).not.toContain('userId_tenantId');
    }
  });
});

describe('W3-R6, W3-R7 — activation : empreinte à clé, essai réservé avant comparaison', () => {
  const CODE = '482913';
  const LOCKED_TEXT = "Ce code n'est plus valable. Demandez un nouveau code à votre administrateur.";

  function current(): MockRow {
    return mockDb.rows('stockWhatsappRegistration').find(r => r.id === 'reg-chef')!;
  }

  function pending(attempts = 0): PendingRegistration {
    const row = current();
    Object.assign(row, {
      status: 'PENDING_ACTIVATION',
      activationCodeHash: activationCodeHash(CODE, 'reg-chef'),
      activationExpiresAt: new Date(Date.now() + 3600 * 1000),
      activationAttempts: attempts,
      activatedAt: null
    });
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      phoneE164: row.phoneE164,
      activationCodeHash: row.activationCodeHash,
      activationExpiresAt: row.activationExpiresAt,
      activationAttempts: row.activationAttempts
    };
  }

  beforeEach(() => {
    resetWorld();
    seedAgency({ siteCount: 1, status: 'PENDING_ACTIVATION' });
  });

  it('empreinte HMAC-SHA256 à clé serveur : 64 caractères hexadécimaux, différente du SHA-256 sans secret', () => {
    const hash = activationCodeHash(CODE, 'reg-chef');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(crypto.createHash('sha256').update(`${CODE}:reg-chef`, 'utf8').digest('hex'));
    expect(activationCodeHash(CODE, 'reg-autre')).not.toBe(hash);
  });

  it('dix mauvais codes simultanés : cinq essais consommés au plus, verrou audité une seule fois', async () => {
    const registration = pending(0);
    await Promise.all(Array.from({ length: 10 }, () => handlePendingRegistrationMessage(registration, text('000000'))));
    expect(current().activationAttempts).toBe(ACTIVATION_MAX_ATTEMPTS);
    expect(current().status).toBe('PENDING_ACTIVATION');
    expect(mockAudit.filter(a => a.actionKey === 'STOCK_WHATSAPP_ACTIVATION_LOCKED')).toHaveLength(1);
    const texts = sentTexts();
    expect(texts.filter(value => value.startsWith('Code incorrect.'))).toHaveLength(ACTIVATION_MAX_ATTEMPTS - 1);
    expect(texts.filter(value => value === LOCKED_TEXT)).toHaveLength(10 - (ACTIVATION_MAX_ATTEMPTS - 1));
  });

  it('le bon code après quatre échecs (essai réservé = le 5e) active encore', async () => {
    const registration = pending(ACTIVATION_MAX_ATTEMPTS - 1);
    await handlePendingRegistrationMessage(registration, text(`Code ${CODE}`));
    expect(current()).toMatchObject({ status: 'ACTIVE', activationCodeHash: null });
    expect(mockAudit.some(a => a.actionKey === 'STOCK_WHATSAPP_REGISTRATION_ACTIVATED' && a.critical)).toBe(true);
  });

  it('essais épuisés par un message simultané : le bon code n’est même pas comparé → M04', async () => {
    const registration = pending(ACTIVATION_MAX_ATTEMPTS - 1);
    // Copie périmée : un autre message a consommé le dernier essai entre-temps.
    current().activationAttempts = ACTIVATION_MAX_ATTEMPTS;
    await handlePendingRegistrationMessage(registration, text(CODE));
    expect(current().status).toBe('PENDING_ACTIVATION');
    expect(current().activationAttempts).toBe(ACTIVATION_MAX_ATTEMPTS);
    expect(lastSent().text).toBe(LOCKED_TEXT);
  });

  it('code régénéré entre la lecture et l’essai : l’empreinte courante fait foi', async () => {
    const registration = pending(0);
    current().activationCodeHash = activationCodeHash('111222', 'reg-chef');
    await handlePendingRegistrationMessage(registration, text(CODE));
    expect(current().status).toBe('PENDING_ACTIVATION');
    expect(current().activationAttempts).toBe(1);
    await handlePendingRegistrationMessage({ ...registration, activationAttempts: 1 }, text('111 222'));
    expect(current().status).toBe('ACTIVE');
  });
});
