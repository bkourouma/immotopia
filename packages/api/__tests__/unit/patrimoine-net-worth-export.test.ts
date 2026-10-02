/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot 5 « patrimoine multi-actifs » — export PDF et Excel de la situation
 * patrimoniale (valeur nette, actifs, dettes, historique).
 *
 * Mock à la frontière `utils/database` (`.claude/rules/testing.md`) : un faux
 * Prisma en mémoire qui mélange deux agences et sait filtrer par `tenantId`,
 * `OR`, `in` et `lte`. Vérifie le contenu des fichiers, l'isolation
 * inter-agences, le plafond de lignes et les en-têtes de la réponse.
 */

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const store = { assets: [] as Row[], valuations: [] as Row[], loans: [] as Row[] };

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return (expected as Row[]).some(clause => matches(row, clause));
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('in' in expected) return expected.in.includes(row[key]);
      if ('not' in expected) return row[key] !== expected.not;
      if ('lte' in expected) return row[key] <= expected.lte;
    }
    return row[key] === expected;
  });
}

function ordered(rows: Row[], orderBy: any): Row[] {
  const clauses: Row[] = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  return [...rows].sort((a, b) => {
    for (const clause of clauses) {
      const [field, dir] = Object.entries(clause)[0] as [string, string];
      if (a[field] === b[field]) continue;
      const cmp = a[field] > b[field] ? 1 : -1;
      return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

const spies = { asset: jest.fn(), valuation: jest.fn(), loan: jest.fn() };

const mockPrisma: Row = {
  tenant: { findUnique: jest.fn(async () => null) },
  syndicate: { findFirst: jest.fn(async () => null) },
  asset: {
    findMany: jest.fn(async (args: Row) => {
      spies.asset(args);
      return store.assets.filter(a => matches(a, args.where));
    })
  },
  assetValuation: {
    findMany: jest.fn(async (args: Row) => {
      spies.valuation(args);
      return ordered(
        store.valuations.filter(v => matches(v, args.where)),
        args.orderBy
      );
    })
  },
  propertyLoan: {
    findMany: jest.fn(async (args: Row) => {
      spies.loan(args);
      const rows = ordered(
        store.loans.filter(l => matches(l, args.where)),
        args.orderBy
      );
      return args.take ? rows.slice(0, args.take) : rows;
    })
  }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { runWithLanguage } from '../../src/i18n';
import { collectNetWorthExport, NET_WORTH_EXPORT_MAX_ROWS } from '../../src/lib/patrimoine/export/net-worth-data';
import { buildNetWorthPdf } from '../../src/lib/patrimoine/export/net-worth-pdf';
import { buildNetWorthWorkbook } from '../../src/lib/patrimoine/export/net-worth-workbook';
import { netWorthExportQuerySchema } from '../../src/lib/patrimoine/export/net-worth-schema';
import { exportNetWorthHandler } from '../../src/controllers/patrimoine-net-worth-export-controller';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function asset(overrides: Row): Row {
  return {
    id: ID(1),
    tenantId: TENANT_A,
    name: 'Villa',
    assetClass: 'REAL_ESTATE',
    status: 'ACTIVE',
    currency: 'XOF',
    exchangeRateToXof: null,
    disposedAt: null,
    propertyId: null,
    details: {},
    ...overrides
  };
}

function valuation(assetId: string, value: number, currency = 'XOF', tenantId = TENANT_A): Row {
  return {
    id: `val-${assetId}`,
    tenantId,
    assetId,
    propertyId: null,
    valuatedAt: new Date('2026-08-01T00:00:00.000Z'),
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    estimatedValue: value,
    currency,
    method: 'MANUAL',
    source: 'Relevé',
    reliability: 'HIGH'
  };
}

function loan(id: number, overrides: Row = {}): Row {
  return {
    id: ID(id),
    tenantId: TENANT_A,
    assetId: null,
    propertyId: null,
    lender: 'Banque Atlantique',
    remainingCapital: 20_000_000,
    currency: 'XOF',
    endDate: new Date('2030-01-01T00:00:00.000Z'),
    status: 'ACTIVE',
    ...overrides
  };
}

function seedTypicalTenants() {
  store.assets = [
    asset({ id: ID(1), name: 'Villa Cocody' }),
    asset({
      id: ID(2),
      name: 'Compte en euros',
      assetClass: 'CASH',
      currency: 'EUR',
      exchangeRateToXof: 655.957
    }),
    asset({ id: ID(3), name: 'Terrain sans valeur', assetClass: 'MOVABLE' }),
    asset({ id: ID(9), tenantId: TENANT_B, name: 'Secret agence B' })
  ];
  store.valuations = [
    valuation(ID(1), 80_000_000),
    valuation(ID(2), 10_000, 'EUR'),
    valuation(ID(9), 999_000_000, 'XOF', TENANT_B)
  ];
  store.loans = [
    loan(1),
    loan(2, { assetId: ID(2), currency: 'EUR', remainingCapital: 1_000, lender: '=CMD()' }),
    loan(3, { tenantId: TENANT_B, lender: 'Banque de B' })
  ];
}

beforeEach(() => {
  jest.clearAllMocks();
  store.assets = [];
  store.valuations = [];
  store.loans = [];
});

async function readWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  return workbook;
}

describe('collectNetWorthExport', () => {
  it('reprend le calcul de valeur nette, avec la valeur d’origine des actifs en devise étrangère', async () => {
    seedTypicalTenants();
    const data = await collectNetWorthExport(TENANT_A, { asOf: '2026-09-29' });

    const eur = data.assets.find(a => a.name === 'Compte en euros');
    expect(eur).toMatchObject({ currency: 'EUR', originalValue: 10_000, valueXof: 6_559_570 });
    expect(data.assets[0].name).toBe('Villa Cocody');
    expect(data.totalAssets).toBe(86_559_570);
    // Dette XOF 20 M + 1 000 EUR au taux de l'actif adossé.
    expect(data.totalDebts).toBe(20_000_000 + 655_957);
    expect(data.netWorth).toBe(data.totalAssets - data.totalDebts);
    expect(data.debts.find(d => d.assetName === 'Compte en euros')).toMatchObject({
      currency: 'EUR',
      remainingCapital: 1_000,
      valueXof: 655_957
    });
    expect(data.debts.find(d => d.assetName === null)?.lender).toBe('Banque Atlantique');
    expect(data.excludedAssets).toEqual([
      expect.objectContaining({ name: 'Terrain sans valeur', reason: 'NO_VALUATION' })
    ]);
    expect(data.history.length).toBeGreaterThan(1);
  });

  it('un tenant sans actif obtient un export vide, sans erreur', async () => {
    const data = await collectNetWorthExport(TENANT_A, {});
    expect(data).toMatchObject({
      totalAssets: 0,
      totalDebts: 0,
      netWorth: 0,
      assets: [],
      debts: [],
      excludedAssets: []
    });
    await expect(buildNetWorthPdf(TENANT_A, data)).resolves.toBeInstanceOf(Buffer);
    const workbook = await readWorkbook(await buildNetWorthWorkbook(data));
    expect(workbook.worksheets.length).toBeGreaterThanOrEqual(5);
  });

  it("l'agence B ne lit jamais la situation de l'agence A (chaque requête est filtrée par tenantId)", async () => {
    seedTypicalTenants();
    const data = await collectNetWorthExport(TENANT_B, { asOf: '2026-09-29' });

    expect(data.assets.map(a => a.name)).toEqual(['Secret agence B']);
    expect(data.debts.map(d => d.lender)).toEqual(['Banque de B']);
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain('Villa Cocody');
    expect(serialized).not.toContain('Banque Atlantique');
    for (const spy of Object.values(spies)) {
      expect(spy).toHaveBeenCalled();
      for (const [args] of spy.mock.calls) expect(args.where.tenantId).toBe(TENANT_B);
    }
  });

  it('plafonne les tableaux et signale la troncature', async () => {
    const total = NET_WORTH_EXPORT_MAX_ROWS + 3;
    store.assets = Array.from({ length: total }, (_, i) => asset({ id: ID(1000 + i), name: `Actif ${i}` }));
    store.valuations = store.assets.map((a, i) => valuation(a.id, 1_000 + i));
    store.loans = Array.from({ length: total }, (_, i) => loan(2000 + i, { remainingCapital: 100 + i }));

    const data = await collectNetWorthExport(TENANT_A, {});
    expect(data.assets).toHaveLength(NET_WORTH_EXPORT_MAX_ROWS);
    expect(data.debts).toHaveLength(NET_WORTH_EXPORT_MAX_ROWS);
    expect(data.totals).toMatchObject({ assets: total, debts: total });
    expect(data.truncated).toMatchObject({ assets: true, debts: true });
    // Le total reste celui de TOUTES les lignes, pas seulement des lignes exportées.
    expect(data.totalAssets).toBe(store.valuations.reduce((sum, v) => sum + v.estimatedValue, 0));

    const workbook = await readWorkbook(await buildNetWorthWorkbook(data));
    expect(workbook.getWorksheet('Actifs')!.rowCount).toBe(NET_WORTH_EXPORT_MAX_ROWS + 1);
    const summary = workbook.getWorksheet('Synthèse')!;
    const notes: string[] = [];
    summary.eachRow(row => notes.push(String(row.getCell(3).value ?? '')));
    expect(notes.some(text => text.includes(`${total}`))).toBe(true);
  });
});

describe('buildNetWorthWorkbook', () => {
  it('produit un classeur xlsx valide avec synthèse, actifs (deux devises), dettes et actifs non comptés', async () => {
    seedTypicalTenants();
    const buffer = await buildNetWorthWorkbook(await collectNetWorthExport(TENANT_A, { asOf: '2026-09-29' }));
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');

    const workbook = await readWorkbook(buffer);
    expect(workbook.worksheets.map(s => s.name)).toEqual([
      'Synthèse',
      'Actifs',
      'Dettes',
      'Actifs non comptés',
      'Historique de la valeur nette'
    ]);
    const assets = workbook.getWorksheet('Actifs')!;
    const byName = new Map<string, ExcelJS.Row>();
    assets.eachRow((row, index) => index > 1 && byName.set(String(row.getCell(1).value), row));
    expect(byName.get('Villa Cocody')!.getCell(5).value).toBe(80_000_000);
    expect(byName.get('Compte en euros')!.getCell(3).value).toBe('EUR');
    expect(byName.get('Compte en euros')!.getCell(4).value).toBe(10_000);
    expect(byName.get('Compte en euros')!.getCell(5).value).toBe(6_559_570);

    const debts = workbook.getWorksheet('Dettes')!;
    const lenders: string[] = [];
    debts.eachRow((row, index) => index > 1 && lenders.push(String(row.getCell(1).value)));
    // « =CMD() » saisi comme prêteur est neutralisé (jamais une formule active).
    expect(lenders).toContain("'=CMD()");
    expect(lenders).toContain('Banque Atlantique');
    expect(workbook.getWorksheet('Actifs non comptés')!.getRow(2).getCell(1).value).toBe('Terrain sans valeur');
  });

  it('suit la langue de la requête : noms de feuilles valides en anglais comme en arabe', async () => {
    seedTypicalTenants();
    const data = await collectNetWorthExport(TENANT_A, {});
    const en = await readWorkbook(await runWithLanguage('en', () => buildNetWorthWorkbook(data)));
    expect(en.worksheets.map(s => s.name)).toEqual([
      'Summary',
      'Assets',
      'Debts',
      'Assets not counted',
      'Net worth history'
    ]);
    const ar = await readWorkbook(await runWithLanguage('ar', () => buildNetWorthWorkbook(data)));
    expect(ar.worksheets).toHaveLength(5);
  });
});

describe('buildNetWorthPdf', () => {
  it('produit un PDF valide (en-tête %PDF, pages lisibles) avec deux devises et des dettes', async () => {
    seedTypicalTenants();
    const buffer = await buildNetWorthPdf(TENANT_A, await collectNetWorthExport(TENANT_A, { asOf: '2026-09-29' }));
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('se génère pour une requête en arabe (forcée en français) et pour un grand nombre de lignes', async () => {
    const total = 120;
    store.assets = Array.from({ length: total }, (_, i) => asset({ id: ID(1000 + i), name: `Actif ${i} — اتفاقية` }));
    store.valuations = store.assets.map((a, i) => valuation(a.id, 1_000_000 + i));
    store.loans = Array.from({ length: total }, (_, i) => loan(2000 + i));
    const data = await collectNetWorthExport(TENANT_A, {});
    const buffer = await runWithLanguage('ar', () => buildNetWorthPdf(TENANT_A, data));
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThan(2);
  });
});

describe('netWorthExportQuerySchema', () => {
  it('exige un format connu et refuse un paramètre inattendu', () => {
    expect(netWorthExportQuerySchema.safeParse({ format: 'pdf' }).success).toBe(true);
    expect(netWorthExportQuerySchema.safeParse({ format: 'xlsx', asOf: '2026-09-29' }).success).toBe(true);
    // Bornes de asOf : une année < 0100 donnait une erreur trompeuse sur `from` (Date.UTC reporte 0-99 en 19xx).
    expect(netWorthExportQuerySchema.safeParse({ format: 'pdf', asOf: '0001-03-15' }).success).toBe(false);
    expect(netWorthExportQuerySchema.safeParse({ format: 'pdf', asOf: '2101-01-01' }).success).toBe(false);
    expect(netWorthExportQuerySchema.safeParse({ format: 'pdf', asOf: '1970-01-01' }).success).toBe(true);
    expect(netWorthExportQuerySchema.safeParse({ format: 'csv' }).success).toBe(false);
    expect(netWorthExportQuerySchema.safeParse({}).success).toBe(false);
    expect(netWorthExportQuerySchema.safeParse({ format: 'pdf', tenantId: 'autre' }).success).toBe(false);
    expect(netWorthExportQuerySchema.safeParse({ format: 'pdf', asOf: 'hier' }).success).toBe(false);
  });
});

describe('exportNetWorthHandler', () => {
  function run(query: Row, tenantId = TENANT_A) {
    const headers: Record<string, string> = {};
    const res: any = {
      setHeader: jest.fn((name: string, value: string) => void (headers[name] = value)),
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    };
    const req: any = { query, params: { tenantId: TENANT_B }, tenantContext: { tenantId }, propertyTenantId: tenantId };
    const next = jest.fn();
    return {
      headers,
      res,
      next,
      done: Promise.resolve(exportNetWorthHandler(req, res, next)).then(() => new Promise(r => setImmediate(r)))
    };
  }

  it('renvoie le fichier en mémoire avec des en-têtes sûrs et un nom de fichier assaini', async () => {
    seedTypicalTenants();
    const { headers, res, next, done } = run({ format: 'pdf', asOf: '2026-09-29' });
    await done;

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(headers['Content-Type']).toBe('application/pdf');
    expect(headers['Cache-Control']).toBe('no-store');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Content-Disposition']).toContain('attachment; filename="situation-patrimoniale-2026-09-29.pdf"');
    const sent = res.send.mock.calls[0][0] as Buffer;
    expect(sent.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('sert un classeur Excel', async () => {
    const { headers, res, done } = run({ format: 'xlsx' });
    await done;
    expect(headers['Content-Type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(headers['Content-Disposition']).toMatch(/filename="situation-patrimoniale-\d{4}-\d{2}-\d{2}\.xlsx"/);
    expect((res.send.mock.calls[0][0] as Buffer).subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it("utilise le contexte d'agence, jamais le paramètre de chemin, et refuse un format invalide", async () => {
    seedTypicalTenants();
    const ok = run({ format: 'xlsx' }, TENANT_B);
    await ok.done;
    const workbook = await readWorkbook(ok.res.send.mock.calls[0][0]);
    const names: string[] = [];
    workbook.getWorksheet('Actifs')!.eachRow(row => names.push(String(row.getCell(1).value)));
    expect(names).toContain('Secret agence B');
    expect(names).not.toContain('Villa Cocody');

    const bad = run({ format: 'doc' });
    await bad.done;
    expect(bad.next).toHaveBeenCalled();
    expect(bad.res.send).not.toHaveBeenCalled();
  });
});
