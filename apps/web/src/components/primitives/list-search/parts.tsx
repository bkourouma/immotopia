import React from 'react';
import { Button, Tag } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import type { SearchCriterion, SearchValues } from '../../../utils/list-search/types';
import { chipParts, chipText } from './format';
import './list-search.css';

/** Puces retirables et compteur de résultats, partagés par les deux dispositions. */

export interface ChipsProps {
  criteria: readonly SearchCriterion[];
  values: SearchValues;
  labels: Readonly<Record<string, string>>;
  /** Retire un critère : la barre écrit `{ [key]: undefined }`. */
  onRemove: (key: string) => void;
  /** Cibles de 44 px (mobile). */
  touch?: boolean;
}

/** Une puce par critère actif, SAUF le champ libre (déjà visible dans son champ). */
export function SearchChips({ criteria, values, labels, onRemove, touch }: ChipsProps) {
  const chips = criteria
    .map(criterion => ({
      criterion,
      parts: chipParts(criterion, values[criterion.key], labels),
      text: chipText(criterion, values[criterion.key], labels)
    }))
    .filter(chip => chip.parts !== null && chip.text !== null);
  if (chips.length === 0) return null;

  const size = touch ? 44 : 24;
  return (
    <div
      role="list"
      aria-label={t('Critères actifs')}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 'var(--space-2)',
        flex: touch ? '1 1 100%' : '0 1 auto',
        minWidth: 0
      }}
    >
      {chips.map(({ criterion, parts, text }) => {
        let body: React.ReactNode = text;
        if (parts && parts.value !== null && parts.isolate) {
          // Le gabarit traduit fixe l'ordre « libellé : valeur » ; seule la valeur est isolée.
          const [before, after] = t('{{label}} : {{value}}', { label: parts.label, value: '\u0000' }).split('\u0000');
          body = (
            <>
              {before}
              <bdi>{parts.value}</bdi>
              {after}
            </>
          );
        }
        return (
          <span key={criterion.key} role="listitem" style={{ display: 'inline-flex', maxWidth: '100%', minWidth: 0 }}>
            <Tag
              title={text ?? undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-1)',
                margin: 0,
                maxWidth: touch ? '100%' : 280,
                minHeight: touch ? 44 : undefined,
                paddingInlineEnd: 0,
                paddingInlineStart: 'var(--space-2)',
                fontSize: 'var(--font-size-small)'
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {body}
              </span>
              <button
                type="button"
                className="list-search-chip-remove"
                data-chip-key={criterion.key}
                aria-label={t('Retirer le critère {{label}}', { label: criterion.label })}
                onClick={() => onRemove(criterion.key)}
                style={{
                  display: 'inline-flex',
                  flex: '0 0 auto',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: size,
                  minHeight: size,
                  padding: 0,
                  border: 0,
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)'
                }}
              >
                <CloseOutlined aria-hidden="true" style={{ fontSize: 10 }} />
              </button>
            </Tag>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Compteur de résultats. La région `aria-live` est TOUJOURS rendue, vide tant
 * que le total est inconnu : un lecteur d'écran n'annonce que le contenu qui
 * change dans une région déjà présente, et la hauteur réservée évite que la
 * mise en page saute à l'arrivée du premier compteur.
 */
export function ResultCounter({ count }: { count: number | undefined }) {
  let text = '';
  if (count !== undefined) {
    text =
      count === 0
        ? t('0 résultat')
        : count === 1
          ? t('1 résultat')
          : t('{{count}} résultats', { count: new Intl.NumberFormat(activeLocale()).format(count) });
  }
  return (
    <span
      aria-live="polite"
      style={{
        marginInlineStart: 'auto',
        minHeight: 24,
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--text-secondary)',
        fontSize: 'var(--font-size-small)',
        whiteSpace: 'nowrap'
      }}
    >
      {text}
    </span>
  );
}

export function ClearCriteriaButton({ onClick, touch }: { onClick: () => void; touch?: boolean }) {
  return (
    <Button type="text" onClick={onClick} style={touch ? { minHeight: 44 } : undefined}>
      {t('Effacer les critères')}
    </Button>
  );
}
