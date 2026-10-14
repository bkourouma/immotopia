/**
 * Finance transverse, partie 3 : trésorerie.
 *
 *  - versements trimestriels de la retenue à la source à la DGI (quand l'agence
 *    en a collecté) ;
 *  - virements entre comptes de trésorerie, mois après mois : remise des espèces
 *    en banque, remise des chèques, retrait du Mobile Money, approvisionnement
 *    de la caisse et du compte d'exploitation, placements de trésorerie ;
 *  - apports de trésorerie (appels de fonds acquéreurs, comptes courants
 *    d'associés) quand la banque en a besoin ;
 *  - quelques virements saisis à tort puis annulés.
 *
 * Les virements passent par `createTransfer` (écriture VIR-AAAA-NNNN). Chaque
 * montant est calculé sur le solde RÉEL du compte source à la date du virement
 * (écritures déjà passées, y compris les décaissements futurs connus) : aucun
 * compte ne devient négatif, ce qui fait « tomber juste » les soldes de l'écran
 * Trésorerie. Idempotent : saute le bloc si des virements existent déjà.
 */
import { between, pick } from './types';
import type { HistoryContext } from './types';
import { DAY, at, loadTreasury, postEntry, roundTo } from './finance-transverse-ops';
import type { TreasuryRef } from './finance-transverse-ops';

// ───────────────────────────────────────────────────────────────── chronologie

/** Solde d'un compte dans le temps : écritures connues + virements que l'on ajoute. */
class Timeline {
  private flows: Array<{ t: number; d: number }> = [];
  private prefix: number[] = [];
  private dirty = false;

  add(t: Date, delta: number): void {
    this.flows.push({ t: t.getTime(), d: delta });
    this.dirty = true;
  }

  private prepare(): void {
    if (!this.dirty) return;
    this.flows.sort((a, b) => a.t - b.t);
    let acc = 0;
    this.prefix = this.flows.map(f => (acc += f.d));
    this.dirty = false;
  }

  balanceAt(t: Date): number {
    this.prepare();
    let lo = 0;
    let hi = this.flows.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.flows[mid].t <= t.getTime()) lo = mid + 1;
      else hi = mid;
    }
    return lo === 0 ? 0 : this.prefix[lo - 1];
  }

  /** Plus bas niveau du solde sur [t0, t1] (solde à t0 compris). */
  minBetween(t0: Date, t1: Date): number {
    this.prepare();
    let min = this.balanceAt(t0);
    for (let i = 0; i < this.flows.length; i++) {
      if (this.flows[i].t > t0.getTime() && this.flows[i].t <= t1.getTime()) min = Math.min(min, this.prefix[i]);
    }
    return min;
  }
}

async function loadTimelines(ctx: HistoryContext, accounts: TreasuryRef[]): Promise<Map<string, Timeline>> {
  const byChart = new Map(accounts.map(a => [a.chartOfAccountId, a.id]));
  const lines = await ctx.prisma.journalEntryLine.findMany({
    where: { accountId: { in: accounts.map(a => a.chartOfAccountId) }, entry: { tenantId: ctx.tenantId } },
    select: { accountId: true, debit: true, credit: true, entry: { select: { entryDate: true } } }
  });
  const map = new Map<string, Timeline>();
  for (const a of accounts) map.set(a.id, new Timeline());
  for (const l of lines) {
    const id = byChart.get(l.accountId);
    if (id) map.get(id)?.add(l.entry.entryDate, Number(l.debit) - Number(l.credit));
  }
  return map;
}

// ───────────────────────────────────────────────────────────────── DGI

/** Verse chaque trimestre échu la retenue à la source collectée. Sans retenue collectée : rien. */
export async function seedTaxRemittances(ctx: HistoryContext, staff: string[]): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  if ((await prisma.taxRemittance.count({ where: { tenantId } })) > 0) return;
  const withholdings = await prisma.rentWithholding.findMany({
    where: { tenantId },
    select: { amount: true, collectedAt: true }
  });
  if (withholdings.length === 0) return;
  const treasury = await loadTreasury(ctx);
  const bank = treasury.find(a => a.accountNumber === '5211') ?? treasury.find(a => a.kind === 'BANK');
  if (!bank) return;
  const { createTaxRemittance } = await import('../../../src/lib/treasury/service');

  const byQuarter = new Map<string, number>();
  for (const w of withholdings) {
    const q = Math.floor(w.collectedAt.getUTCMonth() / 3) + 1;
    const key = `${w.collectedAt.getUTCFullYear()}-${q}`;
    byQuarter.set(key, (byQuarter.get(key) ?? 0) + Number(w.amount));
  }
  let n = 0;
  for (const [key, total] of [...byQuarter.entries()].sort()) {
    const [year, q] = key.split('-').map(Number);
    const quarterEnd = at(year, q * 3, 1, 10); // premier jour du trimestre suivant
    const paidAt = at(quarterEnd.getUTCFullYear(), quarterEnd.getUTCMonth(), between(ctx.rng, 10, 15), 11);
    if (paidAt.getTime() > ctx.end.getTime() - DAY) continue;
    try {
      await createTaxRemittance(tenantId, pick(ctx.rng, staff), {
        amount: Math.round(total),
        paidAt,
        periodLabel: `Retenue à la source — T${q} ${year}`,
        treasuryAccountId: bank.id,
        reference: `DGI-QT${q}-${year}`
      });
      n += 1;
    } catch (error) {
      log(`finance : versement DGI ${key} ignoré (${(error as Error).message.slice(0, 120)})`);
    }
  }
  if (n) log(`finance : ${n} versement(s) DGI`);
}

// ───────────────────────────────────────────────────────────────── virements

const floor1000 = (v: number) => Math.floor(v / 1000) * 1000;
const ceilTo = (v: number, step: number) => Math.ceil(v / step) * step;

/**
 * Virements et apports de trésorerie, mois après mois, sur la durée de l'histoire.
 * `withConstruction` : l'agence a des chantiers, ses apports sont des appels de fonds acquéreurs.
 */
export async function seedTreasuryTransfers(
  ctx: HistoryContext,
  staff: string[],
  withConstruction: boolean
): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  if ((await prisma.treasuryTransfer.count({ where: { tenantId } })) > 0) return;
  const accounts = await loadTreasury(ctx);
  const find = (n: string) => accounts.find(a => a.accountNumber === n);
  const bank = find('5211') ?? accounts.find(a => a.kind === 'BANK');
  const cash = accounts.find(a => a.kind === 'CASH' && a.isDefault) ?? accounts.find(a => a.kind === 'CASH');
  const exploitation = find('5212');
  const epargne = find('5213');
  const checks = accounts.find(a => a.kind === 'CHECKS_TO_CASH');
  const mobile = accounts.filter(a => a.kind === 'MOBILE_MONEY');
  if (!bank || !cash) return;

  const { createTransfer, voidTransfer } = await import('../../../src/lib/treasury/service');
  const timelines = await loadTimelines(ctx, accounts);
  const tl = (a: TreasuryRef): Timeline => {
    let t = timelines.get(a.id);
    if (!t) {
      t = new Timeline();
      timelines.set(a.id, t);
    }
    return t;
  };
  const WINDOW = 31 * DAY;

  let transfers = 0;
  let fundings = 0;
  let seq = 0;

  const move = async (
    from: TreasuryRef,
    to: TreasuryRef,
    amount: number,
    date: Date,
    reference: string,
    notes: string
  ) => {
    const dto = await createTransfer(tenantId, pick(ctx.rng, staff), {
      fromTreasuryAccountId: from.id,
      toTreasuryAccountId: to.id,
      amount,
      transferredAt: date,
      reference,
      notes
    });
    tl(from).add(date, -amount);
    tl(to).add(date, amount);
    transfers += 1;
    return dto;
  };

  /** Garantit que la banque principale ne passe pas sous zéro sur la fenêtre, en l'alimentant si besoin. */
  const ensureBank = async (date: Date, pendingOut: number) => {
    const min = tl(bank).minBetween(date, new Date(date.getTime() + WINDOW)) - pendingOut;
    if (min >= 0) return;
    const step = withConstruction ? 1_000_000 : 500_000;
    const amount = ceilTo(-min * 1.08 + step / 2, step);
    const when = new Date(date.getTime() - 3_600_000);
    seq += 1;
    await postEntry(ctx, {
      kind: 'TREASURY_FUNDING',
      key: seq,
      date: when,
      reference: `APP-${when.getUTCFullYear()}${String(when.getUTCMonth() + 1).padStart(2, '0')}-${String(seq).padStart(2, '0')}`,
      description: withConstruction
        ? `Appels de fonds acquéreurs encaissés — ${monthLabel(when)}`
        : `Apport en compte courant d’associé — renforcement de trésorerie ${monthLabel(when)}`,
      journalType: 'BANK',
      lines: [
        {
          accountNumber: bank.accountNumber,
          accountName: bank.label,
          type: 'ASSET',
          treasury: bank,
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
    tl(bank).add(when, amount);
    fundings += 1;
  };

  const startY = ctx.start.getUTCFullYear();
  const startM = ctx.start.getUTCMonth();
  const done: Array<{ id: string; amount: number; date: Date; from: TreasuryRef; to: TreasuryRef }> = [];
  const dupMonths = new Set([0.18, 0.4, 0.62, 0.8].map(f => Math.floor(ctx.months * f)));

  for (let i = 0; i <= ctx.months; i++) {
    const y = startY + Math.floor((startM + i) / 12);
    const m0 = (startM + i) % 12;
    const ym = `${y}${String(m0 + 1).padStart(2, '0')}`;
    const inFuture = (d: Date) => d.getTime() > ctx.end.getTime() - DAY;

    // 1. Banque : apport si les sorties connues du mois dépassent le solde.
    const d2 = at(y, m0, 2, 9);
    if (!inFuture(d2)) await ensureBank(d2, 0);

    // 2. Approvisionnement de la caisse et du compte d'exploitation par la banque.
    const d3 = at(y, m0, 3, 10, 30);
    if (!inFuture(d3)) {
      for (const [target, label, ref] of [
        [cash, 'Approvisionnement de la caisse (menues dépenses et décaissements)', 'APPRO-CAISSE'],
        ...(exploitation ? [[exploitation, 'Alimentation du compte d’exploitation', 'ALIM-EXPL'] as const] : []),
        ...mobile.map(
          w =>
            [
              w,
              `Approvisionnement du portefeuille ${w.label.split(' — ')[0]}`,
              `APPRO-${(w.mmOperator ?? 'MM').slice(0, 3)}`
            ] as const
        )
      ] as Array<readonly [TreasuryRef, string, string]>) {
        const low = tl(target).minBetween(d3, new Date(d3.getTime() + WINDOW));
        if (low >= 0) continue;
        const amount = ceilTo(
          -low * 1.05 + 20_000,
          target === cash || target.kind === 'MOBILE_MONEY' ? 50_000 : 100_000
        );
        await ensureBank(d3, amount);
        await move(bank, target, amount, d3, `${ref}-${ym}`, label);
      }
    }

    // 3. Remises de chèques et retraits du Mobile Money vers la banque.
    const d6 = at(y, m0, between(ctx.rng, 5, 8), 11);
    if (!inFuture(d6)) {
      if (checks) {
        const avail = Math.min(
          tl(checks).balanceAt(new Date(d6.getTime() - 3 * DAY)),
          tl(checks).minBetween(d6, new Date(d6.getTime() + WINDOW))
        );
        const amount = floor1000(avail);
        if (amount >= 100_000) {
          await move(
            checks,
            bank,
            amount,
            d6,
            `BRD-CHQ-${ym}`,
            'Remise de chèques à l’encaissement — bordereau de remise'
          );
        }
      }
      for (const wallet of mobile) {
        const low = tl(wallet).minBetween(d6, new Date(d6.getTime() + WINDOW));
        const amount = floor1000(Math.max(0, low) * 0.75);
        if (amount >= 100_000) {
          await move(
            wallet,
            bank,
            amount,
            new Date(d6.getTime() + between(ctx.rng, 0, 3) * 3_600_000),
            `RET-${(wallet.mmOperator ?? 'MM').slice(0, 3)}-${ym}`,
            `Retrait ${wallet.label.split(' — ')[0]} vers le compte bancaire`
          );
        }
      }
    }

    // 4. Remise des espèces en banque en fin de mois.
    const d27 = at(y, m0, between(ctx.rng, 25, 28), 15);
    if (!inFuture(d27)) {
      const low = tl(cash).minBetween(d27, new Date(d27.getTime() + WINDOW));
      const amount = floor1000(Math.max(0, low) * 0.85);
      if (amount >= 100_000) {
        await move(
          cash,
          bank,
          amount,
          d27,
          `VERS-ESP-${ym}`,
          'Versement d’espèces en banque — recettes encaissées au guichet'
        );
      }
    }

    // 5. Placement trimestriel de trésorerie sur le compte d'épargne.
    const d20 = at(y, m0, 20, 14);
    if (epargne && i % 3 === 1 && !inFuture(d20)) {
      const low = tl(bank).minBetween(d20, new Date(d20.getTime() + WINDOW));
      const amount = low >= 15_000_000 ? 2_000_000 : low >= 6_000_000 ? 1_000_000 : 0;
      if (amount > 0)
        await move(bank, epargne, amount, d20, `PLAC-${ym}`, 'Placement de trésorerie excédentaire — compte d’épargne');
    }

    // 6. Un virement saisi en double puis annulé (deux fois sur la période).
    const d12 = at(y, m0, 12, 16);
    if (dupMonths.has(i) && !inFuture(d12) && d12.getTime() < ctx.end.getTime() - 45 * DAY && exploitation) {
      const amount = 250_000;
      const low = tl(bank).minBetween(d12, new Date(d12.getTime() + WINDOW));
      if (low >= amount * 2) {
        const dup = await move(
          bank,
          exploitation,
          amount,
          d12,
          `ALIM-EXPL-${ym}-B`,
          'Alimentation du compte d’exploitation'
        );
        const voidedAt = new Date(d12.getTime() + 2 * 3_600_000);
        await voidTransfer(tenantId, pick(ctx.rng, staff), dup.id, {
          reason: 'Virement saisi en double — annulation de la seconde saisie'
        });
        tl(bank).add(voidedAt, amount);
        tl(exploitation).add(voidedAt, -amount);
        await prisma.treasuryTransfer.update({ where: { id: dup.id, tenantId }, data: { voidedAt } });
        const original = await prisma.journalEntry.findFirst({
          where: { tenantId, documentType: 'TREASURY_TRANSFER', documentId: dup.id },
          select: { voidedByEntryId: true }
        });
        if (original?.voidedByEntryId) {
          await prisma.journalEntry.update({ where: { id: original.voidedByEntryId }, data: { entryDate: voidedAt } });
        }
        done.push({ id: dup.id, amount, date: d12, from: bank, to: exploitation });
      }
    }
  }
  log(`finance : ${transfers} virement(s) de trésorerie, ${fundings} apport(s) de trésorerie`);
}

function monthLabel(d: Date): string {
  const names = [
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
  return `${names[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export { roundTo };
