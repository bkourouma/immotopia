/**
 * Periodes structurees des appels de charges (lot S2).
 *
 * `ChargeCall.period` reste un libelle libre ; ses bornes `periodStart` /
 * `periodEnd` (dates sans heure, minuit UTC) servent au suivi mensuel. Cet
 * analyseur est le jumeau exact de la fonction SQL de rattrapage de la
 * migration `20260929110000_syndic_affectation_avance` : tout format ajoute
 * ici doit l'etre aussi la-bas (et inversement).
 *
 * Formats reconnus (annee de 1000 a 9999) :
 *   « AAAA-MM-JJ au AAAA-MM-JJ »  bornes explicites (debut <= fin)
 *   « AAAA-MM »                   mois entier
 *   « AAAA-Qn » / « AAAA-Tn »     trimestre n (1 a 4)
 *   « AAAA »                      annee entiere
 * Un suffixe de recurrence « -R1 » est ignore ; « -R2 » et suivants ne sont
 * pas lisibles seuls (le decalage depend de la frequence, que le libelle ne
 * porte pas) : la creation d'appels recurrents calcule donc elle-meme les
 * bornes de chaque occurrence avec `shiftPeriodBounds`.
 */

export interface PeriodBounds {
  start: Date;
  end: Date;
}

export type RecurrenceFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

const RANGE_PATTERN = /^([1-9]\d{3}-\d{2}-\d{2}) au ([1-9]\d{3}-\d{2}-\d{2})$/;
const MONTH_PATTERN = /^([1-9]\d{3})-(\d{2})$/;
const QUARTER_PATTERN = /^([1-9]\d{3})-[QqTt]([1-4])$/;
const YEAR_PATTERN = /^([1-9]\d{3})$/;
const ISO_DAY_PATTERN = /^([1-9]\d{3})-(\d{2})-(\d{2})$/;

/** Minuit UTC du jour donne (mois de 1 a 12). */
export function utcDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Dernier jour du mois (mois de 1 a 12), a minuit UTC. */
export function lastDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

/**
 * Lit une date « AAAA-MM-JJ » stricte : « 2026-02-30 » est refusee au lieu
 * d'etre repoussee au 2 mars comme le ferait `Date`.
 */
export function parseIsoDay(value: string): Date | null {
  const match = ISO_DAY_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) return null;
  const date = utcDay(year, month, day);
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date : null;
}

/** Deduit les bornes d'un libelle de periode, ou `null` s'il est illisible. */
export function parsePeriodBounds(label: string | null | undefined): PeriodBounds | null {
  const base = String(label ?? '')
    .trim()
    .replace(/-R1$/, '');

  const range = RANGE_PATTERN.exec(base);
  if (range) {
    const start = parseIsoDay(range[1]);
    const end = parseIsoDay(range[2]);
    return start && end && start.getTime() <= end.getTime() ? { start, end } : null;
  }

  const month = MONTH_PATTERN.exec(base);
  if (month) {
    const [year, monthIndex] = [Number(month[1]), Number(month[2])];
    if (monthIndex < 1 || monthIndex > 12) return null;
    return { start: utcDay(year, monthIndex, 1), end: lastDayOfMonth(year, monthIndex) };
  }

  const quarter = QUARTER_PATTERN.exec(base);
  if (quarter) {
    const [year, q] = [Number(quarter[1]), Number(quarter[2])];
    const firstMonth = (q - 1) * 3 + 1;
    return { start: utcDay(year, firstMonth, 1), end: lastDayOfMonth(year, firstMonth + 2) };
  }

  const year = YEAR_PATTERN.exec(base);
  if (year) {
    const value = Number(year[1]);
    return { start: utcDay(value, 1, 1), end: utcDay(value, 12, 31) };
  }

  return null;
}

/** Ajoute des mois a une date en gardant le jour, borne au dernier jour du mois cible. */
function addMonthsClamped(date: Date, months: number): Date {
  const totalMonths = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  const day = Math.min(date.getUTCDate(), lastDayOfMonth(year, month).getUTCDate());
  return utcDay(year, month, day);
}

function isLastDayOfMonth(date: Date): boolean {
  return date.getUTCDate() === lastDayOfMonth(date.getUTCFullYear(), date.getUTCMonth() + 1).getUTCDate();
}

/**
 * Decale une periode de `months` mois. Une fin de mois reste une fin de mois
 * (« 2026-01-01 au 2026-01-31 » + 1 mois = « 2026-02-01 au 2026-02-28 »).
 */
export function shiftPeriodBounds(bounds: PeriodBounds, months: number): PeriodBounds {
  const start = addMonthsClamped(bounds.start, months);
  const shiftedEnd = addMonthsClamped(bounds.end, months);
  const end = isLastDayOfMonth(bounds.end)
    ? lastDayOfMonth(shiftedEnd.getUTCFullYear(), shiftedEnd.getUTCMonth() + 1)
    : shiftedEnd;
  return { start, end };
}

export function recurrenceStepMonths(frequency: RecurrenceFrequency): number {
  if (frequency === 'QUARTERLY') return 3;
  if (frequency === 'ANNUAL') return 12;
  return 1;
}

/**
 * Bornes a enregistrer pour un appel : celles fournies explicitement, sinon
 * celles du libelle. Les deux bornes vont ensemble (jamais une seule).
 */
export function resolvePeriodBounds(input: {
  period: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}): PeriodBounds | null {
  if (input.periodStart && input.periodEnd) {
    return { start: input.periodStart, end: input.periodEnd };
  }
  return parsePeriodBounds(input.period);
}

/** Forme « AAAA-MM-JJ » d'une date sans heure (lue en UTC). */
export function formatIsoDay(date: Date | null | undefined): string | null {
  if (!date) return null;
  return new Date(date).toISOString().slice(0, 10);
}
