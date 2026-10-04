import React from 'react';
import { InputNumber } from 'antd';
import { t } from '../../../i18n/t';

export interface StockQuantityInputProps {
  /** Unité de l'article, affichée en suffixe (sac, tonne, m³…). */
  unit?: string | null;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  /** Borne basse : 0 pour un comptage (zéro accepté), un strict positif ailleurs. */
  min?: number;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

/** Quatre décimales au plus, sans les imposer (règle d'`arrondirQuantite` de l'écran Stock). */
function arrondirQuantite(valeur: number): number {
  return Math.round(valeur * 10_000) / 10_000;
}

/**
 * Saisie d'une quantité (ecrans §4) : clavier décimal sur téléphone, unité en
 * suffixe, quatre décimales au plus, police de 16 px au moins (en dessous,
 * Chrome Android zoome à la saisie).
 */
export const StockQuantityInput: React.FC<StockQuantityInputProps> = ({
  unit,
  value,
  onChange,
  min = 0,
  disabled,
  id,
  'aria-label': ariaLabel
}) => (
  <InputNumber
    id={id}
    aria-label={ariaLabel ?? t('Quantité')}
    inputMode="decimal"
    min={min}
    step={1}
    value={value ?? null}
    disabled={disabled}
    addonAfter={unit || undefined}
    style={{ width: '100%', fontSize: 16 }}
    onChange={next => {
      if (next === null || next === undefined || typeof next !== 'number' || !Number.isFinite(next)) {
        onChange(null);
        return;
      }
      onChange(arrondirQuantite(next));
    }}
  />
);

export default StockQuantityInput;
