/**
 * Compléments SYNDIC — finances : appel du trimestre en cours, régularisations
 * des 30 derniers jours, échéanciers, avances, programmation automatique des
 * appels, mouvements des fonds, budget de l'exercice suivant.
 *
 * Chaque bloc est idempotent : il se juge sur l'état de la base (une ligne qui
 * existe déjà dispense de la recréer) et reste sans effet au 2e passage.
 */
import { randomUUID } from 'crypto';
import { parsePeriodBounds } from '../../../src/lib/syndics/period';
import { describePeriod, firstPeriod, nextPeriodStart } from '../../../src/lib/syndics/charge-schedule-periods';
import {
  CoproLedger,
  METHOD_TREASURY,
  TX_OPTIONS,
  addDays,
  between,
  callStatusFor,
  daysBetween,
  frDate,
  local,
  num,
  paymentRef,
  pickOne,
  roundTo,
  shuffle,
  sum,
  type PayMethod,
  type SyndicEnv,
  type SyndicRow,
  type Tx
} from './syndic-extras-common';

export interface LotFact {
  id: string;
  num: string;
  kind: string;
  shares: number;
  ownerName: string;
  behavior: 'punctual' | 'late' | 'partial' | 'chronic';
  method: PayMethod;
}

export interface Facts {
  lots: LotFact[];
  lotById: Map<string, LotFact>;
  roulementId: string | null;
  travauxId: string | null;
  /** Part du budget versée au fonds de travaux, par budget. */
  worksShare: Map<string, number>;
}

const ORDINAL = ['1er', '2e', '3e', '4e'];
const REGULARISATION_MARK = 'régularisation de l’arriéré';

export async function loadFacts(env: SyndicEnv, s: SyndicRow): Promise<Facts> {
  const { prisma } = env;
  const lots = await prisma.syndicateLot.findMany({
    where: { syndicateId: s.id },
    select: {
      id: true,
      lotNumber: true,
      lotType: true,
      generalShares: true,
      owner: { select: { firstName: true, lastName: true, legalName: true } }
    },
    orderBy: { lotNumber: 'asc' }
  });
  const stats = await prisma.$queryRaw<
    Array<{ lot_id: string; ov: bigint; pa: bigint; late: number | null }>
  >`SELECT c.lot_id,
           COUNT(*) FILTER (WHERE c.status IN ('OVERDUE', 'PENDING') AND c.due_date < ${env.end}) AS ov,
           COUNT(*) FILTER (WHERE c.status = 'PARTIAL') AS pa,
           AVG(EXTRACT(EPOCH FROM (p.paid_at - c.due_date)) / 86400) FILTER (WHERE c.status = 'PAID') AS late
    FROM charge_calls c
    LEFT JOIN charge_payments p ON p.charge_call_id = c.id
    WHERE c.syndicate_id = ${s.id}::uuid
    GROUP BY c.lot_id`;
  const statByLot = new Map(stats.map(r => [r.lot_id, r]));
  const methods = await prisma.$queryRaw<Array<{ lot_id: string; method: string | null; n: bigint }>>`
    SELECT p.lot_id, p.method, COUNT(*) AS n
    FROM charge_payments p JOIN syndicate_lots l ON l.id = p.lot_id
    WHERE l.syndicate_id = ${s.id}::uuid
    GROUP BY p.lot_id, p.method ORDER BY n DESC`;
  const methodByLot = new Map<string, PayMethod>();
  for (const m of methods) {
    if (!methodByLot.has(m.lot_id) && m.method && m.method in METHOD_TREASURY)
      methodByLot.set(m.lot_id, m.method as PayMethod);
  }
  const facts: LotFact[] = lots.map(l => {
    const st = statByLot.get(l.id);
    const ov = Number(st?.ov ?? 0);
    const pa = Number(st?.pa ?? 0);
    const late = st?.late ?? 0;
    const behavior = ov >= 2 ? 'chronic' : pa >= 2 ? 'partial' : late > 5 ? 'late' : 'punctual';
    const o = l.owner;
    return {
      id: l.id,
      num: l.lotNumber,
      kind: l.lotType,
      shares: l.generalShares,
      ownerName: o ? o.legalName || [o.firstName, o.lastName].filter(Boolean).join(' ') : 'Copropriétaire',
      behavior,
      method: methodByLot.get(l.id) ?? 'BANK_TRANSFER'
    };
  });
  const funds = await prisma.syndicateFund.findMany({
    where: { syndicateId: s.id },
    select: { id: true, name: true }
  });
  const lines = await prisma.budgetLineItem.findMany({
    where: { budget: { syndicateId: s.id }, fundId: { not: null } },
    select: { budgetId: true, amountForecast: true, budget: { select: { totalAmount: true } } }
  });
  const worksShare = new Map<string, number>();
  for (const l of lines) {
    const total = num(l.budget.totalAmount);
    if (total > 0) worksShare.set(l.budgetId, (worksShare.get(l.budgetId) ?? 0) + num(l.amountForecast) / total);
  }
  return {
    lots: facts,
    lotById: new Map(facts.map(f => [f.id, f])),
    roulementId: funds.find(f => f.name === 'Fonds de roulement')?.id ?? null,
    travauxId: funds.find(f => f.name === 'Fonds de travaux')?.id ?? null,
    worksShare
  };
}

// ───────────────────────────────────────────────────────────────── paiement

export interface CallLite {
  id: string;
  period: string;
  amount: number;
  fundId: string | null;
  budgetId: string | null;
}

/**
 * Enregistre un paiement de lot comme le plan de base : ligne de paiement,
 * affectations, écriture banque/caisse contre 450<lot>, compte copropriétaire
 * et crédit du fonds de travaux. Les statuts d'appels sont mis à jour par l'appelant.
 */
export async function addPayment(
  env: SyndicEnv,
  facts: Facts,
  led: CoproLedger,
  tx: Tx,
  o: {
    lot: LotFact;
    allocations: Array<{ call: CallLite; amount: number }>;
    unallocated?: number;
    date: Date;
    method: PayMethod;
    /** Libellé du compte copropriétaire ; sert aussi de repère d'idempotence. */
    label?: string;
  }
): Promise<string> {
  const id = randomUUID();
  const allocated = sum(o.allocations.map(a => a.amount));
  const total = allocated + (o.unallocated ?? 0);
  const ref = paymentRef(env.rng, o.method, o.date);
  const treasury = METHOD_TREASURY[o.method];
  const first = o.allocations[0]?.call ?? null;
  await tx.chargePayment.create({
    data: {
      id,
      lotId: o.lot.id,
      chargeCallId: first?.id ?? null,
      amount: total,
      unallocatedAmount: o.unallocated ?? 0,
      paidAt: o.date,
      method: o.method,
      reference: ref,
      createdById: env.adminId,
      createdAt: o.date
    }
  });
  if (o.allocations.length > 0) {
    await tx.chargePaymentAllocation.createMany({
      data: o.allocations.map(a => ({
        paymentId: id,
        chargeCallId: a.call.id,
        amount: a.amount,
        source: 'PAYMENT' as const,
        createdAt: o.date
      }))
    });
  }
  const period = first?.period ?? 'avance';
  await led.entry(tx, {
    date: o.date,
    journal: treasury.journal,
    description: `Règlement ${period} — lot ${o.lot.num} (${o.lot.ownerName}) — ${treasury.label} ${ref}`,
    sourceType: 'CHARGE_PAYMENT',
    sourceId: id,
    lines: [
      { acc: treasury.account, debit: total, label: `${treasury.label} ${ref}` },
      { acc: `450${o.lot.num}`, credit: total, label: `Règlement ${period} — lot ${o.lot.num}`, lotId: o.lot.id }
    ]
  });
  await led.ownerTx(tx, o.lot.id, {
    date: o.date,
    type: 'PAYMENT',
    credit: total,
    label: o.label ?? (first ? `Règlement ${period} (${treasury.label})` : `Avance de charges (${treasury.label})`),
    reference: ref,
    sourceId: id
  });
  if (facts.travauxId) {
    for (const a of o.allocations) {
      const credit = a.call.fundId
        ? a.amount
        : Math.round(a.amount * (a.call.budgetId ? (facts.worksShare.get(a.call.budgetId) ?? 0) : 0));
      if (credit > 0)
        await led.fundMovement(tx, {
          fundId: a.call.fundId ?? facts.travauxId,
          direction: 'CREDIT',
          amount: credit,
          label: a.call.fundId
            ? `Appel travaux ${a.call.period} — lot ${o.lot.num}`
            : `Dotation travaux ${a.call.period} — lot ${o.lot.num}`,
          source: 'CHARGE_PAYMENT',
          sourceId: id,
          at: o.date
        });
    }
  }
  return id;
}

async function refreshCallStatuses(env: SyndicEnv, tx: Tx, callIds: string[]): Promise<void> {
  for (const callId of new Set(callIds)) {
    const call = await tx.chargeCall.findUniqueOrThrow({
      where: { id: callId },
      select: { amount: true, dueDate: true, allocations: { select: { amount: true } } }
    });
    const paid = sum(call.allocations.map(a => num(a.amount)));
    await tx.chargeCall.update({
      where: { id: callId },
      data: { status: callStatusFor(num(call.amount), paid, call.dueDate, env.end) }
    });
  }
}

interface OpenCall extends CallLite {
  lotId: string;
  dueDate: Date;
  outstanding: number;
  lastReminderAt: Date | null;
}

async function loadOpenCalls(env: SyndicEnv, s: SyndicRow): Promise<OpenCall[]> {
  const calls = await env.prisma.chargeCall.findMany({
    where: { syndicateId: s.id, status: { in: ['OVERDUE', 'PARTIAL', 'PENDING'] }, amount: { gt: 0 } },
    select: {
      id: true,
      lotId: true,
      period: true,
      amount: true,
      fundId: true,
      dueDate: true,
      batch: { select: { budgetId: true } },
      allocations: { select: { amount: true } },
      reminders: { select: { sentAt: true }, orderBy: { sentAt: 'desc' }, take: 1 }
    },
    orderBy: { dueDate: 'asc' }
  });
  return calls
    .map(c => {
      const amount = num(c.amount);
      return {
        id: c.id,
        lotId: c.lotId,
        period: c.period,
        amount,
        fundId: c.fundId,
        budgetId: c.batch?.budgetId ?? null,
        dueDate: c.dueDate,
        outstanding: amount - sum(c.allocations.map(a => num(a.amount))),
        lastReminderAt: c.reminders[0]?.sentAt ?? null
      };
    })
    .filter(c => c.outstanding > 0);
}

// ───────────────────────────────────────────────────── F1 : trimestre en cours

async function seedCurrentPeriod(env: SyndicEnv, s: SyndicRow, facts: Facts, led: CoproLedger): Promise<number> {
  const { prisma, end, rng } = env;
  const year = end.getFullYear();
  const q = Math.floor(end.getMonth() / 3);
  const period = `${year}-T${q + 1}`;
  const issue = local(year, q * 3, q === 0 ? 5 : 2, 9);
  if (issue > end) return 0;
  const exists = await prisma.chargeCallBatch.findFirst({
    where: { syndicateId: s.id, period, batchType: 'REGULAR' },
    select: { id: true }
  });
  if (exists) return 0;
  const budget = await prisma.syndicateBudget.findFirst({
    where: { syndicateId: s.id, fiscalYear: year, status: 'APPROVED' },
    include: { allocations: true }
  });
  if (!budget || budget.allocations.length === 0) return 0;
  const due = local(year, q * 3, 15, 23, 59);
  const bounds = parsePeriodBounds(period);
  const batchId = randomUUID();
  const annual = new Map(budget.allocations.map(a => [a.lotId, num(a.totalAllocated)]));
  const calls: Array<CallLite & { lot: LotFact; dueDate: Date }> = [];
  for (const lot of facts.lots) {
    const total = annual.get(lot.id) ?? 0;
    const base = roundTo(total / 4, 100);
    const amount = q < 3 ? base : total - 3 * base;
    if (amount <= 0) continue;
    calls.push({ id: randomUUID(), period, amount, fundId: null, budgetId: budget.id, lot, dueDate: due });
  }
  const label = `Appel de fonds du ${ORDINAL[q]} trimestre ${year}`;
  await prisma.$transaction(async tx => {
    await tx.chargeCallBatch.create({
      data: {
        id: batchId,
        syndicateId: s.id,
        label,
        period,
        periodStart: bounds?.start ?? null,
        periodEnd: bounds?.end ?? null,
        dueDate: due,
        batchType: 'REGULAR',
        budgetId: budget.id,
        totalAmount: sum(calls.map(c => c.amount)),
        currency: 'XOF',
        status: 'SENT',
        createdAt: issue
      }
    });
    await tx.chargeCall.createMany({
      data: calls.map(c => ({
        id: c.id,
        syndicateId: s.id,
        lotId: c.lot.id,
        batchId,
        period,
        periodStart: bounds?.start ?? null,
        periodEnd: bounds?.end ?? null,
        amount: c.amount,
        currency: 'XOF',
        dueDate: due,
        status: 'PENDING' as const, // « en retard » se dérive à la lecture
        noticeSentAt: new Date(issue.getTime() + 3_600_000),
        createdAt: issue
      }))
    });
    await led.entry(tx, {
      date: issue,
      journal: 'CH',
      description: label,
      sourceType: 'MANUAL',
      sourceId: batchId,
      lines: [
        ...calls.map(c => ({
          acc: `450${c.lot.num}`,
          debit: c.amount,
          label: `${period} — lot ${c.lot.num}`,
          lotId: c.lot.id
        })),
        { acc: '701', credit: sum(calls.map(c => c.amount)), label }
      ]
    });
    for (const c of calls)
      await led.ownerTx(tx, c.lot.id, {
        date: issue,
        type: 'CHARGE_CALL',
        debit: c.amount,
        label: `Appel de fonds ${period}`,
        reference: `CH-${period}-${c.lot.num}`
      });

    // règlements déjà reçus depuis l'émission
    const settled: string[] = [];
    for (const c of calls) {
      const lot = c.lot;
      let date: Date;
      let amount = c.amount;
      const hour = between(rng, 9, 16);
      switch (lot.behavior) {
        case 'punctual':
          date = addDays(local(year, q * 3, issue.getDate(), hour), between(rng, 1, 13));
          break;
        case 'late':
          date = addDays(due, between(rng, 6, 45));
          break;
        case 'partial':
          date = addDays(due, between(rng, 0, 20));
          amount = roundTo(c.amount * (0.4 + rng() * 0.3), 100);
          break;
        default:
          if (rng() < 0.85) continue;
          date = addDays(due, between(rng, 40, 120));
      }
      if (date > end || date <= issue || amount <= 0) continue;
      await addPayment(env, facts, led, tx, { lot, allocations: [{ call: c, amount }], date, method: lot.method });
      settled.push(c.id);
    }
    await refreshCallStatuses(env, tx, settled);
    if (settled.length === calls.length) {
      const allPaid = await tx.chargeCall.count({ where: { batchId, status: 'PAID' } });
      if (allPaid === calls.length)
        await tx.chargeCallBatch.update({ where: { id: batchId }, data: { status: 'CLOSED' } });
    }
    await led.finalize(tx);
  }, TX_OPTIONS);
  return calls.length;
}

// ───────────────────────────────────────── F2 : régularisations des 30 derniers jours

async function seedRegularisations(env: SyndicEnv, s: SyndicRow, facts: Facts, led: CoproLedger): Promise<number> {
  const { prisma, end, rng } = env;
  const windowStart = addDays(end, -28);
  // Repère d'idempotence : le libellé du compte copropriétaire des régularisations posées ici.
  const done = await prisma.ownerAccountTransaction.count({
    where: { account: { syndicateId: s.id }, label: { contains: REGULARISATION_MARK } }
  });
  if (done > 0) return 0;
  const missing = Math.max(4, Math.round(facts.lots.length / 9));

  const scheduled = new Set(
    (
      await prisma.paymentSchedule.findMany({ where: { lot: { syndicateId: s.id } }, select: { chargeCallId: true } })
    ).map(r => r.chargeCallId)
  );
  const open = (await loadOpenCalls(env, s)).filter(
    c => c.dueDate < addDays(end, -40) && !scheduled.has(c.id) && c.outstanding >= 20_000
  );
  // un seul appel par lot : une régularisation par propriétaire
  const byLot = new Map<string, OpenCall>();
  for (const c of shuffle(rng, open)) if (!byLot.has(c.lotId)) byLot.set(c.lotId, c);
  const chosen = [...byLot.values()].slice(0, missing);
  if (chosen.length === 0) return 0;

  await prisma.$transaction(async tx => {
    for (const c of chosen) {
      const lot = facts.lotById.get(c.lotId)!;
      const lower = addDays(c.lastReminderAt && c.lastReminderAt > windowStart ? c.lastReminderAt : windowStart, 1);
      const spanDays = Math.max(0, daysBetween(lower, addDays(end, -1)));
      const date = addDays(
        local(lower.getFullYear(), lower.getMonth(), lower.getDate(), between(rng, 9, 16)),
        between(rng, 0, spanDays)
      );
      if (date > end) continue;
      const partial = rng() < 0.35;
      const amount = partial ? roundTo(c.outstanding * (0.4 + rng() * 0.3), 100) : c.outstanding;
      await addPayment(env, facts, led, tx, {
        lot,
        allocations: [{ call: c, amount: Math.min(amount, c.outstanding) }],
        date,
        method: lot.method,
        label: `Règlement ${c.period} (${METHOD_TREASURY[lot.method].label}) — ${REGULARISATION_MARK}`
      });
    }
    await refreshCallStatuses(
      env,
      tx,
      chosen.map(c => c.id)
    );
    await led.finalize(tx);
  }, TX_OPTIONS);
  return chosen.length;
}

// ───────────────────────────────────────────────────────────── F3 : échéanciers

type ScheduleKind = 'COMPLETED' | 'ACTIVE' | 'DEFAULTED';

async function seedSchedules(env: SyndicEnv, s: SyndicRow, facts: Facts, led: CoproLedger): Promise<number> {
  const { prisma, end, rng } = env;
  const existing = await prisma.paymentSchedule.findMany({
    where: { lot: { syndicateId: s.id } },
    select: { status: true, chargeCallId: true }
  });
  const present = new Set(existing.map(e => e.status as string));
  const targetCount = facts.lots.length >= 40 ? 5 : facts.lots.length >= 20 ? 4 : 3;
  const wanted: ScheduleKind[] = ['COMPLETED', 'ACTIVE', 'DEFAULTED', 'ACTIVE', 'COMPLETED'].filter(
    (k, i, a) => a.indexOf(k) !== i || !present.has(k)
  ) as ScheduleKind[];
  const toAdd = wanted.slice(0, Math.max(0, targetCount - existing.length));
  if (toAdd.length === 0) return 0;

  const taken = new Set(existing.map(e => e.chargeCallId));
  const usedLots = new Set<string>();
  let created = 0;
  for (const kind of toAdd) {
    const minAge = kind === 'COMPLETED' ? 165 : kind === 'DEFAULTED' ? 230 : 110;
    const open = (await loadOpenCalls(env, s)).filter(
      c => !taken.has(c.id) && !usedLots.has(c.lotId) && c.outstanding >= 30_000 && c.dueDate < addDays(end, -minAge)
    );
    if (open.length === 0) continue;
    const call = pickOne(rng, open);
    taken.add(call.id);
    usedLots.add(call.lotId);
    const lot = facts.lotById.get(call.lotId)!;
    const count = kind === 'ACTIVE' ? 4 : 3;
    const agreedAt =
      kind === 'COMPLETED'
        ? addDays(call.dueDate, 50)
        : kind === 'DEFAULTED'
          ? addDays(end, -between(rng, 150, 175))
          : addDays(end, -between(rng, 55, 75));
    const part = roundTo(call.outstanding / count, 100);
    const parts = Array.from({ length: count }, (_, i) =>
      i < count - 1 ? part : call.outstanding - part * (count - 1)
    );
    const scheduleId = randomUUID();
    const instalments = parts.map((amount, i) => {
      const due = addDays(agreedAt, 30 * (i + 1));
      let pays: boolean;
      if (kind === 'COMPLETED') pays = true;
      else if (kind === 'DEFAULTED') pays = i === 0;
      else pays = i === 0 || (i === 1 && rng() < 0.6);
      const paidAt = pays
        ? addDays(local(due.getFullYear(), due.getMonth(), due.getDate(), between(rng, 9, 16)), between(rng, 0, 6))
        : null;
      const status = paidAt && paidAt <= end ? 'PAID' : due < end ? 'LATE' : 'PENDING';
      return { amount, due, paidAt: status === 'PAID' ? paidAt : null, status } as const;
    });
    const paidCount = instalments.filter(i => i.status === 'PAID').length;
    const late = instalments.filter(i => i.status === 'LATE').length;
    const status = paidCount === count ? 'COMPLETED' : late >= 2 ? 'DEFAULTED' : 'ACTIVE';

    await prisma.$transaction(async tx => {
      await tx.paymentSchedule.create({
        data: {
          id: scheduleId,
          chargeCallId: call.id,
          lotId: call.lotId,
          agreedAt,
          totalAmount: call.outstanding,
          status,
          createdAt: agreedAt
        }
      });
      await tx.paymentScheduleInstalment.createMany({
        data: instalments.map(i => ({
          scheduleId,
          dueDate: i.due,
          amount: i.amount,
          paidAt: i.paidAt,
          paidAmount: i.paidAt ? i.amount : null,
          status: i.status,
          createdAt: agreedAt
        }))
      });
      for (const i of instalments) {
        if (i.status !== 'PAID' || !i.paidAt) continue;
        await addPayment(env, facts, led, tx, {
          lot,
          allocations: [{ call, amount: i.amount }],
          date: i.paidAt,
          method: 'BANK_TRANSFER'
        });
      }
      await refreshCallStatuses(env, tx, [call.id]);
      await led.finalize(tx);
    }, TX_OPTIONS);
    created++;
  }
  return created;
}

// ───────────────────────────────────────────────────────────── F4 : avances

async function seedAdvances(env: SyndicEnv, s: SyndicRow, facts: Facts, led: CoproLedger): Promise<number> {
  const { prisma, end, rng } = env;
  const already = await prisma.chargePayment.count({
    where: { lot: { syndicateId: s.id }, unallocatedAmount: { gt: 0 } }
  });
  if (already > 0) return 0;
  const calls = await prisma.chargeCall.findMany({
    where: { syndicateId: s.id, status: 'PAID', batch: { batchType: 'REGULAR' } },
    orderBy: { dueDate: 'desc' },
    take: facts.lots.length,
    select: { lotId: true, amount: true }
  });
  const lastByLot = new Map<string, number>();
  for (const c of calls) if (!lastByLot.has(c.lotId)) lastByLot.set(c.lotId, num(c.amount));
  const candidates = shuffle(
    rng,
    facts.lots.filter(l => l.behavior === 'punctual' && l.kind === 'APARTMENT' && lastByLot.has(l.id))
  ).slice(0, facts.lots.length >= 40 ? 3 : 2);
  if (candidates.length === 0) return 0;
  await prisma.$transaction(async tx => {
    for (const lot of candidates) {
      const date = addDays(
        local(end.getFullYear(), end.getMonth(), end.getDate(), between(rng, 9, 16)),
        -between(rng, 3, 20)
      );
      await addPayment(env, facts, led, tx, {
        lot,
        allocations: [],
        unallocated: lastByLot.get(lot.id)!,
        date: date > end ? end : date,
        method: lot.method
      });
    }
    await led.finalize(tx);
  }, TX_OPTIONS);
  return candidates.length;
}

// ─────────────────────────────────────────────── F5 : programmation des appels

async function seedChargeSchedules(env: SyndicEnv, s: SyndicRow, facts: Facts): Promise<number> {
  const { prisma, end, rng } = env;
  const exists = await prisma.syndicChargeSchedule.count({ where: { tenantId: env.tenantId, syndicateId: s.id } });
  if (exists > 0) return 0;
  const batches = await prisma.chargeCallBatch.findMany({
    where: { syndicateId: s.id, batchType: 'REGULAR', periodStart: { not: null } },
    orderBy: { periodStart: 'asc' },
    select: { id: true, periodStart: true, periodEnd: true, createdAt: true, totalAmount: true, label: true }
  });
  if (batches.length < 3) return 0;
  const startDate = new Date(Date.UTC(2024, 0, 1));
  const timing = { frequency: 'QUARTERLY' as const, issueDay: 2, dueOffsetDays: 13, startDate };
  const byStart = new Map(batches.map(b => [b.periodStart!.toISOString().slice(0, 10), b]));
  const callCounts = await prisma.chargeCall.groupBy({
    by: ['batchId'],
    where: { syndicateId: s.id, amount: { gt: 0 } },
    _count: { _all: true }
  });
  const countByBatch = new Map(callCounts.map(c => [c.batchId, c._count._all]));
  const activeBudget = await prisma.syndicateBudget.findFirst({
    where: { syndicateId: s.id, status: 'APPROVED' },
    orderBy: { fiscalYear: 'desc' },
    select: { id: true }
  });

  const scheduleId = randomUUID();
  const runs: Array<Record<string, unknown>> = [];
  let period = firstPeriod(timing);
  let lastRunAt: Date | null = null;
  let lastPeriodStart: Date | null = null;
  let index = 0;
  while (period && period.issueDate <= end) {
    const batch = byStart.get(period.periodStart.toISOString().slice(0, 10));
    if (batch) {
      const calls = countByBatch.get(batch.id) ?? 0;
      const skippedFirst = index === 0;
      const createdAt = new Date(
        Date.UTC(
          batch.createdAt.getFullYear(),
          batch.createdAt.getMonth(),
          batch.createdAt.getDate(),
          2,
          between(rng, 0, 20)
        )
      );
      const noneSent = skippedFirst ? 0 : rng() < 0.12 ? 1 : 0;
      runs.push({
        id: randomUUID(),
        tenantId: env.tenantId,
        scheduleId,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        periodLabel: period.label,
        status: skippedFirst ? 'SKIPPED' : 'SUCCESS',
        trigger: index === 1 ? 'MANUAL' : 'CRON',
        batchId: batch.id,
        callsCreated: skippedFirst ? 0 : calls,
        callsCovered: 0,
        notificationsSent: skippedFirst ? 0 : calls - noneSent,
        notificationsSkipped: noneSent,
        notes: skippedFirst
          ? 'Période déjà appelée manuellement : aucun doublon créé.'
          : noneSent
            ? 'Un avis n’est pas parti : le propriétaire du lot n’est plus un copropriétaire actuel.'
            : null,
        createdAt,
        finishedAt: new Date(createdAt.getTime() + between(rng, 15, 90) * 1000)
      });
      if (!skippedFirst) {
        lastRunAt = createdAt;
        lastPeriodStart = period.periodStart;
      }
      index++;
    }
    period = describePeriod(timing, nextPeriodStart(period.periodStart, timing.frequency));
  }
  if (runs.length === 0 || !lastPeriodStart) return 0;
  const next = describePeriod(timing, nextPeriodStart(lastPeriodStart, timing.frequency));
  await prisma.$transaction(async tx => {
    await tx.syndicChargeSchedule.create({
      data: {
        id: scheduleId,
        tenantId: env.tenantId,
        syndicateId: s.id,
        label: 'Appels de fonds trimestriels',
        frequency: 'QUARTERLY',
        issueDay: 2,
        dueOffsetDays: 13,
        amountSource: 'BUDGET',
        budgetId: null,
        currency: 'XOF',
        startDate,
        active: true,
        nextRunAt: next.issueDate,
        lastRunAt,
        createdById: env.adminId,
        createdAt: new Date(Date.UTC(2023, 11, 20, 10, 0))
      }
    });
    await tx.syndicChargeScheduleRun.createMany({ data: runs as never });
    // une programmation en projet, non activée : les appels mensuels du fonds de roulement
    await tx.syndicChargeSchedule.create({
      data: {
        tenantId: env.tenantId,
        syndicateId: s.id,
        label: 'Appels mensuels (projet soumis à l’assemblée)',
        frequency: 'MONTHLY',
        issueDay: 5,
        dueOffsetDays: 10,
        amountSource: 'BUDGET',
        budgetId: activeBudget?.id ?? null,
        currency: 'XOF',
        startDate: new Date(Date.UTC(end.getFullYear() + 1, 0, 1)),
        active: false,
        nextRunAt: null,
        createdById: env.adminId,
        createdAt: addDays(end, -9)
      }
    });
  }, TX_OPTIONS);
  void facts;
  return runs.length;
}

// ───────────────────────────────────────────────────────────── F6 : fonds

interface FundPlan {
  name: string;
  opening: number;
  yearlyCredit: number;
  debits: Array<{ label: string; amount: number }>;
}

async function seedFunds(env: SyndicEnv, s: SyndicRow, facts: Facts, led: CoproLedger): Promise<number> {
  const { prisma, end, rng } = env;
  const budgets = await prisma.syndicateBudget.findMany({
    where: { syndicateId: s.id },
    orderBy: { fiscalYear: 'asc' },
    select: { fiscalYear: true, totalAmount: true }
  });
  if (budgets.length === 0) return 0;
  const base = num(budgets[0].totalAmount);
  const hasElevator = (await prisma.commonAreaAsset.count({ where: { syndicateId: s.id, name: 'Ascenseur' } })) > 0;
  const plans: FundPlan[] = [
    {
      name: 'Fonds de roulement',
      opening: 0,
      yearlyCredit: roundTo(base * 0.035, 10_000),
      debits: [
        { label: 'Dépannage urgent plomberie (colonne d’eau)', amount: roundTo(base * 0.012, 5_000) },
        { label: 'Remplacement de la serrure du portail piéton', amount: roundTo(base * 0.006, 5_000) },
        { label: 'Achat de lampes et luminaires des parties communes', amount: roundTo(base * 0.008, 5_000) },
        { label: 'Réparation de la pompe du surpresseur', amount: roundTo(base * 0.016, 5_000) },
        { label: 'Désinsectisation exceptionnelle du local à poubelles', amount: roundTo(base * 0.005, 5_000) }
      ]
    },
    {
      name: 'Fonds de réserve — imprévus',
      opening: roundTo(base * 0.06, 10_000),
      yearlyCredit: roundTo(base * 0.025, 10_000),
      debits: [
        { label: 'Franchise du sinistre dégât des eaux (lot du 2e étage)', amount: roundTo(base * 0.01, 5_000) },
        { label: 'Expertise d’huissier après intrusion', amount: roundTo(base * 0.007, 5_000) }
      ]
    }
  ];
  if (hasElevator)
    plans.push({
      name: 'Fonds de prévoyance ascenseur',
      opening: roundTo(base * 0.05, 10_000),
      yearlyCredit: roundTo(base * 0.03, 10_000),
      debits: [
        { label: 'Remplacement de la carte électronique de la cabine', amount: roundTo(base * 0.02, 5_000) },
        { label: 'Câbles de traction : remplacement préventif', amount: roundTo(base * 0.025, 5_000) }
      ]
    });

  const assemblies = await prisma.generalMeeting.findMany({
    where: { syndicateId: s.id, type: 'ORDINARY', status: 'COMPLETED' },
    orderBy: { scheduledAt: 'asc' },
    select: { scheduledAt: true }
  });
  let changed = 0;
  await prisma.$transaction(async tx => {
    for (const plan of plans) {
      let fund = await tx.syndicateFund.findFirst({ where: { syndicateId: s.id, name: plan.name } });
      if (!fund) {
        fund = await tx.syndicateFund.create({
          data: { syndicateId: s.id, name: plan.name, balance: 0, currency: 'XOF', createdAt: s.createdAt }
        });
        led.registerFund(fund.id, 0, s.createdAt);
        if (plan.opening > 0)
          await led.fundMovement(tx, {
            fundId: fund.id,
            direction: 'CREDIT',
            amount: plan.opening,
            label: 'Solde repris à la prise de gestion',
            source: 'OPENING',
            at: s.createdAt
          });
      }
      const moves = await tx.syndicateFundMovement.count({ where: { fundId: fund.id } });
      if (moves > 1) continue;
      // un crédit par exercice (après l'assemblée de printemps) et des dépenses étalées
      const events: Array<{ at: Date; dir: 'CREDIT' | 'DEBIT'; amount: number; label: string }> = [];
      for (const ag of assemblies) {
        const at = addDays(ag.scheduledAt, 12);
        if (at > end || at < s.createdAt) continue;
        events.push({
          at,
          dir: 'CREDIT',
          amount: plan.yearlyCredit,
          label:
            plan.name === 'Fonds de roulement'
              ? `Reconstitution du fonds de roulement votée en AG du ${frDate(ag.scheduledAt)}`
              : `Dotation votée en assemblée générale du ${frDate(ag.scheduledAt)}`
        });
      }
      const span = Math.max(60, daysBetween(s.createdAt, end) - 20);
      plan.debits.forEach(d => {
        const at = addDays(s.createdAt, 120 + Math.floor((span - 120) * rng()));
        if (at <= end) events.push({ at, dir: 'DEBIT', amount: d.amount, label: d.label });
      });
      events.sort((a, b) => a.at.getTime() - b.at.getTime());
      for (const e of events) {
        if (e.dir === 'DEBIT' && led.fundBalance(fund.id) < e.amount) continue;
        await led.fundMovement(tx, {
          fundId: fund.id,
          direction: e.dir,
          amount: e.amount,
          label: e.label,
          source: e.dir === 'CREDIT' ? 'MANUAL_ADJUSTMENT' : 'MANUAL_EXPENSE',
          at: e.at
        });
        changed++;
      }
    }
    await led.finalize(tx);
  }, TX_OPTIONS);
  void facts;
  return changed;
}

// ─────────────────────────────────────────────── F6b : ajustements de comptes

async function seedOwnerAdjustments(env: SyndicEnv, s: SyndicRow, facts: Facts, led: CoproLedger): Promise<number> {
  const { prisma, end, rng } = env;
  const done = await prisma.ownerAccountTransaction.count({
    where: { account: { syndicateId: s.id }, type: 'ADJUSTMENT' }
  });
  if (done > 0) return 0;
  const lots = shuffle(
    rng,
    facts.lots.filter(l => ['APARTMENT', 'COMMERCIAL', 'OFFICE'].includes(l.kind))
  );
  const count = Math.min(lots.length, facts.lots.length >= 40 ? 4 : 2);
  await prisma.$transaction(async tx => {
    for (let i = 0; i < count; i++) {
      const lot = lots[i];
      const credit = i % 2 === 0;
      const amount = credit ? roundTo(between(rng, 15_000, 90_000), 500) : roundTo(between(rng, 15_000, 30_000), 500);
      const date = addDays(
        local(end.getFullYear(), end.getMonth(), end.getDate(), between(rng, 9, 16)),
        -between(rng, 20, 150)
      );
      const label = credit
        ? 'Ajustement — avoir de régularisation de charges (tantièmes corrigés)'
        : 'Ajustement — frais de recouvrement refacturés';
      const id = randomUUID();
      await led.entry(tx, {
        date,
        journal: 'OD',
        description: `${label} — lot ${lot.num} (${lot.ownerName})`,
        sourceType: 'MANUAL',
        sourceId: id,
        lines: credit
          ? [
              { acc: '701', debit: amount, label },
              { acc: `450${lot.num}`, credit: amount, label: `${label} — lot ${lot.num}`, lotId: lot.id }
            ]
          : [
              { acc: `450${lot.num}`, debit: amount, label: `${label} — lot ${lot.num}`, lotId: lot.id },
              { acc: '716', credit: amount, label }
            ]
      });
      await led.ownerTx(tx, lot.id, {
        date,
        type: 'ADJUSTMENT',
        debit: credit ? undefined : amount,
        credit: credit ? amount : undefined,
        label,
        sourceId: id
      });
    }
    await led.finalize(tx);
  }, TX_OPTIONS);
  return count;
}

// ─────────────────────────────────────── F6c : moyen de paiement par carte

async function seedCardMethod(env: SyndicEnv, s: SyndicRow): Promise<number> {
  const has = await env.prisma.syndicPaymentMethod.count({ where: { syndicateId: s.id, type: 'CARD' } });
  if (has > 0) return 0;
  await env.prisma.syndicPaymentMethod.create({
    data: {
      syndicateId: s.id,
      type: 'CARD',
      provider: 'PaySecureHub',
      label: 'Carte bancaire (Visa, Mastercard) via la passerelle de paiement',
      isDefault: false,
      isActive: true,
      createdAt: addDays(env.end, -200)
    }
  });
  return 1;
}

// ───────────────────────────────────────────────── F7 : budget de l'exercice suivant

async function seedNextBudget(env: SyndicEnv, s: SyndicRow): Promise<number> {
  const { prisma, end } = env;
  const nextYear = end.getFullYear() + 1;
  const current = await prisma.syndicateBudget.findFirst({
    where: { syndicateId: s.id, fiscalYear: end.getFullYear(), status: 'APPROVED' },
    include: { lines: true }
  });
  if (!current) return 0;
  const exists = await prisma.syndicateBudget.findFirst({ where: { syndicateId: s.id, fiscalYear: nextYear } });
  if (exists) return 0;
  const lots = await prisma.syndicateLot.findMany({
    where: { syndicateId: s.id },
    select: { id: true, generalShares: true }
  });
  const lines = current.lines.map(l => ({
    id: randomUUID(),
    category: l.category,
    description: l.description,
    amount: roundTo(num(l.amountForecast) * 1.06, 10_000),
    distributionKey: l.distributionKey,
    accountId: l.accountId,
    fundId: l.fundId
  }));
  const total = sum(lines.map(l => l.amount));
  const budgetId = randomUUID();
  await prisma.$transaction(async tx => {
    await tx.syndicateBudget.create({
      data: {
        id: budgetId,
        syndicateId: s.id,
        fiscalYear: nextYear,
        label: `Budget prévisionnel ${nextYear} (projet soumis à la prochaine assemblée)`,
        status: 'DRAFT',
        totalAmount: total,
        currency: 'XOF',
        createdAt: addDays(end, -6)
      }
    });
    await tx.budgetLineItem.createMany({
      data: lines.map(l => ({
        id: l.id,
        budgetId,
        category: l.category,
        description: l.description,
        amountForecast: l.amount,
        amountActual: 0,
        distributionKey: l.distributionKey,
        accountId: l.accountId,
        fundId: l.fundId,
        createdAt: addDays(end, -6)
      }))
    });
    await tx.budgetAllocation.createMany({
      data: lots.map(l => ({
        budgetId,
        lotId: l.id,
        totalAllocated: roundTo((total * l.generalShares) / 1000, 100),
        breakdown: { tantiemes: l.generalShares, base: total, cle: 'GENERAL_SHARES' }
      }))
    });
    // l'appel du premier trimestre est préparé en brouillon, il partira après le vote du budget
    const period = `${nextYear}-T1`;
    const clash = await tx.chargeCallBatch.findFirst({
      where: { syndicateId: s.id, period, batchType: 'REGULAR' },
      select: { id: true }
    });
    if (!clash) {
      const bounds = parsePeriodBounds(period);
      await tx.chargeCallBatch.create({
        data: {
          syndicateId: s.id,
          label: `Appel de fonds du 1er trimestre ${nextYear} (brouillon)`,
          period,
          periodStart: bounds?.start ?? null,
          periodEnd: bounds?.end ?? null,
          dueDate: local(nextYear, 0, 15, 23, 59),
          batchType: 'REGULAR',
          budgetId,
          totalAmount: roundTo(total / 4, 100),
          currency: 'XOF',
          status: 'DRAFT',
          createdAt: addDays(end, -6)
        }
      });
    }
  }, TX_OPTIONS);
  return 1;
}

// ───────────────────────────────────────────────────────────────── orchestrateur

/** Les lots d'appels du générateur de base n'ont pas de bornes de période : on les déduit du libellé. */
async function backfillBatchBounds(env: SyndicEnv, s: SyndicRow): Promise<void> {
  const batches = await env.prisma.chargeCallBatch.findMany({
    where: { syndicateId: s.id, periodStart: null },
    select: { id: true, period: true }
  });
  for (const b of batches) {
    const bounds = parsePeriodBounds(b.period.replace(/-TRAVAUX$/, ''));
    if (!bounds) continue;
    await env.prisma.chargeCallBatch.update({
      where: { id: b.id },
      data: { periodStart: bounds.start, periodEnd: bounds.end }
    });
  }
}

export async function seedSyndicFinances(env: SyndicEnv): Promise<void> {
  for (const s of env.syndicates) {
    await backfillBatchBounds(env, s);
    const facts = await loadFacts(env, s);
    const led = await CoproLedger.load(env, s.id);
    const current = await seedCurrentPeriod(env, s, facts, led);
    const regul = await seedRegularisations(env, s, facts, led);
    const plans = await seedSchedules(env, s, facts, led);
    const adv = await seedAdvances(env, s, facts, led);
    const runs = await seedChargeSchedules(env, s, facts);
    const fundMoves = await seedFunds(env, s, facts, led);
    const adjustments = await seedOwnerAdjustments(env, s, facts, led);
    const card = await seedCardMethod(env, s);
    const budget = await seedNextBudget(env, s);
    env.log(
      `syndic-extras finances « ${s.name} » : appel en cours ${current}, régularisations ${regul}, échéanciers ${plans}, ` +
        `avances ${adv}, exécutions de programmation ${runs}, mouvements de fonds ${fundMoves}, ajustements ${adjustments}, ` +
        `moyen carte ${card}, budget suivant ${budget}`
    );
  }
}
