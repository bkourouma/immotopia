import ExcelJS from 'exceljs';
import { prisma } from '../../utils/database';
import { badRequest } from '../errors';
import { roundMoney } from '../finance/money';
import { syncAllOwnerAccounts } from '../owner-account/service';

/**
 * Exports comptables de la comptabilité opérationnelle de l'agence — lot 8.
 *
 * Journal, grand livre et balance générale sur une période, en JSON pour
 * l'écran et en CSV ou Excel pour le cabinet comptable. La comptabilité des
 * copropriétés est à part (portée SYNDICATE) et n'y entre pas.
 *
 * Les écritures de la gestion locative s'écrivent à la consultation des
 * comptes propriétaires (`lib/owner-account/sync.ts`) : chaque lecture
 * commence donc par les mettre à jour, sans quoi un export oublierait les
 * loyers encaissés depuis la dernière consultation.
 */

const SCOPE = 'OPERATIONS' as const;

export interface Period {
  from: Date;
  to: Date;
  fromLabel: string;
  toLabel: string;
}

/** Période d'un export : dates incluses, du 1er janvier de l'année à aujourd'hui par défaut. */
export function parsePeriod(query: { from?: unknown; to?: unknown }, now: Date = new Date()): Period {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const fromLabel = typeof query.from === 'string' && query.from ? query.from : `${now.getUTCFullYear()}-01-01`;
  const toLabel = typeof query.to === 'string' && query.to ? query.to : iso(now);
  const parse = (value: string, label: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw badRequest(`${label} attendue au format AAAA-MM-JJ`);
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCDate() !== d) throw badRequest(`${label} n'existe pas`);
    return date;
  };
  const from = parse(fromLabel, 'La date de début');
  const toStart = parse(toLabel, 'La date de fin');
  if (from.getTime() > toStart.getTime()) throw badRequest('La date de début est postérieure à la date de fin');
  const to = new Date(toStart.getTime() + 24 * 3600 * 1000 - 1);
  return { from, to, fromLabel, toLabel };
}

const amount = (value: unknown) => roundMoney(Number(value ?? 0));

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

export async function getJournal(tenantId: string, period: Period, journalCode?: string) {
  await syncAllOwnerAccounts(tenantId);

  const [journals, entries] = await Promise.all([
    prisma.accountingJournal.findMany({
      where: { tenantId, scope: SCOPE },
      select: { code: true, label: true },
      distinct: ['code'],
      orderBy: { code: 'asc' }
    }),
    prisma.journalEntry.findMany({
      where: {
        tenantId,
        journal: { scope: SCOPE, ...(journalCode ? { code: journalCode } : {}) },
        entryDate: { gte: period.from, lte: period.to }
      },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        entryDate: true,
        reference: true,
        description: true,
        documentType: true,
        voidedByEntryId: true,
        journal: { select: { code: true } },
        lines: {
          select: {
            label: true,
            debit: true,
            credit: true,
            account: { select: { accountNumber: true, accountName: true } }
          }
        }
      }
    })
  ]);

  let debit = 0;
  let credit = 0;
  const rows = entries.map(entry => {
    const lines = entry.lines
      .map(line => ({
        accountNumber: line.account.accountNumber,
        accountName: line.account.accountName,
        label: line.label ?? '',
        debit: amount(line.debit),
        credit: amount(line.credit)
      }))
      // Débits d'abord, puis par compte : l'ordre d'un journal papier.
      .sort((a, b) => (b.debit > 0 ? 1 : 0) - (a.debit > 0 ? 1 : 0) || a.accountNumber.localeCompare(b.accountNumber));
    for (const line of lines) {
      debit += line.debit;
      credit += line.credit;
    }
    return {
      id: entry.id,
      date: entry.entryDate.toISOString(),
      journalCode: entry.journal.code,
      reference: entry.reference,
      description: entry.description,
      documentType: entry.documentType,
      reversed: Boolean(entry.voidedByEntryId),
      lines
    };
  });

  return {
    from: period.fromLabel,
    to: period.toLabel,
    journals,
    entries: rows,
    totals: { debit: roundMoney(debit), credit: roundMoney(credit) }
  };
}

// ---------------------------------------------------------------------------
// Grand livre et balance
// ---------------------------------------------------------------------------

/** Soldes (débit − crédit) de chaque compte avant la période. */
async function openingBalances(tenantId: string, before: Date, accountNumber?: string) {
  const grouped = await prisma.journalEntryLine.groupBy({
    by: ['accountId'],
    where: {
      account: { tenantId, scope: SCOPE, ...(accountNumber ? { accountNumber } : {}) },
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

export async function getGeneralLedger(tenantId: string, period: Period, accountNumber?: string) {
  await syncAllOwnerAccounts(tenantId);

  const [opening, lines] = await Promise.all([
    openingBalances(tenantId, period.from, accountNumber),
    prisma.journalEntryLine.findMany({
      where: {
        account: { tenantId, scope: SCOPE, ...(accountNumber ? { accountNumber } : {}) },
        entry: { tenantId, entryDate: { gte: period.from, lte: period.to } }
      },
      select: {
        accountId: true,
        label: true,
        debit: true,
        credit: true,
        entry: { select: { entryDate: true, createdAt: true, reference: true, journal: { select: { code: true } } } }
      }
    })
  ]);

  const ids = Array.from(new Set([...opening.keys(), ...lines.map(l => l.accountId)]));
  const byId = await accountsById(tenantId, ids);

  const accounts = ids
    .map(id => {
      const account = byId.get(id);
      const own = lines
        .filter(l => l.accountId === id)
        .sort(
          (a, b) =>
            a.entry.entryDate.getTime() - b.entry.entryDate.getTime() ||
            a.entry.createdAt.getTime() - b.entry.createdAt.getTime()
        );
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
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

  return { from: period.fromLabel, to: period.toLabel, accounts };
}

/** Un solde présenté du côté de son signe : débiteur ou créditeur. */
function split(balance: number) {
  return balance >= 0 ? { debit: balance, credit: 0 } : { debit: 0, credit: roundMoney(-balance) };
}

export async function getTrialBalance(tenantId: string, period: Period) {
  await syncAllOwnerAccounts(tenantId);

  const [opening, grouped] = await Promise.all([
    openingBalances(tenantId, period.from),
    prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        account: { tenantId, scope: SCOPE },
        entry: { tenantId, entryDate: { gte: period.from, lte: period.to } }
      },
      _sum: { debit: true, credit: true }
    })
  ]);
  const periodById = new Map(
    grouped.map(g => [g.accountId, { debit: amount(g._sum.debit), credit: amount(g._sum.credit) }])
  );
  const ids = Array.from(new Set([...opening.keys(), ...periodById.keys()]));
  const byId = await accountsById(tenantId, ids);

  const totals = {
    openingDebit: 0,
    openingCredit: 0,
    periodDebit: 0,
    periodCredit: 0,
    closingDebit: 0,
    closingCredit: 0
  };
  const lines = ids
    .map(id => {
      const account = byId.get(id);
      const openingBalance = opening.get(id) ?? 0;
      const p = periodById.get(id) ?? { debit: 0, credit: 0 };
      const o = split(openingBalance);
      const c = split(roundMoney(openingBalance + p.debit - p.credit));
      return {
        accountNumber: account?.accountNumber ?? '',
        accountName: account?.accountName ?? '',
        openingDebit: o.debit,
        openingCredit: o.credit,
        periodDebit: p.debit,
        periodCredit: p.credit,
        closingDebit: c.debit,
        closingCredit: c.credit
      };
    })
    .filter(l => l.openingDebit || l.openingCredit || l.periodDebit || l.periodCredit)
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

  for (const l of lines) {
    totals.openingDebit += l.openingDebit;
    totals.openingCredit += l.openingCredit;
    totals.periodDebit += l.periodDebit;
    totals.periodCredit += l.periodCredit;
    totals.closingDebit += l.closingDebit;
    totals.closingCredit += l.closingCredit;
  }
  for (const key of Object.keys(totals) as Array<keyof typeof totals>) totals[key] = roundMoney(totals[key]);

  return {
    from: period.fromLabel,
    to: period.toLabel,
    lines,
    totals,
    // Chaque écriture est équilibrée à sa création ; une balance qui ne l'est
    // pas trahirait une écriture passée hors du moteur.
    isBalanced: totals.periodDebit === totals.periodCredit && totals.closingDebit === totals.closingCredit
  };
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
  const cell = (value: Cell, index: number) => {
    let text = typeof value === 'number' ? String(value) : value;
    if (typeof value === 'number' && table.money.includes(index)) text = text.replace('.', ',');
    return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [table.headers, ...table.rows].map(row => row.map(cell).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
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

const day = (isoDate: string) => isoDate.slice(0, 10).split('-').reverse().join('/');

export function journalTable(data: Awaited<ReturnType<typeof getJournal>>): Table {
  const rows: Cell[][] = [];
  for (const entry of data.entries) {
    for (const line of entry.lines) {
      rows.push([
        day(entry.date),
        entry.journalCode,
        entry.reference,
        line.accountNumber,
        line.accountName,
        line.label || entry.description,
        line.debit,
        line.credit,
        entry.reversed ? 'Oui' : ''
      ]);
    }
  }
  return {
    sheet: 'Journal',
    headers: [
      'Date',
      'Journal',
      'Pièce',
      'Compte',
      'Intitulé du compte',
      'Libellé',
      'Débit',
      'Crédit',
      'Contre-passée'
    ],
    rows,
    money: [6, 7]
  };
}

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
      account.totalDebit,
      account.totalCredit,
      account.closingBalance
    ]);
  }
  return {
    sheet: 'Grand livre',
    headers: ['Date', 'Journal', 'Pièce', 'Compte', 'Intitulé du compte', 'Libellé', 'Débit', 'Crédit', 'Solde'],
    rows,
    money: [6, 7, 8]
  };
}

export function trialBalanceTable(data: Awaited<ReturnType<typeof getTrialBalance>>): Table {
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
