import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, DatePicker, Input, InputNumber, Select, Spin } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { activeLocale, dateFormat } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import type {
  BooleanCriterion,
  DateRangeCriterion,
  DateRangeValue,
  MultiSelectCriterion,
  NumberRangeCriterion,
  NumberRangeValue,
  SearchCriterion,
  SearchOption,
  SearchValue,
  SelectCriterion,
  TextCriterion
} from '../../../utils/list-search/types';
import { emitValue, ISO_DAY, knownOptionLabel, withCurrentOption } from './format';
import './list-search.css';

/**
 * Contrôles de `<ListSearch>`, un par type de critère.
 *
 * Chaque contrôle est contrôlé (`value` / `onChange`) et ne sait pas QUAND sa
 * valeur est appliquée : sur ordinateur la barre l'applique tout de suite, sur
 * mobile elle l'écrit dans un brouillon. Les deux exceptions — champ libre et
 * intervalle de nombres — gardent un état local pour ne pas appliquer à chaque
 * frappe.
 */

/** Délai de frappe avant application / avant un nouvel appel de `loadOptions`. */
export const DEBOUNCE_MS = 300;

/** Au-delà, un choix unique statique devient cherchable. */
const SEARCH_MIN_OPTIONS = 8;
/** Dans la feuille mobile, un choix multiple d'au plus ce nombre d'options s'affiche en cases à cocher. */
const CHECKBOX_MAX_OPTIONS = 6;

export interface ControlShared {
  /** Libellés d'options déjà vus (voir `useOptionLabels`). */
  labels: Readonly<Record<string, string>>;
  remember: (key: string, options: readonly SearchOption[]) => void;
  /** En ligne au-dessus de 992 px : le libellé tient lieu de placeholder. */
  compact?: boolean;
  /** Cibles de 44 px (feuille mobile). */
  touch?: boolean;
}

const fill: React.CSSProperties = { width: '100%' };

/* -------------------------------------------------------------------------- */
/* Champ libre                                                                */
/* -------------------------------------------------------------------------- */

export interface TextFieldProps {
  criterion: TextCriterion;
  value: string | undefined;
  /** Applique la valeur. `replace` : ne pas empiler l'historique. */
  onApply: (value: string | undefined, options: { replace: boolean }) => void;
  touch?: boolean;
  style?: React.CSSProperties;
}

export const TextField = React.memo(function TextField({ criterion, value, onApply, touch, style }: TextFieldProps) {
  const external = value ?? '';
  const [local, setLocal] = useState(external);
  // Dernière valeur connue du parent (reçue ou envoyée) : tant que `value`
  // revient avec ce que nous avons envoyé, la frappe en cours n'est pas touchée.
  const known = useRef(external);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyRef = useRef(onApply);
  applyRef.current = onApply;

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  useEffect(() => {
    if (external !== known.current) {
      known.current = external;
      cancel();
      setLocal(external);
    }
  }, [external, cancel]);

  const send = useCallback(
    (next: string) => {
      cancel();
      if (next === known.current) return;
      known.current = next;
      applyRef.current(next === '' ? undefined : next, { replace: true });
    },
    [cancel]
  );

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setLocal(next);
    cancel();
    // Vider le champ (croix, sélection + suppression) s'applique tout de suite.
    if (next === '') {
      send('');
      return;
    }
    timer.current = setTimeout(() => send(next), DEBOUNCE_MS);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      send(local);
    } else if (event.key === 'Escape' && local !== '') {
      event.stopPropagation();
      setLocal('');
      send('');
    }
  };

  return (
    <Input
      value={local}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      allowClear
      size={touch ? 'large' : undefined}
      prefix={<SearchOutlined aria-hidden="true" style={{ color: 'var(--text-tertiary)' }} />}
      placeholder={criterion.placeholder}
      aria-label={criterion.label}
      data-ls-text=""
      className={touch ? 'list-search-touch' : undefined}
      style={{ ...fill, ...(touch ? { minHeight: 44 } : {}), ...style }}
    />
  );
});

/* -------------------------------------------------------------------------- */
/* Choix unique                                                               */
/* -------------------------------------------------------------------------- */

type ControlOf<C extends SearchCriterion> = ControlShared & {
  criterion: C;
  value: SearchValue;
  onChange: (v: SearchValue) => void;
};

function SelectControl({ criterion, value, onChange, labels, remember, compact, touch }: ControlOf<SelectCriterion>) {
  const current = typeof value === 'string' && value !== '' ? value : undefined;
  const remote = Boolean(criterion.loadOptions);
  const [loaded, setLoaded] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const lastTerm = useRef('');
  // On lit toujours la dernière `loadOptions` reçue ; un changement d'identité
  // (nouvelle agence) n'a rien à redemander, la prochaine ouverture ou
  // recherche utilise la nouvelle fonction.
  const loadRef = useRef(criterion.loadOptions);
  loadRef.current = criterion.loadOptions;
  const rememberRef = useRef(remember);
  rememberRef.current = remember;
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const load = useCallback(
    (term: string) => {
      const loader = loadRef.current;
      if (!loader) return;
      const mine = ++sequence.current;
      lastTerm.current = term;
      setLoading(true);
      setFailed(false);
      Promise.resolve()
        .then(() => loader(term))
        .then(result => {
          if (!mounted.current || mine !== sequence.current) return;
          setLoaded(result);
          rememberRef.current(criterion.key, result);
        })
        .catch(() => {
          if (mounted.current && mine === sequence.current) {
            setLoaded([]);
            setFailed(true);
          }
        })
        .finally(() => {
          if (mounted.current && mine === sequence.current) setLoading(false);
        });
    },
    [criterion.key]
  );

  const handleOpen = (open: boolean) => {
    if (open && remote) load('');
  };

  const handleSearch = (term: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(term), DEBOUNCE_MS);
  };

  const staticOptions = criterion.options;
  const options = useMemo(
    () =>
      withCurrentOption(
        remote ? loaded : (staticOptions ?? []),
        current,
        current ? knownOptionLabel(criterion, current, labels) : undefined
      ),
    [remote, loaded, staticOptions, current, criterion, labels]
  );

  return (
    <Select
      value={current}
      options={options}
      onChange={(next: string | undefined) => onChange(next === undefined ? undefined : next)}
      allowClear
      showSearch={
        // La recherche dans la liste n'a de sens que pour beaucoup d'options.
        remote
          ? // Distant : c'est le serveur qui filtre.
            { optionFilterProp: 'label', filterOption: false, onSearch: handleSearch }
          : options.length > SEARCH_MIN_OPTIONS
            ? { optionFilterProp: 'label' }
            : false
      }
      onOpenChange={handleOpen}
      loading={loading}
      notFoundContent={
        loading ? (
          <Spin size="small" />
        ) : failed ? (
          <span>
            {t('Impossible de charger les choix.')}{' '}
            <Button type="link" size="small" onClick={() => load(lastTerm.current)}>
              {t('Réessayer')}
            </Button>
          </span>
        ) : (
          t('Aucun résultat')
        )
      }
      placeholder={criterion.placeholder}
      aria-label={criterion.label}
      prefix={compact ? criterion.label : undefined}
      size={touch ? 'large' : undefined}
      style={compact ? { minWidth: 200, maxWidth: 300 } : { ...fill, ...(touch ? { minHeight: 44 } : {}) }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Choix multiple                                                             */
/* -------------------------------------------------------------------------- */

function MultiSelectControl({ criterion, value, onChange, compact, touch }: ControlOf<MultiSelectCriterion>) {
  const selected = Array.isArray(value) ? value : [];
  if (touch && criterion.options.length <= CHECKBOX_MAX_OPTIONS) {
    return (
      <Checkbox.Group
        value={selected}
        aria-label={criterion.label}
        onChange={next => onChange(next.length > 0 ? (next as string[]) : undefined)}
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        {criterion.options.map(option => (
          <Checkbox
            key={option.value}
            value={option.value}
            style={{ minHeight: 44, display: 'flex', alignItems: 'center', marginInlineStart: 0 }}
          >
            {option.label}
          </Checkbox>
        ))}
      </Checkbox.Group>
    );
  }
  return (
    <Select
      mode="multiple"
      value={selected}
      options={criterion.options as SearchOption[]}
      onChange={(next: string[]) => onChange(next.length > 0 ? next : undefined)}
      allowClear
      showSearch={criterion.options.length > SEARCH_MIN_OPTIONS ? { optionFilterProp: 'label' } : false}
      maxTagCount="responsive"
      placeholder={criterion.placeholder}
      aria-label={criterion.label}
      prefix={compact ? criterion.label : undefined}
      size={touch ? 'large' : undefined}
      style={compact ? { minWidth: 220, maxWidth: 320 } : { ...fill, ...(touch ? { minHeight: 44 } : {}) }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Intervalle de dates                                                        */
/* -------------------------------------------------------------------------- */

function asRange<R>(value: SearchValue): R {
  return (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as R;
}

/** Libellé lu par les lecteurs d'écran mais invisible (équivalent de `sr-only`). */
const HIDDEN_LABEL: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0
};

function DateRangeControl({ criterion, value, onChange, compact, touch }: ControlOf<DateRangeCriterion>) {
  const range = asRange<DateRangeValue>(value);
  const from = range.from ? dayjs(range.from) : null;
  const to = range.to ? dayjs(range.to) : null;
  // Chaque champ a son nom accessible : un `<label>` masqué relié par `id`.
  const baseId = useId();
  const startId = `${baseId}-start`;
  const endId = `${baseId}-end`;
  return (
    <div role="group" aria-label={criterion.label} style={compact ? { minWidth: 250 } : fill}>
      <label htmlFor={startId} style={HIDDEN_LABEL}>
        {t('{{label}}, date de début', { label: criterion.label })}
      </label>
      <label htmlFor={endId} style={HIDDEN_LABEL}>
        {t('{{label}}, date de fin', { label: criterion.label })}
      </label>
      <DatePicker.RangePicker
        id={{ start: startId, end: endId }}
        value={[from && from.isValid() ? from : null, to && to.isValid() ? to : null]}
        allowEmpty={[true, true]}
        allowClear
        format={dateFormat('short')}
        placeholder={[t('Du'), t('Au')]}
        size={touch ? 'large' : undefined}
        style={{ ...fill, ...(touch ? { minHeight: 44 } : {}) }}
        onChange={dates => {
          const next: DateRangeValue = {};
          if (dates?.[0]) next.from = dates[0].format(ISO_DAY);
          if (dates?.[1]) next.to = dates[1].format(ISO_DAY);
          onChange(emitValue(next));
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Intervalle de nombres                                                      */
/* -------------------------------------------------------------------------- */

/** Séparateurs de la locale courante : l'arabe et le français ne groupent pas les milliers comme l'anglais. */
function numberSeparators() {
  const parts = new Intl.NumberFormat(activeLocale()).formatToParts(12345.6);
  return {
    group: parts.find(part => part.type === 'group')?.value ?? '',
    decimal: parts.find(part => part.type === 'decimal')?.value ?? '.'
  };
}

function formatInput(value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  // Les décimales en cours de frappe (« 12. ») sont laissées telles quelles.
  const text = String(value);
  if (/[.]$|[.]\d*0$/.test(text)) return text.replace('.', numberSeparators().decimal);
  return new Intl.NumberFormat(activeLocale(), { maximumFractionDigits: 20 }).format(number);
}

function parseInput(text: string | undefined): number {
  if (!text) return NaN;
  const { group, decimal } = numberSeparators();
  let clean = text.replace(/[\s\u00a0\u202f]/g, '');
  if (group.trim()) clean = clean.split(group).join('');
  clean = clean.split(decimal).join('.');
  return clean === '' ? NaN : Number(clean);
}

function NumberRangeControl({ criterion, value, onChange, compact, touch }: ControlOf<NumberRangeCriterion>) {
  const range = asRange<NumberRangeValue>(value);
  const extMin = typeof range.min === 'number' ? range.min : null;
  const extMax = typeof range.max === 'number' ? range.max : null;
  const [min, setMin] = useState<number | null>(extMin);
  const [max, setMax] = useState<number | null>(extMax);

  // Une valeur qui change de l'extérieur (effacement, retour arrière) l'emporte.
  useEffect(() => setMin(extMin), [extMin]);
  useEffect(() => setMax(extMax), [extMax]);

  const emit = (nextMin: number | null, nextMax: number | null) => {
    if (nextMin === extMin && nextMax === extMax) return;
    const next: NumberRangeValue = {};
    if (nextMin !== null) next.min = nextMin;
    if (nextMax !== null) next.max = nextMax;
    onChange(emitValue(next));
  };
  const commit = () => emit(min, max);

  // Dans la feuille mobile, on écrit dans le brouillon à chaque frappe : une
  // valeur tapée puis « Appliquer » sans quitter le champ ne doit pas se perdre.
  // Sur ordinateur, l'application attend la perte de focus ou Entrée.
  const live = Boolean(touch);
  const size: 'large' | undefined = touch ? 'large' : undefined;
  const boxStyle: React.CSSProperties = compact
    ? { width: 130 }
    : { flex: 1, minWidth: 0, ...(touch ? { minHeight: 44 } : {}) };
  const shared = {
    size,
    suffix: criterion.unit,
    controls: false as const,
    inputMode: 'decimal' as const,
    formatter: formatInput,
    parser: parseInput,
    style: boxStyle
  };

  return (
    <div
      role="group"
      aria-label={criterion.label}
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', ...(compact ? {} : fill) }}
    >
      <InputNumber
        {...shared}
        value={min}
        placeholder={t('Min')}
        aria-label={t('{{label}} minimum', { label: criterion.label })}
        onChange={next => {
          const n = typeof next === 'number' ? next : null;
          setMin(n);
          if (live) emit(n, max);
        }}
        onBlur={commit}
        onPressEnter={commit}
      />
      <span aria-hidden="true" style={{ color: 'var(--text-tertiary)' }}>
        –
      </span>
      <InputNumber
        {...shared}
        value={max}
        placeholder={t('Max')}
        aria-label={t('{{label}} maximum', { label: criterion.label })}
        onChange={next => {
          const n = typeof next === 'number' ? next : null;
          setMax(n);
          if (live) emit(min, n);
        }}
        onBlur={commit}
        onPressEnter={commit}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Booléen                                                                    */
/* -------------------------------------------------------------------------- */

function BooleanControl({ criterion, value, onChange, compact, touch }: ControlOf<BooleanCriterion>) {
  if (!criterion.tristate) {
    return (
      <Checkbox
        checked={value === true}
        onChange={event => onChange(event.target.checked ? true : undefined)}
        style={touch ? { minHeight: 44, display: 'inline-flex', alignItems: 'center' } : undefined}
      >
        {criterion.label}
      </Checkbox>
    );
  }
  const current = value === true ? 'true' : value === false ? 'false' : 'all';
  return (
    <Select
      value={current}
      options={[
        { value: 'all', label: t('Tous') },
        { value: 'true', label: criterion.trueLabel ?? t('Oui') },
        { value: 'false', label: criterion.falseLabel ?? t('Non') }
      ]}
      onChange={(next: string) => onChange(next === 'true' ? true : next === 'false' ? false : undefined)}
      aria-label={criterion.label}
      prefix={compact ? criterion.label : undefined}
      size={touch ? 'large' : undefined}
      style={compact ? { minWidth: 190 } : { ...fill, ...(touch ? { minHeight: 44 } : {}) }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Aiguillage                                                                 */
/* -------------------------------------------------------------------------- */

export interface CriterionControlProps extends ControlShared {
  criterion: Exclude<SearchCriterion, TextCriterion>;
  value: SearchValue;
  /** Reçoit la valeur ; une valeur vide arrive en `undefined`. */
  onChange: (value: SearchValue) => void;
}

export const CriterionControl = React.memo(function CriterionControl(props: CriterionControlProps) {
  const { criterion } = props;
  switch (criterion.type) {
    case 'select':
      return <SelectControl {...props} criterion={criterion} />;
    case 'multiSelect':
      return <MultiSelectControl {...props} criterion={criterion} />;
    case 'dateRange':
      return <DateRangeControl {...props} criterion={criterion} />;
    case 'numberRange':
      return <NumberRangeControl {...props} criterion={criterion} />;
    case 'boolean':
      return <BooleanControl {...props} criterion={criterion} />;
    default:
      return null;
  }
});
