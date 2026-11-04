/**
 * Lectures comptables de la copropriete (lot SYN-A) : journal pagine, grand
 * livre avec solde progressif, balance agregee, recherche dans le plan.
 *
 * Prisma est remplace par une doublure. Pour le SQL brut, `$queryRaw` est
 * servi par un petit EMULATEUR qui lit le SQL reellement genere : il retrouve
 * dans le texte les conditions (`e.tenant_id = $n`, `j.syndicate_id = $n`,
 * bornes de periode, ILIKE, LIMIT/OFFSET) et n'applique que celles qu'il y
 * trouve, avec les valeurs liees. Une condition d'isolation absente du SQL
 * laisserait donc passer les lignes d'une autre agence et ferait echouer les
 * tests ; une pagination ou un cumul mal compose se voit dans les soldes.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';

jest.mock('../../src/utils/database', () => ({
  prisma: {
    syndicate: { findFirst: jest.fn() },
    chartOfAccount: { findFirst: jest.fn(), findMany: jest.fn() },
    journalEntry: { findMany: jest.fn(), count: jest.fn() },
    journalEntryLine: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn()
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import {
  getAccountLedgerHandler,
  getTrialBalanceAggregatedHandler,
  listAccountingEntriesPageHandler,
  listChartOfAccountsSearchHandler
} from '../../src/controllers/syndic-accounting-read-controller';
import { containsPattern } from '../../src/lib/syndics/accounting-reads';
import { getTrialBalanceBySyndicate } from '../../src/lib/syndics/queries';
import { errorHandler } from '../../src/middleware/error-middleware';

const mockPrisma = (jest.requireMock('../../src/utils/database') as { prisma: any }).prisma;

const TENANT = 'tenant-A';
const OTHER_TENANT = 'tenant-B';
const SYNDIC = '11111111-1111-4111-8111-111111111111';
const OTHER_SYNDIC = '22222222-2222-4222-8222-222222222222';
const ACCOUNT = '33333333-3333-4333-8333-333333333333';
const OTHER_ACCOUNT = '44444444-4444-4444-8444-444444444444';
const JOURNAL = '55555555-5555-4555-8555-555555555555';

// ------------------------------------------------------------------ appel d'un handler

type Called = { status: number; body: any; error?: any };

async function call(handler: any, query: Record<string, unknown> = {}, params: Record<string, string> = {}) {
  const req: any = {
    params: { tenantId: TENANT, syndicId: SYNDIC, ...params },
    query,
    method: 'GET',
    path: '/test',
    ip: '127.0.0.1'
  };
  const out: Called = { status: 200, body: undefined };
  const res: any = {
    headersSent: false,
    status: jest.fn((code: number) => {
      out.status = code;
      return res;
    }),
    json: jest.fn((body: unknown) => {
      out.body = body;
      return res;
    })
  };
  const next = jest.fn();
  await handler(req, res, next);
  if (next.mock.calls.length > 0) {
    out.error = next.mock.calls[0][0];
    errorHandler(out.error, req, res, jest.fn());
  }
  return out;
}

// ------------------------------------------------------------------ jeu de lignes et emulateur SQL

type Line = {
  id: string;
  entryId: string;
  tenantId: string;
  syndicateId: string;
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountClass: number;
  entryDate: Date;
  entryCreatedAt: Date;
  lineCreatedAt: Date;
  reference: string;
  description: string;
  journalCode: string;
  label: string;
  lotId: string | null;
  lotNumber: string | null;
  debit: number;
  credit: number;
};

let seq = 0;
function line(partial: Partial<Line> & { date: string; debit?: number; credit?: number }): Line {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  const entryDate = new Date(`${partial.date}T00:00:00.000Z`);
  return {
    id,
    entryId: partial.entryId ?? `entry-${seq}`,
    tenantId: partial.tenantId ?? TENANT,
    syndicateId: partial.syndicateId ?? SYNDIC,
    accountId: partial.accountId ?? ACCOUNT,
    accountNumber: partial.accountNumber ?? '512000',
    accountName: partial.accountName ?? 'Banque',
    accountClass: partial.accountClass ?? 5,
    entryDate,
    entryCreatedAt: partial.entryCreatedAt ?? new Date(entryDate.getTime() + seq * 1000),
    lineCreatedAt: partial.lineCreatedAt ?? new Date(entryDate.getTime() + seq * 1000 + 1),
    reference: partial.reference ?? `REF-${seq}`,
    description: partial.description ?? `Ecriture ${seq}`,
    journalCode: partial.journalCode ?? 'BQ',
    label: partial.label ?? `Ligne ${seq}`,
    lotId: partial.lotId ?? null,
    lotNumber: partial.lotNumber ?? null,
    debit: partial.debit ?? 0,
    credit: partial.credit ?? 0
  };
}

/** Valeur liee au parametre `$n` qui suit le fragment donne, ou undefined si le SQL ne le porte pas. */
function bound(sql: Prisma.Sql, fragment: string): unknown {
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\$(\\d+)`).exec(sql.text);
  return match ? sql.values[Number(match[1]) - 1] : undefined;
}

const asDate = (value: unknown) => new Date(`${String(value).replace(' ', 'T')}Z`);

/** Retrouve dans le motif ILIKE la saisie d'origine (echappement inverse). */
const needleOf = (pattern: string) =>
  pattern
    .slice(1, -1)
    .replace(/\\([\\%_])/g, '$1')
    .toLowerCase();

const byLedgerOrder = (a: Line, b: Line) =>
  a.entryDate.getTime() - b.entryDate.getTime() ||
  a.entryCreatedAt.getTime() - b.entryCreatedAt.getTime() ||
  a.lineCreatedAt.getTime() - b.lineCreatedAt.getTime() ||
  a.id.localeCompare(b.id);

const dec = (value: number) => new Prisma.Decimal(value);

/**
 * Emulateur PostgreSQL minimal des 4 requetes du module. Chaque condition
 * n'est appliquee que si le SQL genere la contient (voir l'en-tete).
 */
function emulate(dataset: Line[]) {
  return async (sql: Prisma.Sql) => {
    const text = sql.text;
    const tenant = bound(sql, 'e.tenant_id =');
    const syndicate = bound(sql, 'j.syndicate_id =');
    const account = bound(sql, 'l.account_id =');
    const scoped = dataset.filter(
      row =>
        (tenant === undefined || row.tenantId === tenant) &&
        (syndicate === undefined || row.syndicateId === syndicate) &&
        (account === undefined || row.accountId === account)
    );

    const fromValue = bound(sql, 'e.entry_date >=');
    const toValue = bound(sql, 'e.entry_date <=');
    const from = fromValue === undefined ? undefined : asDate(fromValue);
    const to = toValue === undefined ? undefined : asDate(toValue);
    const inPeriod = (row: Line) =>
      (!from || row.entryDate.getTime() >= from.getTime()) && (!to || row.entryDate.getTime() <= to.getTime());

    const patternValue = bound(sql, 'ILIKE');
    const needle = patternValue === undefined ? undefined : needleOf(String(patternValue));
    const matches = (row: Line) =>
      !needle || [row.reference, row.description, row.label].some(text => text.toLowerCase().includes(needle));

    if (text.includes('AS opening_balance')) {
      const beforeValue = bound(sql, 'e.entry_date <');
      const before = beforeValue === undefined ? undefined : asDate(beforeValue);
      const opening = before
        ? scoped.filter(row => row.entryDate < before).reduce((s, row) => s + row.debit - row.credit, 0)
        : 0;
      const period = scoped.filter(inPeriod);
      return [
        {
          opening_balance: dec(opening),
          period_debit: dec(period.reduce((s, row) => s + row.debit, 0)),
          period_credit: dec(period.reduce((s, row) => s + row.credit, 0)),
          line_count: BigInt(period.length)
        }
      ];
    }

    if (text.includes('WITH period_lines')) {
      // Fenetre : cumul sur TOUTES les lignes de la periode, dans l'ordre du grand livre...
      let cumulative = 0;
      const window = scoped
        .filter(inPeriod)
        .sort(byLedgerOrder)
        .map(row => {
          cumulative += row.debit - row.credit;
          return { row, cumulative };
        });
      // ... puis recherche et pagination sur la requete externe.
      const limit = Number(bound(sql, 'LIMIT'));
      const offset = Number(bound(sql, 'OFFSET'));
      return window
        .filter(({ row }) => matches(row))
        .slice(offset, offset + limit)
        .map(({ row, cumulative: cumul }) => ({
          id: row.id,
          entry_id: row.entryId,
          entry_date: row.entryDate,
          reference: row.reference,
          description: row.description,
          journal_code: row.journalCode,
          label: row.label,
          lot_id: row.lotId,
          lot_number: row.lotNumber,
          debit: dec(row.debit),
          credit: dec(row.credit),
          cumulative: dec(cumul)
        }));
    }

    if (text.includes('COUNT(*) AS total')) {
      return [{ total: BigInt(scoped.filter(inPeriod).filter(matches).length) }];
    }

    if (text.includes('GROUP BY a.id')) {
      const groups = new Map<string, any>();
      for (const row of scoped.filter(inPeriod)) {
        const current = groups.get(row.accountId) ?? {
          account_id: row.accountId,
          account_number: row.accountNumber,
          account_name: row.accountName,
          account_class: row.accountClass,
          debit: dec(0),
          credit: dec(0)
        };
        current.debit = current.debit.plus(row.debit);
        current.credit = current.credit.plus(row.credit);
        groups.set(row.accountId, current);
      }
      return Array.from(groups.values()).map(({ debit, credit, ...rest }) => ({
        ...rest,
        total_debit: debit,
        total_credit: credit
      }));
    }

    throw new Error(`Requete SQL inattendue : ${text}`);
  };
}

const rawCalls = (): Prisma.Sql[] => mockPrisma.$queryRaw.mock.calls.map((args: any[]) => args[0]);

beforeEach(() => {
  jest.clearAllMocks();
  seq = 0;
  mockPrisma.syndicate.findFirst.mockResolvedValue({ id: SYNDIC });
  mockPrisma.chartOfAccount.findFirst.mockResolvedValue({
    id: ACCOUNT,
    accountNumber: '512000',
    accountName: 'Banque',
    accountClass: 5,
    accountType: 'ASSET'
  });
  mockPrisma.chartOfAccount.findMany.mockResolvedValue([]);
  mockPrisma.journalEntry.findMany.mockResolvedValue([]);
  mockPrisma.journalEntry.count.mockResolvedValue(0);
  mockPrisma.$queryRaw.mockImplementation(emulate([]));
});

afterEach(() => {
  expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
});

// ------------------------------------------------------------------ validation

describe('validation des parametres (400, sans aucune lecture)', () => {
  it.each([
    ['grand livre sans compte', getAccountLedgerHandler, {}],
    ['grand livre, compte non uuid', getAccountLedgerHandler, { accountId: 'abc' }],
    ['grand livre, limit > 100', getAccountLedgerHandler, { accountId: ACCOUNT, limit: '101' }],
    ['grand livre, from > to', getAccountLedgerHandler, { accountId: ACCOUNT, from: '2026-03-01', to: '2026-01-01' }],
    ['grand livre, page > 100000', getAccountLedgerHandler, { accountId: ACCOUNT, page: '100001' }],
    ['ecritures, page > 100000', listAccountingEntriesPageHandler, { page: '100001' }],
    ['ecritures, limit > 100', listAccountingEntriesPageHandler, { limit: '101' }],
    ['ecritures, from > to', listAccountingEntriesPageHandler, { from: '2026-03-01', to: '2026-01-01' }],
    ['ecritures, statut inconnu', listAccountingEntriesPageHandler, { status: 'closed' }],
    ['ecritures, journal non uuid', listAccountingEntriesPageHandler, { journalId: 'j1' }],
    ['ecritures, date invalide', listAccountingEntriesPageHandler, { from: 'pas-une-date' }],
    ['ecritures, recherche trop longue', listAccountingEntriesPageHandler, { search: 'x'.repeat(101) }],
    ['balance, classe 0', getTrialBalanceAggregatedHandler, { accountClass: '0' }],
    ['balance, classe 10', getTrialBalanceAggregatedHandler, { accountClass: '4,10' }],
    ['balance, classe non numerique', getTrialBalanceAggregatedHandler, { accountClass: '4,x' }],
    ['balance, hideZero invalide', getTrialBalanceAggregatedHandler, { hideZero: 'oui' }],
    ['balance, from > to', getTrialBalanceAggregatedHandler, { from: '2026-03-01', to: '2026-01-01' }],
    ['plan, limit > 100', listChartOfAccountsSearchHandler, { limit: '500' }],
    ['plan, classe invalide', listChartOfAccountsSearchHandler, { accountClass: '12' }]
  ])('%s', async (_label, handler, query) => {
    const out = await call(handler, query);
    expect(out.status).toBe(400);
    expect(out.body.success).toBe(false);
    expect(mockPrisma.syndicate.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('la page 100000 (borne incluse) reste acceptee', async () => {
    const out = await call(listAccountingEntriesPageHandler, { page: '100000' });
    expect(out.status).toBe(200);
  });

  it('une recherche vide ou blanche est ignoree (pas de 400)', async () => {
    const out = await call(listAccountingEntriesPageHandler, { search: '   ' });
    expect(out.status).toBe(200);
    expect(mockPrisma.journalEntry.findMany.mock.calls[0][0].where.AND).toBeUndefined();
  });
});

// ------------------------------------------------------------------ isolation

describe('isolation agence / copropriete', () => {
  it.each([
    ['ecritures', listAccountingEntriesPageHandler, {}],
    ['grand livre', getAccountLedgerHandler, { accountId: ACCOUNT }],
    ['balance', getTrialBalanceAggregatedHandler, {}],
    ['plan', listChartOfAccountsSearchHandler, {}]
  ])("%s : copropriete d'une autre agence refusee avant toute lecture", async (_label, handler, query) => {
    mockPrisma.syndicate.findFirst.mockResolvedValue(null);
    const out = await call(handler, query);

    // Meme reponse que toutes les routes syndic (assertSyndicateTenantOwnership).
    expect(out.status).toBe(403);
    expect(out.body.code).toBe('TENANT_ISOLATION_ERROR');
    expect(mockPrisma.syndicate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: SYNDIC, tenantId: TENANT }) })
    );
    expect(mockPrisma.journalEntry.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.chartOfAccount.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.chartOfAccount.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('identifiant de copropriete mal forme : meme refus, aucune requete SQL', async () => {
    const out = await call(getTrialBalanceAggregatedHandler, {}, { syndicId: "x' OR 1=1 --" });
    expect(out.status).toBe(403);
    expect(mockPrisma.syndicate.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("grand livre : un compte d'une autre copropriete repond 404, sans SQL", async () => {
    mockPrisma.chartOfAccount.findFirst.mockResolvedValue(null);
    const out = await call(getAccountLedgerHandler, { accountId: OTHER_ACCOUNT });

    expect(out.status).toBe(404);
    expect(out.error.name).toBe('NotFoundError');
    expect(mockPrisma.chartOfAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: OTHER_ACCOUNT, syndicateId: SYNDIC, tenantId: TENANT } })
    );
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('grand livre et balance : agence et copropriete liees dans CHAQUE requete SQL', async () => {
    const dataset = [
      line({ date: '2026-02-01', debit: 100 }),
      line({ date: '2026-02-02', debit: 999, tenantId: OTHER_TENANT }),
      line({ date: '2026-02-03', debit: 777, syndicateId: OTHER_SYNDIC }),
      line({ date: '2026-02-04', debit: 555, accountId: OTHER_ACCOUNT, accountNumber: '401000' })
    ];
    mockPrisma.$queryRaw.mockImplementation(emulate(dataset));

    const ledger = await call(getAccountLedgerHandler, { accountId: ACCOUNT, search: 'Ligne' });
    const balance = await call(getTrialBalanceAggregatedHandler, {});

    const calls = rawCalls();
    expect(calls).toHaveLength(4); // synthese, page, comptage de recherche, balance
    for (const sql of calls) {
      expect(bound(sql, 'e.tenant_id =')).toBe(TENANT);
      expect(bound(sql, 'j.syndicate_id =')).toBe(SYNDIC);
      // Aucune valeur saisie n'est concatenee au texte SQL.
      expect(sql.text).not.toContain(TENANT);
      expect(sql.text).not.toContain(SYNDIC);
    }
    expect(ledger.body.data.summary.periodDebit).toBe(100);
    expect(ledger.body.data.items.map((item: any) => item.debit)).toEqual([100]);
    expect(ledger.body.data.pagination.total).toBe(1);
    // La balance ne compte ni l'autre agence ni l'autre copropriete.
    expect(balance.body.data.totals.totalDebit).toBe(655);
  });

  it('plan comptable : agence et copropriete dans le where, filtres ajoutes', async () => {
    mockPrisma.chartOfAccount.findMany.mockResolvedValue([{ id: ACCOUNT, accountNumber: '512000' }]);
    const out = await call(listChartOfAccountsSearchHandler, { search: '51', accountClass: '5,4', limit: '20' });

    expect(out.status).toBe(200);
    expect(out.body).toEqual({ success: true, data: [{ id: ACCOUNT, accountNumber: '512000' }] });
    expect(mockPrisma.chartOfAccount.findMany).toHaveBeenCalledWith({
      where: {
        syndicateId: SYNDIC,
        tenantId: TENANT,
        isActive: true,
        accountClass: { in: [5, 4] },
        OR: [
          { accountNumber: { startsWith: '51', mode: 'insensitive' } },
          { accountName: { contains: '51', mode: 'insensitive' } }
        ]
      },
      include: { parent: true },
      orderBy: [{ accountNumber: 'asc' }, { createdAt: 'asc' }],
      take: 20
    });
  });

  it('plan comptable : onlyActive=false lit aussi les comptes inactifs, sans plafond par defaut', async () => {
    await call(listChartOfAccountsSearchHandler, { onlyActive: 'false' });
    const args = mockPrisma.chartOfAccount.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ syndicateId: SYNDIC, tenantId: TENANT });
    expect(args.take).toBeUndefined();
  });
});

// ------------------------------------------------------------------ journal des ecritures

describe('journal des ecritures pagine', () => {
  it('porte tous les filtres dans un meme where pour findMany et count', async () => {
    mockPrisma.journalEntry.findMany.mockResolvedValue([
      {
        id: 'e1',
        reference: 'APP-1',
        lines: [{ id: 'l1', debit: dec(10.1), credit: dec(0), label: 'x' }]
      }
    ]);
    mockPrisma.journalEntry.count.mockResolvedValue(25);

    const out = await call(listAccountingEntriesPageHandler, {
      page: '2',
      limit: '10',
      journalId: JOURNAL,
      accountId: OTHER_ACCOUNT,
      search: '  loyer ',
      status: 'locked',
      from: '2026-01-01',
      to: '2026-03-31'
    });

    expect(out.status).toBe(200);
    const findArgs = mockPrisma.journalEntry.findMany.mock.calls[0][0];
    const countArgs = mockPrisma.journalEntry.count.mock.calls[0][0];
    const contains = { contains: 'loyer', mode: 'insensitive' };
    expect(findArgs.where).toEqual({
      tenantId: TENANT,
      journal: { syndicateId: SYNDIC },
      journalId: JOURNAL,
      isLocked: true,
      entryDate: { gte: new Date('2026-01-01'), lte: new Date('2026-03-31T23:59:59.999Z') },
      AND: [
        { lines: { some: { accountId: OTHER_ACCOUNT } } },
        { OR: [{ reference: contains }, { description: contains }, { lines: { some: { label: contains } } }] }
      ]
    });
    expect(countArgs).toEqual({ where: findArgs.where });
    expect(findArgs.skip).toBe(10);
    expect(findArgs.take).toBe(10);
    expect(findArgs.orderBy).toEqual([{ entryDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]);
    expect(findArgs.include.journal).toEqual({
      select: { id: true, code: true, label: true, journalType: true, fiscalYear: true }
    });
    expect(findArgs.include.lines.orderBy).toEqual([{ createdAt: 'asc' }]);
    expect(findArgs.include.lines.select.account).toEqual({
      select: { id: true, accountNumber: true, accountName: true }
    });
    expect(findArgs.include.lines.select.lot).toEqual({ select: { id: true, lotNumber: true } });

    expect(out.body.pagination).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    expect(out.body.data[0].lines[0]).toMatchObject({ debit: 10.1, credit: 0 });
  });

  it('statut open, valeurs par defaut (page 1, 20 lignes) et totalPages >= 1', async () => {
    const out = await call(listAccountingEntriesPageHandler, { status: 'open' });
    const findArgs = mockPrisma.journalEntry.findMany.mock.calls[0][0];
    expect(findArgs.where).toEqual({ tenantId: TENANT, journal: { syndicateId: SYNDIC }, isLocked: false });
    expect(findArgs.skip).toBe(0);
    expect(findArgs.take).toBe(20);
    expect(out.body).toEqual({ success: true, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
  });
});

// ------------------------------------------------------------------ grand livre

describe("grand livre d'un compte", () => {
  /** 2 lignes avant la periode, 7 dans la periode (dont 2 a la meme date), 1 apres. */
  function ledgerDataset() {
    return [
      line({ date: '2025-12-15', debit: 1000, reference: 'AN-1' }),
      line({ date: '2025-12-20', credit: 250.25, reference: 'AN-2' }),
      line({ date: '2026-01-05', debit: 300.1, reference: 'APP-T1', label: 'Appel de fonds T1' }),
      line({ date: '2026-01-05', credit: 50.2, reference: 'FRA-1', label: 'Frais bancaires' }),
      line({ date: '2026-01-10', credit: 120, reference: 'FAC-EDF', description: 'Facture EDF' }),
      line({ date: '2026-02-01', debit: 410.45, reference: 'APP-T1-B', label: 'Appel 50%_special' }),
      line({ date: '2026-02-15', credit: 75.3, reference: 'FRA-2', label: 'Frais bancaires' }),
      line({ date: '2026-03-01', debit: 99.99, reference: 'APP-T2', label: 'Appel de fonds T2' }),
      line({ date: '2026-03-20', credit: 10, reference: 'FRA-3', label: 'Frais bancaires' }),
      line({ date: '2026-04-02', debit: 5000, reference: 'HORS-PERIODE' })
    ];
  }
  const PERIOD = { from: '2026-01-01', to: '2026-03-31' };

  it('synthese : ouverture, mouvements et cloture de la periode', async () => {
    mockPrisma.$queryRaw.mockImplementation(emulate(ledgerDataset()));
    const out = await call(getAccountLedgerHandler, { accountId: ACCOUNT, ...PERIOD });

    expect(out.status).toBe(200);
    const { account, summary } = out.body.data;
    expect(account).toEqual({
      id: ACCOUNT,
      accountNumber: '512000',
      accountName: 'Banque',
      accountClass: 5,
      accountType: 'ASSET'
    });
    expect(summary).toEqual({
      openingBalance: 749.75, // 1000 - 250.25
      periodDebit: 810.54, // 300.10 + 410.45 + 99.99
      periodCredit: 255.5, // 50.20 + 120 + 75.30 + 10
      closingBalance: 1304.79,
      lineCount: 7
    });
    // Sans recherche, le total vient de la synthese : pas de comptage supplementaire.
    expect(rawCalls()).toHaveLength(2);
  });

  it('solde progressif continu entre deux pages, la derniere ligne tombe sur la cloture', async () => {
    mockPrisma.$queryRaw.mockImplementation(emulate(ledgerDataset()));
    const page1 = (await call(getAccountLedgerHandler, { accountId: ACCOUNT, ...PERIOD, limit: '3', page: '1' })).body
      .data;
    const page2 = (await call(getAccountLedgerHandler, { accountId: ACCOUNT, ...PERIOD, limit: '3', page: '2' })).body
      .data;
    const page3 = (await call(getAccountLedgerHandler, { accountId: ACCOUNT, ...PERIOD, limit: '3', page: '3' })).body
      .data;

    expect(page1.pagination).toEqual({ page: 1, limit: 3, total: 7, totalPages: 3 });
    expect(page1.items.map((i: any) => i.reference)).toEqual(['APP-T1', 'FRA-1', 'FAC-EDF']);
    expect(page2.items.map((i: any) => i.reference)).toEqual(['APP-T1-B', 'FRA-2', 'APP-T2']);
    expect(page3.items.map((i: any) => i.reference)).toEqual(['FRA-3']);

    // Premiere ligne = ouverture + son mouvement.
    expect(page1.items[0].runningBalance).toBe(1049.85); // 749.75 + 300.10
    // Chaque ligne = ligne precedente + son mouvement, y compris d'une page a l'autre.
    const all = [...page1.items, ...page2.items, ...page3.items];
    for (let i = 1; i < all.length; i += 1) {
      const expected = Math.round((all[i - 1].runningBalance + all[i].debit - all[i].credit) * 100) / 100;
      expect(all[i].runningBalance).toBe(expected);
    }
    const lastOfPage1 = page1.items[page1.items.length - 1];
    const firstOfPage2 = page2.items[0];
    expect(firstOfPage2.runningBalance).toBe(
      Math.round((lastOfPage1.runningBalance + firstOfPage2.debit - firstOfPage2.credit) * 100) / 100
    );
    expect(all[all.length - 1].runningBalance).toBe(page1.summary.closingBalance);

    // OFFSET / LIMIT lies (jamais concatenes), calcules depuis page et limit.
    const pageCalls = rawCalls().filter(sql => sql.text.includes('WITH period_lines'));
    expect(pageCalls.map(sql => [bound(sql, 'LIMIT'), bound(sql, 'OFFSET')])).toEqual([
      [3, 0],
      [3, 3],
      [3, 6]
    ]);
  });

  it("la recherche filtre l'affichage sans modifier le cumul", async () => {
    mockPrisma.$queryRaw.mockImplementation(emulate(ledgerDataset()));
    const full = (await call(getAccountLedgerHandler, { accountId: ACCOUNT, ...PERIOD })).body.data;
    const searched = (await call(getAccountLedgerHandler, { accountId: ACCOUNT, ...PERIOD, search: 'frais BANCAIRES' }))
      .body.data;

    const balanceOf = new Map(full.items.map((item: any) => [item.id, item.runningBalance]));
    expect(searched.items.map((i: any) => i.reference)).toEqual(['FRA-1', 'FRA-2', 'FRA-3']);
    for (const item of searched.items) {
      expect(item.runningBalance).toBe(balanceOf.get(item.id));
    }
    expect(searched.pagination).toEqual({ page: 1, limit: 50, total: 3, totalPages: 1 });
    // La synthese reste celle de toute la periode.
    expect(searched.summary).toEqual(full.summary);
  });

  it('les jokers % et _ de la recherche sont echappes', async () => {
    mockPrisma.$queryRaw.mockImplementation(emulate(ledgerDataset()));
    const out = await call(getAccountLedgerHandler, { accountId: ACCOUNT, ...PERIOD, search: '50%_s' });

    expect(out.body.data.items.map((i: any) => i.reference)).toEqual(['APP-T1-B']);
    expect(containsPattern('50%_s\\')).toBe('%50\\%\\_s\\\\%');
    for (const sql of rawCalls().filter(s => s.text.includes('ILIKE'))) {
      expect(bound(sql, 'ILIKE')).toBe('%50\\%\\_s%');
      expect(sql.text).not.toContain('50%');
    }
  });

  it('SQL : fenetre ROWS sur toutes les lignes de la periode, recherche hors de la CTE', async () => {
    mockPrisma.$queryRaw.mockImplementation(emulate(ledgerDataset()));
    await call(getAccountLedgerHandler, { accountId: ACCOUNT, ...PERIOD, search: 'frais' });
    const page = rawCalls().find(sql => sql.text.includes('WITH period_lines'))!;
    const text = page.text.replace(/\s+/g, ' ');

    expect(text).toContain(
      'SUM(l.debit - l.credit) OVER (ORDER BY e.entry_date, e.created_at, l.created_at, l.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)'
    );
    const cteEnd = text.indexOf(') SELECT pl.id');
    expect(cteEnd).toBeGreaterThan(0);
    // Ni recherche ni pagination dans la CTE : elles viennent apres le cumul.
    expect(text.slice(0, cteEnd)).not.toContain('ILIKE');
    expect(text.slice(0, cteEnd)).not.toContain('LIMIT');
    expect(text.slice(cteEnd)).toContain('ILIKE');
    expect(text.slice(cteEnd)).toContain(
      'ORDER BY pl.entry_date, pl.entry_created_at, pl.line_created_at, pl.id LIMIT'
    );
    // Bornes de periode typees en timestamp UTC, sans dependre du fuseau de la session.
    expect(bound(page, 'e.entry_date >=')).toBe('2026-01-01 00:00:00.000');
    expect(bound(page, 'e.entry_date <=')).toBe('2026-03-31 23:59:59.999');
    expect(bound(page, 'l.account_id =')).toBe(ACCOUNT);
  });

  it('sans periode : ouverture nulle, toutes les lignes comptent', async () => {
    mockPrisma.$queryRaw.mockImplementation(emulate(ledgerDataset()));
    const out = await call(getAccountLedgerHandler, { accountId: ACCOUNT });
    const { summary, items } = out.body.data;

    expect(summary.openingBalance).toBe(0);
    expect(summary.lineCount).toBe(10);
    expect(items[0]).toMatchObject({ reference: 'AN-1', runningBalance: 1000, debit: 1000, credit: 0 });
    expect(items[0].entryDate).toBe('2025-12-15T00:00:00.000Z');
    expect(items[items.length - 1].runningBalance).toBe(summary.closingBalance);
    expect(out.body.data.pagination).toEqual({ page: 1, limit: 50, total: 10, totalPages: 1 });
  });

  it('aucune variante non securisee du SQL brut dans le module ni dans son controleur', () => {
    for (const file of [
      '../../src/lib/syndics/accounting-reads.ts',
      '../../src/controllers/syndic-accounting-read-controller.ts'
    ]) {
      const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
      expect(source).not.toMatch(/\$(query|execute)RawUnsafe/);
      expect(source).not.toMatch(/Prisma\.raw\(/);
    }
  });
});

// ------------------------------------------------------------------ balance

describe('balance agregee', () => {
  function balanceDataset() {
    const bank = { accountId: ACCOUNT, accountNumber: '512000', accountName: 'Banque', accountClass: 5 };
    const owners = {
      accountId: '66666666-6666-4666-8666-666666666666',
      accountNumber: '450100',
      accountName: 'Coproprietaires',
      accountClass: 4
    };
    const supplier = {
      accountId: OTHER_ACCOUNT,
      accountNumber: '401000',
      accountName: 'Fournisseurs',
      accountClass: 4
    };
    const energy = {
      accountId: '77777777-7777-4777-8777-777777777777',
      accountNumber: '605100',
      accountName: 'Electricite parties communes',
      accountClass: 6
    };
    return [
      line({ date: '2026-01-05', ...owners, debit: 0.1 }),
      line({ date: '2026-01-05', ...owners, debit: 0.2 }),
      line({ date: '2026-01-05', ...bank, credit: 0.3 }),
      line({ date: '2026-01-10', ...energy, debit: 120.35 }),
      line({ date: '2026-01-10', ...supplier, credit: 120.35 }),
      line({ date: '2026-01-20', ...supplier, debit: 120.35 }),
      line({ date: '2026-01-20', ...bank, credit: 120.35 }),
      line({ date: '2026-02-01', ...bank, debit: 1000.01 }),
      line({ date: '2026-02-01', ...owners, credit: 1000.01 }),
      line({ date: '2025-12-31', ...bank, debit: 99999 }), // hors periode
      line({ date: '2026-01-15', ...bank, debit: 4242, tenantId: OTHER_TENANT })
    ];
  }
  const PERIOD = { from: '2026-01-01', to: '2026-12-31' };

  it("memes montants que l'implementation historique sur le meme jeu de lignes", async () => {
    const dataset = balanceDataset();
    mockPrisma.$queryRaw.mockImplementation(emulate(dataset));
    // Ancienne implementation : toutes les lignes en memoire, filtrees par Prisma.
    mockPrisma.journalEntryLine.findMany.mockImplementation(async ({ where }: any) => {
      const { gte, lte } = where.entry.entryDate ?? {};
      return dataset
        .filter(row => row.syndicateId === where.entry.journal.syndicateId && row.tenantId === TENANT)
        .filter(row => (!gte || row.entryDate >= gte) && (!lte || row.entryDate <= lte))
        .map(row => ({
          accountId: row.accountId,
          debit: dec(row.debit),
          credit: dec(row.credit),
          account: { accountNumber: row.accountNumber, accountName: row.accountName }
        }));
    });

    const legacy = await getTrialBalanceBySyndicate(TENANT, SYNDIC, {
      from: new Date(PERIOD.from),
      to: new Date(PERIOD.to)
    });
    const out = await call(getTrialBalanceAggregatedHandler, PERIOD);
    const data = out.body.data;

    expect(data.items.map(({ accountClass: _c, ...rest }: any) => rest)).toEqual(legacy.items);
    expect(data.totals).toEqual(legacy.totals);
    expect(data.totals).toEqual({ totalDebit: 1241.01, totalCredit: 1241.01, isBalanced: true });
    expect(data.items.map((i: any) => i.accountNumber)).toEqual(['401000', '450100', '512000', '605100']);
    expect(data.items.find((i: any) => i.accountNumber === '450100')).toMatchObject({
      totalDebit: 0.3,
      totalCredit: 1000.01,
      balance: -999.71
    });
    expect(data.filteredTotals).toEqual({ totalDebit: 1241.01, totalCredit: 1241.01 });
  });

  it('les filtres choisissent les comptes renvoyes, les totaux restent ceux de tous les comptes', async () => {
    mockPrisma.$queryRaw.mockImplementation(emulate(balanceDataset()));

    const byClass = (await call(getTrialBalanceAggregatedHandler, { ...PERIOD, accountClass: '4' })).body.data;
    expect(byClass.items.map((i: any) => i.accountNumber)).toEqual(['401000', '450100']);
    expect(byClass.totals).toEqual({ totalDebit: 1241.01, totalCredit: 1241.01, isBalanced: true });
    expect(byClass.filteredTotals).toEqual({ totalDebit: 120.65, totalCredit: 1120.36 });

    const hidden = (await call(getTrialBalanceAggregatedHandler, { ...PERIOD, hideZero: 'true' })).body.data;
    // 401000 : 120,35 au debit et au credit, solde nul.
    expect(hidden.items.map((i: any) => i.accountNumber)).toEqual(['450100', '512000', '605100']);
    expect(hidden.totals.totalDebit).toBe(1241.01);

    const notHidden = (await call(getTrialBalanceAggregatedHandler, { ...PERIOD, hideZero: 'false' })).body.data;
    expect(notHidden.items).toHaveLength(4);

    const byNumber = (await call(getTrialBalanceAggregatedHandler, { ...PERIOD, search: '60' })).body.data;
    expect(byNumber.items.map((i: any) => i.accountNumber)).toEqual(['605100']);

    const byName = (await call(getTrialBalanceAggregatedHandler, { ...PERIOD, search: 'BANQ' })).body.data;
    expect(byName.items.map((i: any) => i.accountNumber)).toEqual(['512000']);
    expect(byName.filteredTotals).toEqual({ totalDebit: 1000.01, totalCredit: 120.65 });
    expect(byName.totals.totalCredit).toBe(1241.01);

    const combined = (
      await call(getTrialBalanceAggregatedHandler, { ...PERIOD, accountClass: '4,6', hideZero: 'true', search: '4' })
    ).body.data;
    expect(combined.items.map((i: any) => i.accountNumber)).toEqual(['450100']);
  });

  it('un agregat SQL par compte : aucune ligne chargee en memoire', async () => {
    mockPrisma.$queryRaw.mockImplementation(emulate(balanceDataset()));
    await call(getTrialBalanceAggregatedHandler, PERIOD);

    expect(mockPrisma.journalEntryLine.findMany).not.toHaveBeenCalled();
    const [sql] = rawCalls();
    expect(sql.text).toContain('GROUP BY a.id, a.account_number, a.account_name, a.account_class');
    expect(bound(sql, 'e.entry_date >=')).toBe('2026-01-01 00:00:00.000');
    expect(bound(sql, 'e.entry_date <=')).toBe('2026-12-31 23:59:59.999');
  });
});
