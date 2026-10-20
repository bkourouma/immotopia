import dayjs from 'dayjs';
import { dateFormat } from '../i18n/format';
import { t } from '../i18n/t';

/**
 * Libellé de période d'un appel de charges, dans la langue affichée.
 *
 * `ChargeCall.period` est un libellé FRANÇAIS stocké (« Octobre 2026 »,
 * « T4 2026 », « S2 2026 », « 2026 ») : l'afficher tel quel laisse du français
 * dans l'interface arabe ou anglaise. Quand les bornes sont connues on les
 * déduit ; sinon on reconnaît le libellé français et on le localise.
 */
export interface ChargePeriodSource {
  period: string;
  periodStart?: string | null;
  periodEnd?: string | null;
}

const DAY_MS = 86_400_000;

const FRENCH_MONTHS = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre'
];

/** Minuscules sans accents : « Février » et « fevrier » se valent. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** Mois (0-11) d'une année, formaté dans la langue courante. Date locale à midi : aucun décalage de fuseau. */
function monthLabel(year: number, monthIndex: number): string {
  return dayjs(new Date(year, monthIndex, 15, 12)).format(dateFormat('month'));
}

function quarterLabel(n: number, year: number): string {
  return t('T{{n}} {{year}}', { n, year });
}

function semesterLabel(n: number, year: number): string {
  return t('S{{n}} {{year}}', { n, year });
}

function fromDates(start: Date, end: Date): string | null {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (days >= 27 && days <= 33) return monthLabel(year, month);
  if (days >= 87 && days <= 94) return quarterLabel(Math.floor(month / 3) + 1, year);
  if (days >= 178 && days <= 186) return semesterLabel(Math.floor(month / 6) + 1, year);
  if (days >= 360 && days <= 368) return String(year);
  return null;
}

function fromFrench(period: string): string | null {
  const text = normalize(period);
  let match = /^([a-z]+)\s+(\d{4})$/.exec(text);
  if (match) {
    const index = FRENCH_MONTHS.indexOf(match[1]);
    return index >= 0 ? monthLabel(Number(match[2]), index) : null;
  }
  match = /^t([1-4])\s+(\d{4})$/.exec(text);
  if (match) return quarterLabel(Number(match[1]), Number(match[2]));
  match = /^s([1-2])\s+(\d{4})$/.exec(text);
  if (match) return semesterLabel(Number(match[1]), Number(match[2]));
  match = /^(\d{4})$/.exec(text);
  return match ? match[1] : null;
}

export function formatChargePeriod(call: ChargePeriodSource): string {
  if (call.periodStart && call.periodEnd) {
    const label = fromDates(new Date(call.periodStart), new Date(call.periodEnd));
    if (label) return label;
  }
  return fromFrench(call.period) ?? call.period;
}
