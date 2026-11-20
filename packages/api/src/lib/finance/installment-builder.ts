import { Decimal } from '@prisma/client/runtime/library';
import { RentalBillingFrequency, RentalInstallmentStatus, RentalLease } from '@prisma/client';
import { roundForCurrency } from './currency-rounding';

/**
 * Cœur de calcul de la génération d'échéances, extrait de
 * `generateInstallments` (services/rental-installment-service.ts) pour que la
 * campagne de facturation mensuelle (`RentBillingRun`, lot 1) puisse le
 * réutiliser sans reconstruire le calcul à l'envers.
 *
 * `generateInstallments` part d'un bail et déroule toutes ses périodes depuis
 * sa date de début. La campagne part au contraire d'un mois donné et demande,
 * pour chaque bail actif, « cette période le concerne-t-elle, et si oui avec
 * quel montant ? ». Les deux sens de parcours doivent produire exactement la
 * même échéance pour une même période : c'est ce que garantit cette fonction
 * pure, seule dépositaire du calcul.
 */

/**
 * Sous-ensemble du bail nécessaire au calcul. Un `Pick` plutôt que le type
 * `RentalLease` complet : la fonction ne lit que ces champs et n'a pas besoin
 * qu'on lui passe un enregistrement Prisma complet (utile pour la campagne du
 * lot 1, qui peut ne sélectionner que ces colonnes).
 */
export type LeaseForInstallmentBuilding = Pick<
  RentalLease,
  | 'id'
  | 'tenant_id'
  | 'start_date'
  | 'end_date'
  | 'billing_frequency'
  | 'due_day_of_month'
  | 'currency'
  | 'rent_amount'
  | 'service_charge_amount'
>;

/**
 * Données d'une échéance prête à être créée par `prisma.rentalInstallment.create`.
 * Champs et valeurs par défaut identiques à ce que `generateInstallments`
 * construisait en ligne — aucun changement de comportement.
 */
export interface InstallmentBuildData {
  tenant_id: string;
  lease_id: string;
  period_year: number;
  period_month: number;
  due_date: Date;
  status: RentalInstallmentStatus;
  currency: string;
  amount_rent: Decimal | number;
  amount_service: Decimal | number;
  amount_other_fees: number;
  penalty_amount: number;
  amount_paid: number;
}

/**
 * Motif pour lequel une période donnée n'est pas une période de facturation
 * de ce bail. La campagne du lot 1 les affiche tels quels dans son compte
 * rendu (`RentBillingRun.summary`) : ce sont donc des motifs métier, pas des
 * détails d'implémentation.
 */
export type InstallmentExclusionReason =
  /** La période demandée précède la date de début du bail. */
  | 'PERIOD_BEFORE_LEASE_START'
  /** La période demandée suit la date de fin du bail, ou n'en couvre que le
   *  dernier jour (début de période == date de fin : non facturée). */
  | 'PERIOD_AFTER_LEASE_END'
  /** Le bail existe sur cette période, mais ne s'y facture pas (ex. bail
   *  trimestriel démarré en février : rien à facturer en mars). */
  | 'PERIOD_OFF_BILLING_CYCLE';

/**
 * Résultat de `buildInstallmentForPeriod` : une union discriminée plutôt
 * qu'une simple valeur nullable. Un `null` dirait « rien à faire » mais
 * perdrait le pourquoi ; or la campagne doit justifier chaque exclusion
 * (bail suspendu, période hors bail, échéance déjà existante, bail sans
 * montant — PLAN-mise-en-oeuvre.md §5.2 tâche 1.5). Porter le motif dans le
 * type renvoyé évite à l'appelant de le redeviner et au compilateur de
 * vérifier qu'on ne lit `data` que quand `included` est vrai.
 */
export type InstallmentBuildResult =
  { included: true; data: InstallmentBuildData } | { included: false; reason: InstallmentExclusionReason };

const BILLING_CYCLE_MONTHS: Record<RentalBillingFrequency, number> = {
  [RentalBillingFrequency.MONTHLY]: 1,
  [RentalBillingFrequency.QUARTERLY]: 3,
  [RentalBillingFrequency.SEMIANNUAL]: 6,
  [RentalBillingFrequency.ANNUAL]: 12
};

/**
 * Date de début de la période (année, mois) pour ce bail.
 *
 * La toute première période d'un bail commence à sa date de début exacte
 * (qui peut tomber n'importe quel jour du mois). Les périodes suivantes
 * commencent toujours le 1er du mois : c'est un effet de bord de
 * `calculatePeriodEnd` dans `generateInstallments`, qui aligne systématiquement
 * la fin de période sur le dernier jour d'un mois calendaire, donc le début
 * de la période suivante sur le 1er du mois d'après. On reproduit cette règle
 * ici pour que la date d'échéance calculée soit identique à celle que
 * `generateInstallments` aurait produite.
 */
function resolvePeriodStartDate(
  lease: LeaseForInstallmentBuilding,
  periodYear: number,
  periodMonth: number,
  monthsSinceLeaseStart: number
): Date {
  if (monthsSinceLeaseStart === 0) {
    const startDate = new Date(lease.start_date);
    startDate.setHours(0, 0, 0, 0);
    return startDate;
  }

  const periodStart = new Date(periodYear, periodMonth - 1, 1);
  periodStart.setHours(0, 0, 0, 0);
  return periodStart;
}

/** Numéro de jour (calendrier local, insensible à l'heure d'été) : permet de compter des jours entiers. */
function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/**
 * Fraction facturée d'une période (décision H5, prorata au jour) : jours
 * effectivement couverts / jours de la période calendaire nominale.
 *
 * La période nominale d'un cycle de N mois va du 1er du mois de début de période
 * au dernier jour du Ne mois. Les jours couverts vont de `coveredStart` (début
 * exact du bail pour la première période, 1er du mois pour les suivantes) à
 * `coveredEnd` (fin nominale, plafonnée par la fin du bail). Une période
 * complète vaut 1 : un bail qui commence un 1er du mois ne change pas.
 */
export function periodFraction(
  periodYear: number,
  periodMonth: number,
  cycleMonths: number,
  coveredStart: Date,
  coveredEnd: Date
): number {
  const nominalStart = new Date(periodYear, periodMonth - 1, 1);
  const nominalEnd = new Date(periodYear, periodMonth - 1 + cycleMonths, 0);
  const nominalDays = dayNumber(nominalEnd) - dayNumber(nominalStart) + 1;
  const covered = dayNumber(coveredEnd) - dayNumber(coveredStart) + 1;
  if (covered >= nominalDays) return 1;
  if (covered <= 0) return 0;
  return covered / nominalDays;
}

/** Applique une fraction de période à un montant, arrondi selon la devise. Fraction 1 : montant inchangé. */
function prorate(amount: Decimal | number, fraction: number, currency: string): Decimal | number {
  if (fraction >= 1) return amount;
  return roundForCurrency(Number(amount) * fraction, currency);
}

/**
 * Calcule la date d'échéance pour une période, au jour du mois configuré sur
 * le bail (`due_day_of_month`), avec repli sur le dernier jour du mois si ce
 * jour n'existe pas (ex. le 31 pour un mois de 30 jours). Identique à
 * `calculateDueDate` dans rental-installment-service.ts.
 */
function calculateDueDate(periodStartDate: Date, dueDayOfMonth: number): Date {
  const dueDate = new Date(periodStartDate);

  const targetMonth = dueDate.getMonth();
  const targetYear = dueDate.getFullYear();
  const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

  if (dueDayOfMonth > lastDayOfMonth) {
    dueDate.setDate(lastDayOfMonth);
  } else {
    dueDate.setDate(dueDayOfMonth);
  }

  return dueDate;
}

/**
 * Changement de loyer/charges daté (révision, renouvellement avec nouveau
 * loyer), lu dans `LeaseEvent`. `effectiveYear/effectiveMonth` est le mois
 * d'effet : le nouveau montant ne vaut qu'à partir de cette période.
 */
export interface RentChange {
  effectiveYear: number;
  effectiveMonth: number;
  previousRent: Decimal | number | null;
  newRent: Decimal | number | null;
  previousCharges: Decimal | number | null;
  newCharges: Decimal | number | null;
}

/**
 * Loyer et charges qui s'appliquent à une période (BUG-2026-09-28-023) : le
 * bail ne porte que le montant le plus récent ; une période antérieure au mois
 * d'effet d'une révision reste au montant d'avant.
 */
export function resolveAmountsForPeriod(
  lease: Pick<LeaseForInstallmentBuilding, 'rent_amount' | 'service_charge_amount'>,
  periodYear: number,
  periodMonth: number,
  changes?: RentChange[]
): { rent: Decimal | number; charges: Decimal | number } {
  const base = { rent: lease.rent_amount, charges: lease.service_charge_amount || 0 };
  if (!changes || changes.length === 0) return base;
  const index = (y: number, m: number) => y * 12 + m;
  const period = index(periodYear, periodMonth);
  const sorted = [...changes].sort(
    (a, b) => index(a.effectiveYear, a.effectiveMonth) - index(b.effectiveYear, b.effectiveMonth)
  );
  type Amounts = { rent: Decimal | number; charges: Decimal | number };
  let current = null as Amounts | null;
  for (const change of sorted) {
    if (index(change.effectiveYear, change.effectiveMonth) <= period) {
      const before: Amounts = current ?? base;
      current = { rent: change.newRent ?? before.rent, charges: change.newCharges ?? before.charges };
    } else if (!current) {
      // Avant la première révision : montants d'avant.
      return {
        rent: change.previousRent ?? base.rent,
        charges: change.previousCharges ?? base.charges
      };
    }
  }
  return current ?? base;
}

/**
 * Options de `buildInstallmentForPeriod`.
 *
 * `periodEnd` : fin effective de la période, quand l'appelant la connaît mieux
 * que le builder (`generateInstallments` : horizon d'un an d'un bail sans date
 * de fin). Sans elle, la fin est déduite de min(fin nominale, fin du bail) ; un
 * bail sans date de fin n'est alors PAS prorata en fin de période (la campagne
 * de facturation émet des mois pleins tant que le bail est actif).
 */
export interface BuildInstallmentOptions {
  periodEnd?: Date;
}

/**
 * Construit les données d'une échéance pour un bail et une période donnés,
 * ou indique pourquoi cette période ne concerne pas ce bail.
 *
 * Fonction pure : aucun appel Prisma, aucun effet de bord, aucune écriture de
 * log. Elle peut être appelée aussi bien par `generateInstallments` (qui
 * parcourt les périodes d'un bail dans l'ordre depuis sa date de début) que
 * par la campagne de facturation du lot 1 (qui part d'un mois donné et
 * interroge chaque bail actif).
 */
export function buildInstallmentForPeriod(
  lease: LeaseForInstallmentBuilding,
  periodYear: number,
  periodMonth: number,
  changes?: RentChange[],
  options?: BuildInstallmentOptions
): InstallmentBuildResult {
  const leaseStartDate = new Date(lease.start_date);
  const leaseStartYear = leaseStartDate.getFullYear();
  const leaseStartMonth = leaseStartDate.getMonth() + 1;

  const monthsSinceLeaseStart = (periodYear - leaseStartYear) * 12 + (periodMonth - leaseStartMonth);

  if (monthsSinceLeaseStart < 0) {
    return { included: false, reason: 'PERIOD_BEFORE_LEASE_START' };
  }

  const cycleMonths = BILLING_CYCLE_MONTHS[lease.billing_frequency] ?? 1;
  if (monthsSinceLeaseStart % cycleMonths !== 0) {
    return { included: false, reason: 'PERIOD_OFF_BILLING_CYCLE' };
  }

  const periodStartDate = resolvePeriodStartDate(lease, periodYear, periodMonth, monthsSinceLeaseStart);

  // Un bail sans date de fin n'a ici AUCUNE borne haute : toute periode
  // posterieure a son debut et alignee sur son cycle est facturable.
  //
  // C'est une divergence assumee avec `generateInstallments`, qui borne un
  // tel bail a douze mois. Ce plafond y est une commodite de generation en
  // masse — il faut bien s'arreter quelque part quand on genere tout d'un
  // coup — et non une regle metier. La campagne du lot 1, elle, procede mois
  // par mois : un bail a duree indeterminee doit continuer d'etre facture
  // tant qu'il est actif, ce que ce plafond lui interdirait a tort.
  //
  // `generateInstallments` garde son plafond : c'est sa propre boucle qui le
  // pose, pas cette fonction.
  if (lease.end_date) {
    const leaseEndDate = new Date(lease.end_date);
    if (periodStartDate > leaseEndDate) {
      return { included: false, reason: 'PERIOD_AFTER_LEASE_END' };
    }

    // Une période (hors première) réduite au seul dernier jour du bail n'est
    // pas facturée : un bail du 01/07/2026 au 01/07/2027 a 12 échéances
    // mensuelles, pas 13. Même règle que `listBillingPeriods`
    // (lib/rental/installment-periods.ts), donc que `generateInstallments`.
    // La première période n'est jamais retirée (bail d'un seul jour).
    const leaseEndDay = new Date(leaseEndDate);
    leaseEndDay.setHours(0, 0, 0, 0);
    if (monthsSinceLeaseStart > 0 && periodStartDate.getTime() === leaseEndDay.getTime()) {
      return { included: false, reason: 'PERIOD_AFTER_LEASE_END' };
    }
  }

  const dueDayOfMonth = lease.due_day_of_month || 5;
  let dueDate = calculateDueDate(periodStartDate, dueDayOfMonth);

  // Première période : l'échéance n'est jamais antérieure au début du bail
  // (BUG-2026-09-28-023). Si le jour d'échéance du mois de début est déjà passé
  // à l'entrée dans les lieux, la première échéance tombe au jour d'échéance
  // du mois suivant. Les échéances suivantes ne changent pas.
  if (monthsSinceLeaseStart === 0 && dueDate < periodStartDate) {
    dueDate = calculateDueDate(
      new Date(periodStartDate.getFullYear(), periodStartDate.getMonth() + 1, 1),
      dueDayOfMonth
    );
  }

  const amounts = resolveAmountsForPeriod(lease, periodYear, periodMonth, changes);

  // Prorata au jour (décision H5) : première et dernière périodes au nombre de
  // jours couverts. Les échéances déjà générées ne sont jamais recalculées.
  const currency = lease.currency || 'FCFA';
  const nominalEnd = new Date(periodYear, periodMonth - 1 + cycleMonths, 0);
  let coveredEnd = nominalEnd;
  if (options?.periodEnd) {
    coveredEnd = new Date(options.periodEnd);
  } else if (lease.end_date) {
    const leaseEnd = new Date(lease.end_date);
    if (dayNumber(leaseEnd) < dayNumber(nominalEnd)) coveredEnd = leaseEnd;
  }
  const fraction = periodFraction(periodYear, periodMonth, cycleMonths, periodStartDate, coveredEnd);

  return {
    included: true,
    data: {
      tenant_id: lease.tenant_id,
      lease_id: lease.id,
      period_year: periodYear,
      period_month: periodMonth,
      due_date: dueDate,
      status: RentalInstallmentStatus.DRAFT,
      currency,
      amount_rent: prorate(amounts.rent, fraction, currency),
      amount_service: prorate(amounts.charges, fraction, currency),
      amount_other_fees: 0,
      penalty_amount: 0,
      amount_paid: 0
    }
  };
}
