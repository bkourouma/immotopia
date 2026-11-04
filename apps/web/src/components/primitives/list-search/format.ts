import dayjs from 'dayjs';
import { dateFormat, formatNumber } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import type {
  DateRangeValue,
  NumberRangeValue,
  SearchCriterion,
  SearchOption,
  SearchValue
} from '../../../utils/list-search/types';

/**
 * Formatage des puces de `<ListSearch>` et petits utilitaires de valeur.
 *
 * Fichier sans React : tout est testable en isolation, et rien ici n'est
 * propre à un écran.
 */

/** Format des dates échangées avec l'URL et l'API. */
export const ISO_DAY = 'YYYY-MM-DD';

/** Un critère est actif quand sa valeur filtre réellement quelque chose. */
export function isActiveValue(value: SearchValue): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  const range = value as DateRangeValue & NumberRangeValue;
  return (
    (range.from !== undefined && range.from !== '') ||
    (range.to !== undefined && range.to !== '') ||
    typeof range.min === 'number' ||
    typeof range.max === 'number'
  );
}

/**
 * Valeur à émettre : une valeur vide devient `undefined`, quel que soit le type
 * (y compris `[]` pour `multiSelect`). C'est la convention de la barre : « vider
 * un critère » s'écrit toujours `{ [key]: undefined }`.
 */
export function emitValue(value: SearchValue): SearchValue {
  return isActiveValue(value) ? value : undefined;
}

export function cacheKey(key: string, value: string): string {
  return `${key}\u0000${value}`;
}

/** Libellé d'une valeur de `select` : options connues, puis libellés vus/résolus, puis la valeur brute. */
export function optionLabel(
  criterion: SearchCriterion,
  value: string,
  cache: Readonly<Record<string, string>>
): string {
  if (criterion.type === 'select' || criterion.type === 'multiSelect') {
    const found = criterion.options?.find(option => option.value === value);
    if (found) return found.label;
  }
  return cache[cacheKey(criterion.key, value)] ?? value;
}

/** Libellé connu sans appel réseau ; `undefined` si la valeur brute serait seule disponible. */
export function knownOptionLabel(
  criterion: SearchCriterion,
  value: string,
  cache: Readonly<Record<string, string>>
): string | undefined {
  if (criterion.type === 'select' || criterion.type === 'multiSelect') {
    const found = criterion.options?.find(option => option.value === value);
    if (found) return found.label;
  }
  return cache[cacheKey(criterion.key, value)];
}

/** Ajoute à `options` l'option de la valeur courante quand elle n'y figure pas (valeur venue de l'URL). */
export function withCurrentOption(
  options: readonly SearchOption[],
  value: string | undefined,
  label: string | undefined
): SearchOption[] {
  if (!value || options.some(option => option.value === value)) return [...options];
  return [{ value, label: label ?? value }, ...options];
}

export function formatIsoDay(value: string | undefined): string {
  if (!value) return '';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format(dateFormat('short')) : value;
}

function amount(value: number, unit: string | undefined): string {
  const text = formatNumber(value);
  return unit ? `${text} ${unit}` : text;
}

/** « 10 000 – 50 000 FCFA », « ≥ 10 000 FCFA », « ≤ 50 000 FCFA ». */
export function formatNumberRange(range: NumberRangeValue, unit?: string): string {
  const hasMin = typeof range.min === 'number';
  const hasMax = typeof range.max === 'number';
  if (hasMin && hasMax) {
    const text = `${formatNumber(range.min as number)} – ${formatNumber(range.max as number)}`;
    return unit ? `${text} ${unit}` : text;
  }
  if (hasMin) return `≥ ${amount(range.min as number, unit)}`;
  if (hasMax) return `≤ ${amount(range.max as number, unit)}`;
  return '';
}

/** « du 01/01/2026 au 31/01/2026 », « à partir du … », « jusqu'au … ». */
export function formatDateRange(range: DateRangeValue): string {
  const from = formatIsoDay(range.from);
  const to = formatIsoDay(range.to);
  if (range.from && range.to) return t('du {{from}} au {{to}}', { from, to });
  if (range.from) return t('à partir du {{from}}', { from });
  if (range.to) return t("jusqu'au {{to}}", { to });
  return '';
}

export interface ChipParts {
  label: string;
  /** `null` : la puce n'est que le libellé (booléen coché). */
  value: string | null;
  /** Dates et nombres : à isoler (`<bdi>`) pour ne pas se retourner en arabe. */
  isolate: boolean;
}

/** Les morceaux d'une puce, ou `null` si le critère est inactif (ou est le champ libre). */
export function chipParts(
  criterion: SearchCriterion,
  value: SearchValue,
  cache: Readonly<Record<string, string>>
): ChipParts | null {
  if (criterion.type === 'text' || !isActiveValue(value)) return null;
  const label = criterion.label;
  switch (criterion.type) {
    case 'select':
      return { label, value: optionLabel(criterion, String(value), cache), isolate: false };
    case 'multiSelect':
      return {
        label,
        value: (value as string[]).map(v => optionLabel(criterion, v, cache)).join(', '),
        isolate: false
      };
    case 'dateRange':
      return { label, value: formatDateRange(value as DateRangeValue), isolate: true };
    case 'numberRange':
      return { label, value: formatNumberRange(value as NumberRangeValue, criterion.unit), isolate: true };
    case 'boolean': {
      if (value === true && !criterion.tristate) return { label, value: null, isolate: false };
      const text = value === true ? (criterion.trueLabel ?? t('Oui')) : (criterion.falseLabel ?? t('Non'));
      return { label, value: text, isolate: false };
    }
    default:
      return null;
  }
}

/** Texte lisible d'une puce (aussi son `title`), ou `null` si le critère est inactif. */
export function chipText(
  criterion: SearchCriterion,
  value: SearchValue,
  cache: Readonly<Record<string, string>>
): string | null {
  const parts = chipParts(criterion, value, cache);
  if (!parts) return null;
  return parts.value === null ? parts.label : t('{{label}} : {{value}}', { label: parts.label, value: parts.value });
}
