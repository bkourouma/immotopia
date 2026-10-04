/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import request from 'supertest';

/**
 * Routes d'agence de l'inventaire de chantier par WhatsApp — lot 041,
 * territoire W4 (contrat `specs/041-inventaire-whatsapp/contracts/openapi.yaml`).
 *
 * Ce que ce fichier prouve, de l'extérieur :
 * - les DROITS de chaque route (gardes réelles de `rbac-middleware`, le service
 *   de permissions est simulé) : un chef de chantier, qui ne porte que
 *   `STOCK_COUNT`, n'ouvre aucune route ;
 * - le `404` inter-agences pour CHAQUE identifiant reçu (inscription, chantier,
 *   lieu, article, capture, fichier, session, inventaire) ;
 * - les MASQUES de la réconciliation (lot 040 §8.1 et §8.2) ;
 * - le simulateur : indisponible hors `log` AVANT toute lecture, injection par
 *   le même moteur que le webhook, hors du contexte de la requête.
 *
 * La base est un faux client en mémoire ; le moteur, le quota, le service des
 * inscriptions (territoire W3), le transport `log` (W1) et les fichiers sont
 * simulés : leurs signatures sont celles du plan §3.3.
 */

// ---------------------------------------------------------------------------
// Appelant, agence et droits
// ---------------------------------------------------------------------------

const mockCaller = { userId: 'user-admin', permissions: new Set<string>() };

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: mockCaller.userId, globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => {
  const { runWithTenantContext } = jest.requireActual('../../src/utils/tenant-context');
  return {
    requireTenantAccess: (req: any, _res: any, next: any) => {
      req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
      // Comme le vrai garde : l'agence de la requête devient l'agence ambiante.
      runWithTenantContext({ tenantId: req.params.tenantId, userId: mockCaller.userId }, () => next());
    }
  };
});

const mockGetUserPermissions = jest.fn(async (..._args: any[]) => [...mockCaller.permissions]);

jest.mock('../../src/services/permission-service', () => ({
  getUserPermissions: (...args: any[]) => (mockGetUserPermissions as any)(...args),
  hasPermission: async (_userId: string, key: string) => mockCaller.permissions.has(key),
  hasAnyPermission: async (_userId: string, keys: string[]) => keys.some(key => mockCaller.permissions.has(key)),
  hasAllPermissions: async (_userId: string, keys: string[]) => keys.every(key => mockCaller.permissions.has(key))
}));

jest.mock('../../src/services/subscription-service', () => ({
  checkSubscriptionAccess: jest.fn(async () => ({ allowed: true }))
}));

// ---------------------------------------------------------------------------
// Configuration : transport et disponibilité du simulateur
// ---------------------------------------------------------------------------

const mockEnvState = { simulatorAvailable: true };

jest.mock('../../src/config/env', () => {
  const actual = jest.requireActual('../../src/config/env');
  return {
    ...actual,
    env: {
      ...actual.env,
      WHATSAPP_INVENTORY_TRANSPORT: 'log',
      WHATSAPP_INVENTORY_PUBLIC_NUMBER: '+2250700000000',
      STOCK_VISION_PROVIDER: 'fake',
      STOCK_VISION_MODEL: 'fake-vision'
    },
    get whatsappInventorySimulatorAvailable() {
      return mockEnvState.simulatorAvailable;
    }
  };
});

// ---------------------------------------------------------------------------
// Faux client Prisma en mémoire
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

const mockDb: Record<string, Row[]> = {};
const mockRaw = {
  lastLines: [] as Row[],
  measures: [] as Row[],
  phoneTaken: false
};

function mockMatches(record: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Row[]).some(branch => mockMatches(record, branch));
    if (key === 'AND') return (condition as Row[]).every(branch => mockMatches(record, branch));
    const value = record[key];
    if (condition === null) return value === null || value === undefined;
    if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime();
    if (typeof condition === 'object' && !Array.isArray(condition)) {
      const c = condition as Row;
      if ('in' in c && !c.in.includes(value)) return false;
      if ('not' in c) {
        if (c.not === null ? value === null || value === undefined : value === c.not) return false;
      }
      if ('lt' in c && !(value < c.lt)) return false;
      if ('gt' in c && !(value > c.gt)) return false;
      if ('gte' in c && !(value >= c.gte)) return false;
      if ('lte' in c && !(value <= c.lte)) return false;
      return true;
    }
    return value === condition;
  });
}

function mockSort(rows: Row[], orderBy: any): Row[] {
  const orders: Array<Record<string, 'asc' | 'desc'>> = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : [];
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const [field, direction] = Object.entries(order)[0];
      const left = a[field] instanceof Date ? a[field].getTime() : a[field];
      const right = b[field] instanceof Date ? b[field].getTime() : b[field];
      if (left === right) continue;
      const sign = left < right ? -1 : 1;
      return direction === 'desc' ? -sign : sign;
    }
    return 0;
  });
}

function mockDelegate(table: string) {
  const rows = () => (mockDb[table] ??= []);
  return {
    findFirst: jest.fn(async (args: any = {}) => {
      const found = mockSort(
        rows().filter(row => mockMatches(row, args.where)),
        args.orderBy
      );
      // Comme Prisma : une copie, jamais la ligne stockée elle-même.
      return found[0] ? { ...found[0] } : null;
    }),
    findUnique: jest.fn(async (args: any = {}) => {
      const { tenantId_month: compound, ...rest } = args.where ?? {};
      const where = compound ? { ...rest, ...compound } : rest;
      const found = rows().find(row => mockMatches(row, where));
      return found ? { ...found } : null;
    }),
    findMany: jest.fn(async (args: any = {}) => {
      const found = mockSort(
        rows().filter(row => mockMatches(row, args.where)),
        args.orderBy
      );
      return (args.take ? found.slice(0, args.take) : found).map(row => ({ ...row }));
    }),
    updateMany: jest.fn(async (args: any) => {
      const found = rows().filter(row => mockMatches(row, args.where));
      for (const row of found) Object.assign(row, args.data);
      return { count: found.length };
    })
  };
}

function mockSqlText(query: any): string {
  if (Array.isArray(query)) return query.join('?');
  if (query && Array.isArray(query.strings)) return query.strings.join('?');
  return String(query?.sql ?? query);
}

const mockPrisma: any = {
  stockFieldCapture: mockDelegate('stockFieldCapture'),
  stockCount: mockDelegate('stockCount'),
  stockLocation: mockDelegate('stockLocation'),
  stockItem: mockDelegate('stockItem'),
  stockBalance: mockDelegate('stockBalance'),
  constructionSite: mockDelegate('constructionSite'),
  stockWhatsappSession: mockDelegate('stockWhatsappSession'),
  stockWhatsappMessage: mockDelegate('stockWhatsappMessage'),
  stockWhatsappRegistration: mockDelegate('stockWhatsappRegistration'),
  stockWhatsappUsage: mockDelegate('stockWhatsappUsage'),
  $queryRaw: jest.fn(async (query: any) => {
    const text = mockSqlText(query);
    if (text.includes('DISTINCT ON')) return mockRaw.lastLines;
    if (text.includes('percentile_cont')) return mockRaw.measures;
    if (text.includes('EXISTS')) return [{ taken: mockRaw.phoneTaken }];
    throw new Error(`Requête SQL inattendue : ${text}`);
  }),
  $transaction: jest.fn(async (callback: any) => callback(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

// ---------------------------------------------------------------------------
// Territoires voisins, simulés par leurs signatures figées (plan §3.3)
// ---------------------------------------------------------------------------

const mockRecordAuditEvent = jest.fn(async (..._args: any[]) => undefined);
jest.mock('../../src/services/audit-service', () => ({
  recordAuditEvent: (...args: any[]) => (mockRecordAuditEvent as any)(...args),
  logAuditEvent: jest.fn()
}));

const mockReadCapturePhoto = jest.fn(async (..._args: any[]): Promise<any> => undefined);
const mockDeleteCapturePhoto = jest.fn(async (..._args: any[]) => undefined);
jest.mock('../../src/lib/stock-whatsapp/capture-files', () => ({
  CAPTURE_MAX_BYTES: 10 * 1024 * 1024,
  readCapturePhoto: (...args: any[]) => mockReadCapturePhoto(...args),
  deleteCapturePhoto: (...args: any[]) => (mockDeleteCapturePhoto as any)(...args)
}));

const mockHandleInboundMessage = jest.fn(async (_message: any) => undefined);
jest.mock('../../src/lib/stock-whatsapp/engine/index', () => ({
  handleInboundMessage: (...args: any[]) => (mockHandleInboundMessage as any)(...args)
}));

const mockRunSessionTimers = jest.fn(async (_options?: any) => undefined);
jest.mock('../../src/lib/stock-whatsapp/engine/timers', () => ({
  runSessionTimers: (...args: any[]) => (mockRunSessionTimers as any)(...args)
}));

const mockDepositSimulatorMedia = jest.fn((_buffer: Buffer, _mimeType: string) => 'sim-media-1');
const mockListUnknownSenderOutbox = jest.fn((_toE164: string, _after?: Date): any[] => []);
jest.mock('../../src/lib/stock-whatsapp/transport/log-transport', () => ({
  depositSimulatorMedia: (...args: any[]) => (mockDepositSimulatorMedia as any)(...args),
  listUnknownSenderOutbox: (...args: any[]) => (mockListUnknownSenderOutbox as any)(...args)
}));

const mockGetWhatsappQuotaState = jest.fn(async (_tenantId: string, _now?: Date) => ({
  month: '2026-10',
  used: 12,
  limit: 500,
  source: 'OPTION' as const,
  blocks: 1
}));
jest.mock('../../src/lib/stock-whatsapp/quota', () => ({
  getWhatsappQuotaState: (...args: any[]) => (mockGetWhatsappQuotaState as any)(...args)
}));

const mockRegistrations = {
  createRegistration: jest.fn(),
  updateRegistrationSites: jest.fn(),
  regenerateActivationCode: jest.fn(),
  revokeRegistration: jest.fn(),
  listRegistrations: jest.fn(),
  getRegistration: jest.fn(),
  listEligibleMembers: jest.fn(),
  listEligibleSites: jest.fn()
};
jest.mock('../../src/lib/stock-whatsapp/registrations/service', () => ({
  createRegistration: (...args: any[]) => mockRegistrations.createRegistration(...args),
  updateRegistrationSites: (...args: any[]) => mockRegistrations.updateRegistrationSites(...args),
  regenerateActivationCode: (...args: any[]) => mockRegistrations.regenerateActivationCode(...args),
  revokeRegistration: (...args: any[]) => mockRegistrations.revokeRegistration(...args),
  listRegistrations: (...args: any[]) => mockRegistrations.listRegistrations(...args),
  getRegistration: (...args: any[]) => mockRegistrations.getRegistration(...args),
  listEligibleMembers: (...args: any[]) => mockRegistrations.listEligibleMembers(...args),
  listEligibleSites: (...args: any[]) => mockRegistrations.listEligibleSites(...args)
}));

import { errorHandler, NotFoundError } from '../../src/middleware/error-middleware';
import { getTenantContext } from '../../src/utils/tenant-context';
import { resetSimulatorMemoryForTests } from '../../src/lib/stock-whatsapp/admin/simulator';
import financeStockWhatsappRoutes from '../../src/routes/finance-stock-whatsapp-routes';

const app = express();
app.use(express.json());
app.use('/api', financeStockWhatsappRoutes);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Jeu de données : agence A (l'appelant) et agence B (l'autre)
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const BASE = `/api/tenants/${TENANT_A}/finance/stock/whatsapp`;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const SITE_A = id(1);
const SITE_B = id(2);
const LOC_BLIND = id(10); // lieu de SITE_A, en comptage (inventaire DRAFT)
const LOC_OPEN = id(11); // magasin de l'agence A
const LOC_B = id(12);
const ITEM_CIMENT = id(20);
const ITEM_FER = id(21);
const ITEM_SABLE = id(22);
const ITEM_B = id(23);
const COUNT_DRAFT = id(30);
const COUNT_DONE = id(31);
const COUNT_B = id(32);
const LINE_CIMENT = id(40);
const LINE_SABLE = id(41);
const CAPTURE_A = id(50);
const CAPTURE_A2 = id(51);
const CAPTURE_B = id(52);
const CAPTURE_REMOVED = id(53);
const SESSION_A = id(60);
const SESSION_B = id(61);
const REG_A = id(70);
const REG_B = id(71);
const MSG_A = id(80);

/** Stock théorique du ciment sur le lieu en comptage : ne doit JAMAIS sortir masqué. */
const SECRET_QUANTITY = 137;

const PHONE_A = '+2250712345678';

function chef() {
  return { fullName: 'Awa Koné', email: 'awa@exemple.ci' };
}

function captureRow(overrides: Row = {}): Row {
  return {
    id: CAPTURE_A,
    tenantId: TENANT_A,
    registrationId: REG_A,
    sessionId: SESSION_A,
    userId: 'user-chef',
    locationId: LOC_BLIND,
    itemId: ITEM_CIMENT,
    countId: COUNT_DRAFT,
    countLineId: LINE_CIMENT,
    itemImposed: false,
    outcome: 'ACCEPTED',
    via: 'SIMULATOR',
    fileUrl: `/uploads/stock-whatsapp/${TENANT_A}/2026/photo.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 2048,
    sha256: 'a'.repeat(64),
    receivedAt: new Date('2026-10-02T09:00:00.000Z'),
    proposedTotal: 84,
    confirmedQuantity: 84,
    lineQuantityAfter: 84,
    mergeMode: null,
    confirmedAt: new Date('2026-10-02T09:00:30.000Z'),
    analysis: {
      quality: 'OK',
      itemId: ITEM_CIMENT,
      itemConfidence: 0.92,
      visibleUnits: 28,
      layers: null,
      columns: null,
      depthRows: 3,
      proposedTotal: 84,
      confidence: 0.9,
      method: 'SACKS_STACKED',
      explanation: 'Sacs empilés.'
    },
    visionProvider: 'fake',
    visionModel: 'fake-vision',
    analysisMs: 1200,
    failureReason: null,
    photoRemovedAt: null,
    photoRemovalReason: null,
    site: { name: 'Résidence Les Palmiers' },
    item: { label: 'Ciment CPJ 45', unit: 'sac', reference: 'CIM-45' },
    user: chef(),
    count: { status: 'DRAFT' },
    photoRemovedBy: null,
    ...overrides
  };
}

function sessionRow(overrides: Row = {}): Row {
  return {
    id: SESSION_A,
    tenantId: TENANT_A,
    registrationId: REG_A,
    state: 'AWAITING_CONFIRMATION',
    countId: COUNT_DRAFT,
    openedAt: new Date('2026-10-02T08:55:00.000Z'),
    lastInboundAt: new Date('2026-10-02T09:00:00.000Z'),
    closedAt: null,
    closeReason: null,
    countOutcome: null,
    site: { name: 'Résidence Les Palmiers' },
    registration: { user: chef() },
    _count: { captures: 2 },
    ...overrides
  };
}

function seed(): void {
  for (const key of Object.keys(mockDb)) delete mockDb[key];
  mockDb.constructionSite = [
    { id: SITE_A, tenantId: TENANT_A },
    { id: SITE_B, tenantId: TENANT_B }
  ];
  mockDb.stockLocation = [
    {
      id: LOC_BLIND,
      tenantId: TENANT_A,
      label: 'Chantier Palmiers',
      siteId: SITE_A,
      site: { name: 'Résidence Les Palmiers' }
    },
    { id: LOC_OPEN, tenantId: TENANT_A, label: 'Magasin central', siteId: null, site: null },
    { id: LOC_B, tenantId: TENANT_B, label: 'Magasin B', siteId: SITE_B, site: { name: 'Chantier B' } }
  ];
  mockDb.stockItem = [
    { id: ITEM_CIMENT, tenantId: TENANT_A, reference: 'CIM-45', label: 'Ciment CPJ 45', unit: 'sac' },
    { id: ITEM_FER, tenantId: TENANT_A, reference: 'FER-10', label: 'Fer de 10', unit: 'barre' },
    { id: ITEM_SABLE, tenantId: TENANT_A, reference: 'SAB-01', label: 'Sable', unit: 'm3' },
    { id: ITEM_B, tenantId: TENANT_B, reference: 'B-01', label: 'Article B', unit: 'u' }
  ];
  mockDb.stockBalance = [
    // Lieu en comptage : ciment à 137 (secret), fer à zéro (rendu quand même, masqué).
    { tenantId: TENANT_A, locationId: LOC_BLIND, itemId: ITEM_CIMENT, quantity: SECRET_QUANTITY, value: 685000 },
    { tenantId: TENANT_A, locationId: LOC_BLIND, itemId: ITEM_FER, quantity: 0, value: 0 },
    // Magasin : ciment à 50, sable à zéro (non rendu sans comptage récent).
    { tenantId: TENANT_A, locationId: LOC_OPEN, itemId: ITEM_CIMENT, quantity: 50, value: 250000 },
    { tenantId: TENANT_A, locationId: LOC_OPEN, itemId: ITEM_SABLE, quantity: 0, value: 0 },
    { tenantId: TENANT_B, locationId: LOC_B, itemId: ITEM_B, quantity: 999, value: 999 }
  ];
  mockDb.stockCount = [
    { id: COUNT_DRAFT, tenantId: TENANT_A, locationId: LOC_BLIND, status: 'DRAFT', source: 'WHATSAPP' },
    { id: COUNT_DONE, tenantId: TENANT_A, locationId: LOC_OPEN, status: 'COUNTED', source: 'WEB' },
    { id: COUNT_B, tenantId: TENANT_B, locationId: LOC_B, status: 'DRAFT', source: 'WEB' }
  ];
  mockDb.stockFieldCapture = [
    captureRow(),
    captureRow({
      id: CAPTURE_A2,
      outcome: 'CORRECTED',
      confirmedQuantity: 40,
      lineQuantityAfter: 124,
      mergeMode: 'ADD',
      receivedAt: new Date('2026-10-02T09:10:00.000Z'),
      confirmedAt: new Date('2026-10-02T09:10:40.000Z')
    }),
    captureRow({
      id: CAPTURE_REMOVED,
      itemId: ITEM_FER,
      countLineId: null,
      outcome: 'UNREADABLE',
      fileUrl: null,
      confirmedAt: null,
      photoRemovedAt: new Date('2026-10-03T10:00:00.000Z'),
      photoRemovalReason: 'Une personne est visible.',
      photoRemovedBy: { fullName: 'Admin', email: 'admin@exemple.ci' }
    }),
    captureRow({ id: CAPTURE_B, tenantId: TENANT_B, locationId: LOC_B, countId: COUNT_B, itemId: ITEM_B })
  ];
  mockDb.stockWhatsappSession = [
    sessionRow(),
    sessionRow({ id: SESSION_B, tenantId: TENANT_B, registrationId: REG_B })
  ];
  mockDb.stockWhatsappMessage = [
    {
      id: MSG_A,
      tenantId: TENANT_A,
      registrationId: REG_A,
      sessionId: SESSION_A,
      captureId: CAPTURE_A,
      direction: 'OUTBOUND',
      kind: 'BUTTONS',
      text: 'Total proposé : 84 sac',
      interactive: [
        { id: `confirm:${CAPTURE_A}`, title: 'Valider' },
        { id: `cancel:${CAPTURE_A}`, title: 'Annuler' }
      ],
      via: null,
      sendError: null,
      createdAt: new Date('2026-10-02T09:00:20.000Z')
    }
  ];
  mockDb.stockWhatsappRegistration = [
    { id: REG_A, tenantId: TENANT_A, phoneE164: PHONE_A, status: 'ACTIVE' },
    { id: REG_B, tenantId: TENANT_B, phoneE164: '+2250799999999', status: 'ACTIVE' }
  ];
  mockDb.stockWhatsappUsage = [{ tenantId: TENANT_A, month: '2026-10', used: 12 }];

  // Dernière ligne de chaque couple (lieu, article), comme la requête DISTINCT ON.
  mockRaw.lastLines = [
    {
      line_id: LINE_CIMENT,
      count_id: COUNT_DRAFT,
      location_id: LOC_BLIND,
      item_id: ITEM_CIMENT,
      count_status: 'DRAFT',
      counted_quantity: 124,
      counted_at_server: new Date('2026-10-02T09:10:40.000Z'),
      line_date: new Date('2026-10-02T09:10:40.000Z'),
      counted_by_full_name: 'Awa Koné',
      counted_by_email: 'awa@exemple.ci'
    },
    {
      line_id: LINE_SABLE,
      count_id: COUNT_DONE,
      location_id: LOC_OPEN,
      item_id: ITEM_SABLE,
      count_status: 'COUNTED',
      counted_quantity: 3,
      counted_at_server: new Date('2026-10-01T15:00:00.000Z'),
      line_date: new Date('2026-10-01T15:00:00.000Z'),
      counted_by_full_name: null,
      counted_by_email: 'magasinier@exemple.ci'
    }
  ];
  mockRaw.measures = [];
  mockRaw.phoneTaken = false;
}

const ADMIN = ['FINANCE_SETTINGS_MANAGE', 'STOCK_VIEW', 'STOCK_DISPOSE', 'STOCK_VALUES_VIEW'];
const COMPTABLE = ['STOCK_VIEW', 'STOCK_VALUES_VIEW'];
const CHEF = ['STOCK_COUNT'];

function as(permissions: string[], userId = 'user-admin'): void {
  mockCaller.userId = userId;
  mockCaller.permissions = new Set(permissions);
}

const flush = () => new Promise(resolve => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  seed();
  as(ADMIN);
  mockEnvState.simulatorAvailable = true;
  resetSimulatorMemoryForTests();
});

// ---------------------------------------------------------------------------
// Droits
// ---------------------------------------------------------------------------

const ALL_ROUTES: Array<[method: 'get' | 'post' | 'patch', path: string, body?: Row]> = [
  ['get', '/overview'],
  ['get', '/eligible-members'],
  ['get', '/eligible-sites'],
  ['get', '/registrations'],
  ['post', '/registrations', { userId: 'user-chef', phone: '0712345678', siteIds: [SITE_A] }],
  ['get', `/registrations/${REG_A}`],
  ['patch', `/registrations/${REG_A}`, { siteIds: [SITE_A] }],
  ['post', `/registrations/${REG_A}/regenerate-code`, {}],
  ['post', `/registrations/${REG_A}/revoke`, {}],
  ['get', '/field-counts'],
  ['get', '/captures'],
  ['get', `/captures/${CAPTURE_A}`],
  ['get', `/captures/${CAPTURE_A}/file`],
  ['post', `/captures/${CAPTURE_A}/remove-photo`, { reason: 'Une personne est visible.' }],
  ['get', `/counts/${COUNT_DRAFT}/captures`],
  ['get', '/sessions'],
  ['get', `/sessions/${SESSION_A}/messages`],
  ['post', '/simulator/messages', { registrationId: REG_A, text: 'AIDE' }],
  ['get', `/simulator/conversation?registrationId=${REG_A}`],
  ['post', `/simulator/sessions/${SESSION_A}/advance`, { minutes: 10 }]
];

function call(method: 'get' | 'post' | 'patch', path: string, body?: Row) {
  const req = request(app)[method](`${BASE}${path}`);
  return body !== undefined ? req.send(body) : req;
}

describe('droits', () => {
  it('un chef de chantier (STOCK_COUNT seul) n’ouvre aucune route d’agence', async () => {
    as(CHEF, 'user-chef');
    for (const [method, path, body] of ALL_ROUTES) {
      const res = await call(method, path, body);
      expect([method, path, res.status]).toEqual([method, path, 403]);
    }
    expect(mockHandleInboundMessage).not.toHaveBeenCalled();
    for (const fn of Object.values(mockRegistrations)) expect(fn).not.toHaveBeenCalled();
  });

  it('un comptable (STOCK_VIEW) lit les comptages et les captures, pas les inscriptions ni les conversations', async () => {
    as(COMPTABLE, 'user-comptable');
    expect((await call('get', '/field-counts')).status).toBe(200);
    expect((await call('get', '/captures')).status).toBe(200);
    expect((await call('get', `/captures/${CAPTURE_A}`)).status).toBe(200);
    expect((await call('get', '/overview')).status).toBe(403);
    expect((await call('get', '/registrations')).status).toBe(403);
    expect((await call('get', '/sessions')).status).toBe(403);
    expect((await call('post', `/captures/${CAPTURE_A}/remove-photo`, { reason: 'Motif valable' })).status).toBe(403);
    expect((await call('post', '/simulator/messages', { registrationId: REG_A, text: 'x' })).status).toBe(403);
  });

  it('un validateur d’inventaire (STOCK_COUNT_VALIDATE) lit les conversations', async () => {
    as(['STOCK_VIEW', 'STOCK_COUNT_VALIDATE'], 'user-validateur');
    expect((await call('get', '/sessions')).status).toBe(200);
    expect((await call('get', `/sessions/${SESSION_A}/messages`)).status).toBe(200);
    const view = await call('get', `/captures/${CAPTURE_A}`);
    expect(view.body.data.canReadConversation).toBe(true);
    expect(view.body.data.canRemovePhoto).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Inscriptions (W3-R1) — corps transmis au service du territoire W3
// ---------------------------------------------------------------------------

describe('inscriptions', () => {
  it('crée une inscription : agence de l’URL, acteur authentifié, corps recomposé', async () => {
    const created = {
      id: REG_A,
      userId: 'user-chef',
      phoneE164: PHONE_A,
      phoneMasked: '+225 07 •• •• •• 78',
      activationCode: '482913'
    };
    mockRegistrations.createRegistration.mockResolvedValue(created);

    const res = await call('post', '/registrations', {
      userId: 'user-chef',
      phone: '07 12 34 56 78',
      siteIds: [SITE_A]
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual(created);
    expect(mockRegistrations.createRegistration).toHaveBeenCalledWith(TENANT_A, 'user-admin', {
      userId: 'user-chef',
      phone: '07 12 34 56 78',
      siteIds: [SITE_A]
    });
  });

  it('sans chantier : 400 STOCK_WHATSAPP_SITES_REQUIRED, le service n’est pas appelé', async () => {
    for (const body of [
      { userId: 'user-chef', phone: '0712345678' },
      { userId: 'user-chef', phone: '0712345678', siteIds: [] }
    ]) {
      const res = await call('post', '/registrations', body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('STOCK_WHATSAPP_SITES_REQUIRED');
    }
    const patch = await call('patch', `/registrations/${REG_A}`, { siteIds: [] });
    expect(patch.body.code).toBe('STOCK_WHATSAPP_SITES_REQUIRED');
    expect(mockRegistrations.createRegistration).not.toHaveBeenCalled();
    expect(mockRegistrations.updateRegistrationSites).not.toHaveBeenCalled();
  });

  it('refuse un corps qui répète l’agence, un statut, plus de 10 chantiers ou un doublon', async () => {
    const valid = { userId: 'user-chef', phone: '0712345678', siteIds: [SITE_A] };
    const elevenSites = Array.from({ length: 11 }, (_, index) => id(100 + index));
    for (const body of [
      { ...valid, tenantId: TENANT_A },
      { ...valid, status: 'ACTIVE' },
      { ...valid, siteIds: elevenSites },
      { ...valid, siteIds: [SITE_A, SITE_A] },
      { ...valid, siteIds: ['pas-un-uuid'] }
    ]) {
      const res = await call('post', '/registrations', body);
      expect(res.status).toBe(400);
    }
    expect(mockRegistrations.createRegistration).not.toHaveBeenCalled();
  });

  it('modifie, régénère et révoque par l’identifiant du chemin', async () => {
    mockRegistrations.updateRegistrationSites.mockResolvedValue({ id: REG_A });
    mockRegistrations.regenerateActivationCode.mockResolvedValue({ id: REG_A, activationCode: '123456' });
    mockRegistrations.revokeRegistration.mockResolvedValue({ id: REG_A, status: 'REVOKED' });

    await call('patch', `/registrations/${REG_A}`, { siteIds: [SITE_A] }).expect(200);
    await call('post', `/registrations/${REG_A}/regenerate-code`, {}).expect(200);
    await call('post', `/registrations/${REG_A}/revoke`, { reason: '  Départ du chantier  ' }).expect(200);
    await call('post', `/registrations/${REG_A}/revoke`).expect(200);

    expect(mockRegistrations.updateRegistrationSites).toHaveBeenCalledWith(TENANT_A, 'user-admin', {
      registrationId: REG_A,
      siteIds: [SITE_A]
    });
    expect(mockRegistrations.regenerateActivationCode).toHaveBeenCalledWith(TENANT_A, 'user-admin', {
      registrationId: REG_A
    });
    expect(mockRegistrations.revokeRegistration).toHaveBeenNthCalledWith(1, TENANT_A, 'user-admin', {
      registrationId: REG_A,
      reason: 'Départ du chantier'
    });
    expect(mockRegistrations.revokeRegistration).toHaveBeenNthCalledWith(2, TENANT_A, 'user-admin', {
      registrationId: REG_A,
      reason: null
    });
  });

  it('un identifiant mal formé répond 404 sans appeler le service ; le 404 du service remonte tel quel', async () => {
    expect((await call('get', '/registrations/pas-un-uuid')).status).toBe(404);
    expect(mockRegistrations.getRegistration).not.toHaveBeenCalled();

    mockRegistrations.getRegistration.mockRejectedValue(new NotFoundError('Inscription introuvable.'));
    const res = await call('get', `/registrations/${REG_B}`);
    expect(res.status).toBe(404);
    expect(mockRegistrations.getRegistration).toHaveBeenCalledWith(TENANT_A, 'user-admin', { registrationId: REG_B });
  });

  it('liste filtrée par statut, membres et chantiers éligibles', async () => {
    mockRegistrations.listRegistrations.mockResolvedValue([]);
    mockRegistrations.listEligibleMembers.mockResolvedValue([{ userId: 'user-chef', label: 'Awa', registered: false }]);
    mockRegistrations.listEligibleSites.mockResolvedValue([]);

    await call('get', '/registrations?status=PENDING_ACTIVATION').expect(200);
    expect((await call('get', '/registrations?status=INCONNU')).status).toBe(400);
    await call('get', '/eligible-members').expect(200);
    await call('get', '/eligible-sites').expect(200);

    expect(mockRegistrations.listRegistrations).toHaveBeenCalledWith(TENANT_A, 'user-admin', {
      status: 'PENDING_ACTIVATION'
    });
    expect(mockRegistrations.listEligibleMembers).toHaveBeenCalledWith(TENANT_A, 'user-admin', {});
    expect(mockRegistrations.listEligibleSites).toHaveBeenCalledWith(TENANT_A, 'user-admin', {});
  });
});

// ---------------------------------------------------------------------------
// Passerelle, quota, mesures (W11, W14-R7)
// ---------------------------------------------------------------------------

describe('overview', () => {
  it('rend la passerelle, le quota du mois courant et les mesures de l’agence entière', async () => {
    mockRaw.measures = [
      {
        total: 20,
        accepted: 15,
        corrected: 3,
        unreadable: 1,
        unrecognized: 1,
        failed: 0,
        median_seconds: 31.44,
        whatsapp_lines: 10,
        lines_with_photo: 9
      }
    ];

    const res = await call('get', '/overview?month=2026-10');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      transport: 'log',
      gatewayReady: true,
      botNumber: '+2250700000000',
      simulatorAvailable: true,
      vision: { provider: 'fake', model: 'fake-vision' },
      quota: { month: '2026-10', used: 12, limit: 500, source: 'OPTION', blocks: 1 },
      measures: {
        photosAnalyzed: 12,
        medianSecondsToConfirm: 31.4,
        acceptedFirstTimeRate: 0.8333,
        proofCoverageRate: 0.9,
        unreadableRate: 0.05,
        unrecognizedRate: 0.05,
        failedRate: 0
      }
    });
    expect(mockGetWhatsappQuotaState).toHaveBeenCalledWith(TENANT_A, expect.any(Date));

    // Agrégat SQL : l'agence est le premier paramètre, explicite.
    const [strings, ...values] = mockPrisma.$queryRaw.mock.calls[0];
    expect(strings.join('?')).toContain('tenant_id = ?');
    expect(values[0]).toBe(TENANT_A);
  });

  it('les mesures ne contiennent aucun identifiant de personne (W14 critère 3)', async () => {
    mockRaw.measures = [{ total: 0 }];
    const res = await call('get', '/overview');
    const text = JSON.stringify(res.body.data.measures);
    expect(text).not.toMatch(/user|chef|email|@|phone/i);
    expect(res.body.data.measures.acceptedFirstTimeRate).toBeNull();
    expect(res.body.data.measures.medianSecondsToConfirm).toBeNull();
  });

  it('refuse un mois mal formé', async () => {
    expect((await call('get', '/overview?month=2026-13')).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Comptages terrain — masques du lot 040 (W14 critère 2)
// ---------------------------------------------------------------------------

describe('field-counts', () => {
  function rowOf(body: any, locationId: string, itemId: string) {
    return body.data.find((row: any) => row.locationId === locationId && row.itemId === itemId);
  }

  it('comptable sans STOCK_COUNT_VALIDATE sur un lieu en comptage : stock théorique null, lieu listé, couples nuls rendus', async () => {
    as(COMPTABLE, 'user-comptable');
    const res = await call('get', '/field-counts');

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ valuesVisible: true, blindLocationIds: [LOC_BLIND], nextCursor: null });

    const ciment = rowOf(res.body, LOC_BLIND, ITEM_CIMENT);
    expect(ciment.theoreticalQuantity).toBeNull();
    expect(ciment.theoreticalValue).toBeNull();
    expect(ciment.averageUnitCost).toBeNull();
    // Le dernier comptage est une quantité comptée : jamais masqué.
    expect(ciment.lastCount).toMatchObject({
      countId: COUNT_DRAFT,
      countStatus: 'DRAFT',
      countSource: 'WHATSAPP',
      countedQuantity: 124,
      countedByLabel: 'Awa Koné',
      captureId: CAPTURE_A2,
      hasPhoto: true,
      outcome: 'CORRECTED'
    });

    // Solde nul sur le lieu en comptage : rendu (masqué), sinon il trahirait le zéro.
    const fer = rowOf(res.body, LOC_BLIND, ITEM_FER);
    expect(fer).toBeDefined();
    expect(fer.theoreticalQuantity).toBeNull();

    // Lieu ouvert : quantité et valeurs visibles.
    expect(rowOf(res.body, LOC_OPEN, ITEM_CIMENT)).toMatchObject({
      theoreticalQuantity: 50,
      theoreticalValue: 250000,
      averageUnitCost: 5000,
      lastCount: null
    });
    // Solde nul hors comptage, mais compté récemment : rendu.
    expect(rowOf(res.body, LOC_OPEN, ITEM_SABLE)).toMatchObject({
      theoreticalQuantity: 0,
      lastCount: { countSource: 'WEB', countedQuantity: 3, countedByLabel: 'magasinier@exemple.ci', captureId: null }
    });

    expect(JSON.stringify(res.body)).not.toContain(String(SECRET_QUANTITY));
    expect(res.body.data.some((row: any) => row.locationId === LOC_B)).toBe(false);
  });

  it('avec STOCK_COUNT_VALIDATE, le lieu en comptage n’est plus masqué', async () => {
    as([...COMPTABLE, 'STOCK_COUNT_VALIDATE'], 'user-validateur');
    const res = await call('get', '/field-counts');

    expect(res.body.meta.blindLocationIds).toEqual([]);
    expect(rowOf(res.body, LOC_BLIND, ITEM_CIMENT).theoreticalQuantity).toBe(SECRET_QUANTITY);
    // Plus aveugle : un solde nul sans comptage récent n'est plus rendu.
    expect(rowOf(res.body, LOC_BLIND, ITEM_FER)).toBeUndefined();
  });

  it('sans STOCK_VALUES_VIEW, valeurs et coût moyen null, quantités visibles hors comptage', async () => {
    as(['STOCK_VIEW', 'STOCK_COUNT_VALIDATE'], 'user-magasinier');
    const res = await call('get', '/field-counts');
    expect(res.body.meta.valuesVisible).toBe(false);
    const row = rowOf(res.body, LOC_OPEN, ITEM_CIMENT);
    expect(row.theoreticalQuantity).toBe(50);
    expect(row.theoreticalValue).toBeNull();
    expect(row.averageUnitCost).toBeNull();
  });

  it('filtre par source du dernier comptage', async () => {
    const whatsapp = await call('get', '/field-counts?source=WHATSAPP');
    expect(whatsapp.body.data.map((row: any) => row.itemId)).toEqual([ITEM_CIMENT]);
    const web = await call('get', '/field-counts?source=WEB');
    expect(web.body.data.map((row: any) => row.itemId)).toEqual([ITEM_SABLE]);
  });

  it('pagine par curseur opaque, tri lieu puis référence', async () => {
    as([...COMPTABLE, 'STOCK_COUNT_VALIDATE']);
    const first = await call('get', '/field-counts?limit=2');
    expect(first.body.data.map((row: any) => row.locationLabel)).toEqual(['Chantier Palmiers', 'Magasin central']);
    expect(first.body.meta.nextCursor).toEqual(expect.any(String));
    const second = await call('get', `/field-counts?limit=2&cursor=${first.body.meta.nextCursor}`);
    expect(second.body.data.map((row: any) => row.itemReference)).toEqual(['SAB-01']);
    expect(second.body.meta.nextCursor).toBeNull();
  });

  it('un chantier, un lieu ou un article d’une autre agence : 404', async () => {
    for (const query of [`siteId=${SITE_B}`, `locationId=${LOC_B}`, `itemId=${ITEM_B}`]) {
      const res = await call('get', `/field-counts?${query}`);
      expect([query, res.status]).toEqual([query, 404]);
    }
  });

  it('la requête des dernières lignes porte l’agence en paramètre explicite', async () => {
    await call('get', '/field-counts');
    const [strings, ...values] = mockPrisma.$queryRaw.mock.calls[0];
    expect(strings.join('?')).toContain('c.tenant_id = ?');
    expect(values[0]).toBe(TENANT_A);
  });
});

// ---------------------------------------------------------------------------
// Captures et preuve (T10, W14)
// ---------------------------------------------------------------------------

describe('captures', () => {
  it('liste les captures de l’agence seulement, sans quantité théorique', async () => {
    const res = await call('get', '/captures');
    expect(res.status).toBe(200);
    expect(res.body.data.map((capture: any) => capture.id).sort()).toEqual(
      [CAPTURE_A, CAPTURE_A2, CAPTURE_REMOVED].sort()
    );
    expect(res.body.meta).toEqual({ nextCursor: null });
    const first = res.body.data.find((capture: any) => capture.id === CAPTURE_A);
    expect(first).toEqual({
      id: CAPTURE_A,
      receivedAt: '2026-10-02T09:00:00.000Z',
      outcome: 'ACCEPTED',
      via: 'SIMULATOR',
      siteName: 'Résidence Les Palmiers',
      locationId: LOC_BLIND,
      itemId: ITEM_CIMENT,
      itemLabel: 'Ciment CPJ 45',
      unit: 'sac',
      proposedTotal: 84,
      confirmedQuantity: 84,
      chefLabel: 'Awa Koné',
      countId: COUNT_DRAFT,
      hasPhoto: true
    });
    expect(JSON.stringify(res.body)).not.toContain(String(SECRET_QUANTITY));
  });

  it('filtres : inventaire, lieu ou article d’une autre agence → 404 ; dates bornées', async () => {
    for (const query of [`countId=${COUNT_B}`, `locationId=${LOC_B}`, `itemId=${ITEM_B}`]) {
      expect((await call('get', `/captures?${query}`)).status).toBe(404);
    }
    expect((await call('get', '/captures?from=2026-10-05&to=2026-10-01')).status).toBe(400);
    const res = await call('get', '/captures?outcome=UNREADABLE');
    expect(res.body.data.map((capture: any) => capture.id)).toEqual([CAPTURE_REMOVED]);
  });

  it('détail : preuve, analyse, droits de l’appelant ; capture d’une autre agence → 404', async () => {
    const res = await call('get', `/captures/${CAPTURE_A}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      sha256: 'a'.repeat(64),
      itemReference: 'CIM-45',
      countStatus: 'DRAFT',
      sessionId: SESSION_A,
      analysis: { method: 'SACKS_STACKED', proposedTotal: 84 },
      vision: { provider: 'fake', model: 'fake-vision', analysisMs: 1200, failureReason: null },
      photoRemoved: null,
      canRemovePhoto: true,
      canReadConversation: true
    });

    expect((await call('get', `/captures/${CAPTURE_B}`)).status).toBe(404);
    expect((await call('get', '/captures/pas-un-uuid')).status).toBe(404);
  });

  it('fichier : 404 pour une autre agence sans relire le disque (W14 critère 1)', async () => {
    const res = await call('get', `/captures/${CAPTURE_B}/file`);
    expect(res.status).toBe(404);
    expect(mockReadCapturePhoto).not.toHaveBeenCalled();
  });

  it('fichier : servi par sendPrivateFile, sans cache, depuis le dossier de l’agence', async () => {
    mockReadCapturePhoto.mockResolvedValue({
      buffer: Buffer.from('jpeg'),
      fileName: 'photo-comptage.jpg',
      mimeType: 'image/jpeg'
    });
    const res = await call('get', `/captures/${CAPTURE_A}/file`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(mockReadCapturePhoto).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      fileUrl: `/uploads/stock-whatsapp/${TENANT_A}/2026/photo.jpg`,
      receivedAt: new Date('2026-10-02T09:00:00.000Z')
    });
  });

  it('fichier d’une photo retirée : 404 STOCK_WHATSAPP_PHOTO_REMOVED', async () => {
    const { AppError } = jest.requireActual('../../src/middleware/error-middleware');
    mockReadCapturePhoto.mockImplementation(async ({ fileUrl }: { fileUrl: string | null }) => {
      if (!fileUrl) throw new AppError('Cette photo a été retirée.', 404, 'STOCK_WHATSAPP_PHOTO_REMOVED');
      throw new Error('inattendu');
    });
    const res = await call('get', `/captures/${CAPTURE_REMOVED}/file`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('STOCK_WHATSAPP_PHOTO_REMOVED');
  });

  it('retrait de la photo : ligne gardée avec l’empreinte, audit critique, fichier effacé après la transaction', async () => {
    const res = await call('post', `/captures/${CAPTURE_A}/remove-photo`, { reason: '  Une personne est visible.  ' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      hasPhoto: false,
      sha256: 'a'.repeat(64),
      canRemovePhoto: false,
      photoRemoved: { reason: 'Une personne est visible.' }
    });
    const stored = mockDb.stockFieldCapture.find(row => row.id === CAPTURE_A) as Row;
    expect(stored.fileUrl).toBeNull();
    expect(stored.photoRemovedByUserId).toBe('user-admin');
    expect(stored.photoRemovalReason).toBe('Une personne est visible.');

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        actionKey: 'STOCK_WHATSAPP_PHOTO_REMOVED',
        tenantId: TENANT_A,
        actorUserId: 'user-admin',
        entityType: 'StockFieldCapture',
        entityId: CAPTURE_A
      })
    );
    expect(mockDeleteCapturePhoto).toHaveBeenCalledWith(`/uploads/stock-whatsapp/${TENANT_A}/2026/photo.jpg`);
    const auditOrder = mockRecordAuditEvent.mock.invocationCallOrder[0];
    expect(mockDeleteCapturePhoto.mock.invocationCallOrder[0]).toBeGreaterThan(auditOrder);
  });

  it('retrait : déjà retirée → 409 ; autre agence → 404 ; motif trop court → 400', async () => {
    const again = await call('post', `/captures/${CAPTURE_REMOVED}/remove-photo`, { reason: 'Encore une fois' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('STOCK_WHATSAPP_PHOTO_ALREADY_REMOVED');

    expect((await call('post', `/captures/${CAPTURE_B}/remove-photo`, { reason: 'Motif valable' })).status).toBe(404);
    expect((await call('post', `/captures/${CAPTURE_A}/remove-photo`, { reason: 'ab' })).status).toBe(400);
    expect(mockDeleteCapturePhoto).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('captures d’un inventaire : la plus récente par article, nombre de captures ; autre agence → 404', async () => {
    const res = await call('get', `/counts/${COUNT_DRAFT}/captures`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      countId: COUNT_DRAFT,
      source: 'WHATSAPP',
      lines: [
        {
          itemId: ITEM_CIMENT,
          countLineId: LINE_CIMENT,
          captureId: CAPTURE_A2,
          outcome: 'CORRECTED',
          mergeMode: 'ADD',
          confirmedAt: '2026-10-02T09:10:40.000Z',
          hasPhoto: true,
          capturesCount: 2
        }
      ]
    });
    expect((await call('get', `/counts/${COUNT_B}/captures`)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Conversations (W14-R3)
// ---------------------------------------------------------------------------

describe('conversations', () => {
  it('liste les sessions de l’agence ; une inscription d’une autre agence → 404', async () => {
    const res = await call('get', '/sessions?open=true');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        id: SESSION_A,
        registrationId: REG_A,
        chefLabel: 'Awa Koné',
        state: 'AWAITING_CONFIRMATION',
        siteName: 'Résidence Les Palmiers',
        countId: COUNT_DRAFT,
        openedAt: '2026-10-02T08:55:00.000Z',
        lastInboundAt: '2026-10-02T09:00:00.000Z',
        closedAt: null,
        closeReason: null,
        countOutcome: null,
        capturesCount: 2
      }
    ]);
    expect((await call('get', `/sessions?registrationId=${REG_B}`)).status).toBe(404);
  });

  it('messages d’une session, boutons compris, sans numéro ; session d’une autre agence → 404', async () => {
    const res = await call('get', `/sessions/${SESSION_A}/messages`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        id: MSG_A,
        direction: 'OUTBOUND',
        kind: 'BUTTONS',
        text: 'Total proposé : 84 sac',
        interactive: [
          { id: `confirm:${CAPTURE_A}`, title: 'Valider' },
          { id: `cancel:${CAPTURE_A}`, title: 'Annuler' }
        ],
        captureId: CAPTURE_A,
        via: null,
        sendError: null,
        createdAt: '2026-10-02T09:00:20.000Z'
      }
    ]);
    expect(JSON.stringify(res.body)).not.toContain('0712345678');
    expect((await call('get', `/sessions/${SESSION_B}/messages`)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Simulateur (W13)
// ---------------------------------------------------------------------------

describe('simulateur', () => {
  const SIMULATOR_ROUTES = ALL_ROUTES.filter(([, path]) => path.startsWith('/simulator'));

  it('transport autre que log : 404 STOCK_WHATSAPP_SIMULATOR_UNAVAILABLE avant toute lecture (W13 critère 1)', async () => {
    mockEnvState.simulatorAvailable = false;
    // Même un appelant sans droit reçoit 404 : rien n'est lu, pas même ses permissions.
    as([], 'user-quelconque');
    for (const [method, path, body] of SIMULATOR_ROUTES) {
      const res = await call(method, path, body);
      expect([path, res.status, res.body.code]).toEqual([path, 404, 'STOCK_WHATSAPP_SIMULATOR_UNAVAILABLE']);
    }
    const photo = await request(app)
      .post(`${BASE}/simulator/messages`)
      .field('registrationId', REG_A)
      .attach('file', Buffer.from([0xff, 0xd8, 0xff]), { filename: 'stock.jpg', contentType: 'image/jpeg' });
    expect(photo.status).toBe(404);

    expect(mockGetUserPermissions).not.toHaveBeenCalled();
    for (const delegate of ['stockWhatsappRegistration', 'stockWhatsappSession', 'stockWhatsappMessage']) {
      expect(mockPrisma[delegate].findFirst).not.toHaveBeenCalled();
      expect(mockPrisma[delegate].findMany).not.toHaveBeenCalled();
    }
    expect(mockDepositSimulatorMedia).not.toHaveBeenCalled();
    expect(mockHandleInboundMessage).not.toHaveBeenCalled();
  });

  it('l’overview annonce l’absence du simulateur', async () => {
    mockEnvState.simulatorAvailable = false;
    mockRaw.measures = [{ total: 0 }];
    const res = await call('get', '/overview');
    expect(res.body.data.simulatorAvailable).toBe(false);
  });

  it('un texte passe par le moteur du webhook, via SIMULATOR, hors du contexte de la requête', async () => {
    let ambientTenant: unknown = 'non lu';
    mockHandleInboundMessage.mockImplementation(async () => {
      ambientTenant = getTenantContext();
    });

    const res = await call('post', '/simulator/messages', { registrationId: REG_A, text: 'AIDE' });
    expect(res.status).toBe(202);
    expect(res.body.data.metaMessageId).toMatch(/^sim-[0-9a-f-]{36}$/);

    await flush();
    expect(mockHandleInboundMessage).toHaveBeenCalledTimes(1);
    const message = mockHandleInboundMessage.mock.calls[0][0];
    expect(message).toMatchObject({
      metaMessageId: res.body.data.metaMessageId,
      fromE164: PHONE_A,
      via: 'SIMULATOR',
      kind: 'TEXT',
      text: 'AIDE'
    });
    expect(message.receivedAt).toBeInstanceOf(Date);
    // Comme un message Meta : aucune agence ambiante (le moteur la résout depuis l'inscription).
    expect(ambientTenant).toBeUndefined();

    // Témoin : dans la requête elle-même, l'agence ambiante est bien posée.
    let requestTenant: unknown;
    mockRegistrations.listEligibleMembers.mockImplementation(async () => {
      requestTenant = getTenantContext()?.tenantId;
      return [];
    });
    await call('get', '/eligible-members').expect(200);
    expect(requestTenant).toBe(TENANT_A);
  });

  it('une réponse de bouton porte son identifiant et son titre', async () => {
    await call('post', '/simulator/messages', {
      registrationId: REG_A,
      replyId: `confirm:${CAPTURE_A}`,
      replyTitle: 'Valider'
    }).expect(202);
    await flush();
    expect(mockHandleInboundMessage.mock.calls[0][0]).toMatchObject({
      kind: 'REPLY',
      replyId: `confirm:${CAPTURE_A}`,
      replyTitle: 'Valider',
      contextMessageId: null
    });
  });

  it('une photo est déposée dans le magasin du transport log, légende comprise (W13 critère 2)', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const res = await request(app)
      .post(`${BASE}/simulator/messages`)
      .field('registrationId', REG_A)
      .field('caption', 'fake:item=CIM-45;total=60')
      .attach('file', jpeg, { filename: 'stock.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(202);
    expect(mockDepositSimulatorMedia).toHaveBeenCalledWith(jpeg, 'image/jpeg');
    await flush();
    expect(mockHandleInboundMessage.mock.calls[0][0]).toMatchObject({
      kind: 'IMAGE',
      via: 'SIMULATOR',
      fromE164: PHONE_A,
      media: {
        mediaId: 'sim-media-1',
        mimeType: 'image/jpeg',
        providerSha256: null,
        caption: 'fake:item=CIM-45;total=60'
      }
    });
  });

  it('photo : type refusé → 400 STOCK_WHATSAPP_SIMULATOR_FILE_TYPE ; plus de 10 Mo → 413 STOCK_WHATSAPP_FILE_TOO_LARGE', async () => {
    const wrongType = await request(app)
      .post(`${BASE}/simulator/messages`)
      .field('registrationId', REG_A)
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.code).toBe('STOCK_WHATSAPP_SIMULATOR_FILE_TYPE');

    const tooLarge = await request(app)
      .post(`${BASE}/simulator/messages`)
      .field('registrationId', REG_A)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), { filename: 'big.jpg', contentType: 'image/jpeg' });
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.code).toBe('STOCK_WHATSAPP_FILE_TOO_LARGE');

    expect(mockDepositSimulatorMedia).not.toHaveBeenCalled();
    await flush();
    expect(mockHandleInboundMessage).not.toHaveBeenCalled();
  });

  it('corps : exactement une cible et un contenu', async () => {
    for (const body of [
      { text: 'x' },
      { registrationId: REG_A, freePhone: '0100000999', text: 'x' },
      { registrationId: REG_A },
      { registrationId: REG_A, text: 'x', replyId: 'confirm:1' },
      { registrationId: REG_A, text: 'x', replyTitle: 'Valider' },
      { registrationId: REG_A, text: 'x', tenantId: TENANT_A }
    ]) {
      expect((await call('post', '/simulator/messages', body)).status).toBe(400);
    }
    await flush();
    expect(mockHandleInboundMessage).not.toHaveBeenCalled();
  });

  it('une inscription d’une autre agence → 404, le moteur n’est pas appelé', async () => {
    expect((await call('post', '/simulator/messages', { registrationId: REG_B, text: 'AIDE' })).status).toBe(404);
    expect((await call('get', `/simulator/conversation?registrationId=${REG_B}`)).status).toBe(404);
    await flush();
    expect(mockHandleInboundMessage).not.toHaveBeenCalled();
  });

  it('numéro libre : normalisé, refusé s’il est inscrit (quelle que soit l’agence), invalide → 400', async () => {
    await call('post', '/simulator/messages', { freePhone: '+225 01 00 00 09 99', text: 'Bonjour' }).expect(202);
    await flush();
    expect(mockHandleInboundMessage.mock.calls[0][0]).toMatchObject({ fromE164: '+2250100000999', kind: 'TEXT' });

    mockRaw.phoneTaken = true;
    const taken = await call('post', '/simulator/messages', { freePhone: '0799999999', text: 'Bonjour' });
    expect(taken.status).toBe(400);
    expect(JSON.stringify(taken.body)).not.toContain(TENANT_B);

    const invalid = await call('post', '/simulator/messages', { freePhone: '12', text: 'Bonjour' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('STOCK_WHATSAPP_PHONE_INVALID');
    await flush();
    expect(mockHandleInboundMessage).toHaveBeenCalledTimes(1);
  });

  it('conversation d’un numéro libre : messages entrants gardés en mémoire et boîte d’envoi du transport log', async () => {
    await call('post', '/simulator/messages', { freePhone: '0100000999', text: 'Bonjour' }).expect(202);
    mockListUnknownSenderOutbox.mockReturnValue([
      {
        sentAt: new Date(Date.now() + 1000),
        message: { kind: 'TEXT', text: "Bonjour. Ce numéro n'est pas associé à un compte Chef de chantier ImmoTopia." }
      }
    ]);

    const res = await call('get', '/simulator/conversation?freePhone=0100000999');
    expect(res.status).toBe(200);
    expect(res.body.data.session).toBeNull();
    expect(res.body.data.messages.map((message: any) => [message.direction, message.text])).toEqual([
      ['INBOUND', 'Bonjour'],
      ['OUTBOUND', "Bonjour. Ce numéro n'est pas associé à un compte Chef de chantier ImmoTopia."]
    ]);
    expect(mockListUnknownSenderOutbox).toHaveBeenCalledWith('+2250100000999', undefined);
  });

  it('conversation d’une inscription : session ouverte et messages, relecture incrémentale par after', async () => {
    const res = await call('get', `/simulator/conversation?registrationId=${REG_A}`);
    expect(res.status).toBe(200);
    expect(res.body.data.session).toMatchObject({ id: SESSION_A, state: 'AWAITING_CONFIRMATION' });
    expect(res.body.data.messages.map((message: any) => message.id)).toEqual([MSG_A]);

    const later = await call('get', `/simulator/conversation?registrationId=${REG_A}&after=2026-10-02T09:00:20.000Z`);
    expect(later.body.data.messages).toEqual([]);
  });

  it('horloge : recule lastInboundAt puis lance la tâche pour cette session (W13-R5)', async () => {
    let ambientTenant: unknown = 'non lu';
    mockRunSessionTimers.mockImplementation(async () => {
      ambientTenant = getTenantContext();
    });
    const res = await call('post', `/simulator/sessions/${SESSION_A}/advance`, { minutes: 30 });
    expect(res.status).toBe(200);
    expect(ambientTenant).toBeUndefined();
    const stored = mockDb.stockWhatsappSession.find(row => row.id === SESSION_A) as Row;
    expect(stored.lastInboundAt.toISOString()).toBe('2026-10-02T08:30:00.000Z');
    expect(mockRunSessionTimers).toHaveBeenCalledWith({ sessionId: SESSION_A });
    expect(res.body.data).toMatchObject({ id: SESSION_A, lastInboundAt: '2026-10-02T08:30:00.000Z' });
  });

  it('horloge : session d’une autre agence → 404 ; session close inchangée ; minutes hors 10 et 30 → 400', async () => {
    expect((await call('post', `/simulator/sessions/${SESSION_B}/advance`, { minutes: 10 })).status).toBe(404);
    expect((await call('post', `/simulator/sessions/${SESSION_A}/advance`, { minutes: 15 })).status).toBe(400);

    mockDb.stockWhatsappSession[0].closedAt = new Date('2026-10-02T09:30:00.000Z');
    const closed = await call('post', `/simulator/sessions/${SESSION_A}/advance`, { minutes: 10 });
    expect(closed.status).toBe(200);
    expect(mockDb.stockWhatsappSession[0].lastInboundAt.toISOString()).toBe('2026-10-02T09:00:00.000Z');
    expect(mockRunSessionTimers).not.toHaveBeenCalled();
  });
});
