/**
 * Tests du journal des mouvements (`lib/finance/stock-journal.ts`) — lot 040,
 * territoire API-3 (spec A4-R4, A5, §8.1, §8.2).
 *
 * Banc en mémoire : les mouvements sont posés directement dans le magasin,
 * sans passer par `stock-mouvements.ts` (territoire API-1), pour que ces tests
 * ne dépendent que du journal. La doublure de Prisma évalue les `where`
 * réellement construits par le service (égalités, `in`, bornes, `contains`,
 * `AND`, `OR`), trie selon `orderBy` et coupe selon `take` : la pagination par
 * curseur est donc éprouvée sur la vraie requête, pas sur une imitation.
 *
 * Critères couverts : A4-2 (motif au journal), A5-1 (120 mouvements → 50, 50,
 * 20, sans doublon ni trou), A5-2 (`entryLagDays`), A5-3 (filtres par personne
 * refusés au magasinier), A5-4 (CSV sans colonne de valeur), colonnes masquées
 * d'un lieu en comptage, export trop gros (`422`).
 */

type Row = Record<string, any>;

const store = {
  movements: [] as Row[],
  counts: [] as Row[],
  items: [] as Row[],
  locations: [] as Row[],
  users: [] as Row[],
  takers: [] as Row[],
  slips: [] as Row[],
  attachments: [] as Row[]
};

function compare(a: any, b: any): number {
  const left = a instanceof Date ? a.getTime() : a;
  const right = b instanceof Date ? b.getTime() : b;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function same(a: any, b: any): boolean {
  return compare(a, b) === 0;
}

/** Évalue un `where` Prisma simple sur une ligne du magasin. */
function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return (condition as Row[]).every(sub => matches(row, sub));
    if (key === 'OR') return (condition as Row[]).some(sub => matches(row, sub));
    const value = row[key];
    if (condition === null || condition instanceof Date || typeof condition !== 'object') {
      return condition === null ? value === null || value === undefined : same(value, condition);
    }
    return Object.entries(condition as Row).every(([op, operand]) => {
      switch (op) {
        case 'in':
          return (operand as any[]).some(candidate => same(candidate, value));
        case 'not':
          return operand === null ? value !== null && value !== undefined : !same(value, operand);
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
        case 'mode':
          return true;
        default:
          throw new Error(`Opérateur non simulé : ${op}`);
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

function enrichMovement(row: Row): Row {
  return {
    ...row,
    item: store.items.find(i => i.id === row.itemId) ?? null,
    location: store.locations.find(l => l.id === row.locationId) ?? null,
    site: null,
    costCategory: null,
    supplierInvoice: row.supplierInvoiceReference ? { reference: row.supplierInvoiceReference } : null,
    createdBy: store.users.find(u => u.id === row.createdByUserId) ?? null,
    taker: store.takers.find(t => t.id === row.takerId) ?? null,
    slip: store.slips.find(s => s.id === row.slipId) ?? null,
    _count: { attachments: store.attachments.filter(a => a.movementId === row.id && !a.removedAt).length }
  };
}

async function findMovements({ where, orderBy, take }: Row): Promise<Row[]> {
  const rows = sortRows(
    store.movements.filter(row => matches(row, where)),
    orderBy
  );
  return (take ? rows.slice(0, take) : rows).map(enrichMovement);
}

const movementFindMany = jest.fn(findMovements);

const mockPrisma: Row = {
  stockMovement: {
    findMany: movementFindMany,
    findFirst: jest.fn(async ({ where }: Row) => store.movements.find(row => matches(row, where)) ?? null),
    groupBy: jest.fn(async ({ where }: Row) => {
      const ids = [...new Set(store.movements.filter(row => matches(row, where)).map(row => row.createdByUserId))];
      return ids.map(createdByUserId => ({ createdByUserId }));
    })
  },
  stockCount: {
    findMany: jest.fn(async ({ where }: Row) => store.counts.filter(row => matches(row, where)))
  },
  user: {
    findMany: jest.fn(async ({ where }: Row) => store.users.filter(row => matches(row, where)))
  }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import {
  decodeMovementCursor,
  encodeMovementCursor,
  exportStockMovementsCsv,
  listStockMovementAuthors,
  listStockMovementsPage
} from '../../src/lib/finance/stock-journal';
import type { StockCallerContext } from '../../src/lib/finance/types-040-controle';

const TENANT = 'tenant-1';
const OTHER_TENANT = 'tenant-2';
const MAGASIN = '11111111-1111-4111-8111-111111111111';
const CHANTIER = '22222222-2222-4222-8222-222222222222';
const CIMENT = '33333333-3333-4333-8333-333333333333';

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

/** Le magasinier : ni valeurs, ni validation d'inventaire. */
const MAGASINIER = context({
  userId: 'user-magasinier',
  valuesVisible: false,
  canValidateCount: false,
  canDispose: false,
  canViewAlerts: false,
  canManageSettings: false
});

/** Le comptable : les valeurs, mais pas la validation d'inventaire (aveugle §8.2). */
const COMPTABLE = context({ userId: 'user-comptable', canValidateCount: false });

let seq = 0;

function seedMovement(overrides: Row = {}): Row {
  seq += 1;
  const movement = {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    tenantId: TENANT,
    type: 'RECEIPT',
    itemId: CIMENT,
    locationId: MAGASIN,
    movementDate: new Date('2026-03-01T00:00:00.000Z'),
    quantity: 10,
    isDecrease: false,
    unitCost: 5000,
    totalValue: 50000,
    currency: 'XOF',
    quantityAfter: 10,
    valueAfter: 50000,
    siteId: null,
    costCategoryId: null,
    requestedBy: null,
    supplierInvoiceId: null,
    supplierInvoiceReference: null,
    transferGroupId: null,
    stockCountId: null,
    reason: null,
    reasonCode: null,
    takerId: null,
    slipId: null,
    valuationSource: null,
    supplierCreditValue: null,
    createdByUserId: 'user-magasinier',
    createdAt: new Date('2026-03-01T08:00:00.000Z'),
    ...overrides
  };
  store.movements.push(movement);
  return movement;
}

beforeEach(() => {
  jest.clearAllMocks();
  movementFindMany.mockImplementation(findMovements);
  seq = 0;
  store.movements = [];
  store.counts = [];
  store.items = [{ id: CIMENT, reference: 'CIM-45', label: 'Ciment CPJ 45', unit: 'sac' }];
  store.locations = [
    { id: MAGASIN, label: 'Magasin central' },
    { id: CHANTIER, label: 'Chantier Kipé' }
  ];
  store.users = [
    { id: 'user-magasinier', fullName: 'Aïssatou Barry', email: 'a.barry@example.gn' },
    { id: 'user-comptable', fullName: null, email: 'compta@example.gn' }
  ];
  store.takers = [];
  store.slips = [];
  store.attachments = [];
});

// ---------------------------------------------------------------------------
// A5-R1 — pagination par curseur
// ---------------------------------------------------------------------------

describe('listStockMovementsPage — pagination par curseur (A5-R1)', () => {
  it('120 mouvements, limit=50 : 50, 50 puis 20 lignes, sans doublon ni trou, curseur nul au troisième appel', async () => {
    // Des dates et des heures de saisie qui se répètent : le tri doit
    // départager par createdAt puis par id, sinon une page en doublerait une autre.
    for (let i = 0; i < 120; i += 1) {
      seedMovement({
        movementDate: new Date(Date.UTC(2026, 2, 1 + (i % 7))),
        createdAt: new Date(Date.UTC(2026, 2, 10, 8, i % 3))
      });
    }

    const seen: string[] = [];
    const sizes: number[] = [];
    let cursor: string | undefined;
    let nextCursors: Array<string | null | undefined> = [];
    for (let call = 0; call < 3; call += 1) {
      const page = await listStockMovementsPage(TENANT, context(), {}, { cursor, limit: 50 });
      sizes.push(page.movements.length);
      seen.push(...page.movements.map(m => m.id));
      nextCursors = [...nextCursors, page.meta.nextCursor];
      cursor = page.meta.nextCursor ?? undefined;
    }

    expect(sizes).toEqual([50, 50, 20]);
    expect(new Set(seen).size).toBe(120);
    expect(nextCursors[0]).toEqual(expect.any(String));
    expect(nextCursors[1]).toEqual(expect.any(String));
    expect(nextCursors[2]).toBeNull();
  });

  it('ne pagine jamais par décalage : aucune requête ne porte `skip`', async () => {
    seedMovement();
    await listStockMovementsPage(TENANT, context(), {}, { limit: 50 });
    for (const [args] of movementFindMany.mock.calls) {
      expect(args).not.toHaveProperty('skip');
    }
  });

  it('le curseur est opaque et se relit ; un curseur illisible est un 400', () => {
    const cursor = {
      movementDate: new Date('2026-03-01T00:00:00.000Z'),
      createdAt: new Date('2026-03-01T08:00:00.000Z'),
      id: 'abc'
    };
    expect(decodeMovementCursor(encodeMovementCursor(cursor))).toEqual(cursor);
    expect(() => decodeMovementCursor('n-importe-quoi')).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('ne lit que les mouvements de l’agence de l’appel', async () => {
    seedMovement();
    seedMovement({ tenantId: OTHER_TENANT });
    const page = await listStockMovementsPage(TENANT, context(), {}, { limit: 50 });
    expect(page.movements).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// A5-R2 — filtres
// ---------------------------------------------------------------------------

describe('listStockMovementsPage — filtres (A5-R2)', () => {
  it('filtre par nature (six valeurs), par bon et par période bornes incluses', async () => {
    seedMovement({ type: 'RECEIPT', movementDate: new Date('2026-03-01T00:00:00.000Z') });
    seedMovement({ type: 'SCRAP', isDecrease: true, movementDate: new Date('2026-03-05T00:00:00.000Z') });
    seedMovement({ type: 'ISSUE', slipId: 'bon-1', movementDate: new Date('2026-03-31T00:00:00.000Z') });

    const page = (filters: Row) => listStockMovementsPage(TENANT, context(), filters, { limit: 50 });

    expect((await page({ type: 'SCRAP' })).movements).toHaveLength(1);
    expect((await page({ slipId: 'bon-1' })).movements.map(m => m.type)).toEqual(['ISSUE']);
    // `to` est inclus : le mouvement du 31 entre.
    expect(
      (await page({ from: new Date('2026-03-05'), to: new Date('2026-03-31') })).movements.map(m => m.type)
    ).toEqual(['ISSUE', 'SCRAP']);
  });

  it('movementId rend le mouvement, ou les deux moitiés de son transfert', async () => {
    const sortie = seedMovement({ type: 'TRANSFER', isDecrease: true, transferGroupId: 'groupe-1' });
    seedMovement({ type: 'TRANSFER', locationId: CHANTIER, transferGroupId: 'groupe-1' });
    const seul = seedMovement({ type: 'RECEIPT' });

    const transfert = await listStockMovementsPage(TENANT, context(), { movementId: sortie.id }, { limit: 50 });
    expect(transfert.movements).toHaveLength(2);

    const reception = await listStockMovementsPage(TENANT, context(), { movementId: seul.id }, { limit: 50 });
    expect(reception.movements.map(m => m.id)).toEqual([seul.id]);
  });

  it('movementId d’une autre agence : page vide, comme un mouvement inexistant', async () => {
    const ailleurs = seedMovement({ tenantId: OTHER_TENANT });
    const page = await listStockMovementsPage(TENANT, context(), { movementId: ailleurs.id }, { limit: 50 });
    expect(page.movements).toEqual([]);
    expect(page.meta.nextCursor).toBeNull();
  });

  it('A5-3 : le magasinier qui filtre par preneur, auteur ou demandeur reçoit 403 STOCK_VALUE_FIELD_FORBIDDEN', async () => {
    for (const filters of [{ createdByUserId: 'user-x' }, { takerId: 'preneur-1' }, { requestedBy: 'Camara' }]) {
      await expect(listStockMovementsPage(TENANT, MAGASINIER, filters, { limit: 50 })).rejects.toMatchObject({
        statusCode: 403,
        code: 'STOCK_VALUE_FIELD_FORBIDDEN'
      });
    }
  });

  it('avec les valeurs visibles, les filtres par personne s’appliquent (demandeur : contient, sans casse)', async () => {
    seedMovement({ type: 'ISSUE', requestedBy: 'Chef de chantier Camara', createdByUserId: 'user-comptable' });
    seedMovement({ type: 'ISSUE', requestedBy: 'Diallo' });

    const parDemandeur = await listStockMovementsPage(TENANT, COMPTABLE, { requestedBy: 'camara' }, { limit: 50 });
    expect(parDemandeur.movements).toHaveLength(1);
    const parAuteur = await listStockMovementsPage(
      TENANT,
      COMPTABLE,
      { createdByUserId: 'user-comptable' },
      { limit: 50 }
    );
    expect(parAuteur.movements).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// La forme d'un mouvement (A4-R4, A5-R5, §8.1, §8.2)
// ---------------------------------------------------------------------------

describe('listStockMovementsPage — forme et masquage', () => {
  it('A4-2 : un ajustement porte son motif typé et sa précision au journal', async () => {
    seedMovement({
      type: 'ADJUSTMENT',
      isDecrease: true,
      reasonCode: 'BREAKAGE',
      reason: 'Sacs éventrés',
      stockCountId: 'inv-1'
    });
    const page = await listStockMovementsPage(TENANT, context(), {}, { limit: 50 });
    expect(page.movements[0]).toMatchObject({ reasonCode: 'BREAKAGE', reason: 'Sacs éventrés', stockCountId: 'inv-1' });
  });

  it('A5-2 : entryLagDays = jour de saisie − jour du mouvement', async () => {
    seedMovement({
      movementDate: new Date('2026-03-01T00:00:00.000Z'),
      createdAt: new Date('2026-03-08T17:30:00.000Z')
    });
    const page = await listStockMovementsPage(TENANT, context(), {}, { limit: 50 });
    expect(page.movements[0].entryLagDays).toBe(7);
  });

  it('rend le preneur ACTUEL, le numéro de bon et les pièces jointes non retirées', async () => {
    store.takers = [{ id: 'preneur-1', fullName: 'Koné Ibrahim', teamOrCompany: 'Équipe maçonnerie' }];
    store.slips = [{ id: 'bon-1', kind: 'ISSUE', year: 2026, number: 42 }];
    const sortie = seedMovement({
      type: 'ISSUE',
      isDecrease: true,
      takerId: 'preneur-1',
      requestedBy: 'Koné Ibrahim — Équipe maçonnerie',
      slipId: 'bon-1'
    });
    store.attachments = [
      { movementId: sortie.id, removedAt: null },
      { movementId: sortie.id, removedAt: new Date() }
    ];

    const [vue] = (await listStockMovementsPage(TENANT, context(), {}, { limit: 50 })).movements;
    expect(vue).toMatchObject({
      takerLabel: 'Koné Ibrahim — Équipe maçonnerie',
      slipNumber: 'BS-2026-00042',
      attachmentsCount: 1
    });
  });

  it('§8.1 : sans STOCK_VALUES_VIEW, toute valeur vaut null et meta.valuesVisible est faux', async () => {
    seedMovement({ valuationSource: 'INVOICE_LINE' });
    const page = await listStockMovementsPage(TENANT, MAGASINIER, {}, { limit: 50 });
    expect(page.meta.valuesVisible).toBe(false);
    expect(page.movements[0]).toMatchObject({
      unitCost: null,
      totalValue: null,
      valueAfter: null,
      supplierCreditValue: null,
      valuationSource: null,
      quantity: 10,
      quantityAfter: 10
    });
  });

  it('§8.2 : un lieu en comptage masque quantité après et coût au comptable, pas au validateur', async () => {
    seedMovement({ locationId: CHANTIER });
    store.counts = [{ tenantId: TENANT, locationId: CHANTIER, status: 'DRAFT' }];

    const comptable = await listStockMovementsPage(TENANT, COMPTABLE, {}, { limit: 50 });
    expect(comptable.meta.blindLocationIds).toEqual([CHANTIER]);
    expect(comptable.movements[0]).toMatchObject({
      quantityAfter: null,
      valueAfter: null,
      unitCost: null,
      totalValue: 50000,
      quantity: 10
    });

    const validateur = await listStockMovementsPage(TENANT, context(), {}, { limit: 50 });
    expect(validateur.meta.blindLocationIds).toEqual([]);
    expect(validateur.movements[0].quantityAfter).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// A5-R3 — l'export CSV
// ---------------------------------------------------------------------------

function parseCsv(csv: string): string[][] {
  return (csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv)
    .split('\r\n')
    .filter(line => line.length > 0)
    .map(line => line.split(';'));
}

describe('exportStockMovementsCsv (A5-R3)', () => {
  it('format du dépôt : BOM UTF-8, CRLF, séparateur « ; »', async () => {
    seedMovement();
    const csv = await exportStockMovementsCsv(TENANT, context(), {});
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('\r\n');
    expect(parseCsv(csv)[0][0]).toBe('Date du mouvement');
  });

  it('A5-4 : l’export d’un magasinier ne contient aucune colonne de valeur', async () => {
    seedMovement();
    const [header, line] = parseCsv(await exportStockMovementsCsv(TENANT, MAGASINIER, {}));
    expect(header).not.toEqual(expect.arrayContaining(['Prix unitaire']));
    expect(header).not.toEqual(expect.arrayContaining(['Valeur']));
    expect(header).not.toEqual(expect.arrayContaining(['Valeur après']));
    expect(line).toHaveLength(header.length);
    expect(line).not.toContain('5000');
    expect(line).not.toContain('50000');
  });

  it('avec les valeurs, trois colonnes de plus : prix unitaire, valeur, valeur après', async () => {
    seedMovement();
    const [header, line] = parseCsv(await exportStockMovementsCsv(TENANT, context(), {}));
    expect(header.slice(-3)).toEqual(['Prix unitaire', 'Valeur', 'Valeur après']);
    expect(line.slice(-3)).toEqual(['5000', '50000', '50000']);
  });

  it('§8.2 : colonnes « quantité après », « prix unitaire », « valeur après » vides pour un lieu en comptage', async () => {
    seedMovement({ locationId: CHANTIER });
    store.counts = [{ tenantId: TENANT, locationId: CHANTIER, status: 'DRAFT' }];

    const [header, line] = parseCsv(await exportStockMovementsCsv(TENANT, COMPTABLE, {}));
    const cell = (name: string) => line[header.indexOf(name)];
    expect(cell('Quantité')).toBe('10');
    expect(cell('Quantité après')).toBe('');
    expect(cell('Prix unitaire')).toBe('');
    expect(cell('Valeur après')).toBe('');
    expect(cell('Valeur')).toBe('50000');
  });

  it('refuse les filtres par personne au magasinier, comme le journal', async () => {
    await expect(exportStockMovementsCsv(TENANT, MAGASINIER, { requestedBy: 'Camara' })).rejects.toMatchObject({
      statusCode: 403,
      code: 'STOCK_VALUE_FIELD_FORBIDDEN'
    });
  });

  it('lit par pages internes de 1 000 et répond 422 STOCK_EXPORT_TOO_LARGE dès la 50 001e ligne', async () => {
    // Doublure : chaque page rend exactement ce qui est demandé, sans fin.
    const rows = (take: number, offset: number) =>
      Array.from({ length: take }, (_, i) => {
        const n = offset + i;
        return {
          ...seedMovementTemplate(),
          id: `id-${n}`,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0) - n)
        };
      });
    let served = 0;
    movementFindMany.mockImplementation(async ({ take }: Row) => {
      const page = rows(take, served).map(enrichMovement);
      served += take;
      return page;
    });

    await expect(exportStockMovementsCsv(TENANT, context(), {})).rejects.toMatchObject({
      statusCode: 422,
      code: 'STOCK_EXPORT_TOO_LARGE'
    });
    const takes = movementFindMany.mock.calls.map(([args]) => (args as Row).take);
    expect(Math.max(...takes)).toBe(1000);
    expect(served).toBe(50_001);
  });
});

function seedMovementTemplate(): Row {
  return {
    tenantId: TENANT,
    type: 'RECEIPT',
    itemId: CIMENT,
    locationId: MAGASIN,
    movementDate: new Date('2026-01-01T00:00:00.000Z'),
    quantity: 1,
    isDecrease: false,
    unitCost: 1,
    totalValue: 1,
    quantityAfter: 1,
    valueAfter: 1,
    createdByUserId: 'user-magasinier'
  };
}

// ---------------------------------------------------------------------------
// Les auteurs
// ---------------------------------------------------------------------------

describe('listStockMovementAuthors', () => {
  it('auteurs distincts de l’agence, libellé = nom, à défaut e-mail, triés', async () => {
    seedMovement({ createdByUserId: 'user-magasinier' });
    seedMovement({ createdByUserId: 'user-magasinier' });
    seedMovement({ createdByUserId: 'user-comptable' });
    seedMovement({ tenantId: OTHER_TENANT, createdByUserId: 'user-ailleurs' });

    expect(await listStockMovementAuthors(TENANT)).toEqual([
      { userId: 'user-magasinier', label: 'Aïssatou Barry' },
      { userId: 'user-comptable', label: 'compta@example.gn' }
    ]);
  });
});
