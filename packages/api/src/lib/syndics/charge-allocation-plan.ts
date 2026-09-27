/**
 * Affectation des paiements de charges — calculs PURS (lot S2, besoins 4 et 5).
 *
 * Regles decidees par l'utilisateur (27/09/2026) :
 * - un paiement solde d'abord les appels les plus anciens (echeance
 *   croissante, puis date de creation) ; le gestionnaire peut designer
 *   lui-meme les appels couverts, qui passent alors en premier ;
 * - l'excedent devient une AVANCE (part non affectee du paiement), imputee
 *   automatiquement sur les appels ouverts du lot, les plus anciens d'abord,
 *   en consommant les avances dans l'ordre de leur paiement (FIFO).
 *
 * Tous les calculs se font en CENTIMES ENTIERS : aucune addition de flottants,
 * donc aucun centime cree ni perdu. Les montants sortent en unites monetaires
 * (nombre a deux decimales au plus) par `fromCents`.
 */

/** Montant (nombre, chaine ou Decimal Prisma) converti en centimes entiers. */
export function toCents(value: unknown): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  // Passage par une chaine a 6 decimales : 1.005 * 100 vaut 100.49999999999999
  // en binaire, et Math.round seul arrondirait vers le bas une demie exacte.
  const cents = Math.round(Number((numeric * 100).toFixed(6)));
  return cents === 0 ? 0 : cents;
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Appel susceptible de recevoir une affectation. */
export interface AllocatableCall {
  id: string;
  dueDate: Date;
  createdAt: Date;
  /** Reste du, en centimes. */
  outstandingCents: number;
}

/** Avance disponible : part non affectee d'un paiement. */
export interface AdvanceSource {
  paymentId: string;
  paidAt: Date;
  createdAt: Date;
  availableCents: number;
}

export interface PlannedAllocation {
  chargeCallId: string;
  amountCents: number;
}

export interface PlannedImputation extends PlannedAllocation {
  paymentId: string;
}

export interface AllocationPlan {
  allocations: PlannedAllocation[];
  /** Reliquat non affecte (avance), en centimes. */
  advanceCents: number;
}

const time = (date: Date) => new Date(date).getTime();

/** Ordre d'affectation : echeance croissante, puis creation, puis identifiant (stable). */
export function compareCallsForAllocation(a: AllocatableCall, b: AllocatableCall): number {
  return (
    time(a.dueDate) - time(b.dueDate) || time(a.createdAt) - time(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Ordre de consommation des avances : date de paiement, puis saisie, puis identifiant. */
export function compareAdvances(a: AdvanceSource, b: AdvanceSource): number {
  return (
    time(a.paidAt) - time(b.paidAt) ||
    time(a.createdAt) - time(b.createdAt) ||
    (a.paymentId < b.paymentId ? -1 : a.paymentId > b.paymentId ? 1 : 0)
  );
}

/**
 * Repartit `amountCents` sur les appels ouverts.
 *
 * Avec `selectedCallIds` (non vide), seuls ces appels recoivent le paiement,
 * dans l'ordre de leur echeance ; sinon tous les appels ouverts du lot. Un
 * appel choisi deja solde est simplement saute. Ce qui reste devient l'avance.
 */
export function planAllocationCents(
  openCalls: AllocatableCall[],
  amountCents: number,
  selectedCallIds?: string[] | null
): AllocationPlan {
  const selection = selectedCallIds && selectedCallIds.length > 0 ? new Set(selectedCallIds) : null;
  const targets = openCalls
    .filter(call => call.outstandingCents > 0 && (!selection || selection.has(call.id)))
    .sort(compareCallsForAllocation);

  let remaining = Math.max(0, Math.trunc(amountCents));
  const allocations: PlannedAllocation[] = [];
  for (const call of targets) {
    if (remaining <= 0) break;
    const applied = Math.min(remaining, call.outstandingCents);
    allocations.push({ chargeCallId: call.id, amountCents: applied });
    remaining -= applied;
  }

  return { allocations, advanceCents: remaining };
}

/**
 * Version en unites monetaires de `planAllocationCents` (contrat du plan S2) :
 * `openCalls[].outstanding` et `amount` en unites, resultat en unites.
 */
export function planAllocation(
  openCalls: Array<{ id: string; dueDate: Date; createdAt: Date; outstanding: number | string }>,
  amount: number | string,
  selectedCallIds?: string[] | null
): { allocations: Array<{ chargeCallId: string; amount: number }>; advance: number } {
  const plan = planAllocationCents(
    openCalls.map(call => ({ ...call, outstandingCents: toCents(call.outstanding) })),
    toCents(amount),
    selectedCallIds
  );
  return {
    allocations: plan.allocations.map(item => ({ chargeCallId: item.chargeCallId, amount: fromCents(item.amountCents) })),
    advance: fromCents(plan.advanceCents)
  };
}

/**
 * Imputation des avances sur les appels ouverts : les appels les plus anciens
 * d'abord, chacun servi par les avances les plus anciennes d'abord.
 * Ne modifie pas ses arguments.
 */
export function planAdvanceImputation(advances: AdvanceSource[], openCalls: AllocatableCall[]): PlannedImputation[] {
  const pool = advances
    .filter(advance => advance.availableCents > 0)
    .sort(compareAdvances)
    .map(advance => ({ ...advance }));
  const calls = openCalls.filter(call => call.outstandingCents > 0).sort(compareCallsForAllocation);

  const imputations: PlannedImputation[] = [];
  let poolIndex = 0;
  for (const call of calls) {
    let due = call.outstandingCents;
    while (due > 0 && poolIndex < pool.length) {
      const advance = pool[poolIndex];
      const applied = Math.min(due, advance.availableCents);
      imputations.push({ paymentId: advance.paymentId, chargeCallId: call.id, amountCents: applied });
      advance.availableCents -= applied;
      due -= applied;
      if (advance.availableCents <= 0) poolIndex += 1;
    }
    if (poolIndex >= pool.length) break;
  }
  return imputations;
}

/** Statut stocke d'un appel d'apres son regle (meme regle que `computeChargeCallStatus`). */
export function statusFromCents(paidCents: number, amountCents: number): 'PENDING' | 'PARTIAL' | 'PAID' {
  if (paidCents <= 0) return 'PENDING';
  if (paidCents < amountCents) return 'PARTIAL';
  return 'PAID';
}
