/**
 * Tests de l'inventaire physique (`lib/finance/stock-inventaire.ts`) — lot 5,
 * refondu par le lot 040 (spec A1 à A4, A7, B4, B7).
 *
 * Magasin en mémoire derrière `utils/database`, comme aux sous-lots
 * précédents. `accounting.ts` est mocké : ce fichier vérifie QUAND une
 * écriture est demandée, pas comment elle s'équilibre. `site-cost.ts`
 * (`sumSiteActualCost`) n'est PAS mocké : c'est le vrai calcul qui prouve
 * qu'un écart n'impute jamais un chantier.
 *
 * La dérogation A1-R3 interroge la base : le magasin simule la requête (membre
 * actif, utilisateur actif, hors plateforme, rôle de l'agence portant
 * STOCK_COUNT_VALIDATE) et un test épingle la forme exacte de la requête ; la
 * preuve en base réelle est dans `__tests__/integration/stock-cloture-concurrence.test.ts`.
 *
 * Verrou de l'inventaire : `$queryRaw … FOR UPDATE` est noté dans `store.locks`
 * (`stock-count:<id>`), et `onCountLock` simule une transaction concurrente
 * VALIDÉE pendant l'attente du verrou : ce que l'opération lit ensuite doit
 * être l'état d'après. `clock_timestamp()` rend `store.dbClock`.
 *
 * Cas inversés délibérément (spec §11) : l'ancien test « l'ajustement ramène
 * au compté » attendait une entrée de 10 et un solde de 90 ; l'ajustement
 * applique désormais l'ÉCART au solde courant (A3) : diminution de 10, solde 70.
 */

import { randomUUID } from 'crypto';

const postDocumentEntryTx = jest.fn();

const COMPTES_OPERATIONNELS = new Map<string, string>([
  ['311', 'compte-311'],
  ['603', 'compte-603'],
  ['605', 'compte-605']
]);

jest.mock('../../src/lib/finance/accounting', () => ({
  postDocumentEntryTx: (...args: any[]) => postDocumentEntryTx(...args),
  ensureOperationalJournalTx: async () => 'journal-operationnel',
  ensureOperationalChartOfAccountsTx: async () => COMPTES_OPERATIONNELS
}));

type Row = Record<string, any>;

const store = {
  sites: [] as Row[],
  items: [] as Row[],
  locations: [] as Row[],
  balances: [] as Row[],
  movements: [] as Row[],
  counts: [] as Row[],
  countLines: [] as Row[],
  allocations: [] as Row[],
  users: [] as Row[],
  slips: [] as Row[],
  alerts: [] as Row[],
  audits: [] as Row[],
  deferred: [] as Row[],
  locks: [] as string[],
  attachments: [] as Row[],
  seq: 0
};

/** Permissions par utilisateur, telles que `getUserPermissions` les rendrait. */
const permissionsByUser = new Map<string, string[]>();

jest.mock('../../src/services/permission-service', () => ({
  getUserPermissions: async (userId: string) => permissionsByUser.get(userId) ?? []
}));

jest.mock('../../src/services/audit-service', () => ({
  recordAuditEvent: async (_tx: any, entry: any) => {
    store.audits.push(entry);
  },
  logAuditEvent: (entry: any) => {
    store.deferred.push(entry);
  }
}));

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

// ---------------------------------------------------------------------------
// Filtre Prisma minimal : égalité, in, not, gt, lt
// ---------------------------------------------------------------------------

function matchesValue(value: any, filter: any): boolean {
  if (filter === undefined) return true;
  if (filter === null) return value === null || value === undefined;
  if (filter && typeof filter === 'object' && !(filter instanceof Date)) {
    if ('in' in filter && !filter.in.includes(value)) return false;
    if ('not' in filter) {
      if (filter.not === null) {
        if (value === null || value === undefined) return false;
      } else if (typeof filter.not === 'object' && filter.not !== null) {
        if (matchesValue(value, filter.not)) return false;
      } else if (Number(value) === Number(filter.not) && typeof filter.not === 'number') {
        return false;
      } else if (value === filter.not) {
        return false;
      }
    }
    if ('gt' in filter) {
      const v = value instanceof Date ? value.getTime() : Number(value);
      const f = filter.gt instanceof Date ? filter.gt.getTime() : Number(filter.gt);
      if (!(v > f)) return false;
    }
    return true;
  }
  if (typeof filter === 'number') return Number(value) === filter;
  return value === filter;
}

function matches(row: Row, where: Row = {}, skip: string[] = []): boolean {
  return Object.entries(where).every(([key, filter]) => {
    if (skip.includes(key)) return true;
    if (key === 'OR') return (filter as Row[]).some(branch => matches(row, branch));
    return matchesValue(row[key], filter);
  });
}

// ---------------------------------------------------------------------------
// Enrichissement des relations (le `select` est ignoré : tout est rendu)
// ---------------------------------------------------------------------------

const userOf = (id: string | null | undefined) => (id ? (store.users.find(u => u.id === id) ?? null) : null);

function enrichLine(line: Row): Row {
  const count = store.counts.find(c => c.id === line.countId);
  return {
    ...line,
    item: store.items.find(i => i.id === line.itemId) ?? null,
    countedBy: userOf(line.countedByUserId),
    justifiedBy: userOf(line.justifiedByUserId),
    setAsideBy: userOf(line.setAsideByUserId),
    _count: { attachments: store.attachments.filter(a => a.countLineId === line.id).length },
    count: count
      ? { status: count.status, kind: count.kind, locationId: count.locationId, tenantId: count.tenantId }
      : null
  };
}

function enrichCount(row: Row): Row {
  const location = store.locations.find(l => l.id === row.locationId) ?? null;
  const site = location?.siteId ? store.sites.find(s => s.id === location.siteId) : null;
  const slip = store.slips.find(s => s.stockCountId === row.id) ?? null;
  return {
    ...row,
    location: location
      ? { ...location, site: site ? { name: site.name, stockEnabledAt: site.stockEnabledAt } : null }
      : null,
    createdBy: userOf(row.createdByUserId),
    closedBy: userOf(row.closedByUserId),
    validatedBy: userOf(row.validatedByUserId),
    slip,
    lines: store.countLines.filter(l => l.countId === row.id).map(enrichLine)
  };
}

const countFields = (data: Row): Row => ({
  validatedAt: null,
  validatedByUserId: null,
  closedAt: null,
  closedByUserId: null,
  cancelledAt: null,
  cancelReason: null,
  selfValidated: false,
  selfValidationReason: null,
  counterUserIds: [],
  countedValue: null,
  varianceValueGross: null,
  varianceValueNet: null,
  setAsideVarianceValue: null,
  kind: 'REGULAR',
  createdAt: new Date(Date.now() + store.counts.length),
  ...data
});

const lineFields = (data: Row): Row => ({
  reason: null,
  expectedCapturedAt: null,
  countedByUserId: null,
  countedAtServer: null,
  countedBlind: null,
  reasonCode: null,
  justifiedByUserId: null,
  justifiedAt: null,
  setAsideAt: null,
  setAsideByUserId: null,
  setAsideReason: null,
  unitCostAtValidation: null,
  movementsSinceCapture: null,
  ...data
});

const userQueries: Row[] = [];

/** Actions jouées une fois, chacune au prochain verrou d'inventaire (transaction concurrente validée). */
const onCountLock: Array<(countId: string) => void> = [];
/** L'horloge de la base (`clock_timestamp()`) ; `null` = l'heure courante. */
let dbClock: Date | null = null;

const mockPrisma: Row = {
  $executeRaw: jest.fn(async (_strings: TemplateStringsArray, ...values: any[]) => {
    store.locks.push(values.map(String).join(':'));
    return 0;
  }),

  $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
    const sql = strings.join('?');
    if (sql.includes('clock_timestamp()')) {
      return [{ now: dbClock ?? new Date() }];
    }
    if (sql.includes('FOR UPDATE') && sql.includes('"stock_counts"')) {
      const [countId, tenantId] = values;
      store.locks.push(`stock-count:${countId}`);
      const hook = onCountLock.shift();
      if (hook) hook(countId);
      return store.counts.filter(c => c.id === countId && c.tenantId === tenantId).map(c => ({ id: c.id }));
    }
    throw new Error(`$queryRaw inattendu : ${sql}`);
  }),

  stockItem: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.items.find(i => i.id === where.id && i.tenantId === where.tenantId) ?? null
    )
  },

  stockLocation: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const location = store.locations.find(l => matches(l, where));
      if (!location) return null;
      const site = location.siteId ? store.sites.find(s => s.id === location.siteId) : null;
      return { ...location, site: site ? { stockEnabledAt: site.stockEnabledAt ?? null } : null };
    })
  },

  stockSettings: { findUnique: jest.fn(async () => null) },

  stockBalance: {
    findFirst: jest.fn(async ({ where }: Row) => store.balances.find(b => matches(b, where)) ?? null),
    findMany: jest.fn(async ({ where }: Row) =>
      store.balances
        .filter(b => matches(b, where))
        .map(b => ({ ...b, item: store.items.find(i => i.id === b.itemId) ?? null }))
    ),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('solde'), ...data };
      store.balances.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.balances.find(b => b.id === where.id)!;
      Object.assign(row, data);
      return row;
    })
  },

  stockMovement: {
    create: jest.fn(async ({ data }: Row) => {
      const created = {
        id: nextId('mouvement'),
        journalEntryId: null,
        siteId: null,
        stockCountId: null,
        reason: null,
        reasonCode: null,
        slipId: null,
        transferGroupId: null,
        createdAt: new Date(Date.now() + 1000 + store.movements.length),
        ...data
      };
      store.movements.push(created);
      return {
        ...created,
        item: store.items.find(i => i.id === created.itemId) ?? null,
        location: store.locations.find(l => l.id === created.locationId) ?? null,
        createdBy: userOf(created.createdByUserId)
      };
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.movements.find(m => m.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    findMany: jest.fn(async ({ where }: Row) => store.movements.filter(m => matches(m, where)))
  },

  stockCount: {
    findFirst: jest.fn(async ({ where, orderBy }: Row) => {
      const rows = store.counts.filter(c => matches(c, where));
      if (orderBy?.validatedAt === 'desc') rows.sort((a, b) => b.validatedAt - a.validatedAt);
      return rows[0] ? enrichCount(rows[0]) : null;
    }),
    findMany: jest.fn(async ({ where }: Row) =>
      store.counts
        .filter(c => matches(c, where))
        .sort((a, b) => b.countedAt.getTime() - a.countedAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime())
        .map(enrichCount)
    ),
    create: jest.fn(async ({ data }: Row) => {
      // Un vrai UUID : le verrou de l'inventaire refuse un identifiant mal formé.
      const created = countFields({ id: randomUUID(), ...data });
      store.counts.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.counts.find(c => c.id === where.id && c.tenantId === where.tenantId)!;
      const { counterUserIds, ...rest } = data;
      if (counterUserIds?.push) row.counterUserIds = [...row.counterUserIds, counterUserIds.push];
      Object.assign(row, rest);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.counts.filter(c => matches(c, where));
      rows.forEach(row => Object.assign(row, data));
      return { count: rows.length };
    })
  },

  stockCountLine: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const line = store.countLines.find(l => {
        if (!matches(l, where, ['count'])) return false;
        if (where.count?.tenantId) {
          return store.counts.find(c => c.id === l.countId)?.tenantId === where.count.tenantId;
        }
        return true;
      });
      return line ? enrichLine(line) : null;
    }),
    findMany: jest.fn(async ({ where }: Row) => store.countLines.filter(l => matches(l, where)).map(enrichLine)),
    create: jest.fn(async ({ data }: Row) => {
      const created = lineFields({ id: nextId('ligne'), ...data });
      store.countLines.push(created);
      return created;
    }),
    createMany: jest.fn(async ({ data }: Row) => {
      for (const entry of data) store.countLines.push(lineFields({ id: nextId('ligne'), ...entry }));
      return { count: data.length };
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.countLines.find(l => l.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.countLines.filter(l => matches(l, where));
      rows.forEach(row => Object.assign(row, data));
      return { count: rows.length };
    }),
    delete: jest.fn(async ({ where }: Row) => {
      const index = store.countLines.findIndex(l => l.id === where.id);
      return store.countLines.splice(index, 1)[0];
    })
  },

  stockSlip: {
    aggregate: jest.fn(async ({ where }: Row) => {
      const rows = store.slips.filter(s => matches(s, where));
      return { _max: { number: rows.length ? Math.max(...rows.map(s => s.number)) : null } };
    }),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('bon'), createdAt: new Date(), ...data };
      store.slips.push(created);
      return created;
    })
  },

  stockAlert: {
    createMany: jest.fn(async ({ data }: Row) => {
      for (const alert of data) {
        if (!store.alerts.some(a => a.tenantId === alert.tenantId && a.dedupeKey === alert.dedupeKey)) {
          store.alerts.push(alert);
        }
      }
      return { count: data.length };
    })
  },

  user: {
    // La dérogation (A1-R3) : la requête est notée pour qu'un test en épingle la forme.
    findFirst: jest.fn(async ({ where }: Row) => {
      userQueries.push(where);
      const tenantId = where.memberships.some.tenantId;
      return (
        store.users.find(
          u =>
            (where.id.notIn ? !where.id.notIn.includes(u.id) : u.id !== where.id.not) &&
            u.isActive !== false &&
            u.globalRole !== 'SUPER_ADMIN' &&
            (u.memberships ?? []).some((m: Row) => m.tenantId === tenantId && m.status === 'ACTIVE') &&
            (u.validatorIn ?? []).includes(tenantId)
        ) ?? null
      );
    }),
    findMany: jest.fn(async ({ where }: Row) => store.users.filter(u => where.id.in.includes(u.id)))
  },

  costAllocation: {
    create: jest.fn(async ({ data }: Row) => {
      store.allocations.push({ id: nextId('imputation'), ...data });
      return data;
    }),
    aggregate: jest.fn(async ({ where }: Row) => {
      const rows = store.allocations.filter(a => a.tenantId === where.tenantId && a.siteId === where.siteId);
      return { _sum: { amount: rows.length ? rows.reduce((t, r) => t + Number(r.amount), 0) : null } };
    })
  }
};

/** Rollback par copie profonde en cas d'erreur. */
async function runTransaction<T>(callback: (tx: Row) => Promise<T>): Promise<T> {
  const keys = ['balances', 'movements', 'counts', 'countLines', 'allocations', 'slips', 'alerts', 'audits'] as const;
  const snapshot = Object.fromEntries(keys.map(key => [key, structuredClone(store[key])]));
  const seq = store.seq;
  try {
    return await callback(mockPrisma);
  } catch (error) {
    for (const key of keys) (store as any)[key] = snapshot[key];
    store.seq = seq;
    throw error;
  }
}

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === '$transaction') return (callback: any) => runTransaction(callback);
        return (mockPrisma as any)[prop];
      }
    }
  )
}));

import {
  cancelStockCountTx,
  closeStockCountTx,
  createStockCountTx,
  getStockCountView,
  hasOtherActiveCountValidator,
  justifyStockCountLineTx,
  listStockCountViews,
  removeStockCountLineTx,
  setAsideStockCountLineTx,
  setAsideUncountedStockCountLinesTx,
  setStockCountLineTx,
  validateStockCountTx
} from '../../src/lib/finance/stock-inventaire';
import { sumSiteActualCost } from '../../src/lib/finance/site-cost';
import type { StockCallerContext } from '../../src/lib/finance/types-040-controle';

const TENANT_ID = 'tenant-1';
/** Inventaire d'avant le lot, posé à la main dans le magasin. */
const ANCIEN = '00000000-0000-4000-8000-0000000000a1';
const AWA = 'user-awa';
const KOFFI = 'user-koffi';
const MOUSSA = 'user-moussa';
const TODAY = new Date();
const DAY = 86_400_000;

function ctxFor(userId: string, overrides: Partial<StockCallerContext> = {}): StockCallerContext {
  return {
    userId,
    valuesVisible: true,
    canValidateCount: true,
    canReceive: true,
    canIssue: true,
    canTransfer: true,
    canCount: true,
    canDispose: true,
    canManageTakers: true,
    canViewAlerts: true,
    canManageSettings: true,
    ...overrides
  };
}

const MAGASINIER_CTX = ctxFor(MOUSSA, { valuesVisible: false, canValidateCount: false });

function seedUser(
  id: string,
  fullName: string,
  options: { validator?: boolean; active?: boolean; membership?: string } = {}
) {
  store.users.push({
    id,
    fullName,
    email: `${id}@example.ci`,
    isActive: options.active !== false,
    globalRole: 'USER',
    memberships: [{ tenantId: TENANT_ID, status: options.membership ?? 'ACTIVE' }],
    validatorIn: options.validator ? [TENANT_ID] : []
  });
  permissionsByUser.set(id, options.validator ? ['STOCK_COUNT', 'STOCK_COUNT_VALIDATE'] : ['STOCK_COUNT']);
}

function seedSite(overrides: Partial<Row> = {}): Row {
  const site = {
    id: nextId('chantier'),
    tenantId: TENANT_ID,
    name: 'Résidence Cocody',
    stockEnabledAt: null,
    ...overrides
  };
  store.sites.push(site);
  return site;
}

function seedItem(overrides: Partial<Row> = {}): Row {
  const item = {
    id: nextId('article'),
    tenantId: TENANT_ID,
    reference: `ART-${String(store.items.length + 1).padStart(3, '0')}`,
    label: 'Ciment CPJ 45',
    unit: 'sac',
    isActive: true,
    ...overrides
  };
  store.items.push(item);
  return item;
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

function seedSiteLocation(site: Row): Row {
  return seedLocation({ kind: 'SITE', label: `Chantier ${site.name}`, siteId: site.id });
}

function seedBalance(location: Row, item: Row, quantity: number, value: number): Row {
  const balance = {
    id: nextId('solde'),
    tenantId: TENANT_ID,
    itemId: item.id,
    locationId: location.id,
    quantity,
    value
  };
  store.balances.push(balance);
  return balance;
}

const soldeDe = (location: Row, item: Row) =>
  store.balances.find(b => b.locationId === location.id && b.itemId === item.id);
const adjustments = () => store.movements.filter(m => m.type === 'ADJUSTMENT');

async function openCount(location: Row, options: { kind?: any; by?: string; countedAt?: Date } = {}) {
  return runTransaction((tx: any) =>
    createStockCountTx(tx, TENANT_ID, {
      locationId: location.id,
      countedAt: options.countedAt ?? TODAY,
      createdByUserId: options.by ?? MOUSSA,
      ...(options.kind ? { kind: options.kind } : {})
    })
  );
}

async function setLine(countId: string, item: Row, countedQuantity: number, by = MOUSSA) {
  return runTransaction((tx: any) =>
    setStockCountLineTx(tx, TENANT_ID, countId, { itemId: item.id, countedQuantity, countedByUserId: by })
  );
}

async function close(countId: string, by = MOUSSA) {
  return runTransaction((tx: any) => closeStockCountTx(tx, TENANT_ID, countId, by));
}

async function justify(
  countId: string,
  item: Row,
  reasonCode: any = 'BREAKAGE',
  reason: string | null = null,
  by = MOUSSA
) {
  return runTransaction((tx: any) =>
    justifyStockCountLineTx(tx, TENANT_ID, countId, item.id, { reasonCode, reason, justifiedByUserId: by })
  );
}

async function validate(countId: string, by = KOFFI, selfValidationReason?: string) {
  return runTransaction((tx: any) => validateStockCountTx(tx, TENANT_ID, countId, by, { selfValidationReason }));
}

async function setAside(countId: string, item: Row, reason = 'Comptage douteux', by = KOFFI) {
  return runTransaction((tx: any) =>
    setAsideStockCountLineTx(tx, TENANT_ID, countId, item.id, { reason, setAsideByUserId: by })
  );
}

/**
 * Une sortie du lieu enregistrée APRÈS le comptage (transfert, sortie) : le
 * solde baisse et un mouvement postérieur à l'heure de figeage est noté. Le
 * transfert réel appartient au territoire des mouvements (`stock-transferts.ts`) :
 * ce fichier n'en dépend pas.
 */
function moveOut(location: Row, item: Row, quantity: number): void {
  const balance = soldeDe(location, item)!;
  const avg = Number(balance.value) / Number(balance.quantity);
  balance.quantity = Number(balance.quantity) - quantity;
  balance.value = Math.round(Number(balance.quantity) * avg);
  store.movements.push({
    id: nextId('mouvement'),
    tenantId: TENANT_ID,
    type: 'TRANSFER',
    itemId: item.id,
    locationId: location.id,
    isDecrease: true,
    quantity,
    createdAt: new Date(Date.now() + 60_000)
  });
}

/** Ouvre, saisit et clôt un inventaire en une fois. */
async function countedInventory(location: Row, lines: Array<[Row, number]>, kind?: any) {
  const count = await openCount(location, { kind });
  for (const [item, quantity] of lines) await setLine(count.id, item, quantity);
  await close(count.id);
  return count;
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(store) as Array<keyof typeof store>) {
    if (Array.isArray(store[key])) (store as any)[key] = [];
  }
  store.seq = 0;
  userQueries.length = 0;
  onCountLock.length = 0;
  dbClock = null;
  permissionsByUser.clear();
  seedUser(AWA, 'Awa Koné', { validator: true });
  seedUser(KOFFI, 'Koffi Yao', { validator: true });
  seedUser(MOUSSA, 'Moussa Traoré');
  postDocumentEntryTx.mockImplementation(async () => ({ entryId: nextId('ecriture'), totalDebit: 0, totalCredit: 0 }));
});

// ---------------------------------------------------------------------------
// Contrat figé pour le lot 041 (plan §11)
// ---------------------------------------------------------------------------

describe('contrat du lot 041 — appel hors requête HTTP', () => {
  it('ouvre, saisit et clôt sans contexte de requête, l’audit portant agence et auteur', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);

    const created = await openCount(magasin, { by: MOUSSA });
    expect(created).toEqual({ id: expect.any(String), locationId: magasin.id, kind: 'REGULAR', status: 'DRAFT' });

    const saved = await setLine(created.id, ciment, 92, MOUSSA);
    expect(saved.lineId).toEqual(expect.any(String));
    // Aucun attendu ni écart dans le retour (A2-R2).
    expect(saved.line).toMatchObject({
      countedQuantity: 92,
      expectedQuantity: null,
      variance: null,
      varianceValue: null
    });
    expect(JSON.stringify(saved)).not.toMatch(/"expectedQuantity":100/);

    const closed = await close(created.id, MOUSSA);
    expect(closed).toEqual({ id: created.id, status: 'COUNTED', uncountedLinesCreated: 0 });

    // Sans collecteur, les événements non critiques s'écrivent dans la transaction.
    expect(store.audits.map(a => a.actionKey)).toEqual([
      'STOCK_COUNT_OPENED',
      'STOCK_COUNT_LINE_RECORDED',
      'STOCK_COUNT_CLOSED'
    ]);
    expect(store.audits.every(a => a.tenantId === TENANT_ID && a.actorUserId === MOUSSA)).toBe(true);
  });

  it('diffère les événements non critiques quand l’appelant les collecte (B6-R5)', async () => {
    const magasin = seedLocation();
    const deferredAudit: any[] = [];
    await runTransaction((tx: any) =>
      createStockCountTx(
        tx,
        TENANT_ID,
        { locationId: magasin.id, countedAt: TODAY, createdByUserId: MOUSSA },
        { deferredAudit }
      )
    );
    expect(store.audits).toHaveLength(0);
    expect(deferredAudit.map(a => a.actionKey)).toEqual(['STOCK_COUNT_OPENED']);
  });
});

// ---------------------------------------------------------------------------
// Ouvrir un inventaire (A2, A5-R4, A7-R1)
// ---------------------------------------------------------------------------

describe('createStockCountTx', () => {
  it('refuse un second inventaire ouvert (DRAFT ou COUNTED) sur le même lieu', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);
    const premier = await openCount(magasin);
    await expect(openCount(magasin)).rejects.toMatchObject({ statusCode: 409, code: 'STOCK_COUNT_ALREADY_OPEN' });
    await setLine(premier.id, ciment, 10);
    await close(premier.id);
    await expect(openCount(magasin)).rejects.toMatchObject({ code: 'STOCK_COUNT_ALREADY_OPEN' });
  });

  it('refuse un lieu désactivé (409) et un lieu d’une autre agence (404)', async () => {
    await expect(openCount(seedLocation({ isActive: false }))).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_LOCATION_INACTIVE'
    });
    await expect(openCount(seedLocation({ tenantId: 'tenant-2' }))).rejects.toMatchObject({ statusCode: 404 });
  });

  it('borne la date d’inventaire (A5-R4)', async () => {
    const magasin = seedLocation();
    await expect(openCount(magasin, { countedAt: new Date(Date.now() + 2 * DAY) })).rejects.toMatchObject({
      statusCode: 400,
      code: 'STOCK_DATE_IN_FUTURE'
    });
    await expect(openCount(magasin, { countedAt: new Date(Date.now() - 8 * DAY) })).rejects.toMatchObject({
      code: 'STOCK_DATE_TOO_OLD'
    });
  });

  it('A7-4 : OPENING refusé sur un magasin et 31 jours après la bascule', async () => {
    await expect(openCount(seedLocation(), { kind: 'OPENING' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_OPENING_COUNT_NOT_ALLOWED'
    });
    const ancien = seedSite({ stockEnabledAt: new Date(Date.now() - 31 * DAY) });
    await expect(openCount(seedSiteLocation(ancien), { kind: 'OPENING' })).rejects.toMatchObject({
      code: 'STOCK_OPENING_COUNT_NOT_ALLOWED'
    });
  });

  it('A7-3 : un second OPENING sur le même lieu → STOCK_OPENING_COUNT_EXISTS', async () => {
    const lieu = seedSiteLocation(seedSite({ stockEnabledAt: new Date(Date.now() - DAY) }));
    const sable = seedItem({ label: 'Sable' });
    const ouverture = await openCount(lieu, { kind: 'OPENING' });
    await setLine(ouverture.id, sable, 5);
    await close(ouverture.id);
    await validate(ouverture.id);
    await expect(openCount(lieu, { kind: 'OPENING' })).rejects.toMatchObject({ code: 'STOCK_OPENING_COUNT_EXISTS' });
  });

  it('CLOSING réservé au lieu d’un chantier', async () => {
    await expect(openCount(seedLocation(), { kind: 'CLOSING' })).rejects.toMatchObject({
      code: 'STOCK_OPENING_COUNT_NOT_ALLOWED'
    });
  });
});

// ---------------------------------------------------------------------------
// A2 — aveugle, clôture du comptage, lignes non comptées, abandon
// ---------------------------------------------------------------------------

describe('A2 — inventaire à l’aveugle', () => {
  it('A2-1 : en DRAFT, ni 100 ni −8 ne sortent, pour le magasinier comme pour un administrateur', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);
    const count = await openCount(magasin);

    const saved = await setLine(count.id, ciment, 92);
    expect(saved.line).toMatchObject({ expectedQuantity: null, variance: null, varianceValue: null });

    for (const ctx of [MAGASINIER_CTX, ctxFor(AWA)]) {
      const view = await getStockCountView(TENANT_ID, count.id, ctx);
      expect(view.blind).toBe(true);
      expect(view.varianceCount).toBeNull();
      expect(view.varianceValueNet).toBeNull();
      expect(view.lines[0]).toMatchObject({ countedQuantity: 92, expectedQuantity: null, variance: null });
      expect(JSON.stringify(view)).not.toMatch(/"expectedQuantity":100|"variance":-8|"varianceValue":-40000/);
    }
  });

  it('A2-4 : en COUNTED, l’écart se révèle ; la valeur reste masquée sans STOCK_VALUES_VIEW', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);
    const count = await countedInventory(magasin, [[ciment, 92]]);

    const vue = await getStockCountView(TENANT_ID, count.id, MAGASINIER_CTX);
    expect(vue.lines[0]).toMatchObject({ expectedQuantity: 100, variance: -8, varianceValue: null });
    const admin = await getStockCountView(TENANT_ID, count.id, ctxFor(AWA));
    expect(admin.lines[0].varianceValue).toBe(-40_000);
    expect(admin.varianceCount).toBe(1);
  });

  it('A2-5 : en COUNTED, saisir ou retirer une ligne → 409 STOCK_COUNT_WRONG_STATUS', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);
    const count = await countedInventory(magasin, [[ciment, 10]]);
    await expect(setLine(count.id, ciment, 9)).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_COUNT_WRONG_STATUS'
    });
    await expect(
      runTransaction((tx: any) => removeStockCountLineTx(tx, TENANT_ID, count.id, ciment.id, MOUSSA))
    ).rejects.toMatchObject({ code: 'STOCK_COUNT_WRONG_STATUS' });
  });

  it('A2-6 : clore un inventaire sans ligne → 409 STOCK_COUNT_EMPTY', async () => {
    const magasin = seedLocation();
    seedBalance(magasin, seedItem(), 10, 50_000);
    const count = await openCount(magasin);
    await expect(close(count.id)).rejects.toMatchObject({ statusCode: 409, code: 'STOCK_COUNT_EMPTY' });
  });

  it('un CLOSING d’un lieu vide se clôt sans ligne : il atteste le lieu vide (A2-R4)', async () => {
    const lieu = seedSiteLocation(seedSite());
    const count = await openCount(lieu, { kind: 'CLOSING' });
    await expect(close(count.id)).resolves.toMatchObject({ status: 'COUNTED', uncountedLinesCreated: 0 });
  });

  it('A2-8 : le non-compté naît à la clôture, bloque la validation, puis s’écarte sans ajustement', async () => {
    const magasin = seedLocation();
    const ciment = seedItem({ reference: 'CIM', label: 'Ciment' });
    const sable = seedItem({ reference: 'SAB', label: 'Sable' });
    seedBalance(magasin, ciment, 100, 500_000);
    seedBalance(magasin, sable, 40, 80_000);

    const count = await openCount(magasin);
    await setLine(count.id, sable, 40);
    const closed = await close(count.id);
    expect(closed.uncountedLinesCreated).toBe(1);
    const uncounted = store.countLines.find(l => l.itemId === ciment.id)!;
    expect(uncounted).toMatchObject({ countedQuantity: null, expectedQuantity: 100, countedByUserId: null });
    // Verrous de solde pris sur les deux articles (A10, data-model §6).
    expect(store.locks.filter(l => l.startsWith(TENANT_ID))).toEqual(
      expect.arrayContaining([`${TENANT_ID}:${ciment.id}:${magasin.id}`, `${TENANT_ID}:${sable.id}:${magasin.id}`])
    );

    await expect(validate(count.id)).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_COUNT_UNCOUNTED_LINES',
      data: { items: [{ itemId: ciment.id, itemLabel: 'Ciment' }] }
    });

    await expect(
      runTransaction((tx: any) =>
        setAsideUncountedStockCountLinesTx(tx, TENANT_ID, count.id, {
          reason: 'Inventaire tournant',
          setAsideByUserId: KOFFI
        })
      )
    ).resolves.toEqual({ setAsideCount: 1 });
    await validate(count.id);

    expect(adjustments()).toHaveLength(0);
    expect(Number(soldeDe(magasin, ciment)!.quantity)).toBe(100);
    // Ensembles disjoints : la ligne non comptée écartée n'est pas aussi une « ligne écartée ».
    expect(store.alerts.find(a => a.kind === 'COUNT_LINE_SET_ASIDE')!.details).toEqual({
      setAsideLines: 0,
      uncountedLines: 1
    });
    const view = await getStockCountView(TENANT_ID, count.id, ctxFor(AWA));
    expect(view.uncountedLinesCount).toBe(1);
  });

  it('A2-9 : un CLOSING où seul le sable est compté → 409 STOCK_COUNT_INCOMPLETE avec le ciment', async () => {
    const lieu = seedSiteLocation(seedSite());
    const ciment = seedItem({ label: 'Ciment' });
    const sable = seedItem({ label: 'Sable' });
    seedBalance(lieu, ciment, 100, 500_000);
    seedBalance(lieu, sable, 40, 80_000);
    const count = await openCount(lieu, { kind: 'CLOSING' });
    await setLine(count.id, sable, 40);

    await expect(close(count.id)).rejects.toMatchObject({
      code: 'STOCK_COUNT_INCOMPLETE',
      data: { items: [{ itemId: ciment.id, itemLabel: 'Ciment' }] }
    });
    expect(store.countLines).toHaveLength(1);
  });

  it('A2-10 : l’abandon audite attendu et compté, ouvre COUNT_CANCELLED, et la lecture reste aveugle', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);
    const count = await openCount(magasin);
    await setLine(count.id, ciment, 92);

    await runTransaction((tx: any) =>
      cancelStockCountTx(tx, TENANT_ID, count.id, { reason: 'Comptage interrompu', cancelledByUserId: KOFFI })
    );

    const audit = store.audits.find(a => a.actionKey === 'STOCK_COUNT_CANCELLED')!;
    expect(audit.payload.lines).toEqual([{ itemId: ciment.id, expectedQuantity: 100, countedQuantity: 92 }]);
    expect(store.alerts).toEqual([
      expect.objectContaining({ kind: 'COUNT_CANCELLED', dedupeKey: `COUNT_CANCELLED:${count.id}` })
    ]);
    const view = await getStockCountView(TENANT_ID, count.id, ctxFor(AWA));
    expect(view).toMatchObject({ status: 'CANCELLED', blind: true });
    expect(view.lines[0].expectedQuantity).toBeNull();
    // L'abandon libère le lieu.
    await expect(openCount(magasin)).resolves.toMatchObject({ status: 'DRAFT' });
  });

  it('un inventaire COUNTED ne s’abandonne pas', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);
    const count = await countedInventory(magasin, [[ciment, 10]]);
    await expect(
      runTransaction((tx: any) =>
        cancelStockCountTx(tx, TENANT_ID, count.id, { reason: 'Erreur', cancelledByUserId: KOFFI })
      )
    ).rejects.toMatchObject({ code: 'STOCK_COUNT_WRONG_STATUS' });
  });

  it('A2-11 : une ligne écartée fige setAsideVarianceValue et entre dans COUNT_VARIANCE', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    // 100 sacs à 5 000 ; seuil par défaut : 100 000 ou 5 %.
    seedBalance(magasin, ciment, 100, 500_000);
    const count = await countedInventory(magasin, [[ciment, 92]]);
    await setAside(count.id, ciment);
    await validate(count.id);

    const row = store.counts.find(c => c.id === count.id)!;
    expect(row.setAsideVarianceValue).toBe(40_000);
    expect(row.varianceValueGross).toBe(0);
    expect(adjustments()).toHaveLength(0);
    // 40 000 / 460 000 = 8,7 % ≥ 5 % : l'écart écarté déclenche l'alerte.
    expect(store.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'COUNT_VARIANCE', amount: 40_000 }),
        expect.objectContaining({ kind: 'COUNT_LINE_SET_ASIDE' })
      ])
    );
    const audit = store.audits.find(a => a.actionKey === 'STOCK_COUNT_LINE_SET_ASIDE')!;
    expect(audit.payload.items).toEqual([{ itemId: ciment.id, expectedQuantity: 100, countedQuantity: 92 }]);
    expect(store.alerts.find(a => a.kind === 'COUNT_LINE_SET_ASIDE')!.details).toEqual({
      setAsideLines: 1,
      uncountedLines: 0
    });
  });

  it('A2-12 : la ligne saisie par un détenteur de STOCK_COUNT_VALIDATE porte countedBlind = false', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    const sable = seedItem();
    const count = await openCount(magasin);
    await setLine(count.id, ciment, 1, AWA);
    await setLine(count.id, sable, 1, MOUSSA);
    expect(store.countLines.find(l => l.itemId === ciment.id)!.countedBlind).toBe(false);
    expect(store.countLines.find(l => l.itemId === sable.id)!.countedBlind).toBe(true);
  });

  it('un motif ne se justifie qu’en COUNTED, et jamais sur une ligne non comptée', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    const sable = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);
    seedBalance(magasin, sable, 10, 10_000);
    const count = await openCount(magasin);
    await setLine(count.id, ciment, 92);
    await expect(justify(count.id, ciment)).rejects.toMatchObject({ code: 'STOCK_COUNT_WRONG_STATUS' });
    await close(count.id);
    await expect(justify(count.id, sable)).rejects.toMatchObject({ statusCode: 409 });
    await expect(justify(count.id, ciment, 'OPENING_BALANCE')).rejects.toMatchObject({
      code: 'STOCK_REASON_NOT_ALLOWED'
    });
  });
});

// ---------------------------------------------------------------------------
// A1 — celui qui compte ne valide pas
// ---------------------------------------------------------------------------

describe('A1 — quatre yeux', () => {
  async function countedBy(counter: string) {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);
    const count = await openCount(magasin, { by: counter });
    await setLine(count.id, ciment, 10, counter);
    await close(count.id, counter);
    return count;
  }

  it('A1-1 et A1-2 : Awa a compté, Koffi peut valider → 403 pour Awa, validation ordinaire pour Koffi', async () => {
    const count = await countedBy(AWA);
    await expect(validate(count.id, AWA)).rejects.toMatchObject({
      statusCode: 403,
      code: 'STOCK_COUNT_SELF_VALIDATION_FORBIDDEN'
    });
    expect(store.slips).toHaveLength(0);
    await expect(validate(count.id, KOFFI)).resolves.toMatchObject({ status: 'VALIDATED', selfValidated: false });
  });

  it('A1-3 : seule validatrice, Awa doit motiver ; la dérogation est tracée, alertée et datée', async () => {
    store.users = store.users.filter(u => u.id !== KOFFI);
    const count = await countedBy(AWA);
    await expect(validate(count.id, AWA)).rejects.toMatchObject({
      statusCode: 400,
      code: 'STOCK_COUNT_SELF_VALIDATION_REASON_REQUIRED'
    });
    await validate(count.id, AWA, 'Seule responsable présente cette semaine');
    expect(store.counts[0]).toMatchObject({
      selfValidated: true,
      selfValidationReason: 'Seule responsable présente cette semaine'
    });
    expect(store.audits.map(a => a.actionKey)).toEqual(
      expect.arrayContaining(['STOCK_COUNT_VALIDATED', 'STOCK_COUNT_SELF_VALIDATED'])
    );
    expect(store.alerts.map(a => a.kind)).toContain('COUNT_SELF_VALIDATED');
  });

  it('A1-4 et A1-7 : un autre validateur DÉSACTIVÉ (adhésion ou compte) ouvre la dérogation', async () => {
    store.users.find(u => u.id === KOFFI)!.memberships = [{ tenantId: TENANT_ID, status: 'DISABLED' }];
    const premier = await countedBy(AWA);
    await expect(validate(premier.id, AWA, 'Koffi est suspendu ce mois-ci')).resolves.toMatchObject({
      selfValidated: true
    });

    store.users.find(u => u.id === KOFFI)!.memberships = [{ tenantId: TENANT_ID, status: 'ACTIVE' }];
    store.users.find(u => u.id === KOFFI)!.isActive = false;
    const second = await countedBy(AWA);
    await expect(validate(second.id, AWA, 'Koffi a quitté l’entreprise')).resolves.toMatchObject({
      selfValidated: true
    });
  });

  it('A1-5 : un inventaire d’avant le lot a pour compteur son créateur', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);
    const count = countFields({
      id: ANCIEN,
      tenantId: TENANT_ID,
      locationId: magasin.id,
      countedAt: TODAY,
      status: 'COUNTED',
      createdByUserId: AWA
    });
    store.counts.push(count);
    store.countLines.push(
      lineFields({
        id: 'ligne-ancienne',
        countId: ANCIEN,
        itemId: ciment.id,
        expectedQuantity: 10,
        countedQuantity: 10
      })
    );
    await expect(validate(ANCIEN, AWA)).rejects.toMatchObject({ code: 'STOCK_COUNT_SELF_VALIDATION_FORBIDDEN' });
  });

  it('A1-6 : Awa reste compteur après la ressaisie de sa ligne par Moussa', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);
    const count = await openCount(magasin);
    await setLine(count.id, ciment, 9, AWA);
    await setLine(count.id, ciment, 10, MOUSSA);
    await close(count.id);
    expect(store.counts[0].counterUserIds).toEqual([AWA, MOUSSA]);
    await expect(validate(count.id, AWA)).rejects.toMatchObject({ code: 'STOCK_COUNT_SELF_VALIDATION_FORBIDDEN' });
  });

  it('A1-5 (écran) : CountView.validation prévient le compteur avant le clic', async () => {
    const count = await countedBy(AWA);
    const view = await getStockCountView(TENANT_ID, count.id, ctxFor(AWA));
    expect(view.validation).toEqual({ callerIsCounter: true, selfValidationAllowed: false });
    expect(view.counters).toEqual([{ userId: AWA, label: 'Awa Koné' }]);
  });

  it('A1-R3 : tous les validateurs actifs ont compté → la dérogation s’ouvre, avec motif', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    const sable = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);
    seedBalance(magasin, sable, 10, 20_000);
    const count = await openCount(magasin, { by: AWA });
    await setLine(count.id, ciment, 10, AWA);
    await setLine(count.id, sable, 10, KOFFI);
    await close(count.id, MOUSSA);

    // Koffi a compté : il ne peut pas valider, il ne ferme donc pas la dérogation d'Awa.
    const view = await getStockCountView(TENANT_ID, count.id, ctxFor(AWA));
    expect(view.validation).toEqual({ callerIsCounter: true, selfValidationAllowed: true });
    await expect(validate(count.id, AWA)).rejects.toMatchObject({
      statusCode: 400,
      code: 'STOCK_COUNT_SELF_VALIDATION_REASON_REQUIRED'
    });
    await expect(validate(count.id, AWA, 'Les deux responsables ont compté ce jour-là')).resolves.toMatchObject({
      status: 'VALIDATED',
      selfValidated: true
    });
    expect(store.audits.map(a => a.actionKey)).toContain('STOCK_COUNT_SELF_VALIDATED');
    expect(store.alerts.map(a => a.kind)).toContain('COUNT_SELF_VALIDATED');
    expect(userQueries.at(-1)!.id).toEqual({ notIn: expect.arrayContaining([AWA, KOFFI]) });
  });

  it('A1-R3 : un validateur actif resté hors du comptage interdit toujours la dérogation', async () => {
    seedUser('user-fanta', 'Fanta Diallo', { validator: true });
    const magasin = seedLocation();
    const ciment = seedItem();
    const sable = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);
    seedBalance(magasin, sable, 10, 20_000);
    const count = await openCount(magasin, { by: AWA });
    await setLine(count.id, ciment, 10, AWA);
    await setLine(count.id, sable, 10, KOFFI);
    await close(count.id, MOUSSA);
    await expect(validate(count.id, AWA, 'Les deux responsables ont compté ce jour-là')).rejects.toMatchObject({
      statusCode: 403,
      code: 'STOCK_COUNT_SELF_VALIDATION_FORBIDDEN'
    });
    await expect(validate(count.id, 'user-fanta')).resolves.toMatchObject({ selfValidated: false });
  });

  it('un CLOSING vide a pour compteur celui qui a clos son comptage (A1 s’applique)', async () => {
    const lieu = seedSiteLocation(seedSite());
    const count = await openCount(lieu, { kind: 'CLOSING', by: AWA });
    await close(count.id, AWA);
    await expect(validate(count.id, AWA)).rejects.toMatchObject({
      statusCode: 403,
      code: 'STOCK_COUNT_SELF_VALIDATION_FORBIDDEN'
    });
    const view = await getStockCountView(TENANT_ID, count.id, ctxFor(AWA));
    expect(view.validation).toEqual({ callerIsCounter: true, selfValidationAllowed: false });
    await expect(validate(count.id, KOFFI)).resolves.toMatchObject({ status: 'VALIDATED', selfValidated: false });
  });

  it('épingle la requête de la dérogation : lue en base, jamais dans le cache des permissions', async () => {
    await hasOtherActiveCountValidator(mockPrisma as any, TENANT_ID, AWA);
    expect(userQueries[0]).toEqual({
      id: { not: AWA },
      isActive: true,
      globalRole: { not: 'SUPER_ADMIN' },
      memberships: { some: { tenantId: TENANT_ID, status: 'ACTIVE' } },
      userRoles: {
        some: { tenantId: TENANT_ID, role: { permissions: { some: { permission: { key: 'STOCK_COUNT_VALIDATE' } } } } }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// A3 — l'écart s'applique au solde courant
// ---------------------------------------------------------------------------

describe('A3 — un mouvement postérieur au comptage n’est plus écrasé', () => {
  it('A3-1 (test inversé) : compté 90 sur 100, puis 20 transférés → diminution de 10, solde 70', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);
    const count = await openCount(magasin);
    await setLine(count.id, ciment, 90);
    moveOut(magasin, ciment, 20);
    await close(count.id);
    await justify(count.id, ciment);
    await validate(count.id);

    const [ajustement] = adjustments();
    expect(ajustement).toMatchObject({ isDecrease: true, quantity: 10, quantityAfter: 70, reasonCode: 'BREAKAGE' });
    expect(Number(soldeDe(magasin, ciment)!.quantity)).toBe(70);
    // Le transfert compte parmi les mouvements postérieurs au comptage (A3-R4).
    expect(store.countLines[0].movementsSinceCapture).toBe(1);
  });

  it('A3-2 : compté 10 sur 10, puis une sortie de 10 → aucun ajustement, solde 0', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);
    const count = await openCount(magasin);
    await setLine(count.id, ciment, 10);
    moveOut(magasin, ciment, 10);
    await close(count.id);
    await validate(count.id);
    expect(adjustments()).toHaveLength(0);
    expect(Number(soldeDe(magasin, ciment)!.quantity)).toBe(0);
  });

  it('A3-3 : compté 5 sur 10, puis 8 sortis → 409 STOCK_COUNT_NEGATIVE_AFTER_MOVEMENTS, rien n’est écrit', async () => {
    const magasin = seedLocation();
    const ciment = seedItem({ label: 'Ciment' });
    seedBalance(magasin, ciment, 10, 50_000);
    const count = await openCount(magasin);
    await setLine(count.id, ciment, 5);
    moveOut(magasin, ciment, 8);
    await close(count.id);
    await justify(count.id, ciment);

    await expect(validate(count.id)).rejects.toMatchObject({
      code: 'STOCK_COUNT_NEGATIVE_AFTER_MOVEMENTS',
      data: { items: [{ itemId: ciment.id, itemLabel: 'Ciment' }] }
    });
    expect(adjustments()).toHaveLength(0);
    expect(store.slips).toHaveLength(0);
    expect(store.counts[0].status).toBe('COUNTED');
  });
});

// ---------------------------------------------------------------------------
// A4 — motifs typés, auteur de chaque ligne
// ---------------------------------------------------------------------------

describe('A4 — justification', () => {
  it('A4-1 : OTHER sans précision → 400 STOCK_REASON_REQUIRED', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);
    const count = await countedInventory(magasin, [[ciment, 9]]);
    await expect(justify(count.id, ciment, 'OTHER', '  ')).rejects.toMatchObject({
      statusCode: 400,
      code: 'STOCK_REASON_REQUIRED'
    });
  });

  it('un écart sans motif bloque la validation (409 STOCK_COUNT_UNJUSTIFIED_VARIANCE)', async () => {
    const magasin = seedLocation();
    const ciment = seedItem({ label: 'Ciment' });
    seedBalance(magasin, ciment, 10, 50_000);
    const count = await countedInventory(magasin, [[ciment, 9]]);
    await expect(validate(count.id)).rejects.toMatchObject({
      code: 'STOCK_COUNT_UNJUSTIFIED_VARIANCE',
      data: { items: [{ itemId: ciment.id, itemLabel: 'Ciment' }] }
    });
  });

  it('A4-2 : l’ajustement porte le motif de sa ligne, l’inventaire, le PVI et le validateur', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);
    const count = await countedInventory(magasin, [[ciment, 92]]);
    await justify(count.id, ciment, 'BREAKAGE', 'Sacs éventrés au déchargement');
    const result = await validate(count.id);

    expect(adjustments()[0]).toMatchObject({
      reasonCode: 'BREAKAGE',
      reason: 'Sacs éventrés au déchargement',
      stockCountId: count.id,
      slipId: result.slip.id,
      createdByUserId: KOFFI,
      totalValue: 40_000
    });
    const params = postDocumentEntryTx.mock.calls[0][1];
    expect(params.documentType).toBe('STOCK_ADJUSTMENT');
    expect(params.lines).toEqual([
      expect.objectContaining({ accountId: 'compte-603', debit: 40_000 }),
      expect.objectContaining({ accountId: 'compte-311', credit: 40_000 })
    ]);
  });

  it('A4-3 : le détail rend le libellé de l’auteur de chaque ligne', async () => {
    const magasin = seedLocation();
    const ciment = seedItem({ reference: 'A' });
    const sable = seedItem({ reference: 'B' });
    const count = await openCount(magasin);
    await setLine(count.id, ciment, 1, AWA);
    await setLine(count.id, sable, 1, MOUSSA);
    const view = await getStockCountView(TENANT_ID, count.id, ctxFor(KOFFI));
    expect(view.lines.map(l => l.countedByLabel)).toEqual(['Awa Koné', 'Moussa Traoré']);
  });

  it('A4-4 : une ligne d’avant le lot au motif libre se valide, movementsSinceCapture nul', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);
    store.counts.push(
      countFields({
        id: ANCIEN,
        tenantId: TENANT_ID,
        locationId: magasin.id,
        countedAt: TODAY,
        status: 'DRAFT',
        createdByUserId: MOUSSA
      })
    );
    store.countLines.push(
      lineFields({
        id: 'ligne-ancienne',
        countId: ANCIEN,
        itemId: ciment.id,
        expectedQuantity: 10,
        countedQuantity: 8,
        reason: 'casse'
      })
    );
    await close(ANCIEN);
    await validate(ANCIEN, KOFFI);
    expect(store.countLines[0].movementsSinceCapture).toBeNull();
    expect(adjustments()[0]).toMatchObject({ reasonCode: null, reason: 'casse', quantity: 2 });
    const view = await getStockCountView(TENANT_ID, ANCIEN, ctxFor(KOFFI));
    expect(view.lines[0]).toMatchObject({ justified: true, movementsSinceCapture: null });
  });
});

// ---------------------------------------------------------------------------
// A7, B4, B7, B8 — ouverture, PVI, alertes, valeurs figées
// ---------------------------------------------------------------------------

describe('validation — ouverture, procès-verbal, alertes et valeurs figées', () => {
  it('A7-2 : un OPENING qui trouve 50 sacs sur un lieu vide entre à valeur nulle, sans écriture ni alerte', async () => {
    const lieu = seedSiteLocation(seedSite({ stockEnabledAt: TODAY }));
    const ciment = seedItem();
    const count = await countedInventory(lieu, [[ciment, 50]], 'OPENING');
    await validate(count.id);

    expect(adjustments()[0]).toMatchObject({
      quantity: 50,
      totalValue: 0,
      reasonCode: 'OPENING_BALANCE',
      isDecrease: false
    });
    expect(soldeDe(lieu, ciment)).toMatchObject({ quantity: 50, value: 0 });
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
    expect(store.alerts).toHaveLength(0);
  });

  it('A7-5 : un manque d’ouverture se justifie, s’écrit et ouvre COUNT_VARIANCE au taux', async () => {
    const lieu = seedSiteLocation(seedSite({ stockEnabledAt: TODAY }));
    const ciment = seedItem();
    // 87 sacs à 5 200 ; 77 comptés : manque 52 000 sous le seuil de 100 000,
    // mais 52 000 / 400 400 = 13 % ≥ 5 %.
    seedBalance(lieu, ciment, 87, 452_400);
    const count = await countedInventory(lieu, [[ciment, 77]], 'OPENING');
    await expect(validate(count.id)).rejects.toMatchObject({ code: 'STOCK_COUNT_UNJUSTIFIED_VARIANCE' });
    await justify(count.id, ciment, 'UNEXPLAINED_DISAPPEARANCE');
    await validate(count.id);

    expect(adjustments()[0]).toMatchObject({ totalValue: 52_000, isDecrease: true });
    expect(postDocumentEntryTx).toHaveBeenCalledTimes(1);
    const alert = store.alerts.find(a => a.kind === 'COUNT_VARIANCE')!;
    expect(alert).toMatchObject({ amount: 52_000, threshold: 100_000, severity: 'WARNING' });
    expect(alert.details.rate).toBeCloseTo(0.13, 2);
  });

  it('B4-3 et B4-R3 : la validation tire le PVI, libellés figés et compteurs dans l’instantané', async () => {
    const magasin = seedLocation({ label: 'Magasin Yopougon' });
    const ciment = seedItem({ reference: 'CIM-45', label: 'Ciment CPJ 45' });
    seedBalance(magasin, ciment, 10, 50_000);
    const count = await countedInventory(magasin, [[ciment, 10]]);
    const result = await validate(count.id);

    expect(result.slip.number).toBe(`PVI-${TODAY.getUTCFullYear()}-00001`);
    expect(store.slips[0]).toMatchObject({ kind: 'COUNT_REPORT', stockCountId: count.id, createdByUserId: KOFFI });
    expect(store.slips[0].snapshot).toMatchObject({
      location: 'Magasin Yopougon',
      counters: ['Moussa Traoré'],
      validator: 'Koffi Yao',
      lines: [{ itemId: ciment.id, reference: 'CIM-45', label: 'Ciment CPJ 45', unit: 'sac' }]
    });
    // Le verrou de numérotation vient après les verrous de solde (A10-R2).
    const balanceLock = store.locks.findIndex(l => l.startsWith(`${TENANT_ID}:`));
    const slipLock = store.locks.lastIndexOf(TENANT_ID);
    expect(balanceLock).toBeGreaterThanOrEqual(0);
    expect(slipLock).toBeGreaterThan(balanceLock);
    const view = await getStockCountView(TENANT_ID, count.id, ctxFor(KOFFI));
    expect(view.slip).toMatchObject({ kind: 'COUNT_REPORT', number: result.slip.number });
  });

  it('B8-3 : valeurs figées à la validation — comptée, ajustée, écartée', async () => {
    const magasin = seedLocation();
    const ciment = seedItem({ reference: 'A' });
    const sable = seedItem({ reference: 'B' });
    seedBalance(magasin, ciment, 100, 500_000); // 5 000 le sac
    seedBalance(magasin, sable, 50, 100_000); // 2 000 le m³
    const count = await countedInventory(magasin, [
      [ciment, 94],
      [sable, 40]
    ]);
    await justify(count.id, ciment);
    await setAside(count.id, sable);
    await validate(count.id);

    expect(store.counts[0]).toMatchObject({
      countedValue: 550_000, // 94 × 5 000 + 40 × 2 000
      varianceValueGross: 30_000,
      varianceValueNet: -30_000,
      setAsideVarianceValue: 20_000
    });
    expect(store.countLines.find(l => l.itemId === ciment.id)!.unitCostAtValidation).toBe(5_000);

    // La valeur d'un inventaire validé ne flotte plus avec le coût moyen courant.
    soldeDe(magasin, ciment)!.value = 999_999;
    const view = await getStockCountView(TENANT_ID, count.id, ctxFor(KOFFI));
    expect(view).toMatchObject({ countedValue: 550_000, varianceValueGross: 30_000, setAsideVarianceValue: 20_000 });
    expect(view.lines.find(l => l.itemId === ciment.id)!.varianceValue).toBe(-30_000);
    const masque = await getStockCountView(TENANT_ID, count.id, MAGASINIER_CTX);
    expect(masque).toMatchObject({ countedValue: null, varianceValueGross: null, setAsideVarianceValue: null });
  });

  it('n’impute jamais un chantier : un écart n’est pas une dépense de chantier', async () => {
    const chantier = seedSite();
    const lieu = seedSiteLocation(chantier);
    const ciment = seedItem();
    seedBalance(lieu, ciment, 80, 400_000);
    const count = await countedInventory(lieu, [[ciment, 60]]);
    await justify(count.id, ciment, 'UNEXPLAINED_DISAPPEARANCE');
    await validate(count.id);
    expect(store.allocations).toHaveLength(0);
    expect(await sumSiteActualCost(mockPrisma as any, TENANT_ID, chantier.id)).toBe(0);
    expect(adjustments()).toHaveLength(1);
  });

  it('un DRAFT ne se valide pas : il faut clore le comptage', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);
    const count = await openCount(magasin);
    await setLine(count.id, ciment, 10);
    await expect(validate(count.id)).rejects.toMatchObject({ code: 'STOCK_COUNT_WRONG_STATUS' });
  });
});

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

describe('listStockCountViews', () => {
  it('rend les inventaires sans lignes par défaut, filtrés, le plus récent en tête, et les articles à recompter', async () => {
    const magasin = seedLocation();
    const ciment = seedItem({ label: 'Ciment' });
    seedBalance(magasin, ciment, 10, 50_000);
    const premier = await countedInventory(magasin, [[ciment, 9]]);
    await setAside(premier.id, ciment);
    await validate(premier.id);
    const second = await openCount(magasin);

    const liste = await listStockCountViews(TENANT_ID, ctxFor(KOFFI));
    expect(liste.map(c => c.id)).toEqual([second.id, premier.id]);
    expect(liste[0].lines).toEqual([]);
    expect(liste[1].linesCount).toBe(1);
    // L'article écarté est rappelé à l'ouverture suivante (A2-R7).
    expect(liste[0].toRecount).toEqual([{ itemId: ciment.id, itemLabel: 'Ciment' }]);

    expect(await listStockCountViews(TENANT_ID, ctxFor(KOFFI), { status: 'VALIDATED' })).toHaveLength(1);
    const avecLignes = await listStockCountViews(TENANT_ID, ctxFor(KOFFI), { withLines: true, status: 'VALIDATED' });
    expect(avecLignes[0].lines).toHaveLength(1);
  });

  it('refuse un inventaire d’une autre agence (404)', async () => {
    const count = await openCount(seedLocation());
    await expect(getStockCountView('tenant-2', count.id, ctxFor(KOFFI))).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ---------------------------------------------------------------------------
// Verrou de l'inventaire et relecture après le verrou (A10-R2)
// ---------------------------------------------------------------------------

describe('verrou de l’inventaire — chaque transition relit sous verrou', () => {
  const countLockIndex = (countId: string) => store.locks.indexOf(`stock-count:${countId}`);

  it('chaque opération qui modifie un inventaire verrouille sa ligne, avant les verrous de solde', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);
    const count = await openCount(magasin);
    const balanceKey = `${TENANT_ID}:${ciment.id}:${magasin.id}`;

    const operations: Array<[string, () => Promise<unknown>]> = [
      ['saisie', () => setLine(count.id, ciment, 92)],
      ['clôture', () => close(count.id)],
      ['justification', () => justify(count.id, ciment)],
      ['validation', () => validate(count.id)]
    ];
    for (const [, run] of operations) {
      store.locks = [];
      await run();
      expect(countLockIndex(count.id)).toBe(0);
      if (store.locks.includes(balanceKey)) {
        expect(store.locks.indexOf(balanceKey)).toBeGreaterThan(countLockIndex(count.id));
      }
    }

    const second = await openCount(magasin);
    await setLine(second.id, ciment, 1);
    for (const run of [
      () => runTransaction((tx: any) => removeStockCountLineTx(tx, TENANT_ID, second.id, ciment.id, MOUSSA)),
      () =>
        runTransaction((tx: any) =>
          cancelStockCountTx(tx, TENANT_ID, second.id, { reason: 'Comptage interrompu', cancelledByUserId: KOFFI })
        )
    ]) {
      store.locks = [];
      await run();
      expect(store.locks[0]).toBe(`stock-count:${second.id}`);
    }

    const third = await countedInventory(magasin, [[ciment, 90]]);
    for (const run of [
      () => setAside(third.id, ciment),
      () =>
        runTransaction((tx: any) =>
          setAsideUncountedStockCountLinesTx(tx, TENANT_ID, third.id, {
            reason: 'Inventaire tournant',
            setAsideByUserId: KOFFI
          })
        )
    ]) {
      store.locks = [];
      await run();
      expect(store.locks[0]).toBe(`stock-count:${third.id}`);
    }
  });

  it('une validation n’ajuste pas une ligne écartée pendant qu’elle attendait le verrou', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);
    const count = await countedInventory(magasin, [[ciment, 92]]);
    await justify(count.id, ciment);

    // La mise à l'écart concurrente est validée pendant que la validation attend le verrou.
    onCountLock.push(() => {
      Object.assign(
        store.countLines.find(l => l.itemId === ciment.id)!,
        {
          setAsideAt: new Date(),
          setAsideByUserId: AWA,
          setAsideReason: 'Comptage douteux'
        }
      );
    });
    await validate(count.id);

    expect(adjustments()).toHaveLength(0);
    expect(Number(soldeDe(magasin, ciment)!.quantity)).toBe(100);
    expect(store.counts.find(c => c.id === count.id)).toMatchObject({
      status: 'VALIDATED',
      setAsideVarianceValue: 40_000
    });
  });

  it('une ressaisie ne modifie plus une ligne après la clôture du comptage', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);
    const count = await openCount(magasin);
    await setLine(count.id, ciment, 92);

    // La clôture concurrente est validée pendant que la ressaisie attend le verrou.
    onCountLock.push(countId => {
      Object.assign(
        store.counts.find(c => c.id === countId)!,
        { status: 'COUNTED', closedAt: new Date() }
      );
    });
    await expect(setLine(count.id, ciment, 80)).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_COUNT_WRONG_STATUS'
    });
    expect(store.countLines.find(l => l.itemId === ciment.id)!.countedQuantity).toBe(92);
  });

  it('un identifiant mal formé ou d’une autre agence répond 404, sans rien écrire', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    const count = await openCount(magasin);
    await expect(setLine('pas-un-uuid', ciment, 1)).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      runTransaction((tx: any) =>
        setStockCountLineTx(tx, 'tenant-2', count.id, {
          itemId: ciment.id,
          countedQuantity: 1,
          countedByUserId: MOUSSA
        })
      )
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(store.countLines).toHaveLength(0);
  });

  it('la saisie lit l’attendu sous le verrou du solde et le date à l’horloge de la base', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);
    const count = await openCount(magasin);
    dbClock = new Date('2026-10-04T08:00:00.000Z');

    store.locks = [];
    await setLine(count.id, ciment, 92);

    expect(store.locks).toEqual([`stock-count:${count.id}`, `${TENANT_ID}:${ciment.id}:${magasin.id}`]);
    expect(store.countLines[0]).toMatchObject({
      expectedQuantity: 100,
      expectedCapturedAt: dbClock,
      countedAtServer: dbClock
    });
  });
});

// ---------------------------------------------------------------------------
// Ouvertures simultanées, mise à l'écart d'un OPENING/CLOSING, valeurs non figées
// ---------------------------------------------------------------------------

describe('cas limites relevés en relecture', () => {
  it('deux ouvertures simultanées : le P2002 de l’index unique répond STOCK_COUNT_ALREADY_OPEN', async () => {
    const magasin = seedLocation();
    mockPrisma.stockCount.create.mockRejectedValueOnce(
      Object.assign(new Error('unique'), { code: 'P2002', meta: { target: 'stock_counts_one_open_per_location' } })
    );
    await expect(openCount(magasin)).rejects.toMatchObject({ statusCode: 409, code: 'STOCK_COUNT_ALREADY_OPEN' });
  });

  it('deux OPENING simultanés : le P2002 de l’index d’ouverture répond STOCK_OPENING_COUNT_EXISTS', async () => {
    const lieu = seedSiteLocation(seedSite({ stockEnabledAt: TODAY }));
    mockPrisma.stockCount.create.mockRejectedValueOnce(
      Object.assign(new Error('unique'), { code: 'P2002', meta: { target: 'stock_counts_one_opening_per_location' } })
    );
    await expect(openCount(lieu, { kind: 'OPENING' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_OPENING_COUNT_EXISTS'
    });
  });

  it('une ligne d’un OPENING ou d’un CLOSING ne s’écarte pas, ni seule ni avec les non comptés', async () => {
    const message =
      "Un inventaire d'ouverture ou de clôture se compte en entier : justifiez l'écart, ou abandonnez l'inventaire et recomptez.";
    for (const kind of ['OPENING', 'CLOSING']) {
      const lieu = seedSiteLocation(seedSite({ stockEnabledAt: TODAY }));
      const ciment = seedItem({ label: 'Ciment' });
      seedBalance(lieu, ciment, 10, 50_000);
      const count = await countedInventory(lieu, [[ciment, 8]], kind);

      await expect(setAside(count.id, ciment)).rejects.toMatchObject({
        statusCode: 409,
        code: 'STOCK_COUNT_INCOMPLETE',
        message,
        data: { items: [{ itemId: ciment.id, itemLabel: 'Ciment' }] }
      });
      await expect(
        runTransaction((tx: any) =>
          setAsideUncountedStockCountLinesTx(tx, TENANT_ID, count.id, {
            reason: 'Inventaire tournant',
            setAsideByUserId: KOFFI
          })
        )
      ).rejects.toMatchObject({ statusCode: 409, code: 'STOCK_COUNT_INCOMPLETE', message });
      expect(store.countLines.find(l => l.countId === count.id)!.setAsideAt).toBeNull();
    }
  });

  it('un inventaire validé avant le lot : aucune valeur recalculée au coût moyen courant', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);
    store.counts.push(
      countFields({
        id: ANCIEN,
        tenantId: TENANT_ID,
        locationId: magasin.id,
        countedAt: TODAY,
        status: 'VALIDATED',
        validatedAt: TODAY,
        validatedByUserId: KOFFI,
        createdByUserId: MOUSSA
      })
    );
    store.countLines.push(
      lineFields({
        id: 'ligne-ancienne',
        countId: ANCIEN,
        itemId: ciment.id,
        expectedQuantity: 100,
        countedQuantity: 92,
        reason: 'casse'
      })
    );

    const view = await getStockCountView(TENANT_ID, ANCIEN, ctxFor(KOFFI));
    expect(view).toMatchObject({
      countedValue: null,
      varianceValueGross: null,
      varianceValueNet: null,
      setAsideVarianceValue: null
    });
    expect(view.lines[0]).toMatchObject({ variance: -8, varianceValue: null });
  });
});

describe('abandon d’un OPENING ou d’un CLOSING clos (arbitrage du Pilote, dérogation à A2-R6)', () => {
  const cancel = (countId: string, reason: string) =>
    runTransaction((tx: any) => cancelStockCountTx(tx, TENANT_ID, countId, { reason, cancelledByUserId: KOFFI }));

  it('un CLOSING COUNTED s’abandonne avec un motif : CANCELLED, audit critique, alerte', async () => {
    const lieu = seedSiteLocation(seedSite());
    const ciment = seedItem();
    seedBalance(lieu, ciment, 10, 50_000);
    const count = await countedInventory(lieu, [[ciment, 5]], 'CLOSING');
    moveOut(lieu, ciment, 8);
    await justify(count.id, ciment);
    await expect(validate(count.id)).rejects.toMatchObject({
      code: 'STOCK_COUNT_NEGATIVE_AFTER_MOVEMENTS',
      message: expect.stringContaining('abandonnez cet inventaire')
    });

    await expect(cancel(count.id, 'Sortie après comptage')).resolves.toEqual({ id: count.id, status: 'CANCELLED' });
    expect(store.counts.find(c => c.id === count.id)).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'Sortie après comptage'
    });
    const audit = store.audits.find(a => a.actionKey === 'STOCK_COUNT_CANCELLED')!;
    expect(audit.payload.lines).toEqual([{ itemId: ciment.id, expectedQuantity: 10, countedQuantity: 5 }]);
    expect(store.alerts.map(a => a.kind)).toContain('COUNT_CANCELLED');
    // Le lieu est libéré : on recompte.
    await expect(openCount(lieu, { kind: 'CLOSING' })).resolves.toMatchObject({ status: 'DRAFT' });
  });

  it('sans motif → 400, rien ne change', async () => {
    const lieu = seedSiteLocation(seedSite());
    const ciment = seedItem();
    seedBalance(lieu, ciment, 10, 50_000);
    const count = await countedInventory(lieu, [[ciment, 10]], 'CLOSING');
    await expect(cancel(count.id, ' ')).rejects.toMatchObject({ statusCode: 400 });
    expect(store.counts.find(c => c.id === count.id)!.status).toBe('COUNTED');
  });

  it('un REGULAR COUNTED reste non abandonnable', async () => {
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 10, 50_000);
    const count = await countedInventory(magasin, [[ciment, 10]]);
    await expect(cancel(count.id, 'Erreur de comptage')).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_COUNT_WRONG_STATUS'
    });
  });
});
