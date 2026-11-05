import React, { useId, useRef, useState } from 'react';
import { Button, Typography } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { t } from '../../i18n/t';
import type { ListSearchBinding, SearchCriterion, SearchValues, TextCriterion } from '../../utils/list-search/types';
import { CriterionControl, TextField } from './list-search/controls';
import { isActiveValue } from '../../utils/list-search/filter';
import { MobileFilters, type NonTextCriterion } from './list-search/MobileFilters';
import { ClearCriteriaButton, ResultCounter, SearchChips } from './list-search/parts';
import { useOptionLabels } from './list-search/useOptionLabels';

/**
 * `<ListSearch>` — la recherche multicritères au-dessus d'un tableau (§5.4).
 *
 * Une seule barre pour tous les tableaux, alimentée par `ListSearchBinding`
 * (`useListSearch(...).searchProps`) : elle ne lit ni n'écrit l'URL, elle ne
 * connaît que des critères, des valeurs et un `onChange`.
 *
 * **Au-dessus de 992 px** : le champ libre en tête, large ; les critères
 * `primary` en ligne (`maxInline`, 3 places par défaut, un intervalle de dates
 * ou de nombres en occupe 2 ; 2 critères conseillés) ; les autres derrière « Plus de
 * critères ». Tout s'applique au changement ; le champ libre après 300 ms sans
 * frappe (Entrée : tout de suite, Échap : vide le champ).
 *
 * **Au-dessous** : le champ libre et un bouton « Filtres (n) » qui ouvre une
 * feuille du bas. Les critères n'y sont appliqués qu'au clic sur « Appliquer ».
 *
 * Dans les deux cas, une ligne de puces retirables dit ce qui filtre (le champ
 * libre n'a pas de puce : il est déjà lisible), « Effacer les critères »
 * remet tout à zéro et le compteur — annoncé aux lecteurs d'écran — dit combien
 * de lignes restent.
 *
 * **Convention de vidage** : retirer une puce ou vider un contrôle écrit
 * `{ [key]: undefined }`, pour tous les types (y compris `multiSelect`).
 *
 * Marges et alignements en propriétés logiques : la barre se retourne en arabe.
 */

export interface ListSearchProps extends ListSearchBinding {
  /**
   * Emplacements de critères en ligne au-dessus de 992 px, hors champ libre (défaut 3).
   * Un `dateRange` ou un `numberRange` en occupe 2. Recommandation : 2 critères
   * `primary` conseillés, 3 au plus ; le reste va sous « Plus de critères ».
   */
  maxInline?: number;
  /** Contenu à l'extrémité de fin de la ligne principale (rare : un bouton de vue). */
  extra?: React.ReactNode;
}

const MORE_ID_PREFIX = 'list-search-more';

/** Après un retrait : puce suivante, sinon précédente, sinon le champ libre (ou le bouton de repli). */
function focusAfterRemoval(root: HTMLElement | null, key: string) {
  if (!root) return;
  const chips = Array.from(root.querySelectorAll<HTMLElement>('[data-chip-key]'));
  const index = chips.findIndex(chip => chip.dataset.chipKey === key);
  const target = (index >= 0 ? (chips[index + 1] ?? chips[index - 1]) : undefined) ?? focusFallback(root);
  target?.focus();
}

function focusFallback(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-ls-text]') ?? root.querySelector<HTMLElement>('[data-ls-fallback]');
}

const containerStyle: React.CSSProperties = {
  background: 'var(--surface-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3) var(--space-4)',
  marginBottom: 'var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)'
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--space-3)'
};

export function ListSearch(props: ListSearchProps) {
  const {
    criteria,
    values,
    onChange,
    onClear,
    activeCount,
    resultCount,
    maxInline = 3,
    extra,
    'aria-label': ariaLabel
  } = props;
  const { isDesktop } = useBreakpoint();
  const { cache, remember } = useOptionLabels(criteria, values);

  const text = criteria.find((criterion): criterion is TextCriterion => criterion.type === 'text');
  const others = criteria.filter((criterion): criterion is NonTextCriterion => criterion.type !== 'text');

  const rootRef = useRef<HTMLDivElement>(null);
  const removeChip = (key: string) => {
    // Le focus part avant que la puce ne disparaisse, sinon il tombe sur <body>.
    focusAfterRemoval(rootRef.current, key);
    onChange({ [key]: undefined });
  };
  const clearAll = () => {
    const root = rootRef.current;
    if (root) focusFallback(root)?.focus();
    onClear();
  };

  // La ligne du bas est toujours rendue : sa région `aria-live` doit exister avant
  // que le compteur n'arrive pour être annoncée, et sa hauteur évite un saut.
  const summary = (
    <div style={{ ...rowStyle, minHeight: 28 }}>
      <SearchChips criteria={criteria} values={values} labels={cache} onRemove={removeChip} touch={!isDesktop} />
      {activeCount > 0 && <ClearCriteriaButton onClick={clearAll} touch={!isDesktop} />}
      <ResultCounter count={resultCount} />
    </div>
  );

  const textField = text && (
    <TextField
      criterion={text}
      value={typeof values[text.key] === 'string' ? (values[text.key] as string) : undefined}
      onApply={(next, options) => onChange({ [text.key]: next }, options)}
      touch={!isDesktop}
    />
  );

  if (!isDesktop) {
    return (
      <div ref={rootRef} role="search" aria-label={ariaLabel ?? t('Rechercher')} style={containerStyle}>
        <div style={{ ...rowStyle, flexWrap: 'nowrap', alignItems: 'stretch' }}>
          {textField && <div style={{ flex: 1, minWidth: 0 }}>{textField}</div>}
          {others.length > 0 && (
            <MobileFilters
              criteria={others}
              values={values}
              labels={cache}
              remember={remember}
              onApply={next => onChange(next)}
              block={!textField}
            />
          )}
        </div>
        {extra && <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{extra}</div>}
        {summary}
      </div>
    );
  }

  return (
    <DesktopBar
      ariaLabel={ariaLabel}
      others={others}
      values={values}
      labels={cache}
      remember={remember}
      onChange={onChange}
      maxInline={maxInline}
      extra={extra}
      textField={textField}
      summary={summary}
      rootRef={rootRef}
    />
  );
}

interface DesktopBarProps {
  ariaLabel: string | undefined;
  others: readonly NonTextCriterion[];
  values: SearchValues;
  labels: Readonly<Record<string, string>>;
  remember: ReturnType<typeof useOptionLabels>['remember'];
  onChange: ListSearchBinding['onChange'];
  maxInline: number;
  extra: React.ReactNode;
  textField: React.ReactNode;
  summary: React.ReactNode;
  rootRef: React.RefObject<HTMLDivElement>;
}

function DesktopBar({
  ariaLabel,
  others,
  values,
  labels,
  remember,
  onChange,
  maxInline,
  extra,
  textField,
  summary,
  rootRef
}: DesktopBarProps) {
  const [expanded, setExpanded] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const panelId = `${MORE_ID_PREFIX}-${useId()}`;

  // `primary` en ligne (au plus `maxInline`) ; tout le reste, dans l'ordre
  // de déclaration, derrière « Plus de critères ».
  const inline: NonTextCriterion[] = [];
  let used = 0;
  for (const criterion of others) {
    if (!criterion.primary) continue;
    // Un intervalle (deux champs) pèse pour deux critères.
    const weight = criterion.type === 'dateRange' || criterion.type === 'numberRange' ? 2 : 1;
    if (used + weight > maxInline) continue;
    inline.push(criterion);
    used += weight;
  }
  const secondary = others.filter(criterion => !inline.includes(criterion));
  const activeSecondary = secondary.filter(criterion => isActiveValue(values[criterion.key])).length;

  const apply = (criterion: SearchCriterion) => (value: SearchValues[string]) => onChange({ [criterion.key]: value });

  const closePanel = () => {
    setExpanded(false);
    moreButton.current?.focus();
  };

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    // Un menu déroulant ou un calendrier ouvert se ferme d'abord, le panneau ensuite.
    const target = event.target as HTMLElement;
    if (event.defaultPrevented) return;
    if (target.closest('.ant-picker-dropdown, .ant-select-dropdown')) return;
    if (target.getAttribute('aria-expanded') === 'true') return;
    if (
      target.closest('.ant-picker') &&
      document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')
    ) {
      return;
    }
    event.stopPropagation();
    closePanel();
  };

  return (
    <div ref={rootRef} role="search" aria-label={ariaLabel ?? t('Rechercher')} style={containerStyle}>
      <div style={rowStyle}>
        {/* Le champ libre est le point focal : plus large que tout critère. */}
        {textField && <div style={{ flex: '2 1 320px', minWidth: 320 }}>{textField}</div>}

        {inline.map(criterion => (
          <InlineControl key={criterion.key} criterion={criterion}>
            <CriterionControl
              criterion={criterion}
              value={values[criterion.key]}
              onChange={apply(criterion)}
              labels={labels}
              remember={remember}
              compact
            />
          </InlineControl>
        ))}

        {secondary.length > 0 && (
          <Button
            ref={moreButton}
            icon={expanded ? <UpOutlined aria-hidden="true" /> : <DownOutlined aria-hidden="true" />}
            iconPlacement="end"
            aria-expanded={expanded}
            aria-controls={panelId}
            data-ls-fallback=""
            onClick={() => setExpanded(open => !open)}
          >
            {activeSecondary > 0
              ? t('Plus de critères ({{count}})', { count: activeSecondary })
              : t('Plus de critères')}
          </Button>
        )}

        {extra && <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center' }}>{extra}</div>}
      </div>

      {expanded && secondary.length > 0 && (
        <div
          id={panelId}
          role="group"
          aria-label={t('Plus de critères')}
          onKeyDown={handlePanelKeyDown}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 'var(--space-3) var(--space-4)',
            alignItems: 'start'
          }}
        >
          {secondary.map(criterion => (
            <div key={criterion.key}>
              {(criterion.type !== 'boolean' || criterion.tristate) && (
                <div
                  style={{
                    marginBottom: 'var(--space-1)',
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--font-size-small)'
                  }}
                >
                  {criterion.label}
                </div>
              )}
              <CriterionControl
                criterion={criterion}
                value={values[criterion.key]}
                onChange={apply(criterion)}
                labels={labels}
                remember={remember}
              />
              {criterion.help && (
                <Typography.Text
                  type="secondary"
                  style={{ display: 'block', marginTop: 'var(--space-1)', fontSize: 'var(--font-size-caption)' }}
                >
                  {criterion.help}
                </Typography.Text>
              )}
            </div>
          ))}
        </div>
      )}

      {summary}
    </div>
  );
}

/**
 * Un critère en ligne. Les intervalles n'ont pas de placeholder unique : leur
 * libellé se lit devant les champs. Les autres le portent dans leur placeholder
 * (et leur `aria-label`).
 */
function InlineControl({ criterion, children }: { criterion: NonTextCriterion; children: React.ReactNode }) {
  const labelled = criterion.type === 'dateRange' || criterion.type === 'numberRange';
  if (!labelled) return <>{children}</>;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-small)' }}>{criterion.label}</span>
      {children}
    </div>
  );
}
