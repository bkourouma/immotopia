/**
 * Lectures paginées et agrégées de la comptabilité de l'agence (lot C) :
 * journal, grand livre, balance générale. Prisma est simulé ; les requêtes
 * brutes sont inspectées (gabarit SQL et paramètres).
 */

export {};

const prismaMock: any = {
  chartOfAccount: { findFirst: jest.fn(), findMany: jest.fn() },
  accountingJournal: { findFirst: jest.fn() },
  journalEntry: { count: jest.fn(), findMany: jest.fn() },
  journalEntryLine: { aggregate: jest.fn() },
  $queryRaw: jest.fn()
};

jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));

/* eslint-disable @typescript-eslint/no-var-requires */
const { getJournalPage, journalPageTable } = require('../../src/lib/accounting-exports/queries/journal');
const { getTrialBalanceData } = require('../../src/lib/accounting-exports/queries/balance');
const {
  getAccountLedger,
  getLedgerSummary,
  listAccounts,
  accountLedgerTable
} = require('../../src/lib/accounting-exports/queries/ledger');
const { escapeLike, containsPattern } = require('../../src/lib/accounting-exports/queries/sql');
const { parsePeriod } = require('../../src/lib/accounting-exports/service');
const { NotFoundError } = require('../../src/middleware/error-middleware');
/* eslint-enable @typescript-eslint/no-var-requires */

const TENANT = 'tenant-1';
const period = parsePeriod({ from: '2026-01-01', to: '2026-12-31' });

function balanceRow(number: string, name: string, opening: number, debit: number, credit: number, cls?: number) {
  return {
    id: `id-${number}`,
    account_number: number,
    account_name: name,
    account_class: cls ?? Number(number[0]),
    opening,
    period_debit: debit,
    period_credit: credit
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('getJournalPage', () => {
  const entry = (id: string) => ({
    id,
    entryDate: new Date('2026-03-01T00:00:00Z'),
    reference: `PCE-${id}`,
    description: 'Loyer',
    documentType: null,
    voidedByEntryId: null,
    journal: { code: 'VT' },
    lines: [
      {
        label: 'Crédit',
        debit: 0,
        credit: 100,
        fundsNature: null,
        thirdParty: null,
        account: { accountNumber: '706', accountName: 'Honoraires' }
      },
      {
        label: 'Débit',
        debit: 100,
        credit: 0,
        fundsNature: 'CURRENT',
        thirdParty: { label: 'M. Koné' },
        account: { accountNumber: '411', accountName: 'Clients' }
      }
    ]
  });

  beforeEach(() => {
    prismaMock.journalEntry.count.mockResolvedValue(45);
    prismaMock.journalEntry.findMany.mockResolvedValue([entry('a'), entry('b')]);
    prismaMock.journalEntryLine.aggregate.mockResolvedValue({ _sum: { debit: 4500, credit: 4500 } });
  });

  it('filtre par agence, pagine et trie sur trois clés', async () => {
    const result = await getJournalPage(TENANT, period, {}, { page: 2, limit: 20 });
    const args = prismaMock.journalEntry.findMany.mock.calls[0][0];
    expect(args.where.tenantId).toBe(TENANT);
    expect(args.where.journal.scope).toBe('OPERATIONS');
    expect(args.skip).toBe(20);
    expect(args.take).toBe(20);
    expect(args.orderBy).toEqual([{ entryDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]);
    expect(result.total).toBe(45);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(20);
  });

  it('calcule les totaux du filtre entier par agrégat, sur le même where', async () => {
    const result = await getJournalPage(TENANT, period, {}, { page: 1, limit: 2 });
    const agg = prismaMock.journalEntryLine.aggregate.mock.calls[0][0];
    expect(agg.where.entry).toBe(prismaMock.journalEntry.count.mock.calls[0][0].where);
    expect(agg.where.entry.tenantId).toBe(TENANT);
    expect(result.totals).toEqual({ debit: 4500, credit: 4500 });
  });

  it('ordonne les lignes (débits d’abord) et totalise par écriture', async () => {
    const result = await getJournalPage(TENANT, period, {}, { page: 1, limit: 2 });
    const first = result.items[0];
    expect(first.lines.map((l: any) => l.accountNumber)).toEqual(['411', '706']);
    expect(first.lines[0].nature).toBe('Compte courant');
    expect(first.lines[0].thirdParty).toBe('M. Koné');
    expect(first.debit).toBe(100);
    expect(first.credit).toBe(100);
  });

  it('applique les filtres journal, compte et recherche', async () => {
    prismaMock.accountingJournal.findFirst.mockResolvedValue({ id: 'j1' });
    await getJournalPage(TENANT, period, { journal: 'VT', account: '41', search: 'loyer' }, { page: 1, limit: 20 });
    expect(prismaMock.accountingJournal.findFirst.mock.calls[0][0].where).toEqual({
      tenantId: TENANT,
      scope: 'OPERATIONS',
      code: 'VT'
    });
    const where = prismaMock.journalEntry.findMany.mock.calls[0][0].where;
    expect(where.journal).toEqual({ scope: 'OPERATIONS', code: 'VT' });
    expect(where.lines.some.account).toEqual({
      tenantId: TENANT,
      scope: 'OPERATIONS',
      accountNumber: { startsWith: '41' }
    });
    expect(where.OR).toHaveLength(3);
    expect(where.OR[0].reference).toEqual({ contains: 'loyer', mode: 'insensitive' });
  });

  it('refuse un journal inconnu de l’agence', async () => {
    prismaMock.accountingJournal.findFirst.mockResolvedValue(null);
    await expect(getJournalPage(TENANT, period, { journal: 'XX' }, { page: 1, limit: 20 })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(prismaMock.journalEntry.findMany).not.toHaveBeenCalled();
  });

  it('renvoie tout le filtre sans skip ni take pour “all”', async () => {
    prismaMock.journalEntry.count.mockResolvedValue(2);
    const result = await getJournalPage(TENANT, period, {}, 'all');
    const args = prismaMock.journalEntry.findMany.mock.calls[0][0];
    expect(args).not.toHaveProperty('skip');
    expect(args).not.toHaveProperty('take');
    expect(result.limit).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it('exporte les mêmes colonnes que l’ancien journal', async () => {
    const result = await getJournalPage(TENANT, period, {}, { page: 1, limit: 2 });
    const table = journalPageTable(result);
    expect(table.headers).toHaveLength(11);
    expect(table.rows).toHaveLength(4);
    expect(table.rows[0][0]).toBe('01/03/2026');
    expect(table.money).toEqual([8, 9]);
  });
});

describe('getTrialBalanceData', () => {
  beforeEach(() => {
    prismaMock.$queryRaw.mockResolvedValue([
      balanceRow('411', 'Clients', 0, 1000, 400),
      balanceRow('571', 'Caisse', 500, 0, 700),
      balanceRow('706', 'Honoraires', 0, 0, 600),
      balanceRow('999', 'Compte soldé', 0, 50, 50),
      balanceRow('000', 'Sans mouvement', 0, 0, 0)
    ]);
  });

  it('calcule le contrôle sur tous les comptes et les totaux sur les lignes filtrées', async () => {
    const data = await getTrialBalanceData(TENANT, period, { accountClass: 7 });
    expect(data.lines.map((l: any) => l.accountNumber)).toEqual(['706']);
    expect(data.totals.periodCredit).toBe(600);
    expect(data.totals.periodDebit).toBe(0);
    expect(data.control.periodDebit).toBe(1050);
    expect(data.control.periodCredit).toBe(1750);
  });

  it('écarte les comptes sans ouverture ni mouvement et sépare débit et crédit', async () => {
    const data = await getTrialBalanceData(TENANT, period, {});
    expect(data.lines.map((l: any) => l.accountNumber)).toEqual(['411', '571', '706', '999']);
    const caisse = data.lines.find((l: any) => l.accountNumber === '571');
    expect(caisse).toMatchObject({ openingDebit: 500, closingDebit: 0, closingCredit: 200 });
  });

  it('filtre par numéro (préfixe) ou par intitulé (contient), sans tenir compte de la casse', async () => {
    const byNumber = await getTrialBalanceData(TENANT, period, { search: '57' });
    expect(byNumber.lines.map((l: any) => l.accountNumber)).toEqual(['571']);
    const byName = await getTrialBalanceData(TENANT, period, { search: 'HONOR' });
    expect(byName.lines.map((l: any) => l.accountNumber)).toEqual(['706']);
    const notPrefix = await getTrialBalanceData(TENANT, period, { search: '1' });
    expect(notPrefix.lines).toHaveLength(0);
  });

  it('masque les comptes soldés', async () => {
    const data = await getTrialBalanceData(TENANT, period, { hideZero: true });
    expect(data.lines.map((l: any) => l.accountNumber)).not.toContain('999');
    expect(data.lines).toHaveLength(3);
  });

  it('évalue l’équilibre sur le contrôle, pas sur les lignes filtrées', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      balanceRow('411', 'Clients', 0, 100, 0),
      balanceRow('706', 'Honoraires', 0, 0, 100)
    ]);
    const filtered = await getTrialBalanceData(TENANT, period, { accountClass: 7 });
    // Les lignes filtrées (classe 7) sont déséquilibrées seules, la balance non.
    expect(filtered.totals.periodDebit).toBe(0);
    expect(filtered.isBalanced).toBe(true);

    prismaMock.$queryRaw.mockResolvedValue([
      balanceRow('411', 'Clients', 0, 100, 0),
      balanceRow('706', 'Honoraires', 0, 0, 90)
    ]);
    const unbalanced = await getTrialBalanceData(TENANT, period, { accountClass: 7 });
    expect(unbalanced.isBalanced).toBe(false);
  });

  it('interroge la base une fois, avec le filtre d’agence sur les deux tables', async () => {
    await getTrialBalanceData(TENANT, period, {});
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    const query = prismaMock.$queryRaw.mock.calls[0][0];
    expect(query.text).toContain('e.tenant_id = $');
    expect(query.text).toContain('a.tenant_id = $');
    expect(query.text).toContain('"AccountingScope"');
    expect(query.values.filter((v: unknown) => v === TENANT)).toHaveLength(2);
  });
});

describe('getLedgerSummary et listAccounts', () => {
  it('pagine le récapitulatif avec le total serveur et les totaux de tout le filtre', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      balanceRow('411', 'Clients', 0, 1000, 400),
      balanceRow('412', 'Clients douteux', 100, 50, 0),
      balanceRow('571', 'Caisse', 0, 10, 0)
    ]);
    const page = await getLedgerSummary(TENANT, period, { search: '41' }, { page: 2, limit: 1 });
    expect(page.mode).toBe('summary');
    expect(page.total).toBe(2);
    expect(page.items.map((i: any) => i.accountNumber)).toEqual(['412']);
    expect(page.totals).toEqual({ openingBalance: 100, totalDebit: 1050, totalCredit: 400, closingBalance: 750 });
  });

  it('cherche les comptes de l’agence par numéro ou intitulé', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.chartOfAccount.findMany.mockResolvedValue([]);
    await listAccounts(TENANT, { search: 'cli', withMovements: true, period, limit: 20 });
    const args = prismaMock.chartOfAccount.findMany.mock.calls[0][0];
    expect(args.where.tenantId).toBe(TENANT);
    expect(args.where.scope).toBe('OPERATIONS');
    expect(args.where.OR).toEqual([
      { accountNumber: { startsWith: 'cli' } },
      { accountName: { contains: 'cli', mode: 'insensitive' } }
    ]);
    expect(args.orderBy).toEqual({ accountNumber: 'asc' });
    expect(args.take).toBe(20);
  });

  it('comptes mouvementés : restreint aux comptes mouvementés ou à ouverture non nulle (soldé avant la période : absent)', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      balanceRow('411', 'Clients', 0, 100, 0), // mouvementé
      balanceRow('512', 'Banque', 250, 0, 0), // ouverture non nulle, sans mouvement
      balanceRow('4112', 'Clients soldés', 0, 0, 0) // soldé avant la période, sans mouvement : écarté
    ]);
    prismaMock.chartOfAccount.findMany.mockResolvedValue([]);
    await listAccounts(TENANT, { withMovements: true, period, limit: 20 });
    const args = prismaMock.chartOfAccount.findMany.mock.calls[0][0];
    expect(args.where.id).toEqual({ in: ['id-411', 'id-512'] });
    expect(args.where.journalLines).toBeUndefined();
  });

  it('sans withMovements : aucun filtre par mouvement ni requête brute', async () => {
    prismaMock.chartOfAccount.findMany.mockResolvedValue([]);
    await listAccounts(TENANT, { limit: 20 });
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(prismaMock.chartOfAccount.findMany.mock.calls[0][0].where.id).toBeUndefined();
  });
});

describe('getAccountLedger', () => {
  const account = { id: 'acc-571', accountNumber: '571', accountName: 'Caisse', accountClass: 5 };

  function rawLine(n: number, debit: number, credit: number, running: number) {
    return {
      id: `l${n}`,
      entry_id: `e${n}`,
      entry_date: new Date(`2026-02-${String(n).padStart(2, '0')}T00:00:00Z`),
      reference: `P${n}`,
      journal_code: 'CA',
      label: `Ligne ${n}`,
      third_party: null,
      funds_nature: null,
      debit,
      credit,
      running
    };
  }

  // Cumul qu'établirait PostgreSQL sur l'ensemble des lignes du compte.
  const all = [rawLine(1, 100, 0, 100), rawLine(2, 0, 30, 70), rawLine(3, 50, 0, 120), rawLine(4, 0, 20, 100)];

  function setup(opts: { stats?: any } = {}) {
    prismaMock.chartOfAccount.findFirst.mockResolvedValue(account);
    prismaMock.journalEntryLine.aggregate
      .mockResolvedValueOnce({ _sum: { debit: 1500, credit: 500 } })
      .mockResolvedValueOnce({ _sum: { debit: 150, credit: 50 } });
    prismaMock.$queryRaw.mockImplementation(async (query: any) => {
      const text = query.text as string;
      if (text.includes('OVER (')) {
        const limit = query.values.length >= 2 && text.includes('LIMIT') ? query.values : null;
        if (limit) {
          const [lim, off] = query.values.slice(-2);
          return all.slice(off, off + lim);
        }
        return all;
      }
      if (text.includes('COUNT(*)')) return [opts.stats ?? { total: 4, total_debit: 150, total_credit: 50 }];
      // Récapitulatif des comptes mouvementés.
      return [
        balanceRow('411', 'Clients', 0, 10, 0),
        balanceRow('571', 'Caisse', 1000, 150, 50),
        balanceRow('706', 'Honoraires', 0, 0, 10)
      ];
    });
  }

  it('traite le compte d’une autre agence comme un compte inexistant', async () => {
    prismaMock.chartOfAccount.findFirst.mockResolvedValue(null);
    await expect(getAccountLedger(TENANT, period, '571', {}, { page: 1, limit: 2 })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(prismaMock.chartOfAccount.findFirst.mock.calls[0][0].where).toEqual({
      tenantId: TENANT,
      scope: 'OPERATIONS',
      accountNumber: '571'
    });
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('refuse un journal inconnu', async () => {
    prismaMock.chartOfAccount.findFirst.mockResolvedValue(account);
    prismaMock.accountingJournal.findFirst.mockResolvedValue(null);
    await expect(
      getAccountLedger(TENANT, period, '571', { journal: 'XX' }, { page: 1, limit: 2 })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('écrit une requête à fenêtre, filtrée par agence sur les deux tables, avec LIMIT/OFFSET en paramètres', async () => {
    setup();
    await getAccountLedger(TENANT, period, '571', {}, { page: 2, limit: 2 });
    const queries = prismaMock.$queryRaw.mock.calls.map((c: any[]) => c[0]);
    const lines = queries.find((q: any) => q.text.includes('OVER ('));
    expect(lines.text).toContain('UNBOUNDED PRECEDING');
    expect(lines.text).toContain('ROW_NUMBER() OVER (');
    expect(lines.text).toMatch(/e\.tenant_id = \$\d+/);
    expect(lines.text).toMatch(/a\.tenant_id = \$\d+/);
    expect(lines.text).toMatch(/LIMIT \$\d+ OFFSET \$\d+/);
    expect(lines.values.slice(-2)).toEqual([2, 2]);
    expect(lines.values.filter((v: unknown) => v === TENANT).length).toBeGreaterThanOrEqual(4);
    expect(lines.text).not.toContain(TENANT);
    const stats = queries.find((q: any) => q.text.includes('COUNT(*)'));
    expect(stats.text).toMatch(/e\.tenant_id = \$\d+/);
    expect(stats.text).toMatch(/a\.tenant_id = \$\d+/);
  });

  it('n’ajoute ni LIMIT ni OFFSET pour “all”', async () => {
    setup();
    await getAccountLedger(TENANT, period, '571', {}, 'all');
    const lines = prismaMock.$queryRaw.mock.calls.map((c: any[]) => c[0]).find((q: any) => q.text.includes('OVER ('));
    expect(lines.text).not.toContain('LIMIT');
    expect(lines.text).not.toContain('OFFSET');
  });

  it('la page 2 reprend au solde de fin de la page 1', async () => {
    setup();
    const page1 = await getAccountLedger(TENANT, period, '571', {}, { page: 1, limit: 2 });
    setup();
    const page2 = await getAccountLedger(TENANT, period, '571', {}, { page: 2, limit: 2 });

    expect(page1.summary).toEqual({ openingBalance: 1000, totalDebit: 150, totalCredit: 50, closingBalance: 1100 });
    expect(page1.items.map((i: any) => i.balance)).toEqual([1100, 1070]);
    const lastOfPage1 = page1.items[page1.items.length - 1];
    const firstOfPage2 = page2.items[0];
    expect(firstOfPage2.balance).toBe(lastOfPage1.balance + firstOfPage2.debit - firstOfPage2.credit);
    expect(firstOfPage2.balance).toBe(1120);
    expect(page2.total).toBe(4);
    expect(page2.page).toBe(2);
    expect(page2.filteredTotals).toBeNull();
  });

  it('applique recherche et journal après le cumul, avec leurs totaux', async () => {
    setup({ stats: { total: 1, total_debit: 50, total_credit: 0 } });
    prismaMock.accountingJournal.findFirst.mockResolvedValue({ id: 'j' });
    const page = await getAccountLedger(
      TENANT,
      period,
      '571',
      { search: '50%_', journal: 'CA' },
      { page: 1, limit: 20 }
    );
    const lines = prismaMock.$queryRaw.mock.calls.map((c: any[]) => c[0]).find((q: any) => q.text.includes('OVER ('));
    // Les filtres suivent la CTE : le cumul porte sur toutes les lignes.
    expect(lines.text.indexOf('ILIKE')).toBeGreaterThan(lines.text.indexOf(') AS rn'));
    expect(lines.values).toContain('%50\\%\\_%');
    expect(lines.values).toContain('CA');
    expect(page.total).toBe(1);
    expect(page.filteredTotals).toEqual({ debit: 50, credit: 0 });
  });

  it('indique les comptes mouvementés voisins', async () => {
    setup();
    const page = await getAccountLedger(TENANT, period, '571', {}, { page: 1, limit: 2 });
    expect(page.previousAccount).toEqual({ accountNumber: '411', accountName: 'Clients' });
    expect(page.nextAccount).toEqual({ accountNumber: '706', accountName: 'Honoraires' });
  });

  it('exporte ouverture, lignes et clôture', async () => {
    setup();
    const page = await getAccountLedger(TENANT, period, '571', {}, 'all');
    const table = accountLedgerTable(page);
    expect(table.rows[0][5]).toBe('Solde d’ouverture');
    expect(table.rows[0][10]).toBe(1000);
    expect(table.rows).toHaveLength(2 + 4);
    expect(table.rows.at(-1)).toEqual([
      '',
      '',
      '',
      '571',
      'Caisse',
      'Total et solde de clôture',
      '',
      '',
      150,
      50,
      1100
    ]);
  });
});

describe('échappement des jokers', () => {
  it('neutralise %, _ et \\', () => {
    expect(escapeLike('100%_a\\b')).toBe('100\\%\\_a\\\\b');
    expect(containsPattern('a_b')).toBe('%a\\_b%');
  });
});
