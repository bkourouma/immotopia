/**
 * Tests du transfert entre lieux (`lib/finance/stock-transferts.ts`) — lot 5,
 * troisième sous-lot, extrait par les fondations du lot 040 et étendu par le
 * territoire API-1 (spec 040 : A5-R4, A7-R3 bis, A7-R4, A10, A11, B2-R3,
 * B3-R2, B6).
 *
 * Le test du lot 5 qui épinglait « un transfert vers le lieu d'un chantier
 * clos est accepté » (`finance.stock-inventaire.test.ts:608-626`, déplacé ici
 * par les fondations) est INVERSÉ délibérément : décision du fondateur (A7-R4).
 *
 * Même magasin en mémoire générique que `finance.stock-mouvements.test.ts`
 * (recopié : aucun fichier d'aide partagé n'appartient à ce territoire).
 */

const postDocumentEntryTx = jest.fn();
const COMPTES_OPERATIONNELS = new Map<string, string>([
  ['311', 'compte-311'],
  ['401', 'compte-401'],
  ['603', 'compte-603'],
  ['605', 'compte-605']
]);
const COMPTES_PAR_POSTE = new Map<string, string>();

jest.mock('../../src/lib/finance/accounting', () => ({
  postDocumentEntryTx: (...args: any[]) => postDocumentEntryTx(...args),
  ensureOperationalJournalTx: async () => 'journal-operationnel',
  ensureOperationalChartOfAccountsTx: async () => COMPTES_OPERATIONNELS,
  resolveExpenseAccountsByCostCategoryTx: async (_tx: unknown, _tenantId: string, ids: string[], parDefaut: string) =>
    new Map(ids.map(id => [id, COMPTES_PAR_POSTE.get(id) ?? parDefaut]))
}));

const syncWorkProgramCostTx = jest.fn();
jest.mock('../../src/lib/finance/cost-allocation', () => ({
  syncWorkProgramCostTx: (...args: any[]) => syncWorkProgramCostTx(...args)
}));

const appendThirdPartyMovementTx = jest.fn();
jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: (...args: any[]) => appendThirdPartyMovementTx(...args)
}));

const recordAuditEvent = jest.fn();
const logAuditEvent = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  recordAuditEvent: (...args: any[]) => recordAuditEvent(...args),
  logAuditEvent: (...args: any[]) => logAuditEvent(...args)
}));

// ---------------------------------------------------------------------------
// Magasin en mémoire, générique
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

const TABLES = [
  'constructionSite',
  'costCategory',
  'stockItem',
  'stockLocation',
  'supplier',
  'supplierInvoice',
  'supplierInvoiceLine',
  'stockBalance',
  'stockMovement',
  'costAllocation',
  'stockSettings',
  'stockTaker',
  'stockSlip',
  'stockAlert',
  'stockClientRequest',
  'stockCount',
  'user'
] as const;

let db: Record<string, Row[]> = {};
let seq = 0;
const locks: string[] = [];

const RELATIONS: Record<string, Record<string, [string, string]>> = {
  stockMovement: {
    item: ['stockItem', 'itemId'],
    location: ['stockLocation', 'locationId'],
    site: ['constructionSite', 'siteId'],
    costCategory: ['costCategory', 'costCategoryId'],
    supplierInvoice: ['supplierInvoice', 'supplierInvoiceId'],
    createdBy: ['user', 'createdByUserId'],
    taker: ['stockTaker', 'takerId'],
    slip: ['stockSlip', 'slipId']
  },
  stockBalance: { item: ['stockItem', 'itemId'], location: ['stockLocation', 'locationId'] },
  supplierInvoice: { supplier: ['supplier', 'supplierId'] }
};

const UNIQUE: Record<string, string[][]> = {
  stockClientRequest: [['tenantId', 'clientRequestId']],
  stockAlert: [['tenantId', 'dedupeKey']],
  stockSlip: [['tenantId', 'kind', 'year', 'number']]
};

const DEFAULTS: Record<string, () => Row> = {
  stockMovement: () => ({
    journalEntryId: null,
    siteId: null,
    costCategoryId: null,
    requestedBy: null,
    supplierInvoiceId: null,
    transferGroupId: null,
    stockCountId: null,
    reason: null,
    reasonCode: null,
    takerId: null,
    slipId: null,
    valuationSource: null,
    supplierInvoiceLineId: null,
    supplierCreditValue: null,
    currency: 'XOF'
  }),
  stockAlert: () => ({ status: 'OPEN', details: null }),
  stockClientRequest: () => ({ resultType: null, resultId: null })
};

function comparable(value: any): any {
  return value instanceof Date ? value.getTime() : typeof value === 'string' ? value : Number(value);
}

function matchValue(value: any, cond: any): boolean {
  if (cond === undefined) return true;
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (typeof cond === 'object' && !Array.isArray(cond)) {
    let ok = true;
    if ('in' in cond) ok = ok && cond.in.includes(value);
    if ('gt' in cond) ok = ok && comparable(value) > comparable(cond.gt);
    if ('gte' in cond) ok = ok && comparable(value) >= comparable(cond.gte);
    if ('lt' in cond) ok = ok && comparable(value) < comparable(cond.lt);
    if ('lte' in cond) ok = ok && comparable(value) <= comparable(cond.lte);
    if ('not' in cond) ok = ok && (cond.not === null ? value !== null && value !== undefined : value !== cond.not);
    return ok;
  }
  return value === cond;
}

function matches(row: Row, where?: Row): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some(sub => matches(row, sub));
    if (key === 'AND') return (cond as Row[]).every(sub => matches(row, sub));
    return matchValue(row[key], cond);
  });
}

function sortRows(rows: Row[], orderBy?: Row | Row[]): Row[] {
  const list = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : [];
  return [...rows].sort((a, b) => {
    for (const order of list) {
      const [key, dir] = Object.entries(order)[0];
      const [av, bv] = [comparable(a[key]), comparable(b[key])];
      if (av !== bv) return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1);
    }
    return 0;
  });
}

function project(table: string, row: Row | undefined | null, args?: Row): Row | null {
  if (!row) return null;
  const relations = RELATIONS[table] ?? {};
  const resolve = (key: string, spec: any) => {
    if (key === '_count') return { attachments: 0 };
    const relation = relations[key];
    if (!relation) return row[key];
    const target = db[relation[0]].find(r => r.id === row[relation[1]]) ?? null;
    return spec === true ? target : project(relation[0], target, spec);
  };
  if (args?.select) {
    const out: Row = {};
    for (const [key, spec] of Object.entries(args.select)) if (spec) out[key] = resolve(key, spec);
    return out;
  }
  const out: Row = { ...row };
  if (args?.include) for (const [key, spec] of Object.entries(args.include)) if (spec) out[key] = resolve(key, spec);
  return out;
}

function uniqueViolation(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

function violates(table: string, data: Row): boolean {
  return (UNIQUE[table] ?? []).some(cols => db[table].some(row => cols.every(col => row[col] === data[col])));
}

function insert(table: string, data: Row): Row {
  seq += 1;
  const row = { id: `${table}-${seq}`, createdAt: new Date(Date.now() + seq), ...(DEFAULTS[table]?.() ?? {}), ...data };
  db[table].push(row);
  return row;
}

function delegate(table: string): Row {
  const find = (args: Row = {}) =>
    sortRows(
      db[table].filter(row => matches(row, args.where)),
      args.orderBy
    );
  return {
    findFirst: jest.fn(async (args: Row = {}) => project(table, find(args)[0], args)),
    findUnique: jest.fn(async (args: Row = {}) => project(table, find(args)[0], args)),
    findMany: jest.fn(async (args: Row = {}) => find(args).map(row => project(table, row, args))),
    create: jest.fn(async (args: Row) => {
      if (violates(table, args.data)) throw uniqueViolation();
      return project(table, insert(table, args.data), args);
    }),
    createMany: jest.fn(async ({ data, skipDuplicates }: Row) => {
      let count = 0;
      for (const entry of data as Row[]) {
        if (violates(table, entry)) {
          if (skipDuplicates) continue;
          throw uniqueViolation();
        }
        insert(table, entry);
        count += 1;
      }
      return { count };
    }),
    update: jest.fn(async (args: Row) => {
      const row = db[table].find(r => matches(r, args.where));
      if (!row) throw new Error(`${table} introuvable`);
      Object.assign(row, args.data);
      return project(table, row, args);
    }),
    aggregate: jest.fn(async ({ where, _max, _sum }: Row) => {
      const list = db[table].filter(row => matches(row, where));
      const out: Row = {};
      if (_max) {
        out._max = {};
        for (const key of Object.keys(_max))
          out._max[key] = list.length ? Math.max(...list.map(r => Number(r[key]))) : null;
      }
      if (_sum) {
        out._sum = {};
        for (const key of Object.keys(_sum))
          out._sum[key] = list.length ? list.reduce((s, r) => s + Number(r[key]), 0) : null;
      }
      return out;
    })
  };
}

const mockPrisma: Row = {
  $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
    const sql = strings.join('?');
    if (sql.includes('stock_client_requests')) {
      const [resultType, resultId, id] = values;
      const row = db.stockClientRequest.find(r => r.id === id);
      if (row) Object.assign(row, { resultType, resultId });
      return 1;
    }
    const kind = sql.includes("'stock-site'") ? 'site' : sql.includes("'stock-balance'") ? 'balance' : 'slip';
    locks.push(`${kind}:${values[0]}`);
    return 0;
  })
};
for (const table of TABLES) mockPrisma[table] = delegate(table);

async function runTransaction<T>(callback: (tx: Row) => Promise<T>): Promise<T> {
  const snapshot = structuredClone(db);
  const seqBefore = seq;
  try {
    return await callback(mockPrisma);
  } catch (error) {
    db = snapshot;
    seq = seqBefore;
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

import { recordStockTransfer, recordStockTransferTx } from '../../src/lib/finance/stock-transferts';
import { sumSiteActualCost } from '../../src/lib/finance/site-cost';
import type { StockCallerContext } from '../../src/lib/finance/types-040-controle';

// ---------------------------------------------------------------------------
// Jeu de données
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-magasinier';
const OTHER_USER_ID = 'user-comptable';
const DAY_MS = 86_400_000;
const TODAY = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));

function daysAgo(n: number): Date {
  return new Date(TODAY.getTime() - n * DAY_MS);
}

function ctxOf(overrides: Partial<StockCallerContext> = {}): StockCallerContext {
  return {
    userId: USER_ID,
    valuesVisible: true,
    canValidateCount: false,
    canReceive: true,
    canIssue: true,
    canTransfer: true,
    canCount: true,
    canDispose: true,
    canManageTakers: true,
    canViewAlerts: false,
    canManageSettings: false,
    ...overrides
  };
}

const ADMIN = ctxOf({ canValidateCount: true, canViewAlerts: true });
const MAGASINIER = ctxOf({ valuesVisible: false, canDispose: false });
const COMPTABLE = ctxOf({ userId: OTHER_USER_ID });

function seed(table: string, data: Row): Row {
  return insert(table, { tenantId: TENANT_ID, ...data });
}

const seedSite = (o: Row = {}) => seed('constructionSite', { name: `Chantier ${seq}`, closedAt: null, ...o });
const seedItem = (o: Row = {}) =>
  seed('stockItem', { reference: `ART-${seq}`, label: 'Ciment CPJ 45', unit: 'sac', isActive: true, ...o });
const seedLocation = (o: Row = {}) =>
  seed('stockLocation', { kind: 'WAREHOUSE', label: `Magasin ${seq}`, siteId: null, isActive: true, ...o });
const seedTaker = (o: Row = {}) =>
  seed('stockTaker', { fullName: 'Koné Ibrahim', teamOrCompany: 'Équipe maçonnerie', isActive: true, ...o });

function seedBalance(location: Row, item: Row, quantity: number, value: number): Row {
  return seed('stockBalance', { itemId: item.id, locationId: location.id, quantity, value, currency: 'XOF' });
}

function openDraftCount(location: Row): Row {
  return seed('stockCount', { locationId: location.id, status: 'DRAFT' });
}

beforeEach(() => {
  jest.clearAllMocks();
  db = Object.fromEntries(TABLES.map(table => [table, [] as Row[]]));
  seq = 0;
  locks.length = 0;
  COMPTES_PAR_POSTE.clear();
  db.user.push(
    { id: USER_ID, fullName: 'Aïssatou Barry', email: 'a.barry@example.ci' },
    { id: OTHER_USER_ID, fullName: 'Moussa Traoré', email: 'm.traore@example.ci' }
  );
  postDocumentEntryTx.mockImplementation(async () => ({ entryId: `ecriture-${++seq}`, totalDebit: 0, totalCredit: 0 }));
  appendThirdPartyMovementTx.mockImplementation(async () => ({ id: 'mouvement-tiers' }));
  recordAuditEvent.mockResolvedValue(undefined);
});

// ===========================================================================
// Transferts
// ===========================================================================

function transfer(from: Row, to: Row, item: Row, quantity: number, overrides: Row = {}, options: Row = {}) {
  return runTransaction(tx =>
    recordStockTransferTx(
      tx as any,
      TENANT_ID,
      {
        fromLocationId: from.id,
        toLocationId: to.id,
        itemId: item.id,
        quantity,
        transferDate: TODAY,
        reasonCode: 'SITE_SUPPLY',
        requestedBy: 'Chef de chantier Camara',
        createdByUserId: USER_ID,
        ...overrides
      } as any,
      options
    )
  );
}

function valueOf(location: Row, item: Row): number {
  return Number(db.stockBalance.find(b => b.locationId === location.id && b.itemId === item.id)?.value ?? 0);
}

describe('recordStockTransferTx — transférer ne crée ni ne détruit de valeur', () => {
  it('LE TEST LE PLUS IMPORTANT : la somme des valeurs des deux lieux ne bouge pas d’un franc, sur un coût moyen qui ne tombe pas rond', async () => {
    const magasin = seedLocation();
    const chantier = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 7, 3_004);
    seedBalance(chantier, ciment, 3, 1_000);

    await transfer(magasin, chantier, ciment, 2);

    expect(valueOf(magasin, ciment) + valueOf(chantier, ciment)).toBe(4_004);
    expect(valueOf(magasin, ciment)).toBe(2_146);
    expect(valueOf(chantier, ciment)).toBe(1_858);
  });

  it('vide le lieu d’origine : la valeur résiduelle part avec, et crée le solde d’arrivée', async () => {
    const magasin = seedLocation();
    const chantier = seedLocation();
    const ciment = seedItem();
    seedBalance(magasin, ciment, 3, 1_001);

    const result = await transfer(magasin, chantier, ciment, 3);

    expect(result.value).toBe(1_001);
    expect(db.stockBalance.find(b => b.locationId === magasin.id)).toMatchObject({ quantity: 0, value: 0 });
    expect(db.stockBalance.find(b => b.locationId === chantier.id)).toMatchObject({ quantity: 3, value: 1_001 });
  });

  it('écrit DEUX mouvements liés par un même groupe, la sortie d’abord, la même valeur des deux côtés', async () => {
    const magasin = seedLocation({ label: 'Magasin central' });
    const chantier = seedLocation({ label: 'Lieu du chantier' });
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);

    const result = await transfer(magasin, chantier, ciment, 20);

    expect(result.movements).toHaveLength(2);
    const [sortie, entree] = result.movements;
    expect(sortie).toMatchObject({ isDecrease: true, locationId: magasin.id, quantityAfter: 80, totalValue: 100_000 });
    expect(entree).toMatchObject({
      isDecrease: false,
      locationId: chantier.id,
      quantityAfter: 20,
      totalValue: 100_000
    });
    expect(sortie.transferGroupId).toBe(result.transferGroupId);
    expect(entree.transferGroupId).toBe(result.transferGroupId);
    expect(result).toMatchObject({
      fromLocationLabel: 'Magasin central',
      toLocationLabel: 'Lieu du chantier',
      quantity: 20,
      value: 100_000
    });
  });

  it('N’IMPUTE RIEN ET N’ÉCRIT AUCUNE ÉCRITURE, même vers le lieu d’un chantier', async () => {
    const site = seedSite();
    const magasin = seedLocation();
    const chantier = seedLocation({ kind: 'SITE', siteId: site.id });
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);

    await transfer(magasin, chantier, ciment, 20);

    expect(postDocumentEntryTx).not.toHaveBeenCalled();
    expect(db.costAllocation).toHaveLength(0);
    expect(syncWorkProgramCostTx).not.toHaveBeenCalled();
    expect(await sumSiteActualCost(mockPrisma as any, TENANT_ID, site.id)).toBe(0);
  });
});

describe('recordStockTransferTx — chantier clos (A7-R4), inversion délibérée du test du lot 5', () => {
  it('REFUSE un transfert VERS le lieu d’un chantier clos (409 STOCK_SITE_CLOSED) — décision du fondateur (critère A7-8)', async () => {
    const clos = seedSite({ closedAt: daysAgo(2) });
    const magasin = seedLocation();
    const chantier = seedLocation({ kind: 'SITE', siteId: clos.id });
    const ciment = seedItem();
    seedBalance(magasin, ciment, 100, 500_000);

    await expect(transfer(magasin, chantier, ciment, 10)).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_SITE_CLOSED'
    });
    expect(db.stockMovement).toHaveLength(0);
    // Verrou de chantier pris AVANT de vérifier l'ouverture, et avant tout verrou de solde (A7-R3 bis).
    expect(locks).toEqual([`site:${clos.id}`]);
  });

  it('ACCEPTE un transfert DEPUIS le lieu d’un chantier clos vers un magasin (évacuation)', async () => {
    const clos = seedSite({ closedAt: daysAgo(2) });
    const chantier = seedLocation({ kind: 'SITE', siteId: clos.id });
    const magasin = seedLocation();
    const ciment = seedItem();
    seedBalance(chantier, ciment, 10, 50_000);

    const result = await transfer(chantier, magasin, ciment, 10, { reasonCode: 'SITE_EVACUATION' });
    expect(result.movements).toHaveLength(2);
    expect(locks.some(lock => lock.startsWith('site:'))).toBe(false);
  });

  it('verrous : site d’arrivée, puis les deux soldes TRIÉS — A→B et B→A prennent le même ordre (A10-R2)', async () => {
    const site = seedSite();
    const a = seedLocation();
    const b = seedLocation({ kind: 'SITE', siteId: site.id });
    const ciment = seedItem();
    seedBalance(a, ciment, 10, 10);
    seedBalance(b, ciment, 10, 10);

    await transfer(a, b, ciment, 1);
    const aller = [...locks];
    locks.length = 0;
    await transfer(b, a, ciment, 1);
    const retour = [...locks];

    const keys = [`${TENANT_ID}:${ciment.id}:${a.id}`, `${TENANT_ID}:${ciment.id}:${b.id}`]
      .sort()
      .map(k => `balance:${k}`);
    expect(aller).toEqual([`site:${site.id}`, ...keys]);
    expect(retour).toEqual(keys);
  });
});

describe('recordStockTransferTx — demandeur et motif obligatoires (A11)', () => {
  it('sans demandeur → 400 STOCK_REQUESTER_REQUIRED ; sans motif → 400 STOCK_REASON_REQUIRED (critère A11-1)', async () => {
    const [from, to, ciment] = [seedLocation(), seedLocation(), seedItem()];
    seedBalance(from, ciment, 10, 10);
    await expect(transfer(from, to, ciment, 1, { requestedBy: undefined })).rejects.toMatchObject({
      statusCode: 400,
      code: 'STOCK_REQUESTER_REQUIRED'
    });
    await expect(transfer(from, to, ciment, 1, { reasonCode: undefined })).rejects.toMatchObject({
      statusCode: 400,
      code: 'STOCK_REASON_REQUIRED'
    });
    await expect(transfer(from, to, ciment, 1, { reasonCode: 'OTHER' })).rejects.toMatchObject({
      code: 'STOCK_REASON_REQUIRED'
    });
    await expect(transfer(from, to, ciment, 1, { reasonCode: 'BREAKAGE' })).rejects.toMatchObject({
      code: 'STOCK_REASON_NOT_ALLOWED'
    });
  });

  it('le demandeur et le motif sont portés par la sortie COMME par l’entrée (critère A11-2)', async () => {
    const [from, to, ciment] = [seedLocation(), seedLocation(), seedItem()];
    seedBalance(from, ciment, 10, 10);
    const taker = seedTaker();
    const result = await transfer(from, to, ciment, 1, {
      takerId: taker.id,
      reasonCode: 'OTHER',
      reason: 'Prêt au voisin'
    });
    for (const movement of result.movements) {
      expect(movement).toMatchObject({
        reasonCode: 'OTHER',
        reason: 'Prêt au voisin',
        takerId: taker.id,
        requestedBy: 'Koné Ibrahim — Équipe maçonnerie'
      });
    }
  });

  it('requireTaker : un demandeur en texte ne suffit plus (400 STOCK_TAKER_REQUIRED)', async () => {
    const [from, to, ciment] = [seedLocation(), seedLocation(), seedItem()];
    seedBalance(from, ciment, 10, 10);
    seed('stockSettings', { backdatingLimitDays: 7, requireTaker: true, issueAlertAmount: 500_000 });
    await expect(transfer(from, to, ciment, 1)).rejects.toMatchObject({ code: 'STOCK_TAKER_REQUIRED' });
  });

  it('date de demain → 400 STOCK_DATE_IN_FUTURE (A5-R4)', async () => {
    const [from, to, ciment] = [seedLocation(), seedLocation(), seedItem()];
    seedBalance(from, ciment, 10, 10);
    await expect(transfer(from, to, ciment, 1, { transferDate: daysAgo(-1) })).rejects.toMatchObject({
      code: 'STOCK_DATE_IN_FUTURE'
    });
  });

  it('écrit STOCK_TRANSFER_RECORDED sur la moitié sortante, dans la transaction', async () => {
    const [from, to, ciment] = [seedLocation(), seedLocation(), seedItem()];
    seedBalance(from, ciment, 10, 10);
    const result = await transfer(from, to, ciment, 1);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        actionKey: 'STOCK_TRANSFER_RECORDED',
        entityType: 'StockMovement',
        entityId: result.movements[0].id
      })
    );
  });
});

describe('recordStockTransferTx — les refus', () => {
  it('refuse le même lieu des deux côtés, une quantité nulle, un stock insuffisant, sans rien écrire', async () => {
    const [from, to, ciment] = [seedLocation(), seedLocation(), seedItem()];
    seedBalance(from, ciment, 5, 50);
    await expect(transfer(from, from, ciment, 1)).rejects.toMatchObject({ statusCode: 400 });
    await expect(transfer(from, to, ciment, 0)).rejects.toMatchObject({ statusCode: 400 });
    await expect(transfer(from, to, ciment, 6, {}, { blindLocationIds: new Set() })).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_INSUFFICIENT',
      data: { items: [expect.objectContaining({ availableQuantity: 5 })] }
    });
    expect(db.stockMovement).toHaveLength(0);
  });

  it('refuse un lieu désactivé (409 STOCK_LOCATION_INACTIVE), un lieu ou un article d’une autre agence (404)', async () => {
    const ciment = seedItem();
    const from = seedLocation();
    seedBalance(from, ciment, 5, 50);
    await expect(transfer(from, seedLocation({ isActive: false }), ciment, 1)).rejects.toMatchObject({
      code: 'STOCK_LOCATION_INACTIVE'
    });
    await expect(transfer(from, seedLocation({ tenantId: 'tenant-2' }), ciment, 1)).rejects.toMatchObject({
      statusCode: 404
    });
    await expect(transfer(from, seedLocation(), seedItem({ tenantId: 'tenant-2' }), 1)).rejects.toMatchObject({
      statusCode: 404
    });
  });
});

describe('recordStockTransfer — idempotence et masquage', () => {
  const CLIENT_REQUEST = '3a0e8b2c-1111-4d6c-9e61-6a0f4c2c9a10';

  it('rejeu : 200 et le même transfert, deux mouvements en tout', async () => {
    const [from, to, ciment] = [seedLocation(), seedLocation(), seedItem()];
    seedBalance(from, ciment, 10, 1_000);
    const input = {
      fromLocationId: from.id,
      toLocationId: to.id,
      itemId: ciment.id,
      quantity: 2,
      transferDate: TODAY,
      reasonCode: 'REBALANCING' as const,
      requestedBy: 'Camara',
      clientRequestId: CLIENT_REQUEST
    };
    const first = await recordStockTransfer(TENANT_ID, ADMIN, input);
    const second = await recordStockTransfer(TENANT_ID, ADMIN, input);
    expect([first.status, second.status]).toEqual([201, 200]);
    expect(second.data.transferGroupId).toBe(first.data.transferGroupId);
    expect(second.data.movements.map(m => m.isDecrease)).toEqual([true, false]);
    expect(db.stockMovement).toHaveLength(2);
  });

  it('origine en comptage : value et quantités masquées pour le comptable ; magasinier sans valeurs', async () => {
    const [from, to, ciment] = [seedLocation(), seedLocation(), seedItem()];
    seedBalance(from, ciment, 10, 1_000);
    openDraftCount(from);
    const input = {
      fromLocationId: from.id,
      toLocationId: to.id,
      itemId: ciment.id,
      quantity: 2,
      transferDate: TODAY,
      reasonCode: 'REBALANCING' as const,
      requestedBy: 'Camara'
    };
    const comptable = await recordStockTransfer(TENANT_ID, COMPTABLE, input);
    expect(comptable.data.value).toBeNull();
    expect(comptable.data.movements[0]).toMatchObject({ quantityAfter: null, unitCost: null });
    expect(comptable.data.movements[1]).toMatchObject({ quantityAfter: 2, totalValue: 200 });
    expect(comptable.meta.blindLocationIds).toEqual([from.id]);

    const magasinier = await recordStockTransfer(TENANT_ID, MAGASINIER, input);
    expect(magasinier.data.movements[1]).toMatchObject({ quantityAfter: 4, totalValue: null, valueAfter: null });
  });
});
