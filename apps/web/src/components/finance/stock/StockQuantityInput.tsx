import React from 'react';
import { InputNumber } from 'antd';
import { useBreakpoint } from '../../../hooks/useBreakpoint';
import { t } from '../../../i18n/t';

/** Cible tactile minimale sur téléphone (ecrans §4 : 48 px au moins). */
export const STOCK_QUANTITY_TOUCH_HEIGHT = 48;

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
 *
 * Sous 768 px, le champ mesure 48 px de haut (rec040-06) : la zone de saisie
 * prend 46 px, la bordure du cadre les 2 restants, et l'unité en suffixe
 * s'étire à la même hauteur. Au-delà, la taille par défaut des formulaires de
 * bureau est gardée.
 */
export const StockQuantityInput: React.FC<StockQuantityInputProps> = ({
  unit,
  value,
  onChange,
  min = 0,
  disabled,
  id,
  'aria-label': ariaLabel
}) => {
  const { isMobile } = useBreakpoint();
  return (
    <InputNumber
      id={id}
      aria-label={ariaLabel ?? t('Quantité')}
      inputMode="decimal"
      min={min}
      step={1}
      value={value ?? null}
      disabled={disabled}
      addonAfter={unit || undefined}
      size={isMobile ? 'large' : undefined}
      style={{
        width: '100%',
        fontSize: 16,
        ...(isMobile ? { minHeight: STOCK_QUANTITY_TOUCH_HEIGHT } : {})
      }}
      styles={isMobile ? { input: { minHeight: STOCK_QUANTITY_TOUCH_HEIGHT - 2 } } : undefined}
      onChange={next => {
        if (next === null || next === undefined || typeof next !== 'number' || !Number.isFinite(next)) {
          onChange(null);
          return;
        }
        onChange(arrondirQuantite(next));
      }}
    />
  );
};

export default StockQuantityInput;
