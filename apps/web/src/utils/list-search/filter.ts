import { normalizeText, toLocalDay } from './normalize';
import type { DateRangeValue, NumberRangeValue, SearchCriterion, SearchValue, SearchValues } from './types';

/** Configuration du filtrage local d'une liste reçue en entier. */
export interface LocalFilterConfig<T> {
  criteria: readonly SearchCriterion[];
  /** Accesseurs du champ libre (critère `text`) : toutes les colonnes textuelles utiles. */
  text?: readonly ((item: T) => unknown)[];
  /** Accesseur par clé de critère (non-text) ; un critère sans accesseur ni prédicat est ignoré localement. */
  accessors?: Partial<Record<string, (item: T) => unknown>>;
  /** Prédicat sur mesure par clé : prime sur l'accesseur. Reçoit la valeur ACTIVE. */
  predicates?: Partial<Record<string, (item: T, value: Exclude<SearchValue, undefined>) => boolean>>;
}

type Accessor<T> = (item: T) => unknown;

/** Vrai si la valeur d'un critère pèse sur le filtrage. Un booléen `false` est un critère actif (« Non »). */
export function isActiveValue(value: SearchValue): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  return Object.values(value).some(bound => bound !== undefined && bound !== '');
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/** Découpe un terme en mots normalisés, sans mot vide. */
function toWords(term: string): string[] {
  return normalizeText(term)
    .split(' ')
    .filter(word => word !== '');
}

/** Chaque mot doit apparaître dans au moins une valeur normalisée des accesseurs. */
function matchesWords<T>(item: T, words: readonly string[], accessors: readonly Accessor<T>[]): boolean {
  if (words.length === 0) return true;
  const values: string[] = [];
  for (const accessor of accessors) {
    const raw = accessor(item);
    for (const entry of Array.isArray(raw) ? raw : [raw]) {
      values.push(normalizeText(entry));
    }
  }
  return words.every(word => values.some(value => value.includes(word)));
}

/**
 * Recherche libre : le terme est découpé en mots, et chaque mot doit figurer
 * dans au moins une valeur des accesseurs (sans casse ni accents). Terme vide : vrai.
 */
export function matchesText<T>(item: T, term: string, accessors: readonly Accessor<T>[]): boolean {
  return matchesWords(item, toWords(term), accessors);
}

/** Égalité sur la forme texte de la valeur ; une valeur tableau matche si l'un de ses éléments matche. */
export function matchesEquals(value: unknown, wanted: string | undefined): boolean {
  if (wanted === undefined || wanted === '') return true;
  if (Array.isArray(value)) return value.some(entry => String(entry) === wanted);
  return isPresent(value) && String(value) === wanted;
}

/** Au moins une des valeurs demandées figure dans la valeur (ou dans ses éléments si c'est un tableau). */
export function matchesAnyOf(value: unknown, wanted: readonly string[]): boolean {
  if (wanted.length === 0) return true;
  if (Array.isArray(value)) return value.some(entry => wanted.includes(String(entry)));
  return isPresent(value) && wanted.includes(String(value));
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Jour `aaaa-mm-jj` d'une valeur de date (Date ou chaîne ISO), en heure locale ; `''` si inexploitable. */
function dayOf(value: unknown): string {
  if (value instanceof Date) return toLocalDay(value);
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (DAY_PATTERN.test(trimmed)) return trimmed;
  return toLocalDay(new Date(trimmed));
}

/** Intervalle de dates : bornes incluses, comparées au jour. Borne absente = ouverte. */
export function matchesDateRange(value: unknown, range: DateRangeValue): boolean {
  const from = range.from || undefined;
  const to = range.to || undefined;
  if (from === undefined && to === undefined) return true;
  const day = dayOf(value);
  if (day === '') return false;
  if (from !== undefined && day < from) return false;
  if (to !== undefined && day > to) return false;
  return true;
}

function finiteBound(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Nombre fini depuis un nombre ou une chaîne numérique ; `undefined` sinon. */
function toNumber(value: unknown): number | undefined {
  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    parsed = Number(value);
  } else {
    return undefined;
  }
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Intervalle de nombres : bornes incluses. Valeur non numérique avec un intervalle actif : faux. */
export function matchesNumberRange(value: unknown, range: NumberRangeValue): boolean {
  const min = finiteBound(range.min);
  const max = finiteBound(range.max);
  if (min === undefined && max === undefined) return true;
  const number = toNumber(value);
  if (number === undefined) return false;
  if (min !== undefined && number < min) return false;
  if (max !== undefined && number > max) return false;
  return true;
}

/** Booléen : `undefined` = indifférent ; sinon la véracité de la valeur doit valoir `wanted`. */
export function matchesBoolean(value: unknown, wanted: boolean | undefined): boolean {
  return wanted === undefined || Boolean(value) === wanted;
}

/** Prédicat d'un critère qui a un accesseur, selon son type. `undefined` si le type n'en a pas. */
function accessorPredicate<T>(
  criterion: SearchCriterion,
  accessor: Accessor<T>,
  value: Exclude<SearchValue, undefined>
): ((item: T) => boolean) | undefined {
  switch (criterion.type) {
    case 'select':
      return item => matchesEquals(accessor(item), String(value));
    case 'multiSelect': {
      const wanted = Array.isArray(value) ? value : [String(value)];
      return item => matchesAnyOf(accessor(item), wanted);
    }
    case 'dateRange':
      return item => matchesDateRange(accessor(item), value as DateRangeValue);
    case 'numberRange':
      return item => matchesNumberRange(accessor(item), value as NumberRangeValue);
    case 'boolean':
      return item => matchesBoolean(accessor(item), value as boolean);
    default:
      return undefined;
  }
}

/**
 * Filtre local d'une liste : ne retient que les éléments qui satisfont chaque
 * critère actif (ET entre critères). Renvoie un nouveau tableau ; `items` n'est pas modifié.
 */
export function filterItems<T>(items: readonly T[], values: SearchValues, config: LocalFilterConfig<T>): T[] {
  const predicates: ((item: T) => boolean)[] = [];
  const textAccessors = config.text ?? [];
  for (const criterion of config.criteria) {
    const value = values[criterion.key];
    if (value === undefined || !isActiveValue(value)) continue;

    const custom = config.predicates?.[criterion.key];
    if (custom) {
      predicates.push(item => custom(item, value));
      continue;
    }

    if (criterion.type === 'text') {
      if (textAccessors.length === 0) continue;
      const words = toWords(String(value));
      predicates.push(item => matchesWords(item, words, textAccessors));
      continue;
    }

    const accessor = config.accessors?.[criterion.key];
    if (!accessor) continue;
    const predicate = accessorPredicate(criterion, accessor, value);
    if (predicate) predicates.push(predicate);
  }
  return items.filter(item => predicates.every(predicate => predicate(item)));
}
