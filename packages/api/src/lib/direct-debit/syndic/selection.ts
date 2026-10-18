import { toIsoDate } from '../business-days';
import { contactDisplayName, type DbClient } from '../dto';
import { mandateReferenceOf } from '../remittance-dto';
import { effectiveCollectionDay, roundMoney, type SelectionResult } from '../remittance-selection';

/**
 * Sélection des appels de charges à prélever (spec 042, P4, data-model §9.3).
 * Remplace la sélection d'échéances locatives (§7.2) pour le périmètre
 * `SYNDIC_LOT`.
 *
 * Pour chaque mandat ACTIVE du créancier du syndicat : les appels de son lot
 * avec `amount > 0`, échus à la date de collecte (`dueDate ≤ collectionDate`,
 * comparés au jour) et dont le reste dû (montant − affectations) est positif,
 * du plus ancien au plus récent (`dueDate`, `createdAt`, `id`). L'avance du lot
 * est déjà imputée aux appels (invariant de `charge-allocation.ts`) : le reste
 * dû la contient. Montant = min(reste dû, plafond du mandat). Les pénalités de
 * retard ne sont jamais prélevées.
 *
 * `evaluateLotMandate` est PURE ; `evaluateSyndicCandidates` charge les
 * données, toutes filtrées par agence et par syndicat.
 */

/** Candidat d'une remise, tous périmètres confondus. */
export interface Candidate {
  mandateId: string;
  mandateReference: string;
  // RENTAL_LEASE
  leaseId: string | null;
  leaseNumber: string | null;
  installmentId: string | null;
  debtorClientId: string | null;
  // SYNDIC_LOT
  lotId: string | null;
  lotNumber: string | null;
  debtorContactId: string | null;
  /** Appels couverts, plus ancien d'abord ; vide en RENTAL_LEASE. */
  chargeCallIds: string[];
  debtorName: string | null;
  result: SelectionResult;
}

export interface SelectionCall {
  id: string;
  amount: number;
  /** Somme des affectations déjà imputées (paiements et avance). */
  paid: number;
  dueDate: Date;
  createdAt: Date;
}

export type LotSelectionResult =
  | { kind: 'SELECTED'; amount: number; remainingDue: number; capped: boolean; chargeCallIds: string[] }
  | { kind: 'SKIPPED'; reason: 'NOTHING_DUE' | 'ALREADY_IN_REMITTANCE' | 'COLLECTION_DAY_LATER' };

export const callOutstanding = (call: Pick<SelectionCall, 'amount' | 'paid'>): number =>
  Math.max(0, roundMoney(call.amount - call.paid));

/** Appels prélevables à la date de collecte, plus ancien d'abord. */
export function collectableCalls(calls: SelectionCall[], collectionDate: Date): SelectionCall[] {
  const limit = toIsoDate(collectionDate);
  return calls
    .filter(call => call.amount > 0 && toIsoDate(call.dueDate) <= limit && callOutstanding(call) > 0)
    .sort(
      (a, b) =>
        a.dueDate.getTime() - b.dueDate.getTime() ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
}

/**
 * Décision pour un mandat de lot. Ordre des motifs : jour de collecte, rien à
 * devoir, lot déjà dans une ligne vivante d'une autre remise.
 */
export function evaluateLotMandate(args: {
  mandate: { maxAmount: number | null; collectionDay: number | null };
  creditorCollectionDay: number;
  collectionDate: Date;
  calls: SelectionCall[];
  alreadyInRemittance: boolean;
}): LotSelectionResult {
  const { mandate } = args;
  if (effectiveCollectionDay(mandate, args.creditorCollectionDay) > args.collectionDate.getUTCDate()) {
    return { kind: 'SKIPPED', reason: 'COLLECTION_DAY_LATER' };
  }
  const calls = collectableCalls(args.calls, args.collectionDate);
  if (calls.length === 0) return { kind: 'SKIPPED', reason: 'NOTHING_DUE' };
  if (args.alreadyInRemittance) return { kind: 'SKIPPED', reason: 'ALREADY_IN_REMITTANCE' };

  const due = roundMoney(calls.reduce((sum, call) => sum + callOutstanding(call), 0));
  const capped = mandate.maxAmount !== null && mandate.maxAmount < due;
  return {
    kind: 'SELECTED',
    amount: capped ? roundMoney(mandate.maxAmount as number) : due,
    remainingDue: due,
    capped,
    chargeCallIds: calls.map(call => call.id)
  };
}

/** Écarts entre deux ensembles d'appels (ordre sans importance). */
export const sameCallSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

const toCents = (value: unknown) => Math.round(Number(value) * 100);

/**
 * Évalue tous les mandats du créancier du syndicat pour la date de collecte.
 * `ownRemittanceId` : les lignes de CETTE remise ne comptent pas comme déjà
 * dans une remise (actualisation, validation).
 */
export async function evaluateSyndicCandidates(
  db: DbClient,
  tenantId: string,
  syndicateId: string,
  creditor: { id: string; collectionDay: number },
  collectionDate: Date,
  ownRemittanceId: string | null
): Promise<Candidate[]> {
  const mandates = await db.directDebitMandate.findMany({
    // DRAFT et SUSPENDED ne donnent jamais de ligne : ils ne servent qu'à les signaler (MANDATE_NOT_ACTIVE).
    where: {
      tenantId,
      scope: 'SYNDIC_LOT',
      syndicateId,
      creditorId: creditor.id,
      status: { in: ['ACTIVE', 'DRAFT', 'SUSPENDED'] }
    },
    orderBy: [{ year: 'asc' }, { sequence: 'asc' }],
    select: {
      id: true,
      status: true,
      year: true,
      sequence: true,
      lotId: true,
      debtorContactId: true,
      maxAmount: true,
      collectionDay: true,
      lot: { select: { id: true, lotNumber: true } },
      debtorContact: { select: { id: true, contactType: true, firstName: true, lastName: true, legalName: true } }
    }
  });
  if (mandates.length === 0) return [];

  const activeLotIds = Array.from(
    new Set(
      mandates
        .filter(mandate => mandate.status === 'ACTIVE')
        .map(mandate => mandate.lotId)
        .filter((id): id is string => Boolean(id))
    )
  );

  const callsByLot = new Map<string, SelectionCall[]>();
  const livingLots = new Set<string>();
  if (activeLotIds.length > 0) {
    const dayAfter = new Date(collectionDate.getTime() + 24 * 60 * 60 * 1000);
    const calls = await db.chargeCall.findMany({
      where: {
        lotId: { in: activeLotIds },
        syndicateId,
        syndicate: { tenantId },
        amount: { gt: 0 },
        dueDate: { lt: dayAfter }
      },
      select: { id: true, lotId: true, amount: true, dueDate: true, createdAt: true }
    });
    const allocations =
      calls.length === 0
        ? []
        : await db.chargePaymentAllocation.findMany({
            where: { chargeCallId: { in: calls.map(call => call.id) } },
            select: { chargeCallId: true, amount: true }
          });
    const paidCents = new Map<string, number>();
    for (const allocation of allocations) {
      paidCents.set(
        allocation.chargeCallId,
        (paidCents.get(allocation.chargeCallId) ?? 0) + toCents(allocation.amount)
      );
    }
    for (const call of calls) {
      const list = callsByLot.get(call.lotId) ?? [];
      list.push({
        id: call.id,
        amount: Number(call.amount),
        paid: (paidCents.get(call.id) ?? 0) / 100,
        dueDate: call.dueDate,
        createdAt: call.createdAt
      });
      callsByLot.set(call.lotId, list);
    }

    const taken = await db.directDebitRemittanceLine.findMany({
      where: {
        tenantId,
        lotId: { in: activeLotIds },
        status: 'PENDING',
        ...(ownRemittanceId ? { remittanceId: { not: ownRemittanceId } } : {})
      },
      select: { lotId: true }
    });
    for (const line of taken) if (line.lotId) livingLots.add(line.lotId);
  }

  return mandates.map(mandate => {
    const lotId = mandate.lotId ?? null;
    const base = {
      mandateId: mandate.id,
      mandateReference: mandateReferenceOf(mandate.year, mandate.sequence),
      leaseId: null,
      leaseNumber: null,
      installmentId: null,
      debtorClientId: null,
      lotId,
      lotNumber: mandate.lot?.lotNumber ?? null,
      debtorContactId: mandate.debtorContactId ?? null,
      debtorName: mandate.debtorContact ? contactDisplayName(mandate.debtorContact) : null
    };
    if (mandate.status !== 'ACTIVE' || !lotId) {
      return {
        ...base,
        chargeCallIds: [],
        result: { kind: 'SKIPPED', reason: 'MANDATE_NOT_ACTIVE' } as SelectionResult
      };
    }
    const decision = evaluateLotMandate({
      mandate: {
        maxAmount: mandate.maxAmount === null ? null : Number(mandate.maxAmount),
        collectionDay: mandate.collectionDay
      },
      creditorCollectionDay: creditor.collectionDay,
      collectionDate,
      calls: callsByLot.get(lotId) ?? [],
      alreadyInRemittance: livingLots.has(lotId)
    });
    if (decision.kind === 'SKIPPED') {
      return { ...base, chargeCallIds: [], result: decision as SelectionResult };
    }
    return {
      ...base,
      chargeCallIds: decision.chargeCallIds,
      result: {
        kind: 'SELECTED',
        amount: decision.amount,
        remainingDue: decision.remainingDue,
        capped: decision.capped
      } as SelectionResult
    };
  });
}
