import { createElement as h } from 'react';

/**
 * Palette et motifs partagés par les graphiques du module Patrimoine.
 *
 * - Teintes choisies pour rester distinctes en cas de daltonisme (bleu, orange,
 *   violet, vert-bleu, ocre) et lisibles sur fond clair (#fff) comme sombre
 *   (#141414) : contraste >= 3:1 des deux côtés.
 * - La couleur ne porte jamais seule le sens : chaque série a aussi un motif de
 *   trait (`dash`) et une forme de repère (`marker`).
 */
export type ChartMarker = 'circle' | 'square' | 'triangle' | 'diamond';

export interface ChartSeriesStyle {
  color: string;
  /** Motif de trait recharts (`strokeDasharray`) ; absent = trait plein. */
  dash?: string;
  marker: ChartMarker;
}

export const CHART_COLORS = {
  blue: '#1f77d0',
  orange: '#d9630a',
  purple: '#8e4fc4',
  teal: '#0f8f7f',
  ochre: '#b8860b',
  grey: '#8c8c8c'
} as const;

export const CHART_SERIES: Record<'primary' | 'secondary' | 'tertiary' | 'quaternary', ChartSeriesStyle> = {
  primary: { color: CHART_COLORS.blue, marker: 'circle' },
  secondary: { color: CHART_COLORS.teal, dash: '8 4', marker: 'square' },
  tertiary: { color: CHART_COLORS.orange, dash: '2 4', marker: 'triangle' },
  quaternary: { color: CHART_COLORS.purple, dash: '10 3 2 3', marker: 'diamond' }
};

/** Axe Y : notation compacte (1,2 M) pour gagner de la largeur ; le tooltip garde le montant entier. */
export function compactNumber(value: unknown, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value ?? 0));
}

interface DotProps {
  cx?: number;
  cy?: number;
  stroke?: string;
}

/** Repère de point selon la forme : distingue les séries sans passer par la couleur. */
export function markerDot(marker: ChartMarker) {
  const size = 4;
  return function MarkerDot({ cx, cy, stroke }: DotProps) {
    if (cx === undefined || cy === undefined || Number.isNaN(cx) || Number.isNaN(cy)) return null;
    const fill = stroke ?? CHART_COLORS.blue;
    switch (marker) {
      case 'square':
        return h('rect', { x: cx - size, y: cy - size, width: size * 2, height: size * 2, fill });
      case 'triangle':
        return h('polygon', {
          points: `${cx},${cy - size - 1} ${cx - size - 1},${cy + size} ${cx + size + 1},${cy + size}`,
          fill
        });
      case 'diamond':
        return h('polygon', {
          points: `${cx},${cy - size - 1} ${cx + size + 1},${cy} ${cx},${cy + size + 1} ${cx - size - 1},${cy}`,
          fill
        });
      default:
        return h('circle', { cx, cy, r: size - 0.5, fill });
    }
  };
}
