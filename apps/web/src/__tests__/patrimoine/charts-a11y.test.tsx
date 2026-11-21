import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { YieldProjectionChart } from '../../components/patrimoine/YieldProjectionChart';
import { NetWorthHistoryCard } from '../../components/patrimoine/actifs/NetWorthCharts';
import { CHART_SERIES } from '../../components/patrimoine/chart-palette';

const projection = [
  { year: 1, estimatedValue: 1000, cumulativeRent: 100, cumulativeExpenses: 40, netResult: 60 },
  { year: 2, estimatedValue: 1100, cumulativeRent: 210, cumulativeExpenses: 85, netResult: 125 }
] as never;

describe('graphiques Patrimoine — alternative textuelle', () => {
  it('YieldProjectionChart : role img résumé et tableau des valeurs', () => {
    render(<YieldProjectionChart data={projection} />);
    const img = screen.getByRole('img', { name: /projection de rendement/i });
    expect(img.getAttribute('aria-label')).toMatch(/année 1/);
    expect(screen.getByText('Voir les valeurs en tableau')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('NetWorthHistoryCard : role img résumé', () => {
    render(
      <NetWorthHistoryCard
        points={
          [
            { date: '2026-01-01', netWorth: 10, totalAssets: 20, totalDebts: 10 },
            { date: '2026-06-01', netWorth: 15, totalAssets: 25, totalDebts: 10 }
          ] as never
        }
      />
    );
    expect(screen.getByRole('img', { name: /valeur nette/i })).toBeInTheDocument();
  });

  it('chaque série de la palette a un motif ou un repère distinct', () => {
    const markers = Object.values(CHART_SERIES).map(s => s.marker);
    expect(new Set(markers).size).toBe(markers.length);
    const colors = Object.values(CHART_SERIES).map(s => s.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
