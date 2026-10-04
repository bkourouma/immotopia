/**
 * Tests des lectures du terrain (`lib/finance/stock-terrain.ts`) — lot 040,
 * territoire API-3 (spec B3-R1, A8-R1, Q9, §8.1, §8.2, B2-R6).
 *
 * Banc en mémoire : la doublure de Prisma évalue les `where` construits par le
 * service (égalités, `in`, `not`, bornes, `contains`, `AND`, `OR`, filtres de
 * relation), trie selon `orderBy` et coupe selon `take`.
 *
 * Critères couverts : B3-2 (contexte d'un magasinier sans montant ni ligne de
 * facture ; d'un gestionnaire sans téléphone ni `people`), A8-1 en lecture
 * (une deuxième réception se voit sur la facture, avec son bon), cumul par
 * article et `returnNeedsInvoiceLine` (A6-R3 bis), recherche paginée des
 * factures (Q9), aveugle sur les mouvements d'un lieu en comptage.
 */

type Row = Record<string, any>;

const OPERATORS = new Set(['in', 'not', 'lt', 'lte', 'gt', 'gte', 'contains', 'mode']);

function compare(a: any, b: any): number {
  const left = a instanceof Date ? a.getTime() : a;
  const right = b instanceof Date ? b.getTime() : b;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return (condition as Row[]).every(sub => matches(row, sub));
    if (key === 'OR') return (condition as Row[]).some(sub => matches(row, sub));
    const value = row[key];
    if (condition === null || condition instanceof Date || typeof condition !== 'object') {
      return condition === null ? value === null || value === undefined : compare(value, condition) === 0;
    }
    const keys = Object.keys(condition);
    if (!keys.some(op => OPERATORS.has(op))) {
      // Filtre de relation (`supplier: { name: { contains } }`).
      return !!value && matches(value, condition);
    }
    return keys.every(op => {
      const operand = (condition as Row)[op];
      switch (op) {
        case 'in':
          return (operand as any[]).some(candidate => compare(candidate, value) === 0);
        case 'not':
          return operand === null ? value !== null && value !== undefined : compare(value, operand) !== 0;
        case 'lt':
          return compare(value, operand) < 0;
        case 'lte':
          return compare(value, operand) <= 0;
        case 'gt':
          return compare(value, operand) > 0;
        case 'gte':
          return compare(value, operand) >= 0;
        case 'contains':
          return (
            typeof value === 'string' &&
            ((condition as Row).mode === 'insensitive'
              ? value.toLowerCase().includes(String(operand).toLowerCase())
              : value.includes(String(operand)))
          );
        default:
          return true;
      }
    });
  });
}

function sortRows(rows: Row[], orderBy: Row | Row[] | undefined): Row[] {
  if (!orderBy) return rows;
  const keys = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const entry of keys) {
      const [key, direction] = Object.entries(entry)[0] as [string, string];
      const result = compare(a[key], b[key]);
      if (result !== 0) return direction === 'desc' ? -result : result;
    }
    return 0;
  });
}

const store: Record<string, Row[]> = {};

function table(name: string, enrich: (row: Row) => Row = row => row) {
  return {
    findMany: jest.fn(async ({ where, orderBy, take }: Row = {}) => {
      const rows = sortRows(
        (store[name] ?? []).map(enrich).filter(row => matches(row, where)),
        orderBy
      );
      return take ? rows.slice(0, take) : rows;
    }),
    findFirst: jest.fn(
      async ({ where }: Row = {}) => (store[name] ?? []).map(enrich).find(row => matches(row, where)) ?? null
    ),
    findUnique: jest.fn(
      async ({ where }: Row = {}) => (store[name] ?? []).map(enrich).find(row => matches(row, where)) ?? null
    )
  };
}

const find = (name: string, id: string | null | undefined) => (store[name] ?? []).find(row => row.id === id) ?? null;

const enrichMovement = (row: Row): Row => ({
  ...row,
  item: find('items', row.itemId),
  location: find('locations', row.locationId),
  site: null,
  costCategory: null,
  supplierInvoice: find('invoices', row.supplierInvoiceId),
  createdBy: find('users', row.createdByUserId),
  taker: null,
  slip: find('slips', row.slipId),
  _count: { attachments: 0 }
});

const mockPrisma: Row = {
  stockMovement: table('movements', enrichMovement),
  stockCount: table('counts'),
  stockCountLine: table('countLines', row => ({ ...row, item: find('items', row.itemId) })),
  stockLocation: table('locations', row => ({ ...row, site: find('sites', row.siteId) })),
  constructionSite: table('sites', row => ({
    ...row,
    stockLocation: (store.locations ?? []).find(l => l.siteId === row.id) ?? null
  })),
  stockBalance: table('balances'),
  costCategory: table('categories'),
  stockItem: table('items'),
  stockTaker: table('takers', row => ({ ...row, employee: null, contractor: null })),
  supplierInvoice: table('invoices', row => ({
    ...row,
    supplier: find('suppliers', row.supplierId),
    site: find('sites', row.siteId),
    lines: (store.invoiceLines ?? []).filter(line => line.invoiceId === row.id)
  })),
  stockSettings: table('settings'),
  employee: table('employees'),
  contractor: table('contractors')
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import {
  getInvoiceReceipts,
  getStockFieldContext,
  groupReceiptOperations,
  searchReceivableInvoices
} from '../../src/lib/finance/stock-terrain';
import { NotFoundError } from '../../src/middleware/error-middleware';
import type { StockCallerContext } from '../../src/lib/finance/types-040-controle';

const TENANT = 'tenant-1';
const OTHER = 'tenant-2';
const NOW = new Date('2026-10-04T10:00:00.000Z');

function context(overrides: Partial<StockCallerContext> = {}): StockCallerContext {
  return {
    userId: 'user-admin',
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

const MAGASINIER = context({
  userId: 'user-magasinier',
  valuesVisible: false,
  canValidateCount: false,
  canDispose: false,
  canViewAlerts: false,
  canManageSettings: false
});

/** Gestionnaire : STOCK_VIEW et les valeurs, ni carnet ni gestes. */
const GESTIONNAIRE = context({
  userId: 'user-gestionnaire',
  canValidateCount: false,
  canReceive: false,
  canIssue: false,
  canTransfer: false,
  canCount: false,
  canDispose: false,
  canManageTakers: false,
  canViewAlerts: false,
  canManageSettings: false
});

const DAY = 86_400_000;

function seedBase(): void {
  store.suppliers = [{ id: 'fournisseur-1', name: 'Quincaillerie du Plateau' }];
  store.sites = [
    {
      id: 'chantier-ouvert',
      tenantId: TENANT,
      name: 'Villa Kipé',
      status: 'IN_PROGRESS',
      closedAt: null,
      stockEnabledAt: new Date(NOW.getTime() - 5 * DAY)
    },
    {
      id: 'chantier-clos-stock',
      tenantId: TENANT,
      name: 'Immeuble Cocody',
      status: 'CLOSED',
      closedAt: new Date('2026-09-01'),
      stockEnabledAt: new Date('2026-01-01')
    },
    {
      id: 'chantier-clos-vide',
      tenantId: TENANT,
      name: 'Duplex Riviera',
      status: 'CLOSED',
      closedAt: new Date('2026-09-01'),
      stockEnabledAt: null
    },
    {
      id: 'chantier-ailleurs',
      tenantId: OTHER,
      name: 'Autre agence',
      status: 'IN_PROGRESS',
      closedAt: null,
      stockEnabledAt: null
    }
  ];
  store.locations = [
    { id: 'lieu-magasin', tenantId: TENANT, kind: 'WAREHOUSE', label: 'Magasin central', siteId: null, isActive: true },
    {
      id: 'lieu-kipe',
      tenantId: TENANT,
      kind: 'SITE',
      label: 'Chantier Kipé',
      siteId: 'chantier-ouvert',
      isActive: true
    },
    {
      id: 'lieu-cocody',
      tenantId: TENANT,
      kind: 'SITE',
      label: 'Chantier Cocody',
      siteId: 'chantier-clos-stock',
      isActive: true
    },
    {
      id: 'lieu-riviera',
      tenantId: TENANT,
      kind: 'SITE',
      label: 'Chantier Riviera',
      siteId: 'chantier-clos-vide',
      isActive: true
    },
    { id: 'lieu-inactif', tenantId: TENANT, kind: 'WAREHOUSE', label: 'Ancien dépôt', siteId: null, isActive: false }
  ];
  store.balances = [
    { tenantId: TENANT, itemId: 'ciment', locationId: 'lieu-cocody', quantity: 12 },
    { tenantId: TENANT, itemId: 'ciment', locationId: 'lieu-riviera', quantity: 0 }
  ];
  store.items = [
    {
      id: 'ciment',
      tenantId: TENANT,
      reference: 'CIM-45',
      label: 'Ciment CPJ 45',
      unit: 'sac',
      category: 'Ciment',
      defaultCostCategoryId: null,
      isActive: true
    },
    {
      id: 'fer',
      tenantId: TENANT,
      reference: 'FER-10',
      label: 'Fer de 10',
      unit: 'barre',
      category: null,
      defaultCostCategoryId: null,
      isActive: true
    },
    {
      id: 'vieux',
      tenantId: TENANT,
      reference: 'OLD-1',
      label: 'Article retiré',
      unit: 'u',
      category: null,
      defaultCostCategoryId: null,
      isActive: false
    }
  ];
  store.categories = [
    { id: 'poste-1', tenantId: TENANT, label: 'Gros œuvre', position: 1, isActive: true },
    { id: 'poste-2', tenantId: TENANT, label: 'Ancien poste', position: 2, isActive: false }
  ];
  store.takers = [
    {
      id: 'preneur-1',
      tenantId: TENANT,
      fullName: 'Koné Ibrahim',
      teamOrCompany: 'Équipe maçonnerie',
      phone: '0700000000',
      employeeId: null,
      contractorId: null,
      isActive: true,
      createdAt: new Date('2026-03-01')
    },
    {
      id: 'preneur-2',
      tenantId: TENANT,
      fullName: 'Ancien preneur',
      teamOrCompany: null,
      phone: null,
      employeeId: null,
      contractorId: null,
      isActive: false,
      createdAt: new Date('2026-03-01')
    }
  ];
  store.employees = [{ id: 'employe-1', tenantId: TENANT, fullName: 'Moussa Traoré', isActive: true }];
  store.contractors = [{ id: 'tacheron-1', tenantId: TENANT, fullName: 'Entreprise Bâtir', isActive: true }];
  store.users = [{ id: 'user-magasinier', fullName: 'Aïssatou Barry', email: 'a.barry@example.gn' }];
  store.counts = [];
  store.countLines = [];
  store.settings = [];
  store.slips = [];
  store.movements = [];
  store.invoiceLines = [];
  store.invoices = [];
}

function seedInvoice(overrides: Row = {}): Row {
  const invoice = {
    id: `facture-${(store.invoices ?? []).length + 1}`,
    tenantId: TENANT,
    supplierId: 'fournisseur-1',
    siteId: null,
    reference: `FAC-${(store.invoices ?? []).length + 1}`,
    invoiceDate: new Date(NOW.getTime() - 10 * DAY),
    amount: 1_000_000,
    status: 'VALIDATED',
    ...overrides
  };
  store.invoices.push(invoice);
  return invoice;
}

let movementSeq = 0;
function seedMovement(overrides: Row = {}): Row {
  movementSeq += 1;
  const movement = {
    id: `mouvement-${movementSeq}`,
    tenantId: TENANT,
    type: 'RECEIPT',
    itemId: 'ciment',
    locationId: 'lieu-magasin',
    movementDate: new Date('2026-09-20T00:00:00.000Z'),
    quantity: 100,
    isDecrease: false,
    unitCost: 4800,
    totalValue: 480_000,
    quantityAfter: 100,
    valueAfter: 480_000,
    createdByUserId: 'user-magasinier',
    createdAt: new Date(`2026-09-20T08:00:${String(movementSeq).padStart(2, '0')}.000Z`),
    slipId: null,
    valuationSource: null,
    supplierCreditValue: null,
    ...overrides
  };
  store.movements.push(movement);
  return movement;
}

beforeEach(() => {
  jest.clearAllMocks();
  movementSeq = 0;
  seedBase();
});

// ---------------------------------------------------------------------------
// Le contexte terrain (B3-R1)
// ---------------------------------------------------------------------------

describe('getStockFieldContext (B3-R1)', () => {
  it('B3-2 : celui d’un magasinier ne contient aucun montant ni aucune ligne de facture', async () => {
    seedInvoice();
    store.invoiceLines = [
      { id: 'ligne-1', invoiceId: 'facture-1', label: 'Ciment', quantity: 100, unitPrice: 4800, amount: 480_000 }
    ];

    const { context: ctx, meta } = await getStockFieldContext(TENANT, MAGASINIER, NOW);

    expect(meta.valuesVisible).toBe(false);
    expect(ctx.receivableInvoices).toHaveLength(1);
    expect(ctx.receivableInvoices[0].amount).toBeNull();
    expect(ctx.receivableInvoices[0]).not.toHaveProperty('lines');
    const json = JSON.stringify(ctx);
    expect(json).not.toContain('1000000');
    expect(json).not.toContain('4800');
    // Le magasinier gère le carnet : il voit le téléphone et les personnes à lier.
    expect(ctx.takers[0].phone).toBe('0700000000');
    expect(ctx.people).toEqual([
      { kind: 'EMPLOYEE', id: 'employe-1', fullName: 'Moussa Traoré' },
      { kind: 'CONTRACTOR', id: 'tacheron-1', fullName: 'Entreprise Bâtir' }
    ]);
  });

  it('B3-2 : celui d’un gestionnaire (sans STOCK_TAKERS_MANAGE) ne contient aucun téléphone et une liste people vide', async () => {
    const { context: ctx } = await getStockFieldContext(TENANT, GESTIONNAIRE, NOW);
    expect(ctx.takers.every(taker => taker.phone === null)).toBe(true);
    expect(ctx.people).toEqual([]);
    expect(ctx.abilities).toMatchObject({ canManageTakers: false, canIssue: false, valuesVisible: true });
  });

  it('rend les lieux, postes, articles et preneurs ACTIFS, les motifs, les réglages et les droits', async () => {
    const { context: ctx } = await getStockFieldContext(TENANT, context(), NOW);

    expect(ctx.locations.map(l => l.id)).not.toContain('lieu-inactif');
    expect(ctx.costCategories).toEqual([{ id: 'poste-1', label: 'Gros œuvre' }]);
    expect(ctx.items.map(i => i.id)).toEqual(['ciment', 'fer']);
    expect(ctx.takers.map(t => t.id)).toEqual(['preneur-1']);
    expect(ctx.reasonCodes.transfer).toContain('SITE_SUPPLY');
    expect(ctx.reasonCodes.count).not.toContain('OPENING_BALANCE');
    expect(ctx.settings).toEqual({ requireTaker: false, backdatingLimitDays: 7 });
    expect(ctx.abilities).toEqual({
      canReceive: true,
      canIssue: true,
      canTransfer: true,
      canCount: true,
      canValidateCount: true,
      canDispose: true,
      canManageTakers: true,
      valuesVisible: true,
      canViewAlerts: true,
      canManageSettings: true
    });
  });

  it('chantiers : ouverts, plus les clos dont le lieu porte encore du stock ; jamais ceux d’une autre agence', async () => {
    const { context: ctx } = await getStockFieldContext(TENANT, context(), NOW);
    expect(ctx.sites.map(s => s.id).sort()).toEqual(['chantier-clos-stock', 'chantier-ouvert']);
    expect(ctx.sites.find(s => s.id === 'chantier-clos-stock')).toMatchObject({
      closed: true,
      stockEnabled: true,
      locationId: 'lieu-cocody'
    });
  });

  it('un chantier clos dont le lieu est en comptage reste proposé sans que sa quantité soit lue', async () => {
    store.counts = [
      { id: 'inv-1', tenantId: TENANT, locationId: 'lieu-riviera', status: 'DRAFT', kind: 'CLOSING', createdAt: NOW }
    ];
    const { context: ctx, meta } = await getStockFieldContext(TENANT, MAGASINIER, NOW);
    expect(meta.blindLocationIds).toEqual(['lieu-riviera']);
    expect(ctx.sites.map(s => s.id)).toContain('chantier-clos-vide');
  });

  it('lieux : inventaire en cours, chantier clos, ouverture suggérée, articles à recompter', async () => {
    store.counts = [
      {
        id: 'inv-draft',
        tenantId: TENANT,
        locationId: 'lieu-magasin',
        status: 'DRAFT',
        kind: 'REGULAR',
        createdAt: NOW
      },
      {
        id: 'inv-valide',
        tenantId: TENANT,
        locationId: 'lieu-cocody',
        status: 'VALIDATED',
        kind: 'REGULAR',
        validatedAt: new Date('2026-08-01'),
        createdAt: new Date('2026-08-01')
      }
    ];
    store.countLines = [{ countId: 'inv-valide', itemId: 'fer', setAsideAt: new Date('2026-08-01T10:00:00.000Z') }];

    const { context: ctx } = await getStockFieldContext(TENANT, context(), NOW);
    const byId = new Map(ctx.locations.map(l => [l.id, l]));

    expect(byId.get('lieu-magasin')!.countInProgress).toEqual({
      countId: 'inv-draft',
      status: 'DRAFT',
      kind: 'REGULAR'
    });
    expect(byId.get('lieu-kipe')!).toMatchObject({
      siteClosed: false,
      openingCountSuggested: true,
      countInProgress: null
    });
    expect(byId.get('lieu-cocody')!).toMatchObject({ siteClosed: true, openingCountSuggested: false });
    expect(byId.get('lieu-cocody')!.toRecount).toEqual([
      { itemId: 'fer', itemLabel: 'Fer de 10', countId: 'inv-valide', setAsideAt: new Date('2026-08-01T10:00:00.000Z') }
    ]);
  });

  it('un inventaire d’ouverture en cours retire la suggestion (A7-R1)', async () => {
    store.counts = [
      { id: 'inv-ouv', tenantId: TENANT, locationId: 'lieu-kipe', status: 'COUNTED', kind: 'OPENING', createdAt: NOW }
    ];
    const { context: ctx } = await getStockFieldContext(TENANT, context(), NOW);
    expect(ctx.locations.find(l => l.id === 'lieu-kipe')!.openingCountSuggested).toBe(false);
  });

  it('factures : les 50 validées les plus récentes des 180 derniers jours, avec leurs réceptions', async () => {
    for (let i = 0; i < 55; i += 1) {
      seedInvoice({ invoiceDate: new Date(NOW.getTime() - (i + 1) * DAY) });
    }
    const ancienne = seedInvoice({ invoiceDate: new Date(NOW.getTime() - 200 * DAY) });
    const brouillon = seedInvoice({ status: 'DRAFT' });
    seedInvoice({ tenantId: OTHER });
    store.slips = [{ id: 'bon-1', kind: 'RECEIPT', year: 2026, number: 1 }];
    seedMovement({ supplierInvoiceId: 'facture-1', slipId: 'bon-1' });
    seedMovement({ supplierInvoiceId: 'facture-1', slipId: 'bon-1', itemId: 'fer' });

    const { context: ctx } = await getStockFieldContext(TENANT, context(), NOW);
    const ids = ctx.receivableInvoices.map(invoice => invoice.id);

    expect(ids).toHaveLength(50);
    expect(ids[0]).toBe('facture-1');
    expect(ids).not.toContain(ancienne.id);
    expect(ids).not.toContain(brouillon.id);
    expect(ctx.receivableInvoices[0]).toMatchObject({
      supplierName: 'Quincaillerie du Plateau',
      receiptCount: 1,
      amount: 1_000_000
    });
    expect(ctx.receivableInvoices[0].lastReceiptAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// Recherche des factures réceptionnables (Q9)
// ---------------------------------------------------------------------------

describe('searchReceivableInvoices (Q9)', () => {
  it('pagine par curseur sans doublon, et cherche sur la référence ou le fournisseur', async () => {
    for (let i = 0; i < 25; i += 1) {
      // Même date pour toutes : le curseur doit départager par l'identifiant.
      seedInvoice({ invoiceDate: new Date('2025-01-01T00:00:00.000Z') });
    }
    const first = await searchReceivableInvoices(TENANT, MAGASINIER, { limit: 20 });
    expect(first.invoices).toHaveLength(20);
    expect(first.meta.nextCursor).toEqual(expect.any(String));
    expect(first.invoices.every(invoice => invoice.amount === null)).toBe(true);

    const second = await searchReceivableInvoices(TENANT, MAGASINIER, {
      limit: 20,
      cursor: first.meta.nextCursor ?? undefined
    });
    expect(second.invoices).toHaveLength(5);
    expect(second.meta.nextCursor).toBeNull();
    expect(new Set([...first.invoices, ...second.invoices].map(invoice => invoice.id)).size).toBe(25);

    const bySupplier = await searchReceivableInvoices(TENANT, MAGASINIER, { limit: 20, search: 'plateau' });
    expect(bySupplier.invoices).toHaveLength(20);
    const byReference = await searchReceivableInvoices(TENANT, MAGASINIER, { limit: 20, search: 'FAC-25' });
    expect(byReference.invoices.map(invoice => invoice.reference)).toEqual(['FAC-25']);
  });

  it('un curseur illisible est un 400', async () => {
    await expect(searchReceivableInvoices(TENANT, MAGASINIER, { limit: 20, cursor: 'xx' })).rejects.toMatchObject({
      statusCode: 400
    });
  });
});

// ---------------------------------------------------------------------------
// Réceptions d'une facture (A8-R1)
// ---------------------------------------------------------------------------

describe('getInvoiceReceipts (A8-R1)', () => {
  function seedReceivedInvoice(): void {
    seedInvoice({ amount: 1_000_000 });
    store.invoiceLines = [
      {
        id: 'ligne-ciment',
        invoiceId: 'facture-1',
        label: 'Ciment CPJ 45',
        quantity: 100,
        unitPrice: 4800,
        amount: 480_000,
        createdAt: new Date(1)
      },
      {
        id: 'ligne-transport',
        invoiceId: 'facture-1',
        label: 'Transport',
        quantity: null,
        unitPrice: null,
        amount: 20_000,
        createdAt: new Date(2)
      }
    ];
    store.slips = [
      { id: 'bon-1', kind: 'RECEIPT', year: 2026, number: 41 },
      { id: 'bon-2', kind: 'RECEIPT', year: 2026, number: 42 }
    ];
    // Une réception d'avant le lot (sans bon, deux lignes dans la même seconde)…
    seedMovement({
      supplierInvoiceId: 'facture-1',
      quantity: 40,
      totalValue: 192_000,
      createdAt: new Date('2026-09-01T08:00:00.000Z'),
      movementDate: new Date('2026-09-01T00:00:00.000Z')
    });
    seedMovement({
      supplierInvoiceId: 'facture-1',
      itemId: 'fer',
      quantity: 10,
      unitCost: 3000,
      totalValue: 30_000,
      createdAt: new Date('2026-09-01T08:00:00.200Z'),
      movementDate: new Date('2026-09-01T00:00:00.000Z')
    });
    // …puis deux réceptions du lot, chacune avec son bon.
    seedMovement({
      supplierInvoiceId: 'facture-1',
      slipId: 'bon-1',
      quantity: 30,
      totalValue: 144_000,
      valuationSource: 'INVOICE_LINE'
    });
    seedMovement({
      supplierInvoiceId: 'facture-1',
      slipId: 'bon-2',
      itemId: 'fer',
      locationId: 'lieu-kipe',
      quantity: 5,
      unitCost: 3100,
      totalValue: 15_500,
      valuationSource: 'AVERAGE_COST'
    });
    // Un retour au fournisseur.
    seedMovement({
      supplierInvoiceId: 'facture-1',
      type: 'SUPPLIER_RETURN',
      isDecrease: true,
      quantity: 10,
      unitCost: 5200,
      totalValue: 52_000,
      supplierCreditValue: 48_000,
      reasonCode: 'DAMAGED_ON_DELIVERY'
    });
  }

  it('liste les réceptions (bon, date, auteur, lieu), les retours, les lignes et le cumul par article', async () => {
    seedReceivedInvoice();
    const { view } = await getInvoiceReceipts(TENANT, context(), 'facture-1');

    expect(view.invoice).toMatchObject({
      reference: 'FAC-1',
      supplierName: 'Quincaillerie du Plateau',
      status: 'VALIDATED',
      amount: 1_000_000
    });
    expect(view.invoice.lines).toEqual([
      {
        id: 'ligne-ciment',
        label: 'Ciment CPJ 45',
        quantity: 100,
        unitPrice: 4800,
        amount: 480_000,
        hasUnitPrice: true
      },
      {
        id: 'ligne-transport',
        label: 'Transport',
        quantity: null,
        unitPrice: null,
        amount: 20_000,
        hasUnitPrice: false
      }
    ]);

    expect(view.receipts.map(r => r.slipNumber)).toEqual([null, 'BR-2026-00041', 'BR-2026-00042']);
    expect(view.receipts[0].lines).toHaveLength(2);
    expect(view.receipts[0]).toMatchObject({
      slipId: null,
      createdByLabel: 'Aïssatou Barry',
      locationLabel: 'Magasin central'
    });

    expect(view.returns).toHaveLength(1);
    expect(view.returns[0]).toMatchObject({
      type: 'SUPPLIER_RETURN',
      reasonCode: 'DAMAGED_ON_DELIVERY',
      supplierCreditValue: 48_000
    });

    const ciment = view.byItem.find(row => row.itemId === 'ciment')!;
    expect(ciment).toMatchObject({
      receivedQuantity: 70,
      returnedQuantity: 10,
      returnableQuantity: 60,
      returnNeedsInvoiceLine: false
    });
    expect(ciment.valuationSources).toEqual(['DECLARED', 'INVOICE_LINE']);
    const fer = view.byItem.find(row => row.itemId === 'fer')!;
    // Une réception au coût moyen : le retour exigera la ligne de facture (A6-R3 bis).
    expect(fer).toMatchObject({ receivedQuantity: 15, returnedQuantity: 0, returnNeedsInvoiceLine: true });

    expect(view.receivedValue).toBe(192_000 + 30_000 + 144_000 + 15_500);
    expect(view.returnedValue).toBe(48_000);
  });

  it('§8.1 : sans les valeurs, montants, prix et sources valent null ; hasUnitPrice et returnNeedsInvoiceLine restent', async () => {
    seedReceivedInvoice();
    const { view, meta } = await getInvoiceReceipts(TENANT, MAGASINIER, 'facture-1');

    expect(meta.valuesVisible).toBe(false);
    expect(view.invoice.amount).toBeNull();
    expect(view.invoice.lines[0]).toMatchObject({ unitPrice: null, amount: null, hasUnitPrice: true });
    expect(view.receipts.flatMap(r => r.lines).every(line => line.unitCost === null && line.totalValue === null)).toBe(
      true
    );
    expect(view.byItem.every(row => row.valuationSources === null)).toBe(true);
    expect(view.byItem.find(row => row.itemId === 'fer')!.returnNeedsInvoiceLine).toBe(true);
    expect(view.receivedValue).toBeNull();
    expect(view.returnedValue).toBeNull();
    expect(view.returns[0]).toMatchObject({ totalValue: null, supplierCreditValue: null });
  });

  it('§8.2 : le coût unitaire d’une réception sur un lieu en comptage est masqué au comptable', async () => {
    seedReceivedInvoice();
    store.counts = [
      { id: 'inv-1', tenantId: TENANT, locationId: 'lieu-kipe', status: 'DRAFT', kind: 'REGULAR', createdAt: NOW }
    ];
    const comptable = context({ canValidateCount: false });

    const { view, meta } = await getInvoiceReceipts(TENANT, comptable, 'facture-1');
    expect(meta.blindLocationIds).toEqual(['lieu-kipe']);
    const kipe = view.receipts.find(r => r.slipNumber === 'BR-2026-00042')!;
    expect(kipe.lines[0]).toMatchObject({ unitCost: null, totalValue: 15_500 });
    const magasin = view.receipts.find(r => r.slipNumber === 'BR-2026-00041')!;
    expect(magasin.lines[0].unitCost).toBe(4800);
  });

  it('une facture d’une autre agence répond comme une facture inexistante', async () => {
    seedInvoice({ tenantId: OTHER });
    await expect(getInvoiceReceipts(TENANT, context(), 'facture-1')).rejects.toBeInstanceOf(NotFoundError);
    await expect(getInvoiceReceipts(TENANT, context(), 'inexistante')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('groupReceiptOperations', () => {
  const base = { movementDate: new Date('2026-09-01'), createdByUserId: 'u', locationId: 'l' };

  it('une réception par bon ; sans bon, les lignes d’une même saisie, à moins de 5 secondes', () => {
    const groups = groupReceiptOperations([
      { ...base, slipId: null, createdAt: new Date('2026-09-01T08:00:00.000Z') },
      { ...base, slipId: null, createdAt: new Date('2026-09-01T08:00:01.000Z') },
      { ...base, slipId: null, createdAt: new Date('2026-09-01T09:00:00.000Z') },
      { ...base, slipId: 'bon-1', createdAt: new Date('2026-09-01T10:00:00.000Z') },
      { ...base, slipId: 'bon-1', createdAt: new Date('2026-09-01T10:00:00.050Z') }
    ]);
    expect(groups.map(group => group.length)).toEqual([2, 1, 2]);
  });
});
