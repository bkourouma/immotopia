import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { YieldCalculator } from '../../components/patrimoine/YieldCalculator';
import type { BankRatios, PropertyYieldData } from '../../types/patrimoine-types';

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
    expect(screen.getAllByText('5,20 %').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('4,10 %').length).toBeGreaterThanOrEqual(1);
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
    expect(screen.getAllByText('3,50 %').length).toBeGreaterThanOrEqual(1);
  });
});

const baseData: PropertyYieldData = {
  grossYield: 5.2,
  netYield: 4.1,
  netNetYield: 3.5,
  latentCapitalGain: 1_200_000,
  projection: []
};

describe('YieldCalculator — bandeau de synchronisation des hypothèses', () => {
  it('annonce la synchronisation avec le serveur par défaut', () => {
    render(<YieldCalculator data={baseData} />);
    expect(
      screen.getByText(
        "Hypothèses synchronisées avec le serveur : elles sont partagées entre vos appareils et les collaborateurs de l'agence."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/non synchronisées/)).not.toBeInTheDocument();
  });

  it('avertit quand les hypothèses ne sont conservées que sur l’appareil', () => {
    render(<YieldCalculator data={baseData} syncStatus="local" />);
    expect(
      screen.getByText(
        'Hypothèses non synchronisées : conservées sur cet appareil en attendant la connexion au serveur.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/synchronisées avec le serveur/)).not.toBeInTheDocument();
  });
});

describe('YieldCalculator — ratios bancaires', () => {
  const nul = { value: null, reason: null };
  const ratiosComplets: BankRatios = {
    dscr: { value: 1.25, reason: null },
    ltv: { value: 40.5, reason: null },
    cashOnCash: { value: 8.5, reason: null },
    irr: { value: 6.2, reason: null }
  };

  it('affiche les quatre ratios formatés', () => {
    render(<YieldCalculator data={{ ...baseData, ratios: ratiosComplets }} />);
    expect(screen.getByText('Ratios bancaires')).toBeInTheDocument();
    expect(screen.getByText('1,25 x')).toBeInTheDocument();
    expect(screen.getByText('40,50 %')).toBeInTheDocument();
    expect(screen.getByText('8,50 %')).toBeInTheDocument();
    expect(screen.getByText('6,20 %')).toBeInTheDocument();
  });

  it('chaque titre porte une info-bulle accessible qui définit le ratio', () => {
    render(<YieldCalculator data={{ ...baseData, ratios: ratiosComplets }} />);
    for (const ratio of ['DSCR', 'LTV', 'Cash-on-cash', 'TRI']) {
      const icone = screen.getByRole('img', { name: new RegExp('Définition : ' + ratio) });
      expect(icone).toHaveAttribute('tabindex', '0');
    }
  });

  it('l’info-bulle s’ouvre au focus clavier et la définition reste lisible par aria-describedby', async () => {
    render(<YieldCalculator data={{ ...baseData, ratios: ratiosComplets }} />);
    const definition =
      "DSCR = (loyers annuels effectifs, vacance déduite − charges d'exploitation) / mensualités d'emprunt des 12 prochains mois.";
    const icone = screen.getByRole('img', { name: /Définition : DSCR/ });

    // Définition accessible sans ouvrir l'info-bulle.
    const id = icone.getAttribute('aria-describedby') as string;
    expect(document.getElementById(id)).toHaveTextContent(definition);

    fireEvent.focus(icone);
    const bulle = await screen.findByRole('tooltip');
    await waitFor(() => expect(bulle).toHaveTextContent(definition));
  });

  it.each([
    ['NO_DEBT_SERVICE', 'Aucune mensualité à venir sur les 12 prochains mois'],
    ['NO_ACTIVE_LOAN', 'Aucun emprunt actif sur ce bien'],
    ['NO_VALUE', 'Aucune valorisation renseignée'],
    ['NO_COST_BASIS', "Renseignez le prix d'acquisition dans une valorisation"],
    ['NO_EQUITY', 'Bien financé à 100 % : fonds propres nuls'],
    ['NOT_CONVERGENT', 'Calcul impossible avec ces hypothèses']
  ] as const)('indéterminable (%s) : un tiret et la raison, jamais 0', (code, texte) => {
    render(
      <YieldCalculator
        data={{
          ...baseData,
          ratios: { ...ratiosComplets, dscr: { value: null, reason: code } }
        }}
      />
    );
    const carte = screen.getByText('Ratios bancaires').closest('.ant-card') as HTMLElement;
    expect(within(carte).getAllByText('—')).toHaveLength(1);
    expect(within(carte).getByText(texte)).toBeInTheDocument();
    expect(within(carte).queryByText(/0,00/)).not.toBeInTheDocument();
  });

  it('quatre tirets sans raison quand le serveur ne précise rien', () => {
    render(<YieldCalculator data={{ ...baseData, ratios: { dscr: nul, ltv: nul, cashOnCash: nul, irr: nul } }} />);
    const carte = screen.getByText('Ratios bancaires').closest('.ant-card') as HTMLElement;
    expect(within(carte).getAllByText('—')).toHaveLength(4);
  });

  it('ne rend pas la carte quand la réponse n’a pas de ratios (ancien serveur)', () => {
    render(<YieldCalculator data={baseData} />);
    expect(screen.queryByText('Ratios bancaires')).not.toBeInTheDocument();
  });
});
