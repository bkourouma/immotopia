import ExcelJS from 'exceljs';
import { toCsvString } from '../csv';
import { MandantFundsNature } from '@prisma/client';
import { prisma } from '../../utils/database';
import { badRequest } from '../errors';
import type { TrialBalanceData } from './types';
import { roundMoney } from '../finance/money';
import { matchesAccountSearch } from './queries/balance';
import { cleanSearch } from './queries/sql';

/**
 * Exports comptables de la comptabilité opérationnelle de l'agence — lot 8.
 *
 * Journal, grand livre et balance générale sur une période, en JSON pour
 * l'écran et en CSV ou Excel pour le cabinet comptable. La comptabilité des
 * copropriétés est à part (portée SYNDICATE) et n'y entre pas.
 *
 * Les écritures de la gestion locative sont synchronisées hors du chemin des
 * lectures (ordonnanceur lancé par le contrôleur) : rien ici n'écrit.
 * Les lectures paginées vivent dans `queries/` ; ce fichier garde les
 * primitives communes, les fichiers (CSV, Excel) et le grand livre complet.
 */

export const SCOPE = 'OPERATIONS' as const;

export interface Period {
  from: Date;
  to: Date;
  fromLabel: string;
  toLabel: string;
}

function parseIsoDate(value: string, label: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw badRequest(`${label} attendue au format AAAA-MM-JJ`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCDate() !== d) throw badRequest(`${label} n'existe pas`);
  return date;
}

/** Période d'un export : dates incluses, du 1er janvier de l'année à aujourd'hui par défaut. */
export function parsePeriod(query: { from?: unknown; to?: unknown }, now: Date = new Date()): Period {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const fromLabel = typeof query.from === 'string' && query.from ? query.from : `${now.getUTCFullYear()}-01-01`;
  const toLabel = typeof query.to === 'string' && query.to ? query.to : iso(now);
  const from = parseIsoDate(fromLabel, 'La date de début');
  const toStart = parseIsoDate(toLabel, 'La date de fin');
  if (from.getTime() > toStart.getTime()) throw badRequest('La date de début est postérieure à la date de fin');
  const to = new Date(toStart.getTime() + 24 * 3600 * 1000 - 1);
  return { from, to, fromLabel, toLabel };
}

export interface AsOfDate {
  date: Date;
  label: string;
}

/** Date d'arrêté d'un état : incluse jusqu'à sa dernière milliseconde, aujourd'hui par défaut. */
export function parseAsOfDate(query: { date?: unknown }, now: Date = new Date()): AsOfDate {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const label = typeof query.date === 'string' && query.date ? query.date : iso(now);
  const start = parseIsoDate(label, 'La date');
  const date = new Date(start.getTime() + 24 * 3600 * 1000 - 1);
  return { date, label };
}

export const amount = (value: unknown) => roundMoney(Number(value ?? 0));

/** Libellés français des natures de fonds de mandant (lot 10). */
export const NATURE_LABELS: Record<MandantFundsNature, string> = {
  CURRENT: 'Compte courant',
  DEPOSIT: 'Dépôt de garantie',
  UNALLOCATED: 'À affecter'
};

// ---------------------------------------------------------------------------
// Grand livre et balance
// ---------------------------------------------------------------------------

/** Soldes (débit − crédit) de chaque compte avant la période. */
async function openingBalances(tenantId: string, before: Date) {
  const grouped = await prisma.journalEntryLine.groupBy({
    by: ['accountId'],
    where: {
      account: { tenantId, scope: SCOPE },
      entry: { tenantId, entryDate: { lt: before } }
    },
    _sum: { debit: true, credit: true }
  });
  return new Map(grouped.map(row => [row.accountId, roundMoney(amount(row._sum.debit) - amount(row._sum.credit))]));
}

async function accountsById(tenantId: string, ids: string[]) {
  const accounts = await prisma.chartOfAccount.findMany({
    where: { tenantId, scope: SCOPE, id: { in: ids } },
    select: { id: true, accountNumber: true, accountName: true }
  });
  return new Map(accounts.map(a => [a.id, a]));
}

/**
 * Grand livre COMPLET (tous les comptes mouvementés) pour l'export : les
 * écrans lisent `queries/ledger.ts`. Lignes regroupées par compte en une
 * passe, tri départagé [date, création de l'écriture, écriture, ligne].
 */
export async function getGeneralLedger(tenantId: string, period: Period, search?: string) {
  const [opening, lines] = await Promise.all([
    openingBalances(tenantId, period.from),
    prisma.journalEntryLine.findMany({
      where: {
        account: { tenantId, scope: SCOPE },
        entry: { tenantId, entryDate: { gte: period.from, lte: period.to } }
      },
      select: {
        id: true,
        accountId: true,
        label: true,
        debit: true,
        credit: true,
        fundsNature: true,
        createdAt: true,
        thirdParty: { select: { label: true } },
        entry: {
          select: { id: true, entryDate: true, createdAt: true, reference: true, journal: { select: { code: true } } }
        }
      }
    })
  ]);

  type LedgerLine = (typeof lines)[number];
  const linesByAccount = new Map<string, LedgerLine[]>();
  for (const line of lines) {
    const list = linesByAccount.get(line.accountId);
    if (list) list.push(line);
    else linesByAccount.set(line.accountId, [line]);
  }
  const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const compareLines = (a: LedgerLine, b: LedgerLine) =>
    a.entry.entryDate.getTime() - b.entry.entryDate.getTime() ||
    a.entry.createdAt.getTime() - b.entry.createdAt.getTime() ||
    compareStrings(a.entry.id, b.entry.id) ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    compareStrings(a.id, b.id);

  const needle = cleanSearch(search);
  const ids = Array.from(new Set([...opening.keys(), ...linesByAccount.keys()]));
  const byId = await accountsById(tenantId, ids);

  const accounts = ids
    .map(id => {
      const account = byId.get(id);
      const own = (linesByAccount.get(id) ?? []).sort(compareLines);
      const openingBalance = opening.get(id) ?? 0;
      let balance = openingBalance;
      let totalDebit = 0;
      let totalCredit = 0;
      const rows = own.map(l => {
        const debit = amount(l.debit);
        const credit = amount(l.credit);
        totalDebit += debit;
        totalCredit += credit;
        balance = roundMoney(balance + debit - credit);
        return {
          date: l.entry.entryDate.toISOString(),
          journalCode: l.entry.journal.code,
          reference: l.entry.reference,
          label: l.label ?? '',
          thirdParty: l.thirdParty?.label ?? null,
          nature: l.fundsNature ? NATURE_LABELS[l.fundsNature] : null,
          debit,
          credit,
          balance
        };
      });
      return {
        accountNumber: account?.accountNumber ?? '',
        accountName: account?.accountName ?? '',
        openingBalance,
        lines: rows,
        totalDebit: roundMoney(totalDebit),
        totalCredit: roundMoney(totalCredit),
        closingBalance: balance
      };
    })
    // Un compte sans solde d'ouverture ni mouvement n'a rien à dire.
    .filter(a => a.lines.length > 0 || a.openingBalance !== 0)
    // Même règle que le récapitulatif affiché : l'export reflète la recherche.
    .filter(a => !needle || matchesAccountSearch(a, needle))
    .sort((a, b) => compareStrings(a.accountNumber, b.accountNumber));

  return { from: period.fromLabel, to: period.toLabel, accounts };
}

// ---------------------------------------------------------------------------
// Fichiers
// ---------------------------------------------------------------------------

export type Cell = string | number;
export interface Table {
  sheet: string;
  headers: string[];
  rows: Cell[][];
  /** Index des colonnes de montants. */
  money: number[];
}

/**
 * CSV pour Excel en français : `;`, virgule décimale, UTF-8 avec BOM, CRLF.
 * Un champ contenant `;`, un guillemet ou un saut de ligne est entre guillemets.
 */
export function toCsv(table: Table): string {
  const money = (value: Cell, index: number): Cell =>
    typeof value === 'number' && table.money.includes(index) ? String(value).replace('.', ',') : value;
  const rows = [table.headers, ...table.rows].map(row => row.map(money));
  return toCsvString(rows, { separator: ';' }) + '\r\n';
}

export async function toXlsx(tables: Table[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ImmoTopia';
  for (const table of tables) {
    const sheet = workbook.addWorksheet(table.sheet.slice(0, 31));
    sheet.addRow(table.headers).font = { bold: true };
    for (const row of table.rows) sheet.addRow(row);
    table.headers.forEach((header, index) => {
      const column = sheet.getColumn(index + 1);
      column.width = Math.min(60, Math.max(12, header.length + 2));
      if (table.money.includes(index)) column.numFmt = '#,##0';
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export const day = (isoDate: string) => isoDate.slice(0, 10).split('-').reverse().join('/');

export function ledgerTable(data: Awaited<ReturnType<typeof getGeneralLedger>>): Table {
  const rows: Cell[][] = [];
  for (const account of data.accounts) {
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
      account.openingBalance
    ]);
    for (const line of account.lines) {
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
      account.totalDebit,
      account.totalCredit,
      account.closingBalance
    ]);
  }
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

export function trialBalanceTable(data: TrialBalanceData): Table {
  const t = data.totals;
  return {
    sheet: 'Balance',
    headers: [
      'Compte',
      'Intitulé',
      'Ouverture débit',
      'Ouverture crédit',
      'Mouvements débit',
      'Mouvements crédit',
      'Solde débiteur',
      'Solde créditeur'
    ],
    rows: [
      ...data.lines.map(l => [
        l.accountNumber,
        l.accountName,
        l.openingDebit,
        l.openingCredit,
        l.periodDebit,
        l.periodCredit,
        l.closingDebit,
        l.closingCredit
      ]),
      ['', 'Total', t.openingDebit, t.openingCredit, t.periodDebit, t.periodCredit, t.closingDebit, t.closingCredit]
    ],
    money: [2, 3, 4, 5, 6, 7]
  };
}
