import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatAsOf, formatYieldPercent } from '../../components/patrimoine/patrimoine-format';
import { YieldCalculator } from '../../components/patrimoine/YieldCalculator';
import { EntityConsolidationCard } from '../../components/patrimoine/entities/EntityConsolidationCard';
import { formatPercent } from '../../pages/OwnerPortal/owner-patrimoine-labels';
import { readYieldAssumptions, writeYieldAssumptions } from '../../components/patrimoine/yield-assumptions-storage';

const NB = ' ';

describe('formatYieldPercent — un seul formateur pour les rendements (BUG 035/036)', () => {
  it("ne multiplie jamais par 100 : l'API renvoie déjà des pourcentages", () => {
    expect(formatYieldPercent(4.444444444444445)).toBe(`4,44${NB}%`);
    expect(formatYieldPercent(-2.3396)).toBe(`-2,34${NB}%`);
  });

  it('arrondit au plus proche au lieu de tronquer, virgule décimale en français', () => {
    expect(formatYieldPercent(6.666666)).toBe(`6,67${NB}%`);
    expect(formatYieldPercent(-4.9467)).toBe(`-4,95${NB}%`);
    expect(formatYieldPercent(7.5)).toBe(`7,50${NB}%`);
  });

  it('rend un tiret pour une valeur absente ou non finie', () => {
    expect(formatYieldPercent(null)).toBe('—');
    expect(formatYieldPercent(undefined)).toBe('—');
    expect(formatYieldPercent(Number.NaN)).toBe('—');
  });

  it("formate l'horodatage de situation au lieu d'afficher l'ISO brut", () => {
    const out = formatAsOf('2026-09-30T14:09:09.563Z');
    expect(out).not.toContain('T14:09');
    expect(out).toContain('2026');
    expect(formatAsOf('pas une date')).toBe('pas une date');
  });
});

describe('cohérence entre écrans : même rendement affiché partout', () => {
  it('fiche du bien, consolidation d’entité et portail propriétaire affichent le même texte', () => {
    const attendu = '6,67 %'; // espace normalisée par Testing Library

    const { unmount } = render(
      <YieldCalculator
        data={{ grossYield: 6.666666, netYield: 6.666666, netNetYield: 6.666666, latentCapitalGain: 1, projection: [] }}
      />
    );
    expect(screen.getAllByText(attendu).length).toBeGreaterThanOrEqual(1);
    unmount();

    render(
      <EntityConsolidationCard
        data={
          {
            asOf: '2026-09-30T14:09:09.563Z',
            totals: {
              propertiesCount: 1,
              estimatedValue: 1,
              outstandingDebt: 0,
              netEquity: 1,
              annualRent: 1,
              annualExpenses: 0,
              annualLoanPayments: 0,
              annualCashFlow: 1,
              grossYield: 6.666666,
              netYield: 6.666666,
              netNetYield: 6.666666,
              latentCapitalGain: 1,
              costBasisIncomplete: false
            },
            properties: []
          } as never
        }
      />
    );
    expect(screen.getAllByText(attendu).length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(/666/)).toBeNull();
    expect(formatPercent(6.666666)).toBe(`6,67${NB}%`);
  });
});

describe('hypothèses de projection conservées par agence et par bien', () => {
  const valeurs = {
    years: 15,
    valueGrowthRate: 0.03,
    rentGrowthRate: 0.02,
    expenseGrowthRate: 0.025,
    vacancyRate: 0.05
  };

  it('relit ce qui a été enregistré, sans fuite vers une autre agence ni un autre bien', () => {
    window.localStorage.clear();
    writeYieldAssumptions('agence-A', 'bien-1', valeurs);
    expect(readYieldAssumptions('agence-A', 'bien-1')).toEqual(valeurs);
    expect(readYieldAssumptions('agence-B', 'bien-1')).toBeUndefined();
    expect(readYieldAssumptions('agence-A', 'bien-2')).toBeUndefined();
  });

  it('ignore une valeur stockée invalide ou corrompue', () => {
    window.localStorage.setItem(
      'patrimoine:performance:assumptions:agence-A:bien-3',
      JSON.stringify({ ...valeurs, years: 99 })
    );
    expect(readYieldAssumptions('agence-A', 'bien-3')).toBeUndefined();
    window.localStorage.setItem('patrimoine:performance:assumptions:agence-A:bien-4', '{oups');
    expect(readYieldAssumptions('agence-A', 'bien-4')).toBeUndefined();
  });
});
