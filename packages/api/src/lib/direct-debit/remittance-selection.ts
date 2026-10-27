/**
 * Sélection des échéances à prélever (spec 042, P2, data-model §7.2, décision D6).
 *
 * Fonctions PURES : aucune lecture en base. Le service charge les mandats, les
 * échéances et les lignes existantes, puis appelle `evaluateMandate` pour
 * chacun. Les montants sont comparés au centime près.
 */

export type SkipReason =
  | 'NO_INSTALLMENT'
  | 'NOTHING_DUE'
  | 'ALREADY_IN_REMITTANCE'
  | 'LEASE_NOT_ACTIVE'
  | 'COLLECTION_DAY_LATER'
  | 'MANDATE_NOT_ACTIVE';

/** Statuts d'échéance prélevables (`PAID` et `CANCELED` ne le sont jamais). */
export const COLLECTABLE_INSTALLMENT_STATUSES = ['DRAFT', 'DUE', 'OVERDUE', 'PARTIAL'] as const;

export interface SelectionMandate {
  /** Plafond par prélèvement ; nul : pas de plafond. */
  maxAmount: number | null;
  /** Jour de collecte propre au mandat ; nul : celui du créancier. */
  collectionDay: number | null;
  /** Statut du bail du mandat ; nul si le mandat n'a pas de bail. */
  leaseStatus: string | null;
}

export interface SelectionInstallment {
  status: string;
  amountRent: number;
  amountService: number;
  amountOtherFees: number;
  amountPaid: number;
}

export type SelectionResult =
  { kind: 'SELECTED'; amount: number; remainingDue: number; capped: boolean } | { kind: 'SKIPPED'; reason: SkipReason };

export const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Reste dû hors pénalités = max(0, loyer + services + autres frais − déjà payé).
 * Les pénalités ne sont jamais prélevées.
 */
export function remainingDue(installment: SelectionInstallment): number {
  return Math.max(
    0,
    roundMoney(
      installment.amountRent + installment.amountService + installment.amountOtherFees - installment.amountPaid
    )
  );
}

/** Jour effectif de collecte d'un mandat : le sien, sinon celui du créancier. */
export const effectiveCollectionDay = (mandate: Pick<SelectionMandate, 'collectionDay'>, creditorDay: number): number =>
  mandate.collectionDay ?? creditorDay;

/**
 * Décision pour un mandat. Ordre des motifs : bail, jour de collecte, échéance
 * absente, rien à devoir, échéance déjà dans une ligne non annulée.
 *
 * @param collectionDayOfMonth jour du mois de la date de collecte de la remise
 * @param alreadyInRemittance l'échéance figure déjà dans une ligne non annulée d'une AUTRE remise
 */
export function evaluateMandate(args: {
  mandate: SelectionMandate;
  creditorCollectionDay: number;
  collectionDayOfMonth: number;
  installment: SelectionInstallment | null;
  alreadyInRemittance: boolean;
}): SelectionResult {
  const { mandate, installment } = args;
  if (mandate.leaseStatus !== 'ACTIVE') return { kind: 'SKIPPED', reason: 'LEASE_NOT_ACTIVE' };
  if (effectiveCollectionDay(mandate, args.creditorCollectionDay) > args.collectionDayOfMonth) {
    return { kind: 'SKIPPED', reason: 'COLLECTION_DAY_LATER' };
  }
  if (!installment) return { kind: 'SKIPPED', reason: 'NO_INSTALLMENT' };
  if (!(COLLECTABLE_INSTALLMENT_STATUSES as readonly string[]).includes(installment.status)) {
    return { kind: 'SKIPPED', reason: 'NOTHING_DUE' };
  }
  const due = remainingDue(installment);
  if (due <= 0) return { kind: 'SKIPPED', reason: 'NOTHING_DUE' };
  if (args.alreadyInRemittance) return { kind: 'SKIPPED', reason: 'ALREADY_IN_REMITTANCE' };

  const capped = mandate.maxAmount !== null && mandate.maxAmount < due;
  return {
    kind: 'SELECTED',
    amount: capped ? roundMoney(mandate.maxAmount as number) : due,
    remainingDue: due,
    capped
  };
}

/** Deux montants identiques au centime près. */
export const sameMoney = (a: number, b: number): boolean => Math.round(a * 100) === Math.round(b * 100);
