/**
 * Tests des mouvements de stock (`lib/finance/stock-mouvements.ts`) — lot 5,
 * deuxième sous-lot, étendu par le lot 040 (spec 040 : A5-R4, A6, A7-R4, A8,
 * A10, B2, B3, B4-R1, B6, B7, §8.1, §8.2).
 *
 * Prisma est remplacé par un magasin en mémoire GÉNÉRIQUE (filtres `in`, `gt`,
 * `gte`, `lt`, `not`, `OR`, relations par `select`/`include`, unicités qui
 * lèvent `P2002`, annulation de la transaction en cas d'erreur) : les vraies
 * aides des fondations (`stock-controles.ts`, `stock-bons.ts`,
 * `stock-alertes.ts`) tournent par-dessus, verrous compris (`$executeRaw`
 * journalise l'ordre des verrous).
 *
 * Sont mockés : `accounting.ts` (comment une écriture s'équilibre n'est pas
 * l'objet ici, seulement les comptes et montants demandés), `cost-allocation.ts`
 * (`syncWorkProgramCostTx`), `ledger.ts` (`appendThirdPartyMovementTx`) et
 * `audit-service.ts`. `site-cost.ts` (`sumSiteActualCost`) NE l'est PAS : c'est
 * le vrai calcul qui prouve qu'une sortie fait monter le coût du chantier et
 * qu'un rebut ne le fait pas.
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

import {
  listStockBalances,
  listStockBalancesForCaller,
  recordStockIssue,
  recordStockIssueTx,
  recordStockReceipt,
  recordStockReceiptTx,
  recordStockScrap,
  recordStockScrapTx,
  recordStockSupplierReturn,
  recordStockSupplierReturnTx
} from '../../src/lib/finance/stock-mouvements';
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
const YEAR = TODAY.getUTCFullYear();

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
const seedCategory = (o: Row = {}) => seed('costCategory', { label: 'Gros œuvre', isActive: true, ...o });
const seedItem = (o: Row = {}) =>
  seed('stockItem', { reference: `ART-${seq}`, label: 'Ciment CPJ 45', unit: 'sac', isActive: true, ...o });
const seedLocation = (o: Row = {}) =>
  seed('stockLocation', { kind: 'WAREHOUSE', label: `Magasin ${seq}`, siteId: null, isActive: true, ...o });
const seedTaker = (o: Row = {}) =>
  seed('stockTaker', { fullName: 'Koné Ibrahim', teamOrCompany: 'Équipe maçonnerie', isActive: true, ...o });

function seedInvoice(o: Row = {}): Row {
  const supplier = seed('supplier', { name: 'Ciments du Sud', thirdPartyAccountId: 'compte-tiers-fournisseur' });
  return seed('supplierInvoice', {
    reference: `FAC-${seq}`,
    status: 'VALIDATED',
    amount: 10_000_000,
    supplierId: supplier.id,
    ...o
  });
}

function seedBalance(location: Row, item: Row, quantity: number, value: number): Row {
  return seed('stockBalance', { itemId: item.id, locationId: location.id, quantity, value, currency: 'XOF' });
}

function receive(location: Row, invoice: Row, lines: Row[], receiptDate = TODAY, options: Row = {}) {
  return runTransaction(tx =>
    recordStockReceiptTx(
      tx as any,
      TENANT_ID,
      {
        locationId: location.id,
        supplierInvoiceId: invoice.id,
        receiptDate,
        lines: lines as any,
        createdByUserId: USER_ID
      },
      options
    )
  );
}

function issue(
  location: Row,
  item: Row,
  site: Row,
  category: Row,
  quantity: number,
  overrides: Row = {},
  options: Row = {}
) {
  return runTransaction(tx =>
    recordStockIssueTx(
      tx as any,
      TENANT_ID,
      {
        locationId: location.id,
        siteId: site.id,
        issueDate: TODAY,
        lines: [{ itemId: item.id, quantity, costCategoryId: category.id }],
        requestedBy: 'Chef de chantier Camara',
        createdByUserId: USER_ID,
        ...overrides
      } as any,
      options
    )
  );
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
// A. La réception
// ===========================================================================

describe('recordStockReceiptTx — bon BR, un mouvement par ligne, aucune écriture', () => {
  it('écrit UN MOUVEMENT PAR LIGNE sous un bon BR numéroté, sans écriture ni imputation', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    const fer = seedItem({ label: 'Fer à béton HA12', unit: 'barre' });

    const result = await receive(location, invoice, [
      { itemId: ciment.id, quantity: 100, unitCost: 5_000 },
      { itemId: fer.id, quantity: 40, unitCost: 12_500 }
    ]);

    expect(result.slip.number).toBe(`BR-${YEAR}-00001`);
    expect(result.movements).toHaveLength(2);
    expect(result.movements.every(m => m.slipId === result.slip.id && m.slipNumber === result.slip.number)).toBe(true);
    expect(result.movements.map(m => m.totalValue)).toEqual([500_000, 500_000]);
    expect(db.stockBalance).toHaveLength(2);
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
    expect(db.costAllocation).toHaveLength(0);
    expect(db.stockSlip[0].snapshot.invoice).toEqual({ reference: invoice.reference, supplierName: 'Ciments du Sud' });
  });

  it('cumule DANS L’ORDRE deux lignes du même article et ne crée qu’un solde', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();

    const { movements } = await receive(location, invoice, [
      { itemId: ciment.id, quantity: 100, unitCost: 5_000 },
      { itemId: ciment.id, quantity: 100, unitCost: 7_000 }
    ]);

    expect(movements.map(m => m.quantityAfter)).toEqual([100, 200]);
    expect(movements[1].valueAfter).toBe(1_200_000);
    expect(db.stockBalance).toHaveLength(1);
    expect(db.stockBalance[0]).toMatchObject({ quantity: 200, value: 1_200_000 });
  });

  describe('chaîne de prix A8-R3', () => {
    it('prix déclaré → DECLARED', async () => {
      const { movements } = await receive(seedLocation(), seedInvoice(), [
        { itemId: seedItem().id, quantity: 10, unitCost: 4_000 }
      ]);
      expect(movements[0]).toMatchObject({ unitCost: 4_000, valuationSource: 'DECLARED' });
    });

    it('ligne de facture à 4 800 → INVOICE_LINE (critère A8-3)', async () => {
      const invoice = seedInvoice();
      const line = insert('supplierInvoiceLine', { invoiceId: invoice.id, unitPrice: 4_800 });
      const { movements } = await receive(seedLocation(), invoice, [
        { itemId: seedItem().id, quantity: 10, supplierInvoiceLineId: line.id }
      ]);
      expect(movements[0]).toMatchObject({ unitCost: 4_800, totalValue: 48_000, valuationSource: 'INVOICE_LINE' });
      expect(db.stockMovement[0].supplierInvoiceLineId).toBe(line.id);
    });

    it('sans prix ni ligne, au coût moyen du lieu : 5 200 → AVERAGE_COST (critère A8-5)', async () => {
      const location = seedLocation();
      const ciment = seedItem();
      seedBalance(location, ciment, 100, 520_000);
      const { movements } = await receive(location, seedInvoice(), [{ itemId: ciment.id, quantity: 10 }]);
      expect(movements[0]).toMatchObject({ unitCost: 5_200, valuationSource: 'AVERAGE_COST' });
    });

    it('lieu vide : dernier prix de réception de l’agence → LAST_RECEIPT', async () => {
      const ciment = seedItem();
      await receive(seedLocation(), seedInvoice(), [{ itemId: ciment.id, quantity: 10, unitCost: 6_100 }]);
      const { movements } = await receive(seedLocation(), seedInvoice(), [{ itemId: ciment.id, quantity: 5 }]);
      expect(movements[0]).toMatchObject({ unitCost: 6_100, valuationSource: 'LAST_RECEIPT' });
    });

    it('aucun prix connu → NONE, valeur nulle, et contrôle RECEIPT_UNVALUED avec les articles concernés', async () => {
      const ciment = seedItem();
      const result = await receive(seedLocation(), seedInvoice(), [{ itemId: ciment.id, quantity: 10 }]);
      expect(result.movements[0]).toMatchObject({ unitCost: 0, totalValue: 0, valuationSource: 'NONE' });
      expect(result.controls).toEqual([
        expect.objectContaining({ code: 'RECEIPT_UNVALUED', severity: 'INFO', itemIds: [ciment.id] })
      ]);
      expect(db.stockAlert).toEqual([
        expect.objectContaining({ kind: 'RECEIPT_UNVALUED', dedupeKey: `RECEIPT_UNVALUED:${result.slip.id}` })
      ]);
    });

    it('refuse une ligne de facture d’une AUTRE facture (404)', async () => {
      const other = seedInvoice();
      const line = insert('supplierInvoiceLine', { invoiceId: other.id, unitPrice: 4_800 });
      await expect(
        receive(seedLocation(), seedInvoice(), [{ itemId: seedItem().id, quantity: 1, supplierInvoiceLineId: line.id }])
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('contrôles A8-R2', () => {
    it('deuxième réception sur une facture → RECEIPT_REPEATED, la réception passe, une alerte s’ouvre (critère A8-1)', async () => {
      const location = seedLocation();
      const invoice = seedInvoice();
      const ciment = seedItem();
      const first = await receive(location, invoice, [{ itemId: ciment.id, quantity: 10, unitCost: 1_000 }]);
      const second = await receive(location, invoice, [{ itemId: ciment.id, quantity: 10, unitCost: 1_000 }]);

      expect(second.controls[0]).toMatchObject({ code: 'RECEIPT_REPEATED', severity: 'INFO' });
      expect(second.controls[0].alertId).toBe(db.stockAlert.find(a => a.kind === 'RECEIPT_REPEATED')!.id);
      expect(second.controls[0].details.previousSlipNumber).toBe(first.slip.number);
      expect(db.stockMovement).toHaveLength(2);
    });

    it('facture de 1 000 000, cumul reçu 1 050 000 → RECEIPT_OVER_INVOICE (critère A8-2)', async () => {
      const invoice = seedInvoice({ amount: 1_000_000 });
      const result = await receive(seedLocation(), invoice, [
        { itemId: seedItem().id, quantity: 105, unitCost: 10_000 }
      ]);
      const control = result.controls.find(c => c.code === 'RECEIPT_OVER_INVOICE');
      expect(control).toMatchObject({ severity: 'WARNING', amount: 1_050_000, threshold: 1_000_000 });
      expect(db.stockAlert.find(a => a.kind === 'RECEIPT_OVER_INVOICE')).toMatchObject({
        amount: 1_050_000,
        threshold: 1_000_000
      });
    });
  });

  describe('refus', () => {
    it('facture non validée → 409 STOCK_INVOICE_NOT_VALIDATED', async () => {
      await expect(
        receive(seedLocation(), seedInvoice({ status: 'DRAFT' }), [{ itemId: seedItem().id, quantity: 1, unitCost: 1 }])
      ).rejects.toMatchObject({ statusCode: 409, code: 'STOCK_INVOICE_NOT_VALIDATED' });
    });

    it('lieu désactivé → 409 STOCK_LOCATION_INACTIVE ; article désactivé → 409 STOCK_ITEM_INACTIVE', async () => {
      await expect(
        receive(seedLocation({ isActive: false }), seedInvoice(), [{ itemId: seedItem().id, quantity: 1, unitCost: 1 }])
      ).rejects.toMatchObject({ code: 'STOCK_LOCATION_INACTIVE' });
      await expect(
        receive(seedLocation(), seedInvoice(), [{ itemId: seedItem({ isActive: false }).id, quantity: 1, unitCost: 1 }])
      ).rejects.toMatchObject({ code: 'STOCK_ITEM_INACTIVE' });
    });

    it('lieu d’un chantier CLOS → 409 STOCK_SITE_CLOSED, verrou de chantier pris AVANT les verrous de solde (A7-R4, A7-R3 bis)', async () => {
      const site = seedSite({ closedAt: daysAgo(3) });
      const location = seedLocation({ kind: 'SITE', siteId: site.id });
      await expect(
        receive(location, seedInvoice(), [{ itemId: seedItem().id, quantity: 1, unitCost: 1 }])
      ).rejects.toMatchObject({ statusCode: 409, code: 'STOCK_SITE_CLOSED' });
      expect(locks).toEqual([`site:${site.id}`]);
      expect(db.stockMovement).toHaveLength(0);
    });

    it('sur le lieu d’un chantier OUVERT : site, puis soldes triés, puis numérotation', async () => {
      const site = seedSite();
      const location = seedLocation({ kind: 'SITE', siteId: site.id });
      const [b, a] = [seedItem(), seedItem()];
      await receive(location, seedInvoice(), [
        { itemId: b.id, quantity: 1, unitCost: 1 },
        { itemId: a.id, quantity: 1, unitCost: 1 }
      ]);
      const balanceKeys = [`${TENANT_ID}:${b.id}:${location.id}`, `${TENANT_ID}:${a.id}:${location.id}`].sort();
      expect(locks).toEqual([`site:${site.id}`, ...balanceKeys.map(k => `balance:${k}`), `slip:${TENANT_ID}`]);
    });

    it('refuse une ligne invalide AVANT d’écrire quoi que ce soit', async () => {
      const ciment = seedItem();
      await expect(
        receive(seedLocation(), seedInvoice(), [
          { itemId: ciment.id, quantity: 100, unitCost: 5_000 },
          { itemId: ciment.id, quantity: -1, unitCost: 5_000 }
        ])
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(db.stockMovement).toHaveLength(0);
      expect(db.stockSlip).toHaveLength(0);
    });
  });
});

describe('recordStockReceipt — masquage pour l’appelant', () => {
  it('le magasinier réceptionne sur une ligne de facture : unitCost null dans SA réponse (critère A8-3)', async () => {
    const invoice = seedInvoice();
    const line = insert('supplierInvoiceLine', { invoiceId: invoice.id, unitPrice: 4_800 });
    const response = await recordStockReceipt(TENANT_ID, MAGASINIER, {
      locationId: seedLocation().id,
      supplierInvoiceId: invoice.id,
      receiptDate: TODAY,
      lines: [{ itemId: seedItem().id, quantity: 10, supplierInvoiceLineId: line.id }]
    });
    expect(response.status).toBe(201);
    expect(db.stockMovement[0]).toMatchObject({ unitCost: 4_800, valuationSource: 'INVOICE_LINE' });
    expect(response.data.movements[0]).toMatchObject({ unitCost: null, totalValue: null, valuationSource: null });
    expect(response.meta.valuesVisible).toBe(false);
  });

  it('le magasinier qui envoie un prix → 403 STOCK_VALUE_FIELD_FORBIDDEN (critère A8-4)', async () => {
    await expect(
      recordStockReceipt(TENANT_ID, MAGASINIER, {
        locationId: seedLocation().id,
        supplierInvoiceId: seedInvoice().id,
        receiptDate: TODAY,
        lines: [{ itemId: seedItem().id, quantity: 10, unitCost: 1_000 }]
      })
    ).rejects.toMatchObject({ statusCode: 403, code: 'STOCK_VALUE_FIELD_FORBIDDEN' });
    expect(db.stockMovement).toHaveLength(0);
  });

  it('contrôle RECEIPT_OVER_INVOICE du magasinier : montants null, message sans « FCFA » (critère A8-6)', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    seedBalance(location, ciment, 10, 100_000);
    const response = await recordStockReceipt(TENANT_ID, MAGASINIER, {
      locationId: location.id,
      supplierInvoiceId: seedInvoice({ amount: 50_000 }).id,
      receiptDate: TODAY,
      lines: [{ itemId: ciment.id, quantity: 10 }]
    });
    const control = response.data.controls.find(c => c.code === 'RECEIPT_OVER_INVOICE')!;
    expect(control).toMatchObject({ amount: null, threshold: null });
    expect(control.message).not.toContain('FCFA');

    const comptable = await recordStockReceipt(TENANT_ID, COMPTABLE, {
      locationId: location.id,
      supplierInvoiceId: seedInvoice({ amount: 50_000 }).id,
      receiptDate: TODAY,
      lines: [{ itemId: ciment.id, quantity: 10 }]
    });
    expect(comptable.data.controls.find(c => c.code === 'RECEIPT_OVER_INVOICE')!.message).toMatch(/FCFA/);
  });
});

// ===========================================================================
// B. Le coût moyen pondéré
// ===========================================================================

describe('coût moyen pondéré', () => {
  it('valorise une sortie au coût moyen AVANT la sortie : 100 à 5 000 puis 100 à 7 000, sortie de 50 = 300 000', async () => {
    const location = seedLocation();
    const invoice = seedInvoice();
    const ciment = seedItem();
    await receive(location, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 5_000 }]);
    await receive(location, invoice, [{ itemId: ciment.id, quantity: 100, unitCost: 7_000 }]);

    const { movements } = await issue(location, ciment, seedSite(), seedCategory(), 50);
    expect(movements[0]).toMatchObject({
      totalValue: 300_000,
      unitCost: 6_000,
      quantityAfter: 150,
      valueAfter: 900_000
    });
  });

  it('QUAND LA QUANTITÉ TOMBE À ZÉRO, LA VALEUR AUSSI — même sur un coût moyen qui ne tombe pas rond', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    const [site, poste] = [seedSite(), seedCategory()];
    await receive(location, seedInvoice(), [
      { itemId: ciment.id, quantity: 3, unitCost: 1_000 },
      { itemId: ciment.id, quantity: 4, unitCost: 1 }
    ]);
    const premiere = (await issue(location, ciment, site, poste, 2)).movements[0];
    const seconde = (await issue(location, ciment, site, poste, 5)).movements[0];
    expect(premiere.totalValue).toBe(858);
    expect(seconde).toMatchObject({ totalValue: 2_146, quantityAfter: 0, valueAfter: 0 });
    expect((premiere.totalValue as number) + (seconde.totalValue as number)).toBe(3_004);
  });

  it('conserve les quatre décimales d’une quantité', async () => {
    const location = seedLocation();
    const sable = seedItem({ label: 'Sable', unit: 'm3' });
    await receive(location, seedInvoice(), [{ itemId: sable.id, quantity: 12.5, unitCost: 8_000 }]);
    const { movements } = await issue(location, sable, seedSite(), seedCategory(), 0.25);
    expect(movements[0]).toMatchObject({ quantity: 0.25, quantityAfter: 12.25, totalValue: 2_000 });
  });
});

// ===========================================================================
// C. La sortie
// ===========================================================================

describe('recordStockIssueTx — bon BS, imputation, preneur', () => {
  it('FAIT MONTER LE COÛT RÉEL DU CHANTIER exactement de la valeur sortie, avec écriture et imputation', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    const site = seedSite();
    const poste = seedCategory();
    COMPTES_PAR_POSTE.set(poste.id, 'compte-du-poste');
    seedBalance(location, ciment, 200, 1_200_000);

    const { movements } = await issue(location, ciment, site, poste, 50);

    expect(await sumSiteActualCost(mockPrisma as any, TENANT_ID, site.id)).toBe(300_000);
    expect(db.costAllocation[0]).toMatchObject({
      sourceType: 'STOCK_ISSUE',
      sourceId: movements[0].id,
      amount: 300_000
    });
    expect(postDocumentEntryTx.mock.calls[0][1]).toMatchObject({
      documentType: 'STOCK_ISSUE',
      documentId: movements[0].id,
      lines: [
        expect.objectContaining({ accountId: 'compte-du-poste', debit: 300_000 }),
        expect.objectContaining({ accountId: 'compte-311', credit: 300_000 })
      ]
    });
    expect(syncWorkProgramCostTx).toHaveBeenCalledWith(expect.anything(), TENANT_ID, site.id);
  });

  it('sortie MULTI-LIGNES : un seul bon, une écriture par ligne, numéros continus BS-AAAA-00001 puis 00002 (B3-R3, B4-1)', async () => {
    const location = seedLocation();
    const [ciment, fer] = [seedItem(), seedItem({ label: 'Fer' })];
    const [site, poste] = [seedSite(), seedCategory()];
    seedBalance(location, ciment, 100, 500_000);
    seedBalance(location, fer, 100, 1_000_000);

    const first = await runTransaction(tx =>
      recordStockIssueTx(tx as any, TENANT_ID, {
        locationId: location.id,
        siteId: site.id,
        issueDate: TODAY,
        requestedBy: 'Camara',
        createdByUserId: USER_ID,
        lines: [
          { itemId: ciment.id, quantity: 10, costCategoryId: poste.id },
          { itemId: fer.id, quantity: 5, costCategoryId: poste.id }
        ]
      })
    );
    const second = await issue(location, ciment, site, poste, 1);

    expect(first.slip.number).toBe(`BS-${YEAR}-00001`);
    expect(first.movements).toHaveLength(2);
    expect(postDocumentEntryTx).toHaveBeenCalledTimes(3);
    expect(second.slip.number).toBe(`BS-${YEAR}-00002`);

    // Une autre agence repart à 00001.
    const autre = insert('stockLocation', {
      tenantId: 'tenant-2',
      kind: 'WAREHOUSE',
      label: 'Autre',
      isActive: true,
      siteId: null
    });
    const autreArticle = insert('stockItem', {
      tenantId: 'tenant-2',
      reference: 'X',
      label: 'X',
      unit: 'u',
      isActive: true
    });
    const autreSite = insert('constructionSite', { tenantId: 'tenant-2', name: 'S', closedAt: null });
    const autrePoste = insert('costCategory', { tenantId: 'tenant-2', label: 'P', isActive: true });
    insert('stockBalance', {
      tenantId: 'tenant-2',
      itemId: autreArticle.id,
      locationId: autre.id,
      quantity: 5,
      value: 5
    });
    const third = await runTransaction(tx =>
      recordStockIssueTx(tx as any, 'tenant-2', {
        locationId: autre.id,
        siteId: autreSite.id,
        issueDate: TODAY,
        requestedBy: 'X',
        createdByUserId: USER_ID,
        lines: [{ itemId: autreArticle.id, quantity: 1, costCategoryId: autrePoste.id }]
      })
    );
    expect(third.slip.number).toBe(`BS-${YEAR}-00001`);
  });

  it('accepte encore la forme à un article (lot 5)', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    const [site, poste] = [seedSite(), seedCategory()];
    seedBalance(location, ciment, 10, 10_000);
    const result = await runTransaction(tx =>
      recordStockIssueTx(tx as any, TENANT_ID, {
        locationId: location.id,
        itemId: ciment.id,
        quantity: 2,
        siteId: site.id,
        costCategoryId: poste.id,
        requestedBy: 'Camara',
        issueDate: TODAY,
        createdByUserId: USER_ID
      })
    );
    expect(result.movements).toHaveLength(1);
  });

  it('verrous de solde TRIÉS, numérotation EN DERNIER (A10-R2)', async () => {
    const location = seedLocation();
    const [b, a] = [seedItem(), seedItem()];
    seedBalance(location, a, 10, 10);
    seedBalance(location, b, 10, 10);
    const [site, poste] = [seedSite(), seedCategory()];
    await runTransaction(tx =>
      recordStockIssueTx(tx as any, TENANT_ID, {
        locationId: location.id,
        siteId: site.id,
        issueDate: TODAY,
        requestedBy: 'X',
        createdByUserId: USER_ID,
        lines: [
          { itemId: b.id, quantity: 1, costCategoryId: poste.id },
          { itemId: a.id, quantity: 1, costCategoryId: poste.id }
        ]
      })
    );
    const keys = [`${TENANT_ID}:${b.id}:${location.id}`, `${TENANT_ID}:${a.id}:${location.id}`].sort();
    expect(locks).toEqual([...keys.map(k => `balance:${k}`), `slip:${TENANT_ID}`]);
  });

  it('une sortie refusée ne consomme AUCUN numéro (B4-2)', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    const [site, poste] = [seedSite(), seedCategory()];
    seedBalance(location, ciment, 10, 10_000);
    await expect(issue(location, ciment, site, poste, 11)).rejects.toMatchObject({ code: 'STOCK_INSUFFICIENT' });
    const ok = await issue(location, ciment, site, poste, 1);
    expect(ok.slip.number).toBe(`BS-${YEAR}-00001`);
  });

  it('REFUSE une sortie supérieure au stock (409 STOCK_INSUFFICIENT), sans rien écrire', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    seedBalance(location, ciment, 30, 150_000);
    await expect(
      issue(location, ciment, seedSite(), seedCategory(), 31, {}, { blindLocationIds: new Set() })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_INSUFFICIENT',
      data: {
        locationId: location.id,
        items: [expect.objectContaining({ requestedQuantity: 31, availableQuantity: 30 })]
      }
    });
    expect(db.stockBalance[0]).toMatchObject({ quantity: 30, value: 150_000 });
    expect(db.costAllocation).toHaveLength(0);
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
  });

  it('chantier clos → 409 STOCK_SITE_CLOSED ; chantier d’une autre agence → 404', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    seedBalance(location, ciment, 100, 100);
    await expect(issue(location, ciment, seedSite({ closedAt: daysAgo(1) }), seedCategory(), 1)).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_SITE_CLOSED'
    });
    await expect(issue(location, ciment, seedSite({ tenantId: 'tenant-2' }), seedCategory(), 1)).rejects.toMatchObject({
      statusCode: 404
    });
  });

  it('exige un poste actif', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    seedBalance(location, ciment, 100, 100);
    await expect(issue(location, ciment, seedSite(), seedCategory({ isActive: false }), 1)).rejects.toMatchObject({
      statusCode: 409
    });
  });

  describe('dates bornées (A5-R4)', () => {
    it('demain → 400 STOCK_DATE_IN_FUTURE ; il y a 8 jours → 400 STOCK_DATE_TOO_OLD ; il y a 7 jours → acceptée, entryLagDays = 7 (critère A5-2)', async () => {
      const location = seedLocation();
      const ciment = seedItem();
      const [site, poste] = [seedSite(), seedCategory()];
      seedBalance(location, ciment, 100, 100_000);
      await expect(issue(location, ciment, site, poste, 1, { issueDate: daysAgo(-1) })).rejects.toMatchObject({
        statusCode: 400,
        code: 'STOCK_DATE_IN_FUTURE'
      });
      await expect(issue(location, ciment, site, poste, 1, { issueDate: daysAgo(8) })).rejects.toMatchObject({
        statusCode: 400,
        code: 'STOCK_DATE_TOO_OLD'
      });
      const { movements } = await issue(location, ciment, site, poste, 1, { issueDate: daysAgo(7) });
      expect(movements[0].entryLagDays).toBe(7);
    });

    it('la borne suit le réglage de l’agence', async () => {
      const location = seedLocation();
      const ciment = seedItem();
      seedBalance(location, ciment, 100, 100_000);
      seed('stockSettings', { backdatingLimitDays: 30, requireTaker: false, issueAlertAmount: null });
      const { movements } = await issue(location, ciment, seedSite(), seedCategory(), 1, { issueDate: daysAgo(20) });
      expect(movements).toHaveLength(1);
    });
  });

  describe('preneur ou demandeur (B2-R3)', () => {
    it('avec un preneur, requestedBy reçoit un INSTANTANÉ de son libellé : le renommer ne réécrit pas l’histoire (B2-3)', async () => {
      const location = seedLocation();
      const ciment = seedItem();
      seedBalance(location, ciment, 100, 100_000);
      const taker = seedTaker();
      const { movements } = await issue(location, ciment, seedSite(), seedCategory(), 1, {
        takerId: taker.id,
        requestedBy: 'ignoré'
      });
      expect(movements[0]).toMatchObject({ takerId: taker.id, requestedBy: 'Koné Ibrahim — Équipe maçonnerie' });
      taker.fullName = 'Koné I.';
      expect(db.stockMovement[0].requestedBy).toBe('Koné Ibrahim — Équipe maçonnerie');
      expect(db.stockSlip[0].snapshot.taker).toBe('Koné Ibrahim — Équipe maçonnerie');
    });

    it('preneur d’une autre agence → 404 (B2-1) ; preneur désactivé → 409 STOCK_TAKER_INACTIVE (B2-4)', async () => {
      const location = seedLocation();
      const ciment = seedItem();
      seedBalance(location, ciment, 100, 100_000);
      const etranger = seedTaker({ tenantId: 'tenant-2' });
      await expect(
        issue(location, ciment, seedSite(), seedCategory(), 1, { takerId: etranger.id })
      ).rejects.toMatchObject({ statusCode: 404 });
      const inactif = seedTaker({ isActive: false });
      await expect(
        issue(location, ciment, seedSite(), seedCategory(), 1, { takerId: inactif.id })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'STOCK_TAKER_INACTIVE'
      });
    });

    it('requireTaker et seulement un demandeur → 400 STOCK_TAKER_REQUIRED (B2-2) ; ni l’un ni l’autre → 400 STOCK_REQUESTER_REQUIRED', async () => {
      const location = seedLocation();
      const ciment = seedItem();
      seedBalance(location, ciment, 100, 100_000);
      await expect(
        issue(location, ciment, seedSite(), seedCategory(), 1, { requestedBy: '   ' })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'STOCK_REQUESTER_REQUIRED'
      });
      seed('stockSettings', { backdatingLimitDays: 7, requireTaker: true, issueAlertAmount: 500_000 });
      await expect(issue(location, ciment, seedSite(), seedCategory(), 1)).rejects.toMatchObject({
        statusCode: 400,
        code: 'STOCK_TAKER_REQUIRED'
      });
    });
  });

  it('alerte LARGE_ISSUE quand la valeur du bon atteint le seuil (500 000 par défaut, critère B7-1)', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    seedBalance(location, ciment, 100, 1_000_000);
    const small = await issue(location, ciment, seedSite(), seedCategory(), 10);
    expect(db.stockAlert).toHaveLength(0);
    const big = await issue(location, ciment, seedSite(), seedCategory(), 60);
    expect(db.stockAlert).toEqual([
      expect.objectContaining({
        kind: 'LARGE_ISSUE',
        severity: 'WARNING',
        amount: 600_000,
        threshold: 500_000,
        dedupeKey: `LARGE_ISSUE:${big.slip.id}`
      })
    ]);
    expect(small.slip.id).not.toBe(big.slip.id);
  });

  it('écrit STOCK_ISSUE_RECORDED DANS la transaction ; si l’audit échoue, la sortie est annulée (critère B6-1)', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    seedBalance(location, ciment, 100, 100_000);
    recordAuditEvent.mockRejectedValueOnce(new Error('audit indisponible'));
    await expect(issue(location, ciment, seedSite(), seedCategory(), 1)).rejects.toThrow('audit indisponible');
    expect(db.stockMovement).toHaveLength(0);
    expect(db.stockSlip).toHaveLength(0);

    const ok = await issue(location, ciment, seedSite(), seedCategory(), 1);
    expect(recordAuditEvent).toHaveBeenLastCalledWith(
      mockPrisma,
      expect.objectContaining({ actionKey: 'STOCK_ISSUE_RECORDED', entityType: 'StockSlip', entityId: ok.slip.id })
    );
  });
});

// ===========================================================================
// D. Idempotence et masquage (recordStockIssue)
// ===========================================================================

describe('recordStockIssue — idempotence (B3-R2) et aveugle (§8.2)', () => {
  const CLIENT_REQUEST = '7d1f1a86-1d3f-4d6c-9e61-6a0f4c2c9a10';

  function issueInput(location: Row, item: Row, site: Row, poste: Row, quantity: number): any {
    return {
      locationId: location.id,
      siteId: site.id,
      issueDate: TODAY,
      requestedBy: 'Camara',
      lines: [{ itemId: item.id, quantity, costCategoryId: poste.id }],
      clientRequestId: CLIENT_REQUEST
    };
  }

  it('deux envois identiques : un seul mouvement, un seul bon, une seule alerte ; le second répond 200 avec le même bon (B3-1, B7-1)', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    const [site, poste] = [seedSite(), seedCategory()];
    seedBalance(location, ciment, 100, 1_000_000);
    const input = issueInput(location, ciment, site, poste, 60);

    const first = await recordStockIssue(TENANT_ID, ADMIN, input);
    const second = await recordStockIssue(TENANT_ID, ADMIN, input);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.data.slip.id).toBe(first.data.slip.id);
    expect(second.data.movements.map(m => m.id)).toEqual(first.data.movements.map(m => m.id));
    expect(db.stockMovement).toHaveLength(1);
    expect(db.stockSlip).toHaveLength(1);
    expect(db.stockAlert).toHaveLength(1);
  });

  it('même clé, autre corps → 409 STOCK_IDEMPOTENCY_MISMATCH ; même clé, autre utilisateur → 409 (B3-3)', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    const [site, poste] = [seedSite(), seedCategory()];
    seedBalance(location, ciment, 100, 100_000);
    await recordStockIssue(TENANT_ID, ADMIN, issueInput(location, ciment, site, poste, 1));

    await expect(
      recordStockIssue(TENANT_ID, ADMIN, issueInput(location, ciment, site, poste, 2))
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_IDEMPOTENCY_MISMATCH'
    });
    await expect(
      recordStockIssue(TENANT_ID, COMPTABLE, issueInput(location, ciment, site, poste, 1))
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_IDEMPOTENCY_MISMATCH'
    });
    expect(db.stockMovement).toHaveLength(1);
  });

  it('rejeu CONCURRENT : la clé bute sur l’unicité (P2002), la clé est relue et le résultat d’origine rendu', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    const [site, poste] = [seedSite(), seedCategory()];
    seedBalance(location, ciment, 100, 100_000);
    const input = issueInput(location, ciment, site, poste, 1);
    const first = await recordStockIssue(TENANT_ID, ADMIN, input);

    // Le second envoi ne voit pas encore la clé à sa première lecture (course).
    mockPrisma.stockClientRequest.findFirst.mockImplementationOnce(async () => null);
    const second = await recordStockIssue(TENANT_ID, ADMIN, input);
    expect(second.status).toBe(200);
    expect(second.data.slip.id).toBe(first.data.slip.id);
    expect(db.stockMovement).toHaveLength(1);
  });

  it('le rejeu est RE-MASQUÉ pour l’appelant à l’instant du rejeu', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    const [site, poste] = [seedSite(), seedCategory()];
    seedBalance(location, ciment, 100, 100_000);
    const input = issueInput(location, ciment, site, poste, 1);
    await recordStockIssue(TENANT_ID, MAGASINIER, input);
    openDraftCount(location);
    const replay = await recordStockIssue(TENANT_ID, MAGASINIER, input);
    expect(replay.status).toBe(200);
    expect(replay.data.movements[0]).toMatchObject({ quantityAfter: null, totalValue: null, unitCost: null });
    expect(replay.meta.blindLocationIds).toEqual([location.id]);
  });

  it('lieu en comptage : refus STOCK_INSUFFICIENT SANS quantité disponible, tracé hors transaction (A2-3, B6)', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    seedBalance(location, ciment, 100, 100_000);
    openDraftCount(location);
    const error = await recordStockIssue(
      TENANT_ID,
      MAGASINIER,
      issueInput(location, ciment, seedSite(), seedCategory(), 150)
    ).catch(e => e);
    expect(error).toMatchObject({ statusCode: 409, code: 'STOCK_INSUFFICIENT' });
    expect(error.message).not.toMatch(/\d/);
    expect(error.data.items[0]).not.toHaveProperty('availableQuantity');
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'STOCK_BLIND_INSUFFICIENT_REFUSED',
        entityType: 'StockLocation',
        entityId: location.id
      })
    );
    expect(db.stockClientRequest).toHaveLength(0);
  });

  it('comptable sur un lieu en comptage : quantityAfter, valueAfter, unitCost null dans sa réponse (A2-7)', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    seedBalance(location, ciment, 100, 100_000);
    openDraftCount(location);
    const response = await recordStockIssue(TENANT_ID, COMPTABLE, {
      ...issueInput(location, ciment, seedSite(), seedCategory(), 1),
      clientRequestId: undefined
    });
    expect(response.data.movements[0]).toMatchObject({
      quantityAfter: null,
      valueAfter: null,
      unitCost: null,
      totalValue: 1_000
    });
    expect(response.meta).toEqual({ valuesVisible: true, blindLocationIds: [location.id] });
  });
});

// ===========================================================================
// E. Le retour fournisseur (A6)
// ===========================================================================

describe('recordStockSupplierReturnTx', () => {
  function setupReturn(valuationSource = 'INVOICE_LINE') {
    const location = seedLocation();
    const ciment = seedItem();
    const invoice = seedInvoice();
    const line = insert('supplierInvoiceLine', { invoiceId: invoice.id, unitPrice: 5_000 });
    seedBalance(location, ciment, 100, 520_000);
    seed('stockMovement', {
      type: 'RECEIPT',
      itemId: ciment.id,
      locationId: location.id,
      movementDate: daysAgo(2),
      quantity: 100,
      isDecrease: false,
      unitCost: 5_000,
      totalValue: 500_000,
      quantityAfter: 100,
      valueAfter: 500_000,
      supplierInvoiceId: invoice.id,
      valuationSource,
      createdByUserId: USER_ID,
      journalEntryId: null,
      reason: null,
      reasonCode: null,
      slipId: null,
      takerId: null,
      siteId: null,
      transferGroupId: null,
      stockCountId: null,
      supplierCreditValue: null,
      supplierInvoiceLineId: null,
      requestedBy: null,
      costCategoryId: null,
      currency: 'XOF'
    });
    return { location, ciment, invoice, line };
  }

  function returnOf(env: Row, quantity: number, overrides: Row = {}) {
    return runTransaction(tx =>
      recordStockSupplierReturnTx(tx as any, TENANT_ID, {
        locationId: env.location.id,
        supplierInvoiceId: env.invoice.id,
        itemId: env.ciment.id,
        quantity,
        returnDate: TODAY,
        reasonCode: 'NON_CONFORMING',
        createdByUserId: USER_ID,
        ...overrides
      } as any)
    );
  }

  it('10 sacs avec la ligne à 5 000, coût moyen 5 200 : D401 50 000, C311 52 000, D603 2 000, compte du fournisseur −50 000 (critère A6-1)', async () => {
    const env = setupReturn();
    const view = await returnOf(env, 10, { supplierInvoiceLineId: env.line.id });

    expect(view).toMatchObject({
      type: 'SUPPLIER_RETURN',
      totalValue: 52_000,
      supplierCreditValue: 50_000,
      reasonCode: 'NON_CONFORMING'
    });
    const params = postDocumentEntryTx.mock.calls[0][1];
    expect(params.documentType).toBe('STOCK_SUPPLIER_RETURN');
    expect(params.lines).toEqual([
      expect.objectContaining({ accountId: 'compte-401', debit: 50_000 }),
      expect.objectContaining({ accountId: 'compte-311', credit: 52_000 }),
      expect.objectContaining({ accountId: 'compte-603', debit: 2_000 })
    ]);
    expect(appendThirdPartyMovementTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        accountId: 'compte-tiers-fournisseur',
        type: 'ADJUSTMENT',
        settled: 50_000,
        sourceType: 'STOCK_SUPPLIER_RETURN',
        sourceId: view.id
      })
    );
    expect(db.stockBalance[0]).toMatchObject({ quantity: 90, value: 468_000 });
    expect(db.costAllocation).toHaveLength(0);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({ actionKey: 'STOCK_SUPPLIER_RETURN_RECORDED', entityId: view.id })
    );
  });

  it('sans ligne, réceptions DECLARED/INVOICE_LINE : prix = coût de réception de la facture', async () => {
    const env = setupReturn('DECLARED');
    const view = await returnOf(env, 10);
    expect(view.supplierCreditValue).toBe(50_000);
  });

  it('120 sacs pour 100 reçus → 409 STOCK_RETURN_EXCEEDS_RECEIVED (critère A6-2)', async () => {
    const env = setupReturn();
    await expect(returnOf(env, 120, { supplierInvoiceLineId: env.line.id })).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_RETURN_EXCEEDS_RECEIVED'
    });
  });

  it('réceptions AVERAGE_COST sans ligne de facture → 409 STOCK_RETURN_UNVALUED, rien n’est écrit (critère A6-5)', async () => {
    const env = setupReturn('AVERAGE_COST');
    await expect(returnOf(env, 10)).rejects.toMatchObject({ statusCode: 409, code: 'STOCK_RETURN_UNVALUED' });
    expect(db.stockMovement.filter(m => m.type === 'SUPPLIER_RETURN')).toHaveLength(0);
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
  });

  it('motif : absent → STOCK_REASON_REQUIRED ; hors colonne → STOCK_REASON_NOT_ALLOWED ; « Autre » sans précision → STOCK_REASON_REQUIRED', async () => {
    const env = setupReturn();
    await expect(returnOf(env, 1, { reasonCode: undefined })).rejects.toMatchObject({ code: 'STOCK_REASON_REQUIRED' });
    await expect(returnOf(env, 1, { reasonCode: 'BREAKAGE' })).rejects.toMatchObject({
      code: 'STOCK_REASON_NOT_ALLOWED'
    });
    await expect(returnOf(env, 1, { reasonCode: 'OTHER' })).rejects.toMatchObject({ code: 'STOCK_REASON_REQUIRED' });
  });

  it('refuse un retour qui rendrait le stock du lieu négatif (A6-R5)', async () => {
    const env = setupReturn();
    db.stockBalance[0].quantity = 5;
    db.stockBalance[0].value = 26_000;
    await expect(returnOf(env, 10, { supplierInvoiceLineId: env.line.id })).rejects.toMatchObject({
      code: 'STOCK_INSUFFICIENT'
    });
  });

  it('public : valeurs masquées pour un rôle sans STOCK_VALUES_VIEW', async () => {
    const env = setupReturn();
    const response = await recordStockSupplierReturn(TENANT_ID, ctxOf({ valuesVisible: false }), {
      locationId: env.location.id,
      supplierInvoiceId: env.invoice.id,
      supplierInvoiceLineId: env.line.id,
      itemId: env.ciment.id,
      quantity: 10,
      returnDate: TODAY,
      reasonCode: 'EXCESS_DELIVERY'
    });
    expect(response.data).toMatchObject({
      unitCost: null,
      totalValue: null,
      valueAfter: null,
      supplierCreditValue: null,
      quantityAfter: 90
    });
  });
});

// ===========================================================================
// F. Le rebut (A6)
// ===========================================================================

describe('recordStockScrapTx', () => {
  function scrap(location: Row, item: Row, quantity: number, overrides: Row = {}) {
    return runTransaction(tx =>
      recordStockScrapTx(tx as any, TENANT_ID, {
        locationId: location.id,
        itemId: item.id,
        quantity,
        scrapDate: TODAY,
        reasonCode: 'BREAKAGE',
        createdByUserId: USER_ID,
        ...overrides
      } as any)
    );
  }

  it('5 sacs au coût moyen 5 200 : D603 26 000 / C311 26 000, et le coût du chantier ne bouge pas (critère A6-3)', async () => {
    const site = seedSite();
    const location = seedLocation({ kind: 'SITE', siteId: site.id });
    const ciment = seedItem();
    seedBalance(location, ciment, 100, 520_000);

    const view = await scrap(location, ciment, 5);

    expect(view).toMatchObject({ type: 'SCRAP', isDecrease: true, totalValue: 26_000, reasonCode: 'BREAKAGE' });
    expect(postDocumentEntryTx.mock.calls[0][1]).toMatchObject({
      documentType: 'STOCK_SCRAP',
      lines: [
        expect.objectContaining({ accountId: 'compte-603', debit: 26_000 }),
        expect.objectContaining({ accountId: 'compte-311', credit: 26_000 })
      ]
    });
    expect(await sumSiteActualCost(mockPrisma as any, TENANT_ID, site.id)).toBe(0);
    expect(db.costAllocation).toHaveLength(0);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({ actionKey: 'STOCK_SCRAP_RECORDED' })
    );
  });

  it('un rebut à valeur nulle n’écrit aucune écriture (A6-R4)', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    seedBalance(location, ciment, 10, 0);
    await scrap(location, ciment, 1);
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
  });

  it('LARGE_SCRAP SINGLE quand un rebut atteint le seuil', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    seedBalance(location, ciment, 100, 1_000_000);
    const view = await scrap(location, ciment, 60);
    expect(db.stockAlert).toEqual([
      expect.objectContaining({
        kind: 'LARGE_SCRAP',
        amount: 600_000,
        dedupeKey: `LARGE_SCRAP:${view.id}`,
        details: { mode: 'SINGLE' }
      })
    ]);
  });

  it('trois rebuts de 200 000 dans le mois : aucune alerte aux deux premiers, une alerte de cumul au troisième ; le quatrième passe sans erreur (A6-6, B7-5)', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    seedBalance(location, ciment, 100, 1_000_000);

    await scrap(location, ciment, 20);
    await scrap(location, ciment, 20);
    expect(db.stockAlert).toHaveLength(0);
    await scrap(location, ciment, 20);
    const month = `${YEAR}-${String(TODAY.getUTCMonth() + 1).padStart(2, '0')}`;
    expect(db.stockAlert).toEqual([
      expect.objectContaining({
        kind: 'LARGE_SCRAP',
        amount: 600_000,
        dedupeKey: `SCRAP_CUMUL:${location.id}:${month}`,
        details: expect.objectContaining({ mode: 'MONTHLY_CUMUL' })
      })
    ]);
    await expect(scrap(location, ciment, 20)).resolves.toMatchObject({ type: 'SCRAP' });
    expect(db.stockAlert).toHaveLength(1);
  });

  it('motif hors colonne « Rebut » → 400 STOCK_REASON_NOT_ALLOWED ; stock insuffisant → 409', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    seedBalance(location, ciment, 1, 100);
    await expect(scrap(location, ciment, 1, { reasonCode: 'NON_CONFORMING' })).rejects.toMatchObject({
      code: 'STOCK_REASON_NOT_ALLOWED'
    });
    await expect(scrap(location, ciment, 2)).rejects.toMatchObject({ code: 'STOCK_INSUFFICIENT' });
  });

  it('public, rejouable : un seul rebut pour deux envois identiques', async () => {
    const location = seedLocation();
    const ciment = seedItem();
    seedBalance(location, ciment, 10, 10_000);
    const input = {
      locationId: location.id,
      itemId: ciment.id,
      quantity: 1,
      scrapDate: TODAY,
      reasonCode: 'DETERIORATION' as const,
      clientRequestId: '0b7c2e5e-4f6a-4b8e-9c0d-1a2b3c4d5e6f'
    };
    const first = await recordStockScrap(TENANT_ID, ADMIN, input);
    const second = await recordStockScrap(TENANT_ID, ADMIN, input);
    expect([first.status, second.status]).toEqual([201, 200]);
    expect(second.data.id).toBe(first.data.id);
    expect(db.stockMovement).toHaveLength(1);
  });
});

// ===========================================================================
// G. Les soldes
// ===========================================================================

describe('listStockBalancesForCaller — masquage (§8.1, §8.2)', () => {
  it('magasinier : value et averageUnitCost null, meta.valuesVisible faux (critère B1-3)', async () => {
    const location = seedLocation();
    seedBalance(location, seedItem(), 100, 500_000);
    const { data, meta } = await listStockBalancesForCaller(TENANT_ID, MAGASINIER, {});
    expect(data[0]).toMatchObject({ quantity: 100, value: null, averageUnitCost: null });
    expect(meta).toEqual({ valuesVisible: false, blindLocationIds: [] });
  });

  it('inventaire DRAFT sur L : quantité null pour le magasinier, tout null pour le comptable, 100 pour l’administrateur (A2-2, A2-7)', async () => {
    const location = seedLocation();
    seedBalance(location, seedItem(), 100, 500_000);
    openDraftCount(location);

    const magasinier = await listStockBalancesForCaller(TENANT_ID, MAGASINIER, { locationId: location.id });
    expect(magasinier.data[0].quantity).toBeNull();
    expect(magasinier.meta.blindLocationIds).toEqual([location.id]);

    const comptable = await listStockBalancesForCaller(TENANT_ID, COMPTABLE, { locationId: location.id });
    expect(comptable.data[0]).toMatchObject({ quantity: null, value: null, averageUnitCost: null });

    const admin = await listStockBalancesForCaller(TENANT_ID, ADMIN, { locationId: location.id });
    expect(admin.data[0]).toMatchObject({ quantity: 100, value: 500_000, averageUnitCost: 5_000 });
    expect(admin.meta.blindLocationIds).toEqual([]);
  });

  it('onlyInStock ne filtre PAS un lieu en comptage : ses soldes nuls restent rendus, masqués', async () => {
    const enComptage = seedLocation();
    const autre = seedLocation();
    const ciment = seedItem();
    seedBalance(enComptage, ciment, 0, 0);
    seedBalance(autre, ciment, 0, 0);
    seedBalance(autre, seedItem(), 3, 30);
    openDraftCount(enComptage);

    const { data } = await listStockBalancesForCaller(TENANT_ID, MAGASINIER, { onlyInStock: true });
    expect(data.map(row => [row.locationId, row.quantity])).toEqual(
      expect.arrayContaining([
        [enComptage.id, null],
        [autre.id, 3]
      ])
    );
    expect(data).toHaveLength(2);
  });

  it('listStockBalances (non masqué) filtre par lieu, article et quantité', async () => {
    const location = seedLocation({ label: 'Dépôt de Kaloum' });
    const ciment = seedItem({ reference: 'CIM-45' });
    seedBalance(location, ciment, 4, 8_000);
    seedBalance(location, seedItem(), 0, 0);
    expect(await listStockBalances(TENANT_ID, { onlyInStock: true })).toEqual([
      expect.objectContaining({
        itemReference: 'CIM-45',
        locationLabel: 'Dépôt de Kaloum',
        quantity: 4,
        value: 8_000,
        averageUnitCost: 2_000
      })
    ]);
  });
});
