import { fromCents, toCents } from './charge-allocation-plan';
import { lastDayOfMonth, utcDay } from './period';

/**
 * Programmation des appels de charges (lot S4, besoin 6) — calculs PURS.
 *
 * Les périodes suivent le calendrier civil : un mois, un trimestre civil
 * (janvier-mars…), un semestre (janvier-juin, juillet-décembre) ou une année.
 * Toutes les dates sont des jours sans heure, à minuit UTC.
 *
 * - La première période d'une programmation est celle qui CONTIENT sa date de
 *   début ; les suivantes s'enchaînent sans trou.
 * - Une période est émise le `issueDay` (1 à 28, donc valable tous les mois)
 *   de son premier mois ; son échéance tombe `dueOffsetDays` jours plus tard.
 * - Une période qui commence après la date de fin n'existe pas.
 */

export type ChargeScheduleFrequency = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

export const FREQUENCY_MONTHS: Record<ChargeScheduleFrequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12
};

/** Nombre de périodes par année civile (1, 2, 4 ou 12). */
export function periodsPerYearOf(frequency: ChargeScheduleFrequency): number {
  return 12 / FREQUENCY_MONTHS[frequency];
}

export interface ScheduleTiming {
  frequency: ChargeScheduleFrequency;
  issueDay: number;
  dueOffsetDays: number;
  startDate: Date;
  endDate?: Date | null;
}

export interface SchedulePeriod {
  periodStart: Date;
  periodEnd: Date;
  /** Libellé lisible : « Octobre 2026 », « T4 2026 », « S2 2026 », « 2026 ». */
  label: string;
  issueDate: Date;
  dueDate: Date;
  /** Rang de la période dans son année civile (1 à `periodsPerYear`). */
  indexInYear: number;
  periodsPerYear: number;
}

const MONTH_NAMES = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre'
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Minuit UTC du jour de `date`. */
export function startOfUtcDay(date: Date): Date {
  return utcDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(startOfUtcDay(date).getTime() + days * DAY_MS);
}

/** Premier jour de la période civile qui contient `date`. */
export function periodStartContaining(date: Date, frequency: ChargeScheduleFrequency): Date {
  const step = FREQUENCY_MONTHS[frequency];
  const monthIndex = Math.floor(date.getUTCMonth() / step) * step;
  return utcDay(date.getUTCFullYear(), monthIndex + 1, 1);
}

/** Premier jour de la période qui suit celle commençant à `periodStart`. */
export function nextPeriodStart(periodStart: Date, frequency: ChargeScheduleFrequency): Date {
  const total = periodStart.getUTCFullYear() * 12 + periodStart.getUTCMonth() + FREQUENCY_MONTHS[frequency];
  return utcDay(Math.floor(total / 12), (total % 12) + 1, 1);
}

export function periodLabel(periodStart: Date, frequency: ChargeScheduleFrequency, indexInYear: number): string {
  const year = periodStart.getUTCFullYear();
  if (frequency === 'MONTHLY') return `${MONTH_NAMES[periodStart.getUTCMonth()]} ${year}`;
  if (frequency === 'QUARTERLY') return `T${indexInYear} ${year}`;
  if (frequency === 'SEMIANNUAL') return `S${indexInYear} ${year}`;
  return String(year);
}

/** La période (bornes, dates, libellé) qui commence à `periodStart`. */
export function describePeriod(timing: ScheduleTiming, periodStart: Date): SchedulePeriod {
  const step = FREQUENCY_MONTHS[timing.frequency];
  const year = periodStart.getUTCFullYear();
  const firstMonth = periodStart.getUTCMonth() + 1;
  const lastMonth = firstMonth + step - 1;
  const indexInYear = Math.floor((firstMonth - 1) / step) + 1;
  const issueDate = utcDay(year, firstMonth, timing.issueDay);
  return {
    periodStart,
    periodEnd: lastDayOfMonth(year, lastMonth),
    label: periodLabel(periodStart, timing.frequency, indexInYear),
    issueDate,
    dueDate: addUtcDays(issueDate, timing.dueOffsetDays),
    indexInYear,
    periodsPerYear: periodsPerYearOf(timing.frequency)
  };
}

/** La période commence-t-elle au plus tard à la date de fin (quand il y en a une) ? */
function withinEnd(timing: ScheduleTiming, periodStart: Date): boolean {
  return !timing.endDate || periodStart.getTime() <= startOfUtcDay(timing.endDate).getTime();
}

/** Première période de la programmation (celle qui contient la date de début), ou `null` si hors fin. */
export function firstPeriod(timing: ScheduleTiming): SchedulePeriod | null {
  const start = periodStartContaining(timing.startDate, timing.frequency);
  return withinEnd(timing, start) ? describePeriod(timing, start) : null;
}

/** Période qui suit `period`, ou `null` après la date de fin. */
export function followingPeriod(timing: ScheduleTiming, period: SchedulePeriod): SchedulePeriod | null {
  const start = nextPeriodStart(period.periodStart, timing.frequency);
  return withinEnd(timing, start) ? describePeriod(timing, start) : null;
}

/**
 * Période de la programmation qui contient `date`, ou `null` si la date
 * précède la première période ou dépasse la dernière.
 */
export function periodContaining(timing: ScheduleTiming, date: Date): SchedulePeriod | null {
  const first = firstPeriod(timing);
  if (!first) return null;
  const start = periodStartContaining(date, timing.frequency);
  if (start.getTime() < first.periodStart.getTime() || !withinEnd(timing, start)) return null;
  return describePeriod(timing, start);
}

/** Période N (0 = la première) de la programmation, ou `null` au-delà de la fin. */
export function periodAt(timing: ScheduleTiming, index: number): SchedulePeriod | null {
  let period = firstPeriod(timing);
  for (let step = 0; period && step < index; step += 1) period = followingPeriod(timing, period);
  return period;
}

/**
 * Première période dont la date d'émission tombe le jour `from` ou après,
 * parmi celles qui ne sont pas déjà traitées (`isDone`). `null` s'il n'y en
 * a plus avant la date de fin. Bornée à 600 périodes (50 ans de mensualités).
 */
export function firstPeriodIssuedOnOrAfter(
  timing: ScheduleTiming,
  from: Date,
  isDone: (periodStart: Date) => boolean = () => false
): SchedulePeriod | null {
  const threshold = startOfUtcDay(from).getTime();
  // Les périodes antérieures à celle qui contient `from` sont émises avant
  // elle : on part directement de celle-ci (ou de la première, si `from` la
  // précède).
  let period = periodContaining(timing, from) ?? firstPeriod(timing);
  for (let guard = 0; period && guard < 600; guard += 1) {
    if (period.issueDate.getTime() >= threshold && !isDone(period.periodStart)) return period;
    period = followingPeriod(timing, period);
  }
  return null;
}

// ---------------------------------------------------------------- montants

/**
 * Part d'un montant annuel pour la période `periodIndex` (1 à `periodsPerYear`) :
 * un N-ième arrondi au centime inférieur, la DERNIÈRE période de l'année
 * absorbant le reste — la somme des N parts vaut exactement le montant annuel.
 */
export function annualShareForPeriod(annualAmount: number, periodsPerYear: number, periodIndex: number): number {
  if (!Number.isInteger(periodsPerYear) || periodsPerYear < 1) throw new RangeError('periodsPerYear invalide');
  if (!Number.isInteger(periodIndex) || periodIndex < 1 || periodIndex > periodsPerYear) {
    throw new RangeError('periodIndex invalide');
  }
  const annualCents = toCents(annualAmount);
  const base = Math.floor(annualCents / periodsPerYear);
  const cents = periodIndex === periodsPerYear ? annualCents - base * (periodsPerYear - 1) : base;
  return fromCents(cents);
}

export interface ShareLot {
  id: string;
  lotNumber: string;
  lotType: string;
  generalShares: number;
}

/** Types de lots principaux (mêmes que le registre des lots, D2). */
export const MAIN_LOT_TYPES = new Set(['APARTMENT', 'OFFICE', 'COMMERCIAL']);

/**
 * Répartit un montant fixe par tantièmes généraux entre les lots principaux
 * (appartements, bureaux, locaux commerciaux). Sans lot principal, tous les
 * lots ; sans tantième, parts égales. Calcul en centimes, le dernier lot (par
 * numéro) absorbe l'arrondi : la somme vaut exactement le montant.
 */
export function distributeFixedAmount(amount: number, lots: ShareLot[]): Array<{ lotId: string; amount: number }> {
  const main = lots.filter(lot => MAIN_LOT_TYPES.has(lot.lotType));
  const targets = [...(main.length > 0 ? main : lots)].sort((a, b) =>
    a.lotNumber.localeCompare(b.lotNumber, 'fr', { numeric: true })
  );
  if (targets.length === 0) return [];
  const totalCents = toCents(amount);
  const totalShares = targets.reduce((sum, lot) => sum + Math.max(0, Number(lot.generalShares) || 0), 0);
  const weightOf = (lot: ShareLot) => (totalShares > 0 ? Math.max(0, Number(lot.generalShares) || 0) : 1);
  const totalWeight = totalShares > 0 ? totalShares : targets.length;

  let distributed = 0;
  return targets.map((lot, index) => {
    const cents =
      index === targets.length - 1 ? totalCents - distributed : Math.floor((totalCents * weightOf(lot)) / totalWeight);
    distributed += cents;
    return { lotId: lot.id, amount: fromCents(cents) };
  });
}
