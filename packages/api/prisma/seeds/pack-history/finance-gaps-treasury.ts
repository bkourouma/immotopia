/**
 * Trous de finance, partie 1 : équilibre de la trésorerie.
 *
 * Cause du solde négatif relevé par la recette (caisse du Promoteur et de
 * l'Opérateur intégré à environ −91 000 000 F CFA) : la paie du chantier
 * (`SALARY_PAYMENT`) est écrite par le service de salaires, qui crédite TOUJOURS
 * la caisse par défaut. Les salaires de 36 mois (~91 M) sortaient donc en
 * espèces d'une caisse que personne n'alimentait pour eux. Deux corrections :
 *
 *  1. `repointSalaryPayments` : la paie se règle surtout par virement bancaire,
 *     un peu par Mobile Money, le reste en espèces (comme les autres règlements
 *     rangés par `repointConstructionPayments`). Fonction idempotente, appelée
 *     par `finance-transverse.ts` AVANT les virements (un seed neuf calcule ses
 *     alimentations sur la bonne trésorerie) et par ce bloc de rattrapage (une
 *     base déjà peuplée est réparée) ;
 *  2. `balanceTreasury` : balayage mensuel de chaque compte (chèques, Mobile
 *     Money, caisse, banques secondaires puis banque principale). Quand le solde
 *     passe sous zéro à une date quelconque, on passe, AVANT cette date, un
 *     virement depuis la banque principale (vrai service `createTransfer`) et,
 *     pour la banque principale elle-même, un apport (appels de fonds acquéreurs
 *     ou compte courant d'associé). Idempotent : une trésorerie déjà positive
 *     n'ajoute rien. Un dernier balayage remet en banque les espèces et les
 *     portefeuilles devenus trop riches.
 *
 * Les virements ajoutés après coup portent un numéro VIR-AAAA-NNNN postérieur à
 * celui de virements plus anciens : `renumberTransfers` rétablit l'ordre
 * chronologique (numéro du virement et de ses écritures).
 */
import type { HistoryContext } from './types';
import { DAY, at, loadTreasury, postEntry } from './finance-transverse-ops';
import type { TreasuryRef } from './finance-transverse-ops';

const HOUR = 3_600_000;
const WINDOW = 31 * DAY;
const ceilTo = (v: number, step: number) => Math.ceil(v / step) * step;
const floorTo = (v: number, step: number) => Math.floor(v / step) * step;

const MONTHS_FR = [
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

// ───────────────────────────────────────────────────────────────── paie

/** Part des salariés payés par chacun des moyens (déterministe, par identifiant du salarié). */
function salaryChannel(employeeId: string): 'MAIN' | 'EXPL' | 'MOBILE' | 'CASH' {
  let h = 0;
  for (let i = 0; i < employeeId.length; i++) h = (h * 31 + employeeId.charCodeAt(i)) >>> 0;
  const r = h % 20;
  if (r < 10) return 'MAIN';
  if (r < 14) return 'EXPL';
  if (r < 17) return 'MOBILE';
  return 'CASH';
}

/**
 * Range les règlements de salaires (crédités sur la caisse par le service) sur le
 * compte réel du moyen de paiement. Sans effet quand l'agence n'a pas de paie.
 */
export async function repointSalaryPayments(ctx: HistoryContext): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  const treasury = await loadTreasury(ctx);
  const cash = treasury.find(a => a.kind === 'CASH' && a.isDefault) ?? treasury.find(a => a.kind === 'CASH');
  const main = treasury.find(a => a.accountNumber === '5211') ?? treasury.find(a => a.kind === 'BANK');
  if (!cash || !main) return;
  const expl = treasury.find(a => a.accountNumber === '5212') ?? main;
  const mobile = treasury.find(a => a.kind === 'MOBILE_MONEY' && a.mmOperator === 'ORANGE') ?? main;

  const lines = await prisma.journalEntryLine.findMany({
    where: {
      accountId: cash.chartOfAccountId,
      credit: { gt: 0 },
      entry: { tenantId, documentType: 'SALARY_PAYMENT' }
    },
    select: { id: true, entryId: true, entry: { select: { documentId: true, entryDate: true } } }
  });
  if (lines.length === 0) return;
  const payments = await prisma.salaryPayment.findMany({
    where: { tenantId, id: { in: lines.map(l => l.entry.documentId as string) } },
    select: { id: true, employeeId: true }
  });
  const employeeOf = new Map(payments.map(p => [p.id, p.employeeId]));

  const [{ prisma: appPrisma }, accounting] = await Promise.all([
    import('../../../src/utils/database'),
    import('../../../src/lib/finance/accounting')
  ]);
  let moved = 0;
  await appPrisma.$transaction(
    async tx => {
      for (const l of lines) {
        const employeeId = employeeOf.get(l.entry.documentId as string);
        if (!employeeId) continue;
        const channel = salaryChannel(employeeId);
        if (channel === 'CASH') continue;
        const target: TreasuryRef = channel === 'MAIN' ? main : channel === 'EXPL' ? expl : mobile;
        await tx.journalEntryLine.update({ where: { id: l.id }, data: { accountId: target.chartOfAccountId } });
        const journalId = await accounting.ensureOperationalJournalTx(
          tx,
          tenantId,
          l.entry.entryDate.getUTCFullYear(),
          'BANK'
        );
        await tx.journalEntry.update({ where: { id: l.entryId }, data: { journalId } });
        moved += 1;
      }
    },
    { timeout: 300_000, maxWait: 30_000 }
  );
  if (moved) log(`finance : ${moved} règlement(s) de salaire rangés sur banque / Mobile Money`);
}

// ───────────────────────────────────────────────────────────────── chronologie

interface Flow {
  t: number;
  d: number;
}

/** Solde d'un compte dans le temps, flux triés ; permet d'ajouter un flux et de relire le minimum d'une fenêtre. */
class Series {
  flows: Flow[] = [];
  private sorted = true;

  add(t: number, d: number): void {
    this.flows.push({ t, d });
    this.sorted = false;
  }

  private sort(): void {
    if (this.sorted) return;
    this.flows.sort((a, b) => a.t - b.t);
    this.sorted = true;
  }

  balanceAt(t: number): number {
    this.sort();
    let acc = 0;
    for (const f of this.flows) {
      if (f.t > t) break;
      acc += f.d;
    }
    return acc;
  }

  /** Plus bas solde atteint dans ]t0, t1], solde à t0 compris. */
  minBetween(t0: number, t1: number): number {
    this.sort();
    let acc = 0;
    let min = Infinity;
    let started = false;
    for (const f of this.flows) {
      if (!started && f.t > t0) {
        min = acc;
        started = true;
      }
      acc += f.d;
      if (f.t > t0 && f.t <= t1) min = Math.min(min, acc);
      if (f.t > t1) break;
    }
    return started ? min : acc;
  }
}

async function loadSeries(ctx: HistoryContext, accounts: TreasuryRef[]): Promise<Map<string, Series>> {
  const byChart = new Map(accounts.map(a => [a.chartOfAccountId, a.id]));
  const lines = await ctx.prisma.journalEntryLine.findMany({
    where: { accountId: { in: accounts.map(a => a.chartOfAccountId) }, entry: { tenantId: ctx.tenantId } },
    select: { accountId: true, debit: true, credit: true, entry: { select: { entryDate: true } } }
  });
  const map = new Map<string, Series>();
  for (const a of accounts) map.set(a.id, new Series());
  for (const l of lines) {
    const id = byChart.get(l.accountId);
    if (id) map.get(id)?.add(l.entry.entryDate.getTime(), Number(l.debit) - Number(l.credit));
  }
  return map;
}

const monthLabel = (d: Date) => `${MONTHS_FR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

// ───────────────────────────────────────────────────────────────── équilibrage

export interface BalanceResult {
  transfers: number;
  fundings: number;
  sweeps: number;
}

export async function balanceTreasury(
  ctx: HistoryContext,
  staff: string[],
  withConstruction: boolean
): Promise<BalanceResult> {
  const { prisma, tenantId, log } = ctx;
  const result: BalanceResult = { transfers: 0, fundings: 0, sweeps: 0 };
  const accounts = await loadTreasury(ctx);
  const main = accounts.find(a => a.accountNumber === '5211') ?? accounts.find(a => a.kind === 'BANK');
  if (!main) return result;
  const cash = accounts.find(a => a.kind === 'CASH' && a.isDefault) ?? accounts.find(a => a.kind === 'CASH');
  const series = await loadSeries(ctx, accounts);
  const serie = (a: TreasuryRef) => series.get(a.id) as Series;
  const { createTransfer } = await import('../../../src/lib/treasury/service');
  const nowMs = ctx.end.getTime();
  const staffPick = (i: number) => staff[i % staff.length];
  let counter = 0;

  const move = async (from: TreasuryRef, to: TreasuryRef, amount: number, date: Date, ref: string, notes: string) => {
    counter += 1;
    await createTransfer(tenantId, staffPick(counter), {
      fromTreasuryAccountId: from.id,
      toTreasuryAccountId: to.id,
      amount,
      transferredAt: date,
      reference: ref,
      notes
    });
    serie(from).add(date.getTime(), -amount);
    serie(to).add(date.getTime(), amount);
    result.transfers += 1;
  };

  // Mois à balayer : de l'ouverture à aujourd'hui, une fenêtre de 31 jours à chaque début de mois.
  const windows: Date[] = [new Date(ctx.start.getTime())];
  for (let i = 0; i <= ctx.months; i++) {
    const y = ctx.start.getUTCFullYear() + Math.floor((ctx.start.getUTCMonth() + i) / 12);
    const m0 = (ctx.start.getUTCMonth() + i) % 12;
    const d = at(y, m0, 3, 10, 30);
    if (d.getTime() < nowMs - DAY) windows.push(d);
  }

  // 1. Comptes alimentés par la banque principale : chèques, Mobile Money, caisse, banques secondaires.
  const secondary = accounts.filter(a => a.id !== main.id);
  const order = (a: TreasuryRef) =>
    a.kind === 'CHECKS_TO_CASH' ? 0 : a.kind === 'MOBILE_MONEY' ? 1 : a.kind === 'CASH' ? 2 : 3;
  secondary.sort((a, b) => order(a) - order(b));
  for (const acc of secondary) {
    const step = acc.kind === 'BANK' ? 100_000 : 50_000;
    const label =
      acc.kind === 'CASH'
        ? ['Approvisionnement de la caisse (paie, menues dépenses et décaissements)', 'APPRO-CAISSE']
        : acc.kind === 'MOBILE_MONEY'
          ? [
              `Approvisionnement du portefeuille ${acc.label.split(' — ')[0]}`,
              `APPRO-${(acc.mmOperator ?? 'MM').slice(0, 3)}`
            ]
          : acc.kind === 'CHECKS_TO_CASH'
            ? ['Chèques émis aux propriétaires — provision du compte chèques', 'PROV-CHQ']
            : ['Alimentation du compte d’exploitation', 'ALIM-EXPL'];
    for (const start of windows) {
      const low = serie(acc).minBetween(start.getTime(), start.getTime() + WINDOW);
      if (low >= 0) continue;
      const amount = ceilTo(-low * 1.05 + 20_000, step);
      // Un rang d'heures par compte : les virements du même jour ne se confondent pas.
      const date = new Date(start.getTime() + (secondary.indexOf(acc) % 6) * HOUR);
      const ym = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      await move(main, acc, amount, date, `${label[1]}-${ym}-R`, label[0]);
    }
  }

  // 2. Banque principale : apport quand elle passe sous zéro (après tous les virements ci-dessus).
  let seq = 0;
  for (const start of windows) {
    const low = serie(main).minBetween(start.getTime(), start.getTime() + WINDOW);
    if (low >= 0) continue;
    const step = withConstruction ? 1_000_000 : 500_000;
    const amount = ceilTo(-low * 1.08 + step / 2, step);
    const when = new Date(start.getTime() - HOUR);
    seq += 1;
    await postEntry(ctx, {
      kind: 'TREASURY_FUNDING',
      key: `gaps:${when.getTime()}`,
      date: when,
      reference: `APP-${when.getUTCFullYear()}${String(when.getUTCMonth() + 1).padStart(2, '0')}-R${seq}`,
      description: withConstruction
        ? `Appels de fonds acquéreurs encaissés — ${monthLabel(when)}`
        : `Apport en compte courant d’associé — renforcement de trésorerie ${monthLabel(when)}`,
      journalType: 'BANK',
      lines: [
        {
          accountNumber: main.accountNumber,
          accountName: main.label,
          type: 'ASSET',
          treasury: main,
          debit: amount,
          label: 'Encaissement en banque'
        },
        withConstruction
          ? {
              accountNumber: '4191',
              accountName: 'Clients, avances et acomptes reçus',
              type: 'LIABILITY',
              credit: amount,
              label: 'Appels de fonds acquéreurs'
            }
          : {
              accountNumber: '4621',
              accountName: 'Associés, comptes courants',
              type: 'LIABILITY',
              credit: amount,
              label: 'Apport de l’exploitant'
            }
      ]
    });
    serie(main).add(when.getTime(), amount);
    result.fundings += 1;
  }

  // 3. Espèces et portefeuilles devenus trop riches : remise en banque (balayage de fin de mois).
  const sweepable = accounts.filter(a => a.kind === 'CASH' || a.kind === 'MOBILE_MONEY' || a.kind === 'CHECKS_TO_CASH');
  for (const acc of sweepable) {
    const cap = acc.kind === 'CASH' ? 6_000_000 : 3_000_000;
    if (!cash && acc.kind === 'CASH') continue;
    for (let i = 0; i <= ctx.months; i++) {
      const y = ctx.start.getUTCFullYear() + Math.floor((ctx.start.getUTCMonth() + i) / 12);
      const m0 = (ctx.start.getUTCMonth() + i) % 12;
      const d = at(y, m0, 26, 15, 40);
      if (d.getTime() > nowMs - 2 * DAY) continue;
      const low = serie(acc).minBetween(d.getTime(), nowMs);
      if (low <= cap) continue;
      const amount = floorTo(low - cap / 2, 100_000);
      if (amount < 100_000) continue;
      const ym = `${y}${String(m0 + 1).padStart(2, '0')}`;
      await move(
        acc,
        main,
        amount,
        d,
        `${acc.kind === 'CASH' ? 'VERS-ESP' : acc.kind === 'CHECKS_TO_CASH' ? 'BRD-CHQ' : `RET-${(acc.mmOperator ?? 'MM').slice(0, 3)}`}-${ym}-R`,
        acc.kind === 'CASH'
          ? 'Versement d’espèces en banque — excédent de caisse'
          : acc.kind === 'CHECKS_TO_CASH'
            ? 'Remise de chèques à l’encaissement — bordereau de remise'
            : `Retrait ${acc.label.split(' — ')[0]} vers le compte bancaire`
      );
      result.sweeps += 1;
    }
  }
  // Le balayage a crédité la banque principale : elle n'a jamais pu en sortir de l'argent qu'elle n'avait pas.
  if (result.transfers + result.fundings > 0) {
    log(
      `finance : trésorerie équilibrée (${result.transfers} virement(s) dont ${result.sweeps} remise(s) en banque, ${result.fundings} apport(s))`
    );
  }
  void prisma;
  return result;
}

// ───────────────────────────────────────────────────────────────── numérotation

/**
 * Rétablit l'ordre chronologique des numéros VIR-AAAA-NNNN après des virements
 * ajoutés a posteriori (le service numérote à l'ordre de saisie). Met à jour le
 * virement, ses écritures (référence et libellé) et celles de son annulation.
 */
export async function renumberTransfers(ctx: HistoryContext): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  const all = await prisma.treasuryTransfer.findMany({
    where: { tenantId },
    orderBy: [{ year: 'asc' }, { transferredAt: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, year: true, sequence: true }
  });
  const byYear = new Map<number, typeof all>();
  for (const t of all) byYear.set(t.year, [...(byYear.get(t.year) ?? []), t]);
  const changes: Array<{ id: string; year: number; from: number; to: number }> = [];
  for (const [year, list] of byYear) {
    list.forEach((t, i) => {
      if (t.sequence !== i + 1) changes.push({ id: t.id, year, from: t.sequence, to: i + 1 });
    });
  }
  if (changes.length === 0) return;
  const num = (y: number, s: number) => `VIR-${y}-${String(s).padStart(4, '0')}`;
  // Deux temps : la contrainte d'unicité (agence, année, rang) interdit les échanges directs.
  for (const c of changes) {
    await prisma.treasuryTransfer.update({ where: { id: c.id, tenantId }, data: { sequence: c.to + 1_000_000 } });
  }
  for (const c of changes) {
    await prisma.treasuryTransfer.update({ where: { id: c.id, tenantId }, data: { sequence: c.to } });
    const entries = await prisma.journalEntry.findMany({
      where: { tenantId, documentType: 'TREASURY_TRANSFER', documentId: c.id },
      select: { id: true, reference: true, description: true, voidedByEntryId: true }
    });
    const reversalIds = entries.map(e => e.voidedByEntryId).filter((x): x is string => Boolean(x));
    const reversals = reversalIds.length
      ? await prisma.journalEntry.findMany({
          where: { tenantId, id: { in: reversalIds } },
          select: { id: true, reference: true, description: true, voidedByEntryId: true }
        })
      : [];
    const oldNum = num(c.year, c.from);
    const newNum = num(c.year, c.to);
    for (const e of [...entries, ...reversals]) {
      await prisma.journalEntry.update({
        where: { id: e.id },
        data: {
          reference: e.reference.split(oldNum).join(newNum),
          description: e.description.split(oldNum).join(newNum)
        }
      });
    }
  }
  log(`finance : ${changes.length} virement(s) renumérotés dans l’ordre chronologique`);
}
