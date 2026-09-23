import ExcelJS from 'exceljs';
import { MandantFundsNature, Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { badRequest } from '../errors';
import { roundMoney } from '../finance/money';
import { syncAllOwnerAccounts } from '../owner-account/service';
import { DEFAULT_OWNER_FUNDS_ACCOUNT, getAgencyFinanceSettings } from '../settings/finance-settings';

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

const amount = (value: unknown) => roundMoney(Number(value ?? 0));

/** Libellés français des natures de fonds de mandant (lot 10). */
const NATURE_LABELS: Record<MandantFundsNature, string> = {
  CURRENT: 'Compte courant',
  DEPOSIT: 'Dépôt de garantie',
  UNALLOCATED: 'À affecter'
};

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
            fundsNature: true,
            thirdParty: { select: { label: true } },
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
        thirdParty: line.thirdParty?.label ?? null,
        nature: line.fundsNature ? NATURE_LABELS[line.fundsNature] : null,
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
        fundsNature: true,
        thirdParty: { select: { label: true } },
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
        line.thirdParty ?? '',
        line.nature ?? '',
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
      'Tiers',
      'Nature',
      'Débit',
      'Crédit',
      'Contre-passée'
    ],
    rows,
    money: [8, 9]
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

// ---------------------------------------------------------------------------
// Grand livre auxiliaire et balance auxiliaire des mandants — lot 10
// ---------------------------------------------------------------------------

/**
 * Comptes de fonds propriétaires : toute ligne qui porte une nature de fonds
 * de mandant, OU qui est passée sur le compte de fonds propriétaires des
 * paramètres (`4731` par défaut). La seconde condition couvre les lignes
 * historiques du compte, écrites avant que `fundsNature` n'existe.
 *
 * Sens d'affichage : **crédit − débit**, pas l'inverse. Le compte de fonds de
 * mandants est un compte de tiers créditeur par nature (l'agence DOIT les
 * fonds aux propriétaires) ; un solde créditeur — donc positif dans ce sens —
 * se lit comme « dû aux mandants ». C'est l'opposé du sens debit − credit
 * utilisé par `getGeneralLedger` pour un compte d'actif.
 */
function mandantBalance(debit: number, credit: number): number {
  return roundMoney(credit - debit);
}

const UNASSIGNED_OWNER_KEY = '__non_reparti__';
const NATURE_ORDER: MandantFundsNature[] = [
  MandantFundsNature.CURRENT,
  MandantFundsNature.DEPOSIT,
  MandantFundsNature.UNALLOCATED
];

async function fundsAccountNumber(tenantId: string): Promise<string> {
  const settings = await getAgencyFinanceSettings(tenantId);
  return settings.ownerFundsAccountNumber ?? DEFAULT_OWNER_FUNDS_ACCOUNT;
}

async function fundsAccountRecord(tenantId: string, accountNumber: string) {
  return prisma.chartOfAccount.findFirst({
    where: { tenantId, scope: SCOPE, accountNumber },
    select: { id: true, accountNumber: true, accountName: true }
  });
}

/** Solde du compte de fonds propriétaires tout entier (toutes ses lignes), à une date, dans le sens mandant. */
async function fundsAccountGeneralBalance(tenantId: string, accountId: string, upTo: Date): Promise<number> {
  const grouped = await prisma.journalEntryLine.aggregate({
    where: { accountId, entry: { tenantId, entryDate: { lte: upTo } } },
    _sum: { debit: true, credit: true }
  });
  return mandantBalance(amount(grouped._sum.debit), amount(grouped._sum.credit));
}

function fundsLineWhere(tenantId: string, fundsAccountId?: string): Prisma.JournalEntryLineWhereInput {
  const or: Prisma.JournalEntryLineWhereInput[] = [{ fundsNature: { not: null } }];
  if (fundsAccountId) or.push({ accountId: fundsAccountId });
  return {
    account: { tenantId, scope: SCOPE },
    entry: { tenantId },
    OR: or
  };
}

async function thirdPartyLabels(tenantId: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const accounts = await prisma.thirdPartyAccount.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, label: true }
  });
  return new Map(accounts.map(a => [a.id, a.label]));
}

const mandantGroupKey = (ownerId: string | null, nature: MandantFundsNature | null) =>
  `${ownerId ?? UNASSIGNED_OWNER_KEY}|${nature ?? MandantFundsNature.CURRENT}`;

export interface MandantSubledgerLine {
  date: string;
  journalCode: string;
  reference: string;
  label: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface MandantSubledgerNatureGroup {
  nature: MandantFundsNature;
  natureLabel: string;
  openingBalance: number;
  lines: MandantSubledgerLine[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export interface MandantSubledgerOwnerGroup {
  thirdPartyAccountId: string | null;
  /** « Non réparti » pour les lignes sans compte de tiers. */
  ownerLabel: string;
  natures: MandantSubledgerNatureGroup[];
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

/**
 * Grand livre auxiliaire des mandants (lot 10) : les mouvements des comptes
 * de fonds propriétaires, groupés par propriétaire puis par nature, sur une
 * période. Le contrôle compare le total auxiliaire au solde général du
 * compte de fonds propriétaires — ils doivent coïncider, sauf ligne égarée
 * hors du compte paramétré mais tout de même marquée d'une nature de fonds.
 */
export async function getMandantSubledger(tenantId: string, period: Period) {
  await syncAllOwnerAccounts(tenantId);

  const accountNumber = await fundsAccountNumber(tenantId);
  const fundsAccount = await fundsAccountRecord(tenantId, accountNumber);
  const where = fundsLineWhere(tenantId, fundsAccount?.id);

  const [openingGrouped, lines, generalBalance] = await Promise.all([
    prisma.journalEntryLine.groupBy({
      by: ['thirdPartyAccountId', 'fundsNature'],
      where: { ...where, entry: { tenantId, entryDate: { lt: period.from } } },
      _sum: { debit: true, credit: true }
    }),
    prisma.journalEntryLine.findMany({
      where: { ...where, entry: { tenantId, entryDate: { gte: period.from, lte: period.to } } },
      select: {
        thirdPartyAccountId: true,
        fundsNature: true,
        label: true,
        debit: true,
        credit: true,
        entry: { select: { entryDate: true, createdAt: true, reference: true, journal: { select: { code: true } } } }
      }
    }),
    fundsAccount ? fundsAccountGeneralBalance(tenantId, fundsAccount.id, period.to) : Promise.resolve(0)
  ]);

  const ownerIds = Array.from(
    new Set(
      [...openingGrouped.map(g => g.thirdPartyAccountId), ...lines.map(l => l.thirdPartyAccountId)].filter(
        (id): id is string => Boolean(id)
      )
    )
  );
  const labels = await thirdPartyLabels(tenantId, ownerIds);

  const openingByGroup = new Map<string, number>();
  for (const g of openingGrouped) {
    openingByGroup.set(
      mandantGroupKey(g.thirdPartyAccountId, g.fundsNature),
      mandantBalance(amount(g._sum.debit), amount(g._sum.credit))
    );
  }

  const linesByGroup = new Map<string, typeof lines>();
  for (const line of lines) {
    const key = mandantGroupKey(line.thirdPartyAccountId, line.fundsNature);
    const bucket = linesByGroup.get(key);
    if (bucket) bucket.push(line);
    else linesByGroup.set(key, [line]);
  }

  const ownerKeys = Array.from(
    new Set([
      ...openingGrouped.map(g => g.thirdPartyAccountId ?? UNASSIGNED_OWNER_KEY),
      ...lines.map(l => l.thirdPartyAccountId ?? UNASSIGNED_OWNER_KEY)
    ])
  );

  const owners: MandantSubledgerOwnerGroup[] = ownerKeys
    .map(ownerKey => {
      const ownerId = ownerKey === UNASSIGNED_OWNER_KEY ? null : ownerKey;
      const ownerLabel = ownerId ? (labels.get(ownerId) ?? ownerId) : 'Non réparti';

      const natures = NATURE_ORDER.map(nature => {
        const key = mandantGroupKey(ownerId, nature);
        const openingBalance = openingByGroup.get(key) ?? 0;
        const own = (linesByGroup.get(key) ?? []).slice().sort(
          (a, b) =>
            a.entry.entryDate.getTime() - b.entry.entryDate.getTime() ||
            a.entry.createdAt.getTime() - b.entry.createdAt.getTime()
        );
        let balance = openingBalance;
        let totalDebit = 0;
        let totalCredit = 0;
        const rows: MandantSubledgerLine[] = own.map(l => {
          const debit = amount(l.debit);
          const credit = amount(l.credit);
          totalDebit += debit;
          totalCredit += credit;
          balance = roundMoney(balance + credit - debit);
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
          nature,
          natureLabel: NATURE_LABELS[nature],
          openingBalance,
          lines: rows,
          totalDebit: roundMoney(totalDebit),
          totalCredit: roundMoney(totalCredit),
          closingBalance: balance
        };
      }).filter(group => group.lines.length > 0 || group.openingBalance !== 0);

      return {
        thirdPartyAccountId: ownerId,
        ownerLabel,
        natures,
        openingBalance: roundMoney(natures.reduce((sum, n) => sum + n.openingBalance, 0)),
        totalDebit: roundMoney(natures.reduce((sum, n) => sum + n.totalDebit, 0)),
        totalCredit: roundMoney(natures.reduce((sum, n) => sum + n.totalCredit, 0)),
        closingBalance: roundMoney(natures.reduce((sum, n) => sum + n.closingBalance, 0))
      };
    })
    .filter(owner => owner.natures.length > 0)
    .sort((a, b) => {
      if (a.thirdPartyAccountId === null) return 1;
      if (b.thirdPartyAccountId === null) return -1;
      return a.ownerLabel.localeCompare(b.ownerLabel);
    });

  const totals = {
    openingBalance: roundMoney(owners.reduce((sum, o) => sum + o.openingBalance, 0)),
    totalDebit: roundMoney(owners.reduce((sum, o) => sum + o.totalDebit, 0)),
    totalCredit: roundMoney(owners.reduce((sum, o) => sum + o.totalCredit, 0)),
    closingBalance: roundMoney(owners.reduce((sum, o) => sum + o.closingBalance, 0))
  };
  const difference = roundMoney(totals.closingBalance - generalBalance);

  return {
    from: period.fromLabel,
    to: period.toLabel,
    accountNumber,
    accountName: fundsAccount?.accountName ?? '',
    owners,
    totals,
    control: {
      auxiliaryBalance: totals.closingBalance,
      generalBalance,
      difference,
      isBalanced: difference === 0
    }
  };
}

export interface MandantTrialBalanceRow {
  thirdPartyAccountId: string | null;
  ownerLabel: string;
  current: number;
  deposit: number;
  unallocated: number;
  total: number;
}

/**
 * Balance auxiliaire des mandants (lot 10) : soldes par propriétaire et par
 * nature (compte courant / dépôt / à affecter), à une date. Ligne « Non
 * réparti » pour les lignes sans compte de tiers. Même contrôle que le grand
 * livre auxiliaire : total auxiliaire contre solde général du compte.
 */
export async function getMandantTrialBalance(tenantId: string, asOf: AsOfDate) {
  await syncAllOwnerAccounts(tenantId);

  const accountNumber = await fundsAccountNumber(tenantId);
  const fundsAccount = await fundsAccountRecord(tenantId, accountNumber);
  const where = fundsLineWhere(tenantId, fundsAccount?.id);

  const [grouped, generalBalance] = await Promise.all([
    prisma.journalEntryLine.groupBy({
      by: ['thirdPartyAccountId', 'fundsNature'],
      where: { ...where, entry: { tenantId, entryDate: { lte: asOf.date } } },
      _sum: { debit: true, credit: true }
    }),
    fundsAccount ? fundsAccountGeneralBalance(tenantId, fundsAccount.id, asOf.date) : Promise.resolve(0)
  ]);

  const ownerIds = Array.from(
    new Set(grouped.map(g => g.thirdPartyAccountId).filter((id): id is string => Boolean(id)))
  );
  const labels = await thirdPartyLabels(tenantId, ownerIds);

  const byOwner = new Map<string, { current: number; deposit: number; unallocated: number }>();
  for (const g of grouped) {
    const key = g.thirdPartyAccountId ?? UNASSIGNED_OWNER_KEY;
    const entry = byOwner.get(key) ?? { current: 0, deposit: 0, unallocated: 0 };
    const balance = mandantBalance(amount(g._sum.debit), amount(g._sum.credit));
    const nature = g.fundsNature ?? MandantFundsNature.CURRENT;
    if (nature === MandantFundsNature.CURRENT) entry.current = roundMoney(entry.current + balance);
    else if (nature === MandantFundsNature.DEPOSIT) entry.deposit = roundMoney(entry.deposit + balance);
    else entry.unallocated = roundMoney(entry.unallocated + balance);
    byOwner.set(key, entry);
  }

  const rows: MandantTrialBalanceRow[] = Array.from(byOwner.entries())
    .map(([key, value]) => {
      const ownerId = key === UNASSIGNED_OWNER_KEY ? null : key;
      return {
        thirdPartyAccountId: ownerId,
        ownerLabel: ownerId ? (labels.get(ownerId) ?? ownerId) : 'Non réparti',
        current: value.current,
        deposit: value.deposit,
        unallocated: value.unallocated,
        total: roundMoney(value.current + value.deposit + value.unallocated)
      };
    })
    .filter(row => row.current !== 0 || row.deposit !== 0 || row.unallocated !== 0)
    .sort((a, b) => {
      if (a.thirdPartyAccountId === null) return 1;
      if (b.thirdPartyAccountId === null) return -1;
      return a.ownerLabel.localeCompare(b.ownerLabel);
    });

  const totals = {
    current: roundMoney(rows.reduce((sum, r) => sum + r.current, 0)),
    deposit: roundMoney(rows.reduce((sum, r) => sum + r.deposit, 0)),
    unallocated: roundMoney(rows.reduce((sum, r) => sum + r.unallocated, 0)),
    total: roundMoney(rows.reduce((sum, r) => sum + r.total, 0))
  };
  const difference = roundMoney(totals.total - generalBalance);

  return {
    date: asOf.label,
    accountNumber,
    accountName: fundsAccount?.accountName ?? '',
    rows,
    totals,
    control: {
      auxiliaryBalance: totals.total,
      generalBalance,
      difference,
      isBalanced: difference === 0
    }
  };
}

export function mandantSubledgerTable(data: Awaited<ReturnType<typeof getMandantSubledger>>): Table {
  const rows: Cell[][] = [];
  for (const owner of data.owners) {
    for (const nature of owner.natures) {
      rows.push([
        '',
        '',
        '',
        owner.ownerLabel,
        nature.natureLabel,
        'Solde d’ouverture',
        '',
        '',
        nature.openingBalance
      ]);
      for (const line of nature.lines) {
        rows.push([
          day(line.date),
          line.journalCode,
          line.reference,
          owner.ownerLabel,
          nature.natureLabel,
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
        owner.ownerLabel,
        nature.natureLabel,
        'Total et solde de clôture',
        nature.totalDebit,
        nature.totalCredit,
        nature.closingBalance
      ]);
    }
  }
  return {
    sheet: 'Grand livre auxiliaire',
    headers: ['Date', 'Journal', 'Pièce', 'Mandant', 'Nature', 'Libellé', 'Débit', 'Crédit', 'Solde'],
    rows,
    money: [6, 7, 8]
  };
}

export function mandantTrialBalanceTable(data: Awaited<ReturnType<typeof getMandantTrialBalance>>): Table {
  const t = data.totals;
  return {
    sheet: 'Balance auxiliaire',
    headers: ['Mandant', 'Compte courant', 'Dépôt de garantie', 'À affecter', 'Total'],
    rows: [
      ...data.rows.map(r => [r.ownerLabel, r.current, r.deposit, r.unallocated, r.total]),
      ['Total', t.current, t.deposit, t.unallocated, t.total]
    ],
    money: [1, 2, 3, 4]
  };
}
