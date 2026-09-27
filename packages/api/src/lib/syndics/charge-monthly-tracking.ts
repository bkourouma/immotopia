/**
 * Suivi mensuel des appels de charges (lot S2, besoin 5) : pour chaque lot
 * d'une copropriete, les mois de janvier a decembre regles, partiels, dus ou
 * en retard.
 *
 * Regles :
 * - un appel dont la periode couvre plusieurs mois est reparti a parts egales
 *   sur ces mois ; le dernier mois absorbe l'arrondi. La repartition se fait a
 *   l'unite monetaire quand le montant est rond (franc CFA), au centime sinon ;
 * - le montant regle d'un appel remplit ses mois dans l'ordre chronologique :
 *   un trimestre a moitie paye montre le premier mois regle, pas trois mois
 *   « partiels » ;
 * - un appel sans bornes de periode est range au mois de son echeance ;
 * - statut d'un mois : NONE (aucun appel), PAID (regle >= du), OVERDUE (une
 *   part non soldee d'un appel echu), PARTIAL (regle > 0), DUE sinon — meme
 *   logique que `deriveChargeCallStatus` : un partiel echu est en retard.
 */

import { prisma } from '../../utils/database';
import { assertSyndicateOfTenant, sumAllocationsByCall } from './charge-allocation';
import { fromCents, toCents } from './charge-allocation-plan';
import { utcDay, lastDayOfMonth } from './period';

export type MonthStatus = 'NONE' | 'PAID' | 'PARTIAL' | 'DUE' | 'OVERDUE';

export interface TrackedCall {
  id: string;
  lotId: string;
  amountCents: number;
  paidCents: number;
  dueDate: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
}

export interface MonthCell {
  month: number;
  due: number;
  paid: number;
  status: MonthStatus;
}

interface MonthPart {
  year: number;
  month: number;
  dueCents: number;
  paidCents: number;
}

/** Mois (annee, mois 1-12) couverts par un appel, dans l'ordre. */
export function monthsOfCall(call: Pick<TrackedCall, 'dueDate' | 'periodStart' | 'periodEnd'>) {
  if (!call.periodStart || !call.periodEnd) {
    const due = new Date(call.dueDate);
    return [{ year: due.getUTCFullYear(), month: due.getUTCMonth() + 1 }];
  }
  const start = new Date(call.periodStart);
  const end = new Date(call.periodEnd);
  const months: Array<{ year: number; month: number }> = [];
  let cursor = start.getUTCFullYear() * 12 + start.getUTCMonth();
  const last = end.getUTCFullYear() * 12 + end.getUTCMonth();
  // Garde-fou : une periode aberrante (plusieurs siecles) ne fait pas exploser la boucle.
  const ceiling = Math.min(last, cursor + 1200);
  for (; cursor <= ceiling; cursor += 1) {
    months.push({ year: Math.floor(cursor / 12), month: (cursor % 12) + 1 });
  }
  return months.length > 0 ? months : [{ year: start.getUTCFullYear(), month: start.getUTCMonth() + 1 }];
}

/** Parts egales, dernier mois absorbant l'arrondi ; a l'unite si le montant est rond. */
export function splitEvenly(totalCents: number, parts: number): number[] {
  if (parts <= 1) return [totalCents];
  const step = totalCents % 100 === 0 ? 100 : 1;
  const units = Math.round(totalCents / step);
  const base = Math.floor(units / parts);
  const shares = Array.from({ length: parts }, () => base * step);
  shares[parts - 1] = totalCents - base * step * (parts - 1);
  return shares;
}

/** Decoupe un appel en parts mensuelles (du et regle). */
export function monthPartsOfCall(call: TrackedCall): MonthPart[] {
  const months = monthsOfCall(call);
  const dues = splitEvenly(call.amountCents, months.length);
  let paidLeft = Math.max(0, Math.min(call.paidCents, call.amountCents));
  return months.map((month, index) => {
    const paidCents = Math.min(paidLeft, dues[index]);
    paidLeft -= paidCents;
    return { ...month, dueCents: dues[index], paidCents };
  });
}

/** Grille de janvier a decembre d'un lot pour `year`. Pure. */
export function buildLotMonthGrid(calls: TrackedCall[], year: number, now: Date = new Date()): MonthCell[] {
  const cells = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    dueCents: 0,
    paidCents: 0,
    hasCall: false,
    overdue: false
  }));

  for (const call of calls) {
    const isPastDue = new Date(call.dueDate).getTime() < now.getTime();
    for (const part of monthPartsOfCall(call)) {
      if (part.year !== year) continue;
      const cell = cells[part.month - 1];
      cell.hasCall = true;
      cell.dueCents += part.dueCents;
      cell.paidCents += part.paidCents;
      if (isPastDue && part.paidCents < part.dueCents) cell.overdue = true;
    }
  }

  return cells.map(cell => ({
    month: cell.month,
    due: fromCents(cell.dueCents),
    paid: fromCents(cell.paidCents),
    status: monthStatus(cell)
  }));
}

function monthStatus(cell: { hasCall: boolean; dueCents: number; paidCents: number; overdue: boolean }): MonthStatus {
  if (!cell.hasCall) return 'NONE';
  if (cell.paidCents >= cell.dueCents) return 'PAID';
  if (cell.overdue) return 'OVERDUE';
  if (cell.paidCents > 0) return 'PARTIAL';
  return 'DUE';
}

function ownerNameOf(contact?: { firstName?: string | null; lastName?: string | null; legalName?: string | null } | null) {
  if (!contact) return null;
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  return name || contact.legalName || null;
}

/** Appels touchant l'annee : bornes qui chevauchent l'annee, ou echeance dans l'annee sans bornes. */
async function loadCallsOfYear(syndicateId: string, tenantId: string, year: number) {
  const yearStart = utcDay(year, 1, 1);
  const yearEnd = lastDayOfMonth(year, 12);
  const nextYear = utcDay(year + 1, 1, 1);
  return prisma.chargeCall.findMany({
    where: {
      syndicateId,
      syndicate: { tenantId },
      OR: [
        { periodStart: { lte: yearEnd }, periodEnd: { gte: yearStart } },
        { periodStart: null, dueDate: { gte: yearStart, lt: nextYear } }
      ]
    },
    select: { id: true, lotId: true, amount: true, currency: true, dueDate: true, periodStart: true, periodEnd: true }
  });
}

async function loadAdvanceByLot(lotIds: string[]) {
  const byLot = new Map<string, number>();
  if (lotIds.length === 0) return byLot;
  const payments = await prisma.chargePayment.findMany({
    where: { lotId: { in: lotIds }, unallocatedAmount: { gt: 0 } },
    select: { lotId: true, unallocatedAmount: true }
  });
  for (const payment of payments) {
    byLot.set(payment.lotId, (byLot.get(payment.lotId) ?? 0) + toCents(payment.unallocatedAmount));
  }
  return byLot;
}

export async function getMonthlyTrackingBySyndicate(tenantId: string, syndicateId: string, year: number) {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);

  const [lots, calls] = await Promise.all([
    prisma.syndicateLot.findMany({
      where: { syndicateId, syndicate: { tenantId } },
      select: {
        id: true,
        lotNumber: true,
        owner: { select: { firstName: true, lastName: true, legalName: true } },
        coowner: { select: { firstName: true, lastName: true, legalName: true } }
      },
      orderBy: { lotNumber: 'asc' }
    }),
    loadCallsOfYear(syndicateId, tenantId, year)
  ]);
  const [paidByCall, advanceByLot] = await Promise.all([
    sumAllocationsByCall(
      prisma,
      calls.map(call => call.id)
    ),
    loadAdvanceByLot(lots.map(lot => lot.id))
  ]);

  const callsByLot = new Map<string, TrackedCall[]>();
  for (const call of calls) {
    const list = callsByLot.get(call.lotId) ?? [];
    list.push({
      id: call.id,
      lotId: call.lotId,
      amountCents: toCents(call.amount),
      paidCents: paidByCall.get(call.id) ?? 0,
      dueDate: call.dueDate,
      periodStart: call.periodStart,
      periodEnd: call.periodEnd
    });
    callsByLot.set(call.lotId, list);
  }

  const now = new Date();
  return {
    year,
    currency: calls[0]?.currency ?? 'XOF',
    months: Array.from({ length: 12 }, (_, index) => index + 1),
    lots: lots.map(lot => ({
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      ownerName: ownerNameOf(lot.owner) ?? ownerNameOf(lot.coowner),
      advance: fromCents(advanceByLot.get(lot.id) ?? 0),
      months: buildLotMonthGrid(callsByLot.get(lot.id) ?? [], year, now)
    }))
  };
}
