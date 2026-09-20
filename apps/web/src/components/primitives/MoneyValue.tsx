import React from 'react';

import { activeLocale } from '../../i18n/format';
/**
 * `<MoneyValue>` — rendu unique des montants (REFONTE_UI_UX.md §3.6).
 *
 * Trois regles, aujourd'hui appliquees au cas par cas dans une cinquantaine
 * de fichiers :
 *   - separateur de milliers par espace insecable etroit, jamais de virgule ;
 *   - `font-variant-numeric: tabular-nums`, pour que les montants d'une colonne
 *     s'alignent chiffre par chiffre ;
 *   - une valeur absente s'ecrit `—`, jamais `0` : le §4.2 releve deja ce soin
 *     sur le tableau de bord, il devient la regle.
 *
 * Non cable dans les ecrans a ce stade.
 */

/** Devise par defaut : le produit est deploye en zone franc CFA. */
const DEFAULT_CURRENCY = 'FCFA';

export interface MoneyValueProps {
  value: number | string | null | undefined;
  /** Devise affichee apres le montant. `null` pour n'afficher que le nombre. */
  currency?: string | null;
  /** Nombre de decimales. 0 par defaut : le FCFA n'a pas de subdivision. */
  fractionDigits?: number;
  /** Rendu des valeurs absentes. */
  placeholder?: string;
  /** Colore le montant selon son signe (rouge si negatif). */
  signed?: boolean;
  className?: string;
}

export function formatMoney(
  value: number | string | null | undefined,
  { currency = DEFAULT_CURRENCY, fractionDigits = 0, placeholder = '—' }: Partial<MoneyValueProps> = {}
): string {
  if (value === null || value === undefined || value === '') return placeholder;

  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, ''));
  if (!Number.isFinite(numeric)) return placeholder;

  // fr-FR pose une espace insecable etroite (U+202F) comme separateur.
  const formatted = numeric.toLocaleString(activeLocale(), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  });

  return currency ? `${formatted} ${currency}` : formatted;
}

export const MoneyValue: React.FC<MoneyValueProps> = ({
  value,
  currency = DEFAULT_CURRENCY,
  fractionDigits = 0,
  placeholder = '—',
  signed = false,
  className
}) => {
  const text = formatMoney(value, { currency, fractionDigits, placeholder });
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').replace(/\s/g, ''));
  const isNegative = signed && Number.isFinite(numeric) && numeric < 0;

  return (
    <span
      className={className}
      style={{
        fontVariantNumeric: 'tabular-nums',
        fontSize: 'var(--font-size-numeric)',
        lineHeight: 'var(--line-height-numeric)',
        fontWeight: 'var(--font-weight-numeric)' as unknown as number,
        color: isNegative ? 'var(--color-error-text)' : undefined,
        whiteSpace: 'nowrap'
      }}
    >
      {text}
    </span>
  );
};
