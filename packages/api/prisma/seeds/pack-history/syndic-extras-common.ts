/**
 * Outils communs aux compléments SYNDIC (« 3 ans ») : contexte, dates, libellés,
 * et un petit grand livre qui écrit comme `syndic-plan.ts` (comptes 450xx, 512,
 * 5171, 531, journaux AC/BQ/CA/CH/MM/OD, soldes de copropriétaires, fonds).
 *
 * Tout est déterministe (`ctx.rng`) et relatif à `ctx.end`.
 */
import { randomUUID } from 'crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { HistoryContext } from './types';

export type Tx = Prisma.TransactionClient;

export const TX_OPTIONS = { maxWait: 60_000, timeout: 10 * 60_000 } as const;

export interface SyndicRow {
  id: string;
  name: string;
  address: string;
  registrationNo: string | null;
  cadastralReference: string | null;
  createdAt: Date;
  status: 'ACTIVE' | 'IN_LIQUIDATION' | 'IN_DISPUTE';
  mandatingAgencyId: string | null;
  propertyId: string | null;
  totalLots: number;
  syndicManagerId: string | null;
}

export interface SyndicEnv {
  ctx: HistoryContext;
  prisma: PrismaClient;
  tenantId: string;
  adminId: string;
  /** Collaborateurs actifs (administrateur compris). */
  staff: string[];
  rng: () => number;
  start: Date;
  end: Date;
  log: (message: string) => void;
  syndicates: SyndicRow[];
}

/** Charge le contexte ; `null` quand l'agence n'a aucune copropriété (rien à compléter). */
export async function loadSyndicEnv(ctx: HistoryContext): Promise<SyndicEnv | null> {
  const { prisma, tenantId } = ctx;
  const syndicates = (await prisma.syndicate.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      address: true,
      registrationNo: true,
      cadastralReference: true,
      createdAt: true,
      status: true,
      mandatingAgencyId: true,
      propertyId: true,
      totalLots: true,
      syndicManagerId: true
    },
    orderBy: [{ totalLots: 'asc' }, { name: 'asc' }]
  })) as SyndicRow[];
  if (syndicates.length === 0) {
    ctx.log('syndic-extras : aucune copropriété (le générateur de base n’a pas tourné), rien à compléter');
    return null;
  }
  const members = await prisma.membership.findMany({
    where: { tenantId, status: 'ACTIVE' },
    select: { userId: true }
  });
  const staff = Array.from(new Set([ctx.adminUserId, ...members.map(m => m.userId)]));
  return {
    ctx,
    prisma,
    tenantId,
    adminId: ctx.adminUserId,
    staff,
    rng: ctx.rng,
    start: ctx.start,
    end: ctx.end,
    log: ctx.log,
    syndicates
  };
}

// ───────────────────────────────────────────────────────────────── utilitaires

export const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
export const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
export const roundTo = (n: number, step: number): number => Math.round(n / step) * step;
export const local = (y: number, m: number, d: number, h = 9, mi = 0): Date => new Date(y, m, d, h, mi, 0, 0);
export const addDays = (from: Date, days: number): Date => new Date(from.getTime() + days * 86_400_000);
export const addMonths = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth() + n, d.getDate(), d.getHours(), d.getMinutes(), 0, 0);
export const between = (rng: () => number, min: number, max: number): number =>
  Math.floor(min + rng() * (max - min + 1));
export const pickOne = <T>(rng: () => number, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length) % items.length];
export const pickStaff = (env: SyndicEnv): string => pickOne(env.rng, env.staff);
export const daysBetween = (a: Date, b: Date): number => Math.floor((b.getTime() - a.getTime()) / 86_400_000);

export function shuffle<T>(rng: () => number, items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const slug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');

/** « 1 250 000 F CFA » (espace simple : le PDF ne sait pas écrire l'espace insécable fine). */
export function fcfa(amount: number): string {
  return `${Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F CFA`;
}

export function frDate(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
];
export function frLongDate(d: Date): string {
  return `${d.getDate() === 1 ? '1er' : d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function ivorianPhone(rng: () => number): string {
  return `+225 0${pickOne(rng, [1, 5, 7])} ${pad(between(rng, 0, 99))} ${pad(between(rng, 0, 99))} ${pad(between(rng, 0, 99))} ${pad(between(rng, 0, 99))}`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const num = (v: unknown): number => Number(v ?? 0);

// ───────────────────────────────────────────────────────────────── grand livre

export type JournalCode = 'AC' | 'BQ' | 'CA' | 'CH' | 'MM' | 'OD';
export type PayMethod = 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH' | 'CHECK';

export const METHOD_TREASURY: Record<PayMethod, { journal: JournalCode; account: string; label: string }> = {
  BANK_TRANSFER: { journal: 'BQ', account: '512', label: 'Virement' },
  CHECK: { journal: 'BQ', account: '512', label: 'Chèque' },
  MOBILE_MONEY: { journal: 'MM', account: '5171', label: 'Mobile Money' },
  CASH: { journal: 'CA', account: '531', label: 'Espèces' }
};

const JOURNAL_DEFS: Record<JournalCode, { type: 'GENERAL' | 'BANK' | 'CASH' | 'CHARGES'; label: string }> = {
  AC: { type: 'GENERAL', label: 'Achats — factures fournisseurs' },
  BQ: { type: 'BANK', label: 'Banque' },
  CA: { type: 'CASH', label: 'Caisse (espèces)' },
  CH: { type: 'CHARGES', label: 'Appels de fonds' },
  MM: { type: 'BANK', label: 'Monnaie électronique' },
  OD: { type: 'GENERAL', label: 'Opérations diverses' }
};

export type SourceTypeValue = 'CHARGE_PAYMENT' | 'MANUAL' | 'PENALTY' | 'SUPPLIER_INVOICE' | 'SUPPLIER_PAYMENT';

export interface EntryLine {
  acc: string;
  debit?: number;
  credit?: number;
  label: string;
  lotId?: string;
}

/**
 * Petit grand livre d'UNE copropriété. Les écritures reprennent les conventions
 * de `syndic-plan.ts` : le compte copropriétaire de chaque lot est `450<lot>`.
 */
export class CoproLedger {
  private accounts = new Map<string, string>();
  private journals = new Map<string, string>();
  private refSeq = new Map<string, number>();
  private ownerAccounts = new Map<string, string>();
  private touchedAccounts = new Set<string>();
  private fundState = new Map<string, { balance: number; lastAt: Date }>();
  lotNumbers = new Map<string, string>();

  private constructor(
    private env: SyndicEnv,
    readonly syndicateId: string
  ) {}

  static async load(env: SyndicEnv, syndicateId: string): Promise<CoproLedger> {
    const led = new CoproLedger(env, syndicateId);
    const { prisma } = env;
    const [accounts, journals, lots, owners, funds] = await Promise.all([
      prisma.chartOfAccount.findMany({
        where: { syndicateId, tenantId: env.tenantId },
        select: { id: true, accountNumber: true }
      }),
      prisma.accountingJournal.findMany({
        where: { syndicateId, tenantId: env.tenantId },
        select: { id: true, code: true, fiscalYear: true }
      }),
      prisma.syndicateLot.findMany({ where: { syndicateId }, select: { id: true, lotNumber: true } }),
      prisma.ownerAccount.findMany({ where: { syndicateId }, select: { id: true, lotId: true } }),
      prisma.syndicateFund.findMany({ where: { syndicateId }, select: { id: true, balance: true } })
    ]);
    for (const a of accounts) led.accounts.set(a.accountNumber, a.id);
    for (const j of journals) led.journals.set(`${j.fiscalYear}:${j.code}`, j.id);
    for (const l of lots) led.lotNumbers.set(l.id, l.lotNumber);
    for (const o of owners) led.ownerAccounts.set(o.lotId, o.id);
    const counts = await prisma.journalEntry.groupBy({
      by: ['journalId'],
      where: { journalId: { in: journals.map(j => j.id) } },
      _count: { _all: true }
    });
    const byJournal = new Map(counts.map(c => [c.journalId, c._count._all]));
    for (const j of journals) led.refSeq.set(`${j.fiscalYear}:${j.code}`, byJournal.get(j.id) ?? 0);
    for (const f of funds) {
      const last = await prisma.syndicateFundMovement.findFirst({
        where: { fundId: f.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      });
      led.fundState.set(f.id, { balance: num(f.balance), lastAt: last?.createdAt ?? new Date(0) });
    }
    return led;
  }

  account(number: string): string {
    const id = this.accounts.get(number);
    if (!id) throw new Error(`[syndic-extras] compte ${number} absent du plan de la copropriété ${this.syndicateId}`);
    return id;
  }

  hasAccount(number: string): boolean {
    return this.accounts.has(number);
  }

  private async journalId(tx: Tx, year: number, code: JournalCode): Promise<string> {
    const key = `${year}:${code}`;
    const known = this.journals.get(key);
    if (known) return known;
    const def = JOURNAL_DEFS[code];
    const created = await tx.accountingJournal.create({
      data: {
        syndicateId: this.syndicateId,
        tenantId: this.env.tenantId,
        scope: 'SYNDICATE',
        journalType: def.type,
        label: def.label,
        code,
        fiscalYear: year,
        createdAt: local(year, 0, 1, 7)
      },
      select: { id: true }
    });
    this.journals.set(key, created.id);
    this.refSeq.set(key, 0);
    return created.id;
  }

  /** Passe une écriture équilibrée ; la référence continue la numérotation du journal. */
  async entry(
    tx: Tx,
    o: {
      date: Date;
      journal: JournalCode;
      description: string;
      sourceType: SourceTypeValue;
      sourceId?: string | null;
      lines: EntryLine[];
    }
  ): Promise<string> {
    const debit = sum(o.lines.map(l => l.debit ?? 0));
    const credit = sum(o.lines.map(l => l.credit ?? 0));
    if (debit !== credit || debit <= 0) {
      throw new Error(`[syndic-extras] écriture déséquilibrée « ${o.description} » (${debit}/${credit})`);
    }
    const year = o.date.getFullYear();
    const journalId = await this.journalId(tx, year, o.journal);
    const key = `${year}:${o.journal}`;
    const n = (this.refSeq.get(key) ?? 0) + 1;
    this.refSeq.set(key, n);
    const id = randomUUID();
    await tx.journalEntry.create({
      data: {
        id,
        journalId,
        tenantId: this.env.tenantId,
        entryDate: o.date,
        reference: `${o.journal}-${year}-${pad(n, 4)}`,
        description: o.description,
        sourceType: o.sourceType,
        sourceId: o.sourceId ?? null,
        isLocked: year < this.env.end.getFullYear(),
        createdAt: o.date
      }
    });
    await tx.journalEntryLine.createMany({
      data: o.lines.map((l, i) => ({
        entryId: id,
        accountId: this.account(l.acc),
        lotId: l.lotId ?? null,
        debit: l.debit ?? 0,
        credit: l.credit ?? 0,
        label: l.label,
        createdAt: new Date(o.date.getTime() + i)
      }))
    });
    return id;
  }

  /** Ligne du compte copropriétaire du lot ; les soldes sont recalculés par `finalize`. */
  async ownerTx(
    tx: Tx,
    lotId: string,
    row: {
      date: Date;
      type: 'CHARGE_CALL' | 'PAYMENT' | 'PENALTY' | 'WAIVER' | 'ADJUSTMENT';
      debit?: number;
      credit?: number;
      label: string;
      reference?: string | null;
      sourceId?: string | null;
    }
  ): Promise<void> {
    const accountId = this.ownerAccounts.get(lotId);
    if (!accountId) throw new Error(`[syndic-extras] compte copropriétaire absent pour le lot ${lotId}`);
    await tx.ownerAccountTransaction.create({
      data: {
        accountId,
        transactionDate: row.date,
        type: row.type,
        debit: row.debit ?? null,
        credit: row.credit ?? null,
        balanceAfter: 0,
        label: row.label,
        reference: row.reference ?? null,
        sourceId: row.sourceId ?? null,
        createdAt: row.date
      }
    });
    this.touchedAccounts.add(accountId);
  }

  /** Mouvement de fonds chaîné sur le solde courant ; `createdAt` ne recule jamais. */
  async fundMovement(
    tx: Tx,
    o: {
      fundId: string;
      direction: 'CREDIT' | 'DEBIT';
      amount: number;
      label: string;
      source: 'CHARGE_PAYMENT' | 'PROVIDER_PAYMENT' | 'MANUAL_ADJUSTMENT' | 'MANUAL_EXPENSE' | 'OPENING';
      sourceId?: string | null;
      at: Date;
    }
  ): Promise<void> {
    const state = this.fundState.get(o.fundId);
    if (!state) throw new Error(`[syndic-extras] fonds inconnu ${o.fundId}`);
    const delta = o.direction === 'CREDIT' ? o.amount : -o.amount;
    const balance = state.balance + delta;
    if (balance < 0) throw new Error(`[syndic-extras] fonds ${o.fundId} négatif (${balance})`);
    // L'ordre du journal ne recule jamais : un mouvement daté avant le dernier est rangé juste après lui.
    const at = o.at <= state.lastAt ? new Date(state.lastAt.getTime() + 1) : o.at;
    await tx.syndicateFundMovement.create({
      data: {
        tenantId: this.env.tenantId,
        fundId: o.fundId,
        direction: o.direction,
        amount: o.amount,
        balanceAfter: balance,
        label: o.label,
        sourceType: o.source,
        sourceId: o.sourceId ?? null,
        createdById: this.env.adminId,
        createdAt: at
      }
    });
    this.fundState.set(o.fundId, { balance, lastAt: at });
  }

  fundBalance(fundId: string): number {
    return this.fundState.get(fundId)?.balance ?? 0;
  }

  registerFund(fundId: string, balance: number, at: Date): void {
    this.fundState.set(fundId, { balance, lastAt: at });
  }

  /** Recalcule `balanceAfter` des lignes touchées et le solde des comptes, puis le solde des fonds. */
  async finalize(tx: Tx): Promise<void> {
    const ids = [...this.touchedAccounts];
    if (ids.length > 0) {
      await tx.$executeRaw`
        UPDATE owner_account_transactions t
        SET balance_after = x.bal
        FROM (
          SELECT id,
                 SUM(COALESCE(debit, 0) - COALESCE(credit, 0))
                   OVER (PARTITION BY account_id ORDER BY transaction_date, created_at, id) AS bal
          FROM owner_account_transactions
          WHERE account_id = ANY(${ids}::uuid[])
        ) x
        WHERE t.id = x.id`;
      await tx.$executeRaw`
        UPDATE owner_accounts a
        SET balance = COALESCE((
          SELECT SUM(COALESCE(debit, 0) - COALESCE(credit, 0))
          FROM owner_account_transactions t WHERE t.account_id = a.id
        ), 0)
        WHERE a.id = ANY(${ids}::uuid[])`;
      this.touchedAccounts.clear();
    }
    for (const [fundId, state] of this.fundState) {
      await tx.syndicateFund.update({ where: { id: fundId }, data: { balance: state.balance } });
    }
  }
}

/** Statut d'un appel d'après ce qui est réglé (même règle que le plan de base). */
export function callStatusFor(
  amount: number,
  paid: number,
  due: Date,
  end: Date
): 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' {
  if (paid >= amount) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return due < end ? 'OVERDUE' : 'PENDING';
}

/** Référence plausible d'un règlement selon le mode (même forme que le plan de base). */
export function paymentRef(rng: () => number, method: PayMethod, date: Date): string {
  const d = (n: number) => Array.from({ length: n }, () => String(between(rng, 0, 9))).join('');
  const ymd = `${String(date.getFullYear()).slice(2)}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  switch (method) {
    case 'BANK_TRANSFER':
      return `VIR ${ymd} ${d(6)}`;
    case 'CHECK':
      return `CHQ ${d(7)}`;
    case 'MOBILE_MONEY':
      return `OM${ymd}.${d(4)}.${'ABCDEFGHJK'[between(rng, 0, 9)]}${d(5)}`;
    default:
      return `REC-${ymd}-${d(3)}`;
  }
}
