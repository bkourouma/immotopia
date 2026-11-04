import { Prisma } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { NotFoundError } from '../../../middleware/error-middleware';
import { badRequest } from '../../errors';
import { roundMoney } from '../../finance/money';
import { amount, Cell, day, NATURE_LABELS, Period, SCOPE, Table } from '../service';
import type {
  AccountBalanceRow,
  AccountLedgerPage,
  AccountOption,
  AccountRef,
  AccountSearch,
  BalanceSummary,
  LedgerFilters,
  LedgerLineRow,
  LedgerSummaryPage,
  PageRequest
} from '../types';
import { getAccountBalances, ts } from './account-balances';
import { matchesAccountSearch } from './balance';
import { cleanSearch, compareStrings, containsPattern, escapeLike, paginate, pagedResult } from './sql';

// ---------------------------------------------------------------------------
// Sélecteur de comptes
// ---------------------------------------------------------------------------

export async function listAccounts(tenantId: string, params: AccountSearch): Promise<AccountOption[]> {
  const search = cleanSearch(params.search);
  if (params.withMovements && !params.period)
    throw badRequest('La période est obligatoire pour les comptes mouvementés');

  // Contrat de types.ts : seulement les comptes mouvementés sur la période ou au solde d'ouverture non nul.
  const movedIds =
    params.withMovements && params.period
      ? (await getAccountBalances(tenantId, params.period)).map(row => row.id)
      : undefined;

  const accounts = await prisma.chartOfAccount.findMany({
    where: {
      tenantId,
      scope: SCOPE,
      ...(movedIds ? { id: { in: movedIds } } : {}),
      ...(search
        ? {
            OR: [
              { accountNumber: { startsWith: escapeLike(search) } },
              { accountName: { contains: escapeLike(search), mode: 'insensitive' as const } }
            ]
          }
        : {})
    },
    orderBy: { accountNumber: 'asc' },
    take: params.limit,
    select: { id: true, accountNumber: true, accountName: true, accountClass: true }
  });
  return accounts;
}

// ---------------------------------------------------------------------------
// Grand livre : récapitulatif des comptes
// ---------------------------------------------------------------------------

function sumBalances(rows: AccountBalanceRow[]): BalanceSummary {
  const totals = rows.reduce(
    (acc, r) => ({
      openingBalance: acc.openingBalance + r.openingBalance,
      totalDebit: acc.totalDebit + r.totalDebit,
      totalCredit: acc.totalCredit + r.totalCredit,
      closingBalance: acc.closingBalance + r.closingBalance
    }),
    { openingBalance: 0, totalDebit: 0, totalCredit: 0, closingBalance: 0 }
  );
  return {
    openingBalance: roundMoney(totals.openingBalance),
    totalDebit: roundMoney(totals.totalDebit),
    totalCredit: roundMoney(totals.totalCredit),
    closingBalance: roundMoney(totals.closingBalance)
  };
}

export async function getLedgerSummary(
  tenantId: string,
  period: Period,
  filters: { search?: string },
  page: PageRequest
): Promise<LedgerSummaryPage> {
  const search = cleanSearch(filters.search);
  const all = await getAccountBalances(tenantId, period);
  const filtered = search ? all.filter(r => matchesAccountSearch(r, search)) : all;
  return {
    mode: 'summary',
    from: period.fromLabel,
    to: period.toLabel,
    ...paginate(filtered, page),
    totals: sumBalances(filtered)
  };
}

// ---------------------------------------------------------------------------
// Grand livre d'un compte
// ---------------------------------------------------------------------------

interface RawLedgerLine {
  id: string;
  entry_id: string;
  entry_date: Date;
  reference: string;
  journal_code: string;
  label: string | null;
  third_party: string | null;
  funds_nature: keyof typeof NATURE_LABELS | null;
  debit: unknown;
  credit: unknown;
  running: unknown;
}

interface RawLedgerStats {
  total: unknown;
  total_debit: unknown;
  total_credit: unknown;
}

/** Filtres appliqués sur les colonnes données (`l.label`, `e.reference`, `j.code` ou leurs alias de la CTE). */
function lineFilters(
  columns: { label: string; reference: string; journal: string },
  search: string | undefined,
  journal: string | undefined
) {
  return Prisma.sql`
    ${
      search
        ? Prisma.sql`AND (${Prisma.raw(columns.label)} ILIKE ${containsPattern(search)} OR ${Prisma.raw(columns.reference)} ILIKE ${containsPattern(search)})`
        : Prisma.empty
    }
    ${journal ? Prisma.sql`AND ${Prisma.raw(columns.journal)} = ${journal}` : Prisma.empty}
  `;
}

/** Une ligne d'écriture, sa jointure d'agence : toutes les requêtes brutes filtrent `tenant_id` des deux tables. */
function lineSource(tenantId: string, accountId: string, period: Period) {
  return Prisma.sql`
    FROM journal_entry_lines l
    JOIN journal_entries e ON e.id = l.entry_id AND e.tenant_id = ${tenantId}
    JOIN chart_of_accounts a ON a.id = l.account_id AND a.tenant_id = ${tenantId}
      AND a.scope = 'OPERATIONS'::"AccountingScope"
    JOIN accounting_journals j ON j.id = e.journal_id AND j.tenant_id = ${tenantId}
    LEFT JOIN third_party_accounts tp ON tp.id = l.third_party_account_id AND tp.tenant_id = ${tenantId}
    WHERE l.account_id = ${accountId}::uuid
      AND e.entry_date >= ${ts(period.from)} AND e.entry_date <= ${ts(period.to)}
  `;
}

/** Lignes paginées d'un compte, solde progressif calculé par PostgreSQL sur l'ensemble des lignes de la période. */
export function accountLinesQuery(
  tenantId: string,
  accountId: string,
  period: Period,
  filters: { search?: string; journal?: string },
  page: PageRequest
): Prisma.Sql {
  const order = Prisma.sql`ORDER BY e.entry_date, e.created_at, e.id, l.created_at, l.id`;
  const limit = page === 'all' ? Prisma.empty : Prisma.sql`LIMIT ${page.limit} OFFSET ${(page.page - 1) * page.limit}`;
  return Prisma.sql`
    WITH ordered AS (
      SELECT l.id AS id, e.id AS entry_id, e.entry_date AS entry_date, e.reference AS reference,
        j.code AS journal_code, l.label AS label, tp.label AS third_party,
        l.funds_nature::text AS funds_nature, l.debit AS debit, l.credit AS credit,
        SUM(l.debit - l.credit) OVER (${order} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running,
        ROW_NUMBER() OVER (${order}) AS rn
      ${lineSource(tenantId, accountId, period)}
    )
    SELECT * FROM ordered
    WHERE TRUE ${lineFilters({ label: 'label', reference: 'reference', journal: 'journal_code' }, filters.search, filters.journal)}
    ORDER BY rn
    ${limit}
  `;
}

/** Nombre et totaux des lignes qui passent les filtres (même source, sans fenêtre). */
export function accountStatsQuery(
  tenantId: string,
  accountId: string,
  period: Period,
  filters: { search?: string; journal?: string }
): Prisma.Sql {
  return Prisma.sql`
    SELECT COUNT(*) AS total, COALESCE(SUM(l.debit), 0) AS total_debit, COALESCE(SUM(l.credit), 0) AS total_credit
    ${lineSource(tenantId, accountId, period)}
    ${lineFilters({ label: 'l.label', reference: 'e.reference', journal: 'j.code' }, filters.search, filters.journal)}
  `;
}

export async function getAccountLedger(
  tenantId: string,
  period: Period,
  accountNumber: string,
  filters: LedgerFilters,
  page: PageRequest
): Promise<AccountLedgerPage> {
  // Un compte d'une autre agence ou inexistant lève la même erreur.
  const account = await prisma.chartOfAccount.findFirst({
    where: { tenantId, scope: SCOPE, accountNumber },
    select: { id: true, accountNumber: true, accountName: true, accountClass: true }
  });
  if (!account) throw new NotFoundError('Compte introuvable.');

  const journal = cleanSearch(filters.journal);
  if (journal) {
    const found = await prisma.accountingJournal.findFirst({
      where: { tenantId, scope: SCOPE, code: journal },
      select: { id: true }
    });
    if (!found) throw new NotFoundError('Journal introuvable.');
  }
  const search = cleanSearch(filters.search);
  const filtered = Boolean(search || journal);
  const rowFilters = { search, journal };

  const accountWhere = { accountId: account.id, account: { tenantId } };
  const [openingAgg, periodAgg, balances, rawLines, stats] = await Promise.all([
    prisma.journalEntryLine.aggregate({
      where: { ...accountWhere, entry: { tenantId, entryDate: { lt: period.from } } },
      _sum: { debit: true, credit: true }
    }),
    prisma.journalEntryLine.aggregate({
      where: { ...accountWhere, entry: { tenantId, entryDate: { gte: period.from, lte: period.to } } },
      _sum: { debit: true, credit: true }
    }),
    getAccountBalances(tenantId, period),
    prisma.$queryRaw<RawLedgerLine[]>(accountLinesQuery(tenantId, account.id, period, rowFilters, page)),
    page === 'all' && !filtered
      ? Promise.resolve(null)
      : prisma.$queryRaw<RawLedgerStats[]>(accountStatsQuery(tenantId, account.id, period, rowFilters))
  ]);

  const openingBalance = roundMoney(amount(openingAgg._sum.debit) - amount(openingAgg._sum.credit));
  const totalDebit = amount(periodAgg._sum.debit);
  const totalCredit = amount(periodAgg._sum.credit);
  const summary: BalanceSummary = {
    openingBalance,
    totalDebit,
    totalCredit,
    closingBalance: roundMoney(openingBalance + totalDebit - totalCredit)
  };

  const items: LedgerLineRow[] = rawLines.map(row => ({
    id: row.id,
    entryId: row.entry_id,
    date: new Date(row.entry_date).toISOString(),
    journalCode: row.journal_code,
    reference: row.reference,
    label: row.label ?? '',
    thirdParty: row.third_party ?? null,
    nature: row.funds_nature ? NATURE_LABELS[row.funds_nature] : null,
    debit: amount(row.debit),
    credit: amount(row.credit),
    balance: roundMoney(openingBalance + amount(row.running))
  }));

  const statsRow = stats?.[0];
  const total = statsRow ? Number(statsRow.total) : items.length;
  let filteredTotals: AccountLedgerPage['filteredTotals'] = null;
  if (filtered) {
    filteredTotals = statsRow
      ? { debit: amount(statsRow.total_debit), credit: amount(statsRow.total_credit) }
      : { debit: 0, credit: 0 };
  }

  // Voisins dans la liste des comptes mouvementés (celle du récapitulatif).
  let previousAccount: AccountRef | null = null;
  let nextAccount: AccountRef | null = null;
  for (const b of balances) {
    const cmp = compareStrings(b.accountNumber, account.accountNumber);
    if (cmp < 0) previousAccount = { accountNumber: b.accountNumber, accountName: b.accountName };
    else if (cmp > 0) {
      nextAccount = { accountNumber: b.accountNumber, accountName: b.accountName };
      break;
    }
  }

  return {
    mode: 'account',
    from: period.fromLabel,
    to: period.toLabel,
    account,
    summary,
    filteredTotals,
    previousAccount,
    nextAccount,
    ...pagedResult(items, total, page)
  };
}

// ---------------------------------------------------------------------------
// Fichier
// ---------------------------------------------------------------------------

/** Mêmes colonnes que `ledgerTable` : ouverture, lignes, total et solde de clôture. */
export function accountLedgerTable(data: AccountLedgerPage): Table {
  const { account, summary } = data;
  const rows: Cell[][] = [];
  rows.push([
    '',
    '',
    '',
    account.accountNumber,
    account.accountName,
    'Solde d’ouverture',
    '',
    '',
    '',
    '',
    summary.openingBalance
  ]);
  for (const line of data.items) {
    rows.push([
      day(line.date),
      line.journalCode,
      line.reference,
      account.accountNumber,
      account.accountName,
      line.label,
      line.thirdParty ?? '',
      line.nature ?? '',
      line.debit,
      line.credit,
      line.balance
    ]);
  }
  rows.push([
    '',
    '',
    '',
    account.accountNumber,
    account.accountName,
    'Total et solde de clôture',
    '',
    '',
    summary.totalDebit,
    summary.totalCredit,
    summary.closingBalance
  ]);
  return {
    sheet: 'Grand livre',
    headers: [
      'Date',
      'Journal',
      'Pièce',
      'Compte',
      'Intitulé du compte',
      'Libellé',
      'Tiers',
      'Nature',
      'Débit',
      'Crédit',
      'Solde'
    ],
    rows,
    money: [8, 9, 10]
  };
}
