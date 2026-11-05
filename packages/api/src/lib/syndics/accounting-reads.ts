import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { dayEnd, dayStart, zDay } from '../../utils/list-query-schemas';
import { DEFAULT_MAX_PAGE } from '../../utils/pagination-helper';
import { prisma } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import { escapeLike } from '../../utils/like-escape';
import { tenantIsolationError } from '../errors';
import { roundMoney } from '../finance/money';
import { assertSyndicateTenantOwnership } from './queries';

/**
 * Lectures comptables d'une copropriete, paginees et agregees en SQL (lot SYN-A).
 *
 * - journal des ecritures : `findMany` + `count` sur le meme `where`, filtres
 *   serveur (journal, compte, statut, periode, recherche libre) ;
 * - grand livre d'UN compte : synthese (ouverture, mouvements, cloture) en
 *   agregats SQL, lignes paginees avec un solde progressif calcule par une
 *   fonction de fenetre sur TOUTES les lignes de la periode — la recherche
 *   filtre l'affichage, jamais le cumul, et le solde reste juste d'une page a
 *   l'autre ;
 * - balance : un agregat `GROUP BY` compte (jamais les lignes en memoire),
 *   mouvements de la periode et solde = debit - credit ;
 * - plan comptable : la liste actuelle, avec recherche, classes et plafond.
 *
 * Isolation : la copropriete est verifiee d'abord (`assertSyndicateTenantOwnership`),
 * puis chaque requete porte EXPLICITEMENT l'agence et la copropriete — dans le
 * `where` Prisma comme dans le SQL brut (`journal_entry_lines` n'a pas de
 * colonne tenant : elle passe par `journal_entries.tenant_id`). Le SQL brut
 * n'utilise que `Prisma.sql` (parametres lies), jamais la variante « Unsafe »
 * ni `Prisma.raw` : aucune saisie n'est concatenee au texte SQL.
 */

// ------------------------------------------------------------------ schemas

/** Une valeur repetee dans la query (?a=1&a=2) est jointe par des virgules. */
const queryText = (raw: unknown) => (Array.isArray(raw) ? raw.join(',') : raw);

/** Parametre optionnel : une chaine vide (ou blanche) est traitee comme absente. */
const optionalQuery = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(raw => {
    const value = queryText(raw);
    return typeof value === 'string' && value.trim() === '' ? undefined : value;
  }, schema.optional());

const searchQuery = optionalQuery(z.string().trim().min(1).max(100));
// Jour aaaa-mm-jj RÉEL (2026-02-31 et 2026-13-45 → 400) : `from` = début du jour,
// `to` = fin du jour INCLUSIVE (23:59:59.999), cf. utils/list-query-schemas.
const fromDayQuery = z.preprocess(queryText, zDay).transform(day => (day ? dayStart(day) : undefined));
const toDayQuery = z.preprocess(queryText, zDay).transform(day => (day ? dayEnd(day) : undefined));
const uuidQuery = optionalQuery(z.string().uuid());
// Borne haute alignée sur la pagination commune : page=100001 → 400, jamais un OFFSET géant.
const pageQuery = optionalQuery(z.coerce.number().int().positive().max(DEFAULT_MAX_PAGE)).transform(
  value => value ?? 1
);
const limitQuery = (fallback: number) =>
  optionalQuery(z.coerce.number().int().positive().max(100)).transform(value => value ?? fallback);

/** Classes de comptes 1 a 9, separees par des virgules (« 4,6 »). */
const accountClassQuery = optionalQuery(
  z
    .string()
    .transform(raw =>
      raw
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.coerce.number().int().min(1).max(9)).min(1).max(9))
).transform(values => (values ? Array.from(new Set(values)) : undefined));

const booleanQuery = optionalQuery(z.enum(['true', 'false']).transform(value => value === 'true'));

const checkDateOrder = (value: { from?: Date; to?: Date }) => !value.from || !value.to || value.from <= value.to;
// Messages relayés tels quels dans la réponse 400 : le middleware d'erreurs les traduit
// à la requête (`t(entry.message)`), le marqueur les déclare à l'extraction i18n.
// @i18n-keys
const dateOrderMessage = {
  message: 'La date de début doit être antérieure ou égale à la date de fin.',
  path: ['from']
};
// @i18n-keys
const ACCOUNT_REQUIRED_MESSAGE = 'Le compte est obligatoire.';

export const accountingEntriesPageQuerySchema = z
  .object({
    page: pageQuery,
    limit: limitQuery(20),
    journalId: uuidQuery,
    accountId: uuidQuery,
    search: searchQuery,
    status: optionalQuery(z.enum(['locked', 'open'])),
    from: fromDayQuery,
    to: toDayQuery
  })
  .refine(checkDateOrder, dateOrderMessage);

export const accountLedgerQuerySchema = z
  .object({
    accountId: z.preprocess(queryText, z.string({ required_error: ACCOUNT_REQUIRED_MESSAGE }).uuid()),
    from: fromDayQuery,
    to: toDayQuery,
    search: searchQuery,
    page: pageQuery,
    limit: limitQuery(50)
  })
  .refine(checkDateOrder, dateOrderMessage);

export const trialBalanceQuerySchema = z
  .object({
    from: fromDayQuery,
    to: toDayQuery,
    accountClass: accountClassQuery,
    hideZero: booleanQuery.transform(value => value ?? false),
    search: searchQuery
  })
  .refine(checkDateOrder, dateOrderMessage);

export const chartOfAccountsSearchQuerySchema = z.object({
  // Meme lecture que le handler historique : tout sauf « false » vaut « actifs seulement ».
  onlyActive: z.unknown().transform(raw => queryText(raw) !== 'false'),
  search: searchQuery,
  accountClass: accountClassQuery,
  // Absent : pas de plafond (le plan entier, comportement historique).
  limit: optionalQuery(z.coerce.number().int().positive().max(100))
});

export type AccountingEntriesPageQuery = z.infer<typeof accountingEntriesPageQuerySchema>;
export type AccountLedgerQuery = z.infer<typeof accountLedgerQuerySchema>;
export type TrialBalanceQuery = z.infer<typeof trialBalanceQuerySchema>;
export type ChartOfAccountsSearchQuery = z.infer<typeof chartOfAccountsSearchQuerySchema>;

// ------------------------------------------------------------------ helpers

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Traduit par le middleware d'erreurs (le texte français est la clé) ; marqueur = extraction.
// @i18n-keys
const ACCOUNT_NOT_FOUND = 'Compte comptable introuvable pour cette copropriété.';

/**
 * Copropriete de l'agence, sinon la meme erreur que `assertSyndicateTenantOwnership`
 * (un identifiant mal forme ne doit pas devenir une erreur SQL, ni se distinguer
 * d'une copropriete inexistante ou d'une autre agence).
 */
async function assertSyndicateOfTenant(tenantId: string, syndicateId: string) {
  if (!UUID_PATTERN.test(syndicateId ?? '')) {
    throw tenantIsolationError('Copropriete introuvable pour ce tenant');
  }
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
}

const toMoney = (value: unknown) => roundMoney(Number(value ?? 0));

function pageMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/**
 * `DateTime` Prisma = `timestamp(3)` sans fuseau, stocke en UTC. On lie la
 * borne comme texte UTC puis on la type explicitement : aucune conversion par
 * le fuseau de la session ne peut decaler la periode.
 */
function sqlTimestamp(date: Date): Prisma.Sql {
  const text = date.toISOString().replace('T', ' ').replace('Z', '');
  return Prisma.sql`${text}::timestamp`;
}

/** Bornes de periode sur `e.entry_date` (TRUE sans borne). */
function periodCondition(range: { from?: Date; to?: Date }): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (range.from) parts.push(Prisma.sql`e.entry_date >= ${sqlTimestamp(range.from)}`);
  if (range.to) parts.push(Prisma.sql`e.entry_date <= ${sqlTimestamp(range.to)}`);
  return parts.length > 0 ? Prisma.join(parts, ' AND ') : Prisma.sql`TRUE`;
}

/** Motif ILIKE « contient », `\`, `%` et `_` echappes (echappement par defaut de PostgreSQL : `\`). */
export function containsPattern(search: string): string {
  return `%${escapeLike(search)}%`;
}

// ------------------------------------------------------------------ journal des ecritures

const ENTRY_LINE_SELECT = {
  id: true,
  entryId: true,
  accountId: true,
  lotId: true,
  debit: true,
  credit: true,
  label: true,
  createdAt: true,
  account: { select: { id: true, accountNumber: true, accountName: true } },
  lot: { select: { id: true, lotNumber: true } }
} satisfies Prisma.JournalEntryLineSelect;

export function buildJournalEntriesWhere(
  tenantId: string,
  syndicateId: string,
  query: Pick<AccountingEntriesPageQuery, 'journalId' | 'accountId' | 'search' | 'status' | 'from' | 'to'>
): Prisma.JournalEntryWhereInput {
  const and: Prisma.JournalEntryWhereInput[] = [];
  // Un journal ou un compte d'une autre copropriete reste dans le filtre, a
  // cote de `journal.syndicateId` : il ne ramene simplement rien.
  if (query.accountId) and.push({ lines: { some: { accountId: query.accountId } } });
  if (query.search) {
    const contains = { contains: escapeLike(query.search), mode: 'insensitive' as const };
    and.push({
      OR: [{ reference: contains }, { description: contains }, { lines: { some: { label: contains } } }]
    });
  }

  return {
    tenantId,
    journal: { syndicateId },
    ...(query.journalId ? { journalId: query.journalId } : {}),
    ...(query.status ? { isLocked: query.status === 'locked' } : {}),
    ...(query.from || query.to
      ? {
          entryDate: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {})
          }
        }
      : {}),
    ...(and.length > 0 ? { AND: and } : {})
  };
}

export async function listAccountingEntriesPage(
  tenantId: string,
  syndicateId: string,
  query: AccountingEntriesPageQuery
) {
  await assertSyndicateOfTenant(tenantId, syndicateId);
  const where = buildJournalEntriesWhere(tenantId, syndicateId, query);

  const [rows, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      include: {
        journal: { select: { id: true, code: true, label: true, journalType: true, fiscalYear: true } },
        lines: { select: ENTRY_LINE_SELECT, orderBy: [{ createdAt: 'asc' }] }
      },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit
    }),
    prisma.journalEntry.count({ where })
  ]);

  const items = rows.map(entry => ({
    ...entry,
    lines: entry.lines.map(line => ({ ...line, debit: toMoney(line.debit), credit: toMoney(line.credit) }))
  }));

  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

// ------------------------------------------------------------------ grand livre d'un compte

type LedgerSummaryRow = {
  opening_balance: unknown;
  period_debit: unknown;
  period_credit: unknown;
  line_count: unknown;
};

type LedgerLineRow = {
  id: string;
  entry_id: string;
  entry_date: Date | string;
  reference: string;
  description: string;
  journal_code: string | null;
  label: string;
  lot_id: string | null;
  lot_number: string | null;
  debit: unknown;
  credit: unknown;
  cumulative: unknown;
};

/** Lignes du compte dans la copropriete ET l'agence (jointures + filtres explicites). */
function ledgerScope(tenantId: string, syndicateId: string, accountId: string): Prisma.Sql {
  return Prisma.sql`e.tenant_id = ${tenantId}
    AND j.syndicate_id = ${syndicateId}::uuid
    AND l.account_id = ${accountId}::uuid`;
}

const LEDGER_JOINS = Prisma.sql`FROM journal_entry_lines l
  JOIN journal_entries e ON e.id = l.entry_id
  JOIN accounting_journals j ON j.id = e.journal_id`;

/** Ordre chronologique total du grand livre (l.id departage les ex aequo). */
const LEDGER_ORDER = Prisma.sql`e.entry_date, e.created_at, l.created_at, l.id`;

export function buildLedgerSummarySql(
  tenantId: string,
  syndicateId: string,
  accountId: string,
  range: { from?: Date; to?: Date }
): Prisma.Sql {
  const period = periodCondition(range);
  const opening = range.from
    ? Prisma.sql`COALESCE(SUM(l.debit - l.credit) FILTER (WHERE e.entry_date < ${sqlTimestamp(range.from)}), 0)`
    : Prisma.sql`0`;
  // Rien apres la fin de periode ne compte, ni pour l'ouverture ni pour la periode.
  const upperBound = range.to ? Prisma.sql`AND e.entry_date <= ${sqlTimestamp(range.to)}` : Prisma.empty;

  return Prisma.sql`SELECT
      ${opening} AS opening_balance,
      COALESCE(SUM(l.debit) FILTER (WHERE ${period}), 0) AS period_debit,
      COALESCE(SUM(l.credit) FILTER (WHERE ${period}), 0) AS period_credit,
      COUNT(*) FILTER (WHERE ${period}) AS line_count
    ${LEDGER_JOINS}
    WHERE ${ledgerScope(tenantId, syndicateId, accountId)}
      ${upperBound}`;
}

/**
 * Page du grand livre. La CTE porte TOUTES les lignes de la periode et leur
 * cumul (fenetre ordonnee, cadre ROWS : chaque ligne a son propre cumul, meme
 * a date egale). La recherche et la pagination s'appliquent ensuite, sur la
 * requete externe : elles choisissent les lignes affichees sans toucher au
 * cumul de chacune.
 */
export function buildLedgerPageSql(
  tenantId: string,
  syndicateId: string,
  accountId: string,
  query: { from?: Date; to?: Date; search?: string; page: number; limit: number }
): Prisma.Sql {
  const searchFilter = query.search
    ? (() => {
        const pattern = containsPattern(query.search);
        return Prisma.sql`WHERE (pl.reference ILIKE ${pattern} OR pl.description ILIKE ${pattern} OR pl.label ILIKE ${pattern})`;
      })()
    : Prisma.empty;
  const offset = (query.page - 1) * query.limit;

  return Prisma.sql`WITH period_lines AS (
      SELECT
        l.id,
        l.entry_id,
        e.entry_date,
        e.created_at AS entry_created_at,
        l.created_at AS line_created_at,
        e.reference,
        e.description,
        j.code AS journal_code,
        l.label,
        l.lot_id,
        sl.lot_number,
        l.debit,
        l.credit,
        SUM(l.debit - l.credit) OVER (ORDER BY ${LEDGER_ORDER} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative
      ${LEDGER_JOINS}
      LEFT JOIN syndicate_lots sl ON sl.id = l.lot_id AND sl.syndicate_id = ${syndicateId}::uuid
      WHERE ${ledgerScope(tenantId, syndicateId, accountId)}
        AND ${periodCondition(query)}
    )
    SELECT pl.id, pl.entry_id, pl.entry_date, pl.reference, pl.description, pl.journal_code, pl.label,
      pl.lot_id, pl.lot_number, pl.debit, pl.credit, pl.cumulative
    FROM period_lines pl
    ${searchFilter}
    ORDER BY pl.entry_date, pl.entry_created_at, pl.line_created_at, pl.id
    LIMIT ${query.limit} OFFSET ${offset}`;
}

/** Nombre de lignes de la periode qui repondent a la recherche. */
export function buildLedgerSearchCountSql(
  tenantId: string,
  syndicateId: string,
  accountId: string,
  query: { from?: Date; to?: Date; search: string }
): Prisma.Sql {
  const pattern = containsPattern(query.search);
  return Prisma.sql`SELECT COUNT(*) AS total
    ${LEDGER_JOINS}
    WHERE ${ledgerScope(tenantId, syndicateId, accountId)}
      AND ${periodCondition(query)}
      AND (e.reference ILIKE ${pattern} OR e.description ILIKE ${pattern} OR l.label ILIKE ${pattern})`;
}

export async function getAccountLedger(tenantId: string, syndicateId: string, query: AccountLedgerQuery) {
  await assertSyndicateOfTenant(tenantId, syndicateId);

  const account = await prisma.chartOfAccount.findFirst({
    where: { id: query.accountId, syndicateId, tenantId },
    select: { id: true, accountNumber: true, accountName: true, accountClass: true, accountType: true }
  });
  if (!account) throw new NotFoundError(ACCOUNT_NOT_FOUND);

  const range = { from: query.from, to: query.to };
  const [summaryRows, lineRows, searchCountRows] = await Promise.all([
    prisma.$queryRaw<LedgerSummaryRow[]>(buildLedgerSummarySql(tenantId, syndicateId, account.id, range)),
    prisma.$queryRaw<LedgerLineRow[]>(buildLedgerPageSql(tenantId, syndicateId, account.id, query)),
    query.search
      ? prisma.$queryRaw<Array<{ total: unknown }>>(
          buildLedgerSearchCountSql(tenantId, syndicateId, account.id, { ...range, search: query.search })
        )
      : Promise.resolve(null)
  ]);

  const summaryRow = summaryRows[0];
  const openingBalance = toMoney(summaryRow?.opening_balance);
  const periodDebit = toMoney(summaryRow?.period_debit);
  const periodCredit = toMoney(summaryRow?.period_credit);
  const lineCount = Number(summaryRow?.line_count ?? 0);
  const total = searchCountRows ? Number(searchCountRows[0]?.total ?? 0) : lineCount;

  const items = lineRows.map(row => ({
    id: row.id,
    entryId: row.entry_id,
    entryDate: new Date(row.entry_date).toISOString(),
    reference: row.reference,
    description: row.description,
    journalCode: row.journal_code ?? null,
    label: row.label,
    lotId: row.lot_id ?? null,
    lotNumber: row.lot_number ?? null,
    debit: toMoney(row.debit),
    credit: toMoney(row.credit),
    runningBalance: roundMoney(openingBalance + Number(row.cumulative ?? 0))
  }));

  return {
    account,
    summary: {
      openingBalance,
      periodDebit,
      periodCredit,
      closingBalance: roundMoney(openingBalance + periodDebit - periodCredit),
      lineCount
    },
    items,
    pagination: pageMeta(query.page, query.limit, total)
  };
}

// ------------------------------------------------------------------ balance

type TrialBalanceRow = {
  account_id: string;
  account_number: string;
  account_name: string;
  account_class: number | bigint;
  total_debit: unknown;
  total_credit: unknown;
};

/**
 * Mouvements de la periode par compte :
 * lignes des ecritures des journaux de la copropriete, sans solde d'ouverture.
 * Une ligne par compte mouvemente : quelques centaines au plus.
 */
export function buildTrialBalanceSql(tenantId: string, syndicateId: string, range: { from?: Date; to?: Date }) {
  return Prisma.sql`SELECT
      a.id AS account_id,
      a.account_number,
      a.account_name,
      a.account_class,
      COALESCE(SUM(l.debit), 0) AS total_debit,
      COALESCE(SUM(l.credit), 0) AS total_credit
    FROM journal_entry_lines l
    JOIN journal_entries e ON e.id = l.entry_id
    JOIN accounting_journals j ON j.id = e.journal_id
    JOIN chart_of_accounts a ON a.id = l.account_id
    WHERE e.tenant_id = ${tenantId}
      AND j.syndicate_id = ${syndicateId}::uuid
      AND ${periodCondition(range)}
    GROUP BY a.id, a.account_number, a.account_name, a.account_class`;
}

const sumTotals = (items: Array<{ totalDebit: number; totalCredit: number }>) =>
  items.reduce(
    (acc, item) => ({
      totalDebit: roundMoney(acc.totalDebit + item.totalDebit),
      totalCredit: roundMoney(acc.totalCredit + item.totalCredit)
    }),
    { totalDebit: 0, totalCredit: 0 }
  );

export async function getTrialBalanceAggregated(tenantId: string, syndicateId: string, query: TrialBalanceQuery) {
  await assertSyndicateOfTenant(tenantId, syndicateId);

  const rows = await prisma.$queryRaw<TrialBalanceRow[]>(
    buildTrialBalanceSql(tenantId, syndicateId, { from: query.from, to: query.to })
  );

  const all = rows
    .map(row => {
      const totalDebit = toMoney(row.total_debit);
      const totalCredit = toMoney(row.total_credit);
      return {
        accountId: row.account_id,
        accountNumber: row.account_number,
        accountName: row.account_name,
        accountClass: Number(row.account_class),
        totalDebit,
        totalCredit,
        balance: roundMoney(totalDebit - totalCredit)
      };
    })
    // Meme tri que l'implementation historique (et independant de la collation de la base).
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

  const totals = sumTotals(all);
  const needle = query.search?.toLowerCase();
  const items = all.filter(item => {
    if (query.accountClass && !query.accountClass.includes(item.accountClass)) return false;
    if (query.hideZero && item.balance === 0) return false;
    if (
      needle &&
      !item.accountNumber.toLowerCase().startsWith(needle) &&
      !item.accountName.toLowerCase().includes(needle)
    ) {
      return false;
    }
    return true;
  });

  return {
    items,
    totals: { ...totals, isBalanced: roundMoney(totals.totalDebit) === roundMoney(totals.totalCredit) },
    filteredTotals: sumTotals(items)
  };
}

// ------------------------------------------------------------------ plan comptable

export function buildChartOfAccountsWhere(
  tenantId: string,
  syndicateId: string,
  query: Pick<ChartOfAccountsSearchQuery, 'onlyActive' | 'search' | 'accountClass'>
): Prisma.ChartOfAccountWhereInput {
  return {
    syndicateId,
    tenantId,
    ...(query.onlyActive ? { isActive: true } : {}),
    ...(query.accountClass ? { accountClass: { in: query.accountClass } } : {}),
    ...(query.search
      ? {
          OR: [
            { accountNumber: { startsWith: escapeLike(query.search), mode: 'insensitive' } },
            { accountName: { contains: escapeLike(query.search), mode: 'insensitive' } }
          ]
        }
      : {})
  };
}

/** Plan comptable avec recherche, classes et plafond. */
export async function searchChartOfAccounts(tenantId: string, syndicateId: string, query: ChartOfAccountsSearchQuery) {
  await assertSyndicateOfTenant(tenantId, syndicateId);

  return prisma.chartOfAccount.findMany({
    where: buildChartOfAccountsWhere(tenantId, syndicateId, query),
    include: { parent: true },
    orderBy: [{ accountNumber: 'asc' }, { createdAt: 'asc' }],
    ...(query.limit ? { take: query.limit } : {})
  });
}
