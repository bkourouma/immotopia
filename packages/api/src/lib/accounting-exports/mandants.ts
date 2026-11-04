import { MandantFundsNature, Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import { roundMoney } from '../finance/money';
import { DEFAULT_OWNER_FUNDS_ACCOUNT, getAgencyFinanceSettings } from '../settings/finance-settings';
import { ts } from './queries/account-balances';
import { amount, AsOfDate, Cell, day, NATURE_LABELS, Period, SCOPE, Table } from './service';
import {
  UNASSIGNED_OWNER,
  type MandantLineRow,
  type MandantNatureSummary,
  type MandantOwnerLedgerPage,
  type MandantOwnerRow,
  type MandantOwnersPage,
  type MandantTrialBalancePage,
  type Paged,
  type PageRequest
} from './types';

/**
 * Grand livre auxiliaire et balance auxiliaire des mandants (lot 10), sortis
 * de `service.ts` (lot C, comptabilité rapide) sans changement de fond.
 */

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

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

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
        id: true,
        thirdPartyAccountId: true,
        fundsNature: true,
        label: true,
        debit: true,
        credit: true,
        entry: {
          select: { id: true, entryDate: true, createdAt: true, reference: true, journal: { select: { code: true } } }
        }
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
    // Un groupe `fundsNature = NULL` (ligne historique) et un groupe CURRENT du même propriétaire
    // partagent la même clé : on additionne, on n'écrase pas.
    const key = mandantGroupKey(g.thirdPartyAccountId, g.fundsNature);
    openingByGroup.set(
      key,
      roundMoney((openingByGroup.get(key) ?? 0) + mandantBalance(amount(g._sum.debit), amount(g._sum.credit)))
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
        const own = (linesByGroup.get(key) ?? [])
          .slice()
          .sort(
            (a, b) =>
              a.entry.entryDate.getTime() - b.entry.entryDate.getTime() ||
              a.entry.createdAt.getTime() - b.entry.createdAt.getTime() ||
              compareText(a.entry.id, b.entry.id) ||
              compareText(a.id, b.id)
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
  ownerKey: string;
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
        ownerKey: key === UNASSIGNED_OWNER_KEY ? UNASSIGNED_OWNER : key,
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
      rows.push(['', '', '', owner.ownerLabel, nature.natureLabel, 'Solde d’ouverture', '', '', nature.openingBalance]);
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

// ---------------------------------------------------------------------------
// Lectures paginées (lot C) — par agrégats SQL, sans charger les lignes
// ---------------------------------------------------------------------------

const OWNERLESS_LABEL = 'Non réparti';

/** Minuscules sans accents, pour une recherche tolérante sur les libellés. */
const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function paginate<T>(all: T[], page: PageRequest): Paged<T> {
  if (page === 'all') return { items: all, total: all.length, page: 1, limit: all.length };
  const start = (page.page - 1) * page.limit;
  return { items: all.slice(start, start + page.limit), total: all.length, page: page.page, limit: page.limit };
}

function sortOwners<T extends { thirdPartyAccountId: string | null; ownerLabel: string }>(rows: T[]): T[] {
  return rows.sort((a, b) => {
    if (a.thirdPartyAccountId === null) return 1;
    if (b.thirdPartyAccountId === null) return -1;
    return a.ownerLabel.localeCompare(b.ownerLabel);
  });
}

function matchesSearch(label: string, search?: string): boolean {
  const needle = search ? fold(search.trim()) : '';
  return needle === '' || fold(label).includes(needle);
}

function control(auxiliaryBalance: number, generalBalance: number) {
  const difference = roundMoney(auxiliaryBalance - generalBalance);
  return { auxiliaryBalance, generalBalance, difference, isBalanced: difference === 0 };
}

const natureOf = (nature: MandantFundsNature | null): MandantFundsNature => nature ?? MandantFundsNature.CURRENT;

/**
 * Soldes par propriétaire sur la période : deux agrégats (avant la période,
 * sur la période), fusionnés ici. Sens crédit − débit.
 */
export async function getMandantOwnersPage(
  tenantId: string,
  period: Period,
  filters: { search?: string },
  page: PageRequest
): Promise<MandantOwnersPage> {
  const accountNumber = await fundsAccountNumber(tenantId);
  const fundsAccount = await fundsAccountRecord(tenantId, accountNumber);
  const where = fundsLineWhere(tenantId, fundsAccount?.id);

  const [openingGrouped, periodGrouped, generalBalance] = await Promise.all([
    prisma.journalEntryLine.groupBy({
      by: ['thirdPartyAccountId'],
      where: { ...where, entry: { tenantId, entryDate: { lt: period.from } } },
      _sum: { debit: true, credit: true }
    }),
    prisma.journalEntryLine.groupBy({
      by: ['thirdPartyAccountId'],
      where: { ...where, entry: { tenantId, entryDate: { gte: period.from, lte: period.to } } },
      _sum: { debit: true, credit: true }
    }),
    fundsAccount ? fundsAccountGeneralBalance(tenantId, fundsAccount.id, period.to) : Promise.resolve(0)
  ]);

  const byOwner = new Map<string, { opening: number; debit: number; credit: number }>();
  const slot = (id: string | null) => {
    const key = id ?? UNASSIGNED_OWNER;
    let entry = byOwner.get(key);
    if (!entry) {
      entry = { opening: 0, debit: 0, credit: 0 };
      byOwner.set(key, entry);
    }
    return entry;
  };
  for (const g of openingGrouped) {
    slot(g.thirdPartyAccountId).opening = mandantBalance(amount(g._sum.debit), amount(g._sum.credit));
  }
  for (const g of periodGrouped) {
    const entry = slot(g.thirdPartyAccountId);
    entry.debit = amount(g._sum.debit);
    entry.credit = amount(g._sum.credit);
  }

  const ownerIds = Array.from(byOwner.keys()).filter(key => key !== UNASSIGNED_OWNER);
  const labels = await thirdPartyLabels(tenantId, ownerIds);

  const all: MandantOwnerRow[] = sortOwners(
    Array.from(byOwner.entries())
      .filter(([, v]) => v.opening !== 0 || v.debit !== 0 || v.credit !== 0)
      .map(([key, v]) => {
        const ownerId = key === UNASSIGNED_OWNER ? null : key;
        return {
          ownerKey: key,
          thirdPartyAccountId: ownerId,
          ownerLabel: ownerId ? (labels.get(ownerId) ?? ownerId) : OWNERLESS_LABEL,
          openingBalance: v.opening,
          totalDebit: v.debit,
          totalCredit: v.credit,
          closingBalance: roundMoney(v.opening + v.credit - v.debit)
        };
      })
  );

  const filtered = all.filter(row => matchesSearch(row.ownerLabel, filters.search));
  const sum = (rows: MandantOwnerRow[], pick: (r: MandantOwnerRow) => number) =>
    roundMoney(rows.reduce((total, r) => total + pick(r), 0));

  return {
    mode: 'owners',
    from: period.fromLabel,
    to: period.toLabel,
    accountNumber,
    accountName: fundsAccount?.accountName ?? '',
    ...paginate(filtered, page),
    totals: {
      openingBalance: sum(filtered, r => r.openingBalance),
      totalDebit: sum(filtered, r => r.totalDebit),
      totalCredit: sum(filtered, r => r.totalCredit),
      closingBalance: sum(filtered, r => r.closingBalance)
    },
    control: control(
      sum(all, r => r.closingBalance),
      generalBalance
    )
  };
}

interface LedgerSqlRow {
  id: string;
  entry_date: Date;
  journal_code: string;
  reference: string;
  label: string | null;
  nature: MandantFundsNature;
  debit: unknown;
  credit: unknown;
  cumul: unknown;
}

/**
 * Grand livre auxiliaire d'un propriétaire : synthèse par nature (agrégats) et
 * lignes paginées. Le solde progressif est calculé en SQL (fenêtre par nature)
 * sur TOUTES les lignes de la période ; le filtre de nature s'applique après.
 */
export async function getMandantOwnerLedger(
  tenantId: string,
  period: Period,
  ownerKey: string,
  filters: { nature?: MandantFundsNature },
  page: PageRequest
): Promise<MandantOwnerLedgerPage> {
  const isUnassigned = ownerKey === UNASSIGNED_OWNER;
  let ownerLabel = OWNERLESS_LABEL;
  if (!isUnassigned) {
    const owner = await prisma.thirdPartyAccount.findFirst({
      where: { id: ownerKey, tenantId },
      select: { id: true, label: true }
    });
    if (!owner) throw new NotFoundError('Mandant introuvable.');
    ownerLabel = owner.label;
  }

  const accountNumber = await fundsAccountNumber(tenantId);
  const fundsAccount = await fundsAccountRecord(tenantId, accountNumber);
  const where: Prisma.JournalEntryLineWhereInput = {
    ...fundsLineWhere(tenantId, fundsAccount?.id),
    thirdPartyAccountId: isUnassigned ? null : ownerKey
  };

  const [openingGrouped, periodGrouped] = await Promise.all([
    prisma.journalEntryLine.groupBy({
      by: ['fundsNature'],
      where: { ...where, entry: { tenantId, entryDate: { lt: period.from } } },
      _sum: { debit: true, credit: true }
    }),
    prisma.journalEntryLine.groupBy({
      by: ['fundsNature'],
      where: { ...where, entry: { tenantId, entryDate: { gte: period.from, lte: period.to } } },
      _sum: { debit: true, credit: true },
      _count: { _all: true }
    })
  ]);

  const stats = new Map<MandantFundsNature, { opening: number; debit: number; credit: number; count: number }>();
  const statFor = (nature: MandantFundsNature) => {
    let s = stats.get(nature);
    if (!s) {
      s = { opening: 0, debit: 0, credit: 0, count: 0 };
      stats.set(nature, s);
    }
    return s;
  };
  for (const g of openingGrouped) {
    const s = statFor(natureOf(g.fundsNature));
    s.opening = roundMoney(s.opening + mandantBalance(amount(g._sum.debit), amount(g._sum.credit)));
  }
  for (const g of periodGrouped) {
    const s = statFor(natureOf(g.fundsNature));
    s.debit = roundMoney(s.debit + amount(g._sum.debit));
    s.credit = roundMoney(s.credit + amount(g._sum.credit));
    s.count += g._count._all;
  }

  const natures: MandantNatureSummary[] = NATURE_ORDER.filter(nature => {
    const s = stats.get(nature);
    return s !== undefined && (s.opening !== 0 || s.debit !== 0 || s.credit !== 0 || s.count > 0);
  }).map(nature => {
    const s = stats.get(nature) as NonNullable<ReturnType<typeof stats.get>>;
    return {
      nature,
      natureLabel: NATURE_LABELS[nature],
      openingBalance: s.opening,
      totalDebit: s.debit,
      totalCredit: s.credit,
      closingBalance: roundMoney(s.opening + s.credit - s.debit)
    };
  });

  const total = filters.nature
    ? (stats.get(filters.nature)?.count ?? 0)
    : Array.from(stats.values()).reduce((sum, s) => sum + s.count, 0);

  const ownerCondition = isUnassigned
    ? Prisma.sql`l.third_party_account_id IS NULL`
    : Prisma.sql`l.third_party_account_id = ${ownerKey}::uuid`;
  const fundsCondition = fundsAccount
    ? Prisma.sql`(l.funds_nature IS NOT NULL OR l.account_id = ${fundsAccount.id}::uuid)`
    : Prisma.sql`l.funds_nature IS NOT NULL`;
  const natureFilter = filters.nature ? Prisma.sql`WHERE r.nature = ${filters.nature}` : Prisma.empty;
  const paging = page === 'all' ? Prisma.empty : Prisma.sql`LIMIT ${page.limit} OFFSET ${(page.page - 1) * page.limit}`;

  const rows =
    total === 0
      ? []
      : await prisma.$queryRaw<LedgerSqlRow[]>(Prisma.sql`
    WITH funds AS (
      SELECT l.id, l.debit, l.credit, l.label, l.created_at AS line_created_at,
             COALESCE(l.funds_nature::text, 'CURRENT') AS nature,
             e.id AS entry_id, e.entry_date, e.created_at AS entry_created_at, e.reference,
             j.code AS journal_code
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      JOIN accounting_journals j ON j.id = e.journal_id
      WHERE e.tenant_id = ${tenantId}
        AND a.tenant_id = ${tenantId}
        AND a.scope = 'OPERATIONS'
        AND e.entry_date >= ${ts(period.from)}
        AND e.entry_date <= ${ts(period.to)}
        AND ${ownerCondition}
        AND ${fundsCondition}
    ), running AS (
      SELECT f.*,
             SUM(f.credit - f.debit) OVER (
               PARTITION BY f.nature
               ORDER BY f.entry_date, f.entry_created_at, f.entry_id, f.line_created_at, f.id
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
             ) AS cumul,
             ROW_NUMBER() OVER (
               ORDER BY f.entry_date, f.entry_created_at, f.entry_id, f.line_created_at, f.id
             ) AS rn
      FROM funds f
    )
    SELECT r.id, r.entry_date, r.journal_code, r.reference, r.label, r.nature, r.debit, r.credit, r.cumul
    FROM running r
    ${natureFilter}
    ORDER BY r.rn
    ${paging}
  `);

  const lines: MandantLineRow[] = rows.map(row => ({
    id: row.id,
    date: new Date(row.entry_date).toISOString(),
    journalCode: row.journal_code,
    reference: row.reference,
    label: row.label ?? '',
    nature: row.nature,
    natureLabel: NATURE_LABELS[row.nature],
    debit: amount(row.debit),
    credit: amount(row.credit),
    balance: roundMoney((stats.get(row.nature)?.opening ?? 0) + amount(row.cumul))
  }));

  return {
    mode: 'owner',
    from: period.fromLabel,
    to: period.toLabel,
    owner: { ownerKey, thirdPartyAccountId: isUnassigned ? null : ownerKey, ownerLabel },
    natures,
    items: lines,
    total,
    page: page === 'all' ? 1 : page.page,
    limit: page === 'all' ? total : page.limit
  };
}

/** Balance auxiliaire paginée : même calcul que `getMandantTrialBalance`, recherche et pages appliquées après. */
export async function getMandantTrialBalancePage(
  tenantId: string,
  asOf: AsOfDate,
  filters: { search?: string },
  page: PageRequest
): Promise<MandantTrialBalancePage> {
  const full = await getMandantTrialBalance(tenantId, asOf);
  const filtered = full.rows.filter(row => matchesSearch(row.ownerLabel, filters.search));
  const sum = (pick: (r: MandantTrialBalanceRow) => number) =>
    roundMoney(filtered.reduce((total, r) => total + pick(r), 0));
  return {
    date: full.date,
    accountNumber: full.accountNumber,
    accountName: full.accountName,
    ...paginate(filtered, page),
    totals: {
      current: sum(r => r.current),
      deposit: sum(r => r.deposit),
      unallocated: sum(r => r.unallocated),
      total: sum(r => r.total)
    },
    control: full.control
  };
}

export function mandantOwnerLedgerTable(data: MandantOwnerLedgerPage, nature?: MandantFundsNature): Table {
  const rows: Cell[][] = [];
  const label = data.owner.ownerLabel;
  const complete = data.items.length >= data.total;
  for (const summary of data.natures) {
    if (nature && summary.nature !== nature) continue;
    const own = data.items.filter(line => line.nature === summary.nature);
    if (own.length === 0 && !complete) continue;
    rows.push(['', '', '', label, summary.natureLabel, 'Solde d’ouverture', '', '', summary.openingBalance]);
    for (const line of own) {
      rows.push([
        day(line.date),
        line.journalCode,
        line.reference,
        label,
        line.natureLabel,
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
      label,
      summary.natureLabel,
      'Total et solde de clôture',
      summary.totalDebit,
      summary.totalCredit,
      summary.closingBalance
    ]);
  }
  return {
    sheet: 'Grand livre auxiliaire',
    headers: ['Date', 'Journal', 'Pièce', 'Mandant', 'Nature', 'Libellé', 'Débit', 'Crédit', 'Solde'],
    rows,
    money: [6, 7, 8]
  };
}

export function mandantTrialBalancePageTable(data: MandantTrialBalancePage): Table {
  const t = data.totals;
  return {
    sheet: 'Balance auxiliaire',
    headers: ['Mandant', 'Compte courant', 'Dépôt de garantie', 'À affecter', 'Total'],
    rows: [
      ...data.items.map(r => [r.ownerLabel, r.current, r.deposit, r.unallocated, r.total]),
      ['Total', t.current, t.deposit, t.unallocated, t.total]
    ],
    money: [1, 2, 3, 4]
  };
}
