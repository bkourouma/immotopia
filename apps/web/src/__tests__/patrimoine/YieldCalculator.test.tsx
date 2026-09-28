import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { YieldCalculator } from '../../components/patrimoine/YieldCalculator';

/**
 * `netNetYield` et `latentCapitalGain` valent `null` quand le prix
 * d'acquisition du bien est inconnu (contrat `packages/api/src/lib/patrimoine/yield.ts`) :
 * afficher 0 inventerait un rendement. L'écran doit montrer « — » et dire
 * quoi renseigner, jamais un zéro silencieux.
 */
describe('YieldCalculator — rendement sans prix d’acquisition', () => {
  it('affiche « — » et le message d’aide quand netNetYield et la plus-value valent null', () => {
    render(
      <YieldCalculator
        data={{
          grossYield: 5.2,
          netYield: 4.1,
          netNetYield: null,
          latentCapitalGain: null,
          projection: []
        }}
      />
    );

    // Les deux indicateurs qui dépendent du prix d'acquisition s'affichent en tiret.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Renseignez le prix d'acquisition dans une valorisation").length).toBeGreaterThanOrEqual(
      1
    );

    // Les indicateurs qui n'en dépendent pas restent affichés normalement
    // (`<Statistic>` sépare partie entière et décimale en deux `<span>`, et
    // la valeur se répète dans la carte « Rendement projeté »).
    expect(screen.getAllByText('.20').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('.10').length).toBeGreaterThanOrEqual(1);
  });

  it('affiche les valeurs quand le prix d’acquisition est connu', () => {
    render(
      <YieldCalculator
        data={{
          grossYield: 5.2,
          netYield: 4.1,
          netNetYield: 3.5,
          latentCapitalGain: 1_200_000,
          projection: []
        }}
      />
    );

    expect(screen.queryByText("Renseignez le prix d'acquisition dans une valorisation")).not.toBeInTheDocument();
    expect(screen.getAllByText('.50').length).toBeGreaterThanOrEqual(1);
  });
});
