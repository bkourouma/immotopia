import { Decimal } from '@prisma/client/runtime/library';
import { RentalBillingFrequency, RentalInstallmentStatus, RentalLease } from '@prisma/client';

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
  /** La période demandée suit la date de fin du bail. */
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
  periodMonth: number
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
  }

  const dueDayOfMonth = lease.due_day_of_month || 5;
  const dueDate = calculateDueDate(periodStartDate, dueDayOfMonth);

  return {
    included: true,
    data: {
      tenant_id: lease.tenant_id,
      lease_id: lease.id,
      period_year: periodYear,
      period_month: periodMonth,
      due_date: dueDate,
      status: RentalInstallmentStatus.DRAFT,
      currency: lease.currency || 'FCFA',
      amount_rent: lease.rent_amount,
      amount_service: lease.service_charge_amount || 0,
      amount_other_fees: 0,
      penalty_amount: 0,
      amount_paid: 0
    }
  };
}
