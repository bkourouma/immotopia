import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectionsPage } from '../../pages/patrimoine/ProjectionsPage';

/**
 * `<ProjectionsPage>` — projections de la valeur nette, hypothèses modifiables,
 * simulations d'opérations et scénarios enregistrés (lot 3).
 */

const runProjection = vi.fn();
const runScenario = vi.fn();
const listScenarios = vi.fn();
const createScenario = vi.fn();
const getScenario = vi.fn();
const updateScenario = vi.fn();
const deleteScenario = vi.fn();
const listAssets = vi.fn();
const listDebts = vi.fn();

vi.mock('../../services/patrimoine-projections-service', () => ({
  runProjection: (...a: unknown[]) => runProjection(...a),
  runScenario: (...a: unknown[]) => runScenario(...a),
  listScenarios: (...a: unknown[]) => listScenarios(...a),
  createScenario: (...a: unknown[]) => createScenario(...a),
  getScenario: (...a: unknown[]) => getScenario(...a),
  updateScenario: (...a: unknown[]) => updateScenario(...a),
  deleteScenario: (...a: unknown[]) => deleteScenario(...a)
}));

vi.mock('../../services/patrimoine-assets-service', () => ({
  listAssets: (...a: unknown[]) => listAssets(...a),
  listDebts: (...a: unknown[]) => listDebts(...a)
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const point = (year: number, netWorth: number, assets = 100_000_000) => ({
  year,
  assets,
  debts: assets - netWorth,
  netWorth,
  realNetWorth: netWorth - 1_000,
  byClass: []
});

const ASSUMPTIONS = {
  growthPercentByClass: { REAL_ESTATE: 4, CASH: 0 },
  inflationPercent: 3
};

const BASE = {
  assumptionsUsed: ASSUMPTIONS,
  base: { points: [point(0, 80_000_000), point(1, 83_000_000), point(2, 86_000_000)], warnings: [] }
};

const SIMULATED = {
  ...BASE,
  simulated: { points: [point(0, 80_000_000), point(1, 84_000_000), point(2, 91_000_000)], warnings: [] },
  delta: [
    { year: 0, netWorth: 0 },
    { year: 1, netWorth: 1_000_000 },
    { year: 2, netWorth: 5_000_000 }
  ]
};

const SCENARIO = {
  id: 's1',
  name: 'Vente de la villa',
  horizonYears: 5,
  baseScenario: 'PRUDENT',
  assumptions: { growthPercentByClass: { REAL_ESTATE: 1 } },
  operations: [{ type: 'SELL_ASSET', year: 3, assetId: 'a1' }],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z'
};

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/patrimoine/projections']}>
          <Routes>
            <Route path="/tenant/:tenantId/patrimoine/projections" element={<ProjectionsPage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const ops = (call: unknown[]) => (call[1] as { operations?: unknown[] }).operations;

beforeEach(() => {
  vi.clearAllMocks();
  runProjection.mockImplementation(async (_tenant: string, body: { operations?: unknown[] }) =>
    body.operations?.length ? SIMULATED : BASE
  );
  runScenario.mockResolvedValue(SIMULATED);
  listScenarios.mockResolvedValue([]);
  listAssets.mockResolvedValue([
    { id: 'a1', name: 'Villa Cocody', status: 'ACTIVE' },
    { id: 'a2', name: 'Stock sans valeur', status: 'ACTIVE' },
    { id: 'a3', name: 'Vieux camion', status: 'DISPOSED' }
  ]);
  listDebts.mockResolvedValue([{ id: 'd1', lender: 'Banque du Sahel', status: 'ACTIVE' }]);
});

const MENTION_1 = 'Ces projections reposent sur des hypothèses indicatives, elles ne sont pas une prévision.';

describe('<ProjectionsPage>', () => {
  it('affiche un état vide explicite quand aucun actif n’est valorisé, avec un lien vers Mes actifs', async () => {
    runProjection.mockResolvedValue({
      assumptionsUsed: ASSUMPTIONS,
      base: { points: [point(0, 0, 0), point(1, 0, 0)], warnings: [] }
    });
    monter();

    expect(await screen.findByText(/Ajoutez un actif avec une valeur pour lancer une projection/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mes actifs' })).toHaveAttribute(
      'href',
      '/tenant/agence-1/patrimoine/actifs'
    );
    expect(screen.queryByText('Tableau annuel')).not.toBeInTheDocument();
    // Les mentions restent visibles même sans projection.
    expect(screen.getByText(MENTION_1)).toBeInTheDocument();
  });

  it('affiche la projection, le tableau annuel et les mentions obligatoires', async () => {
    monter();

    expect(await screen.findByText('Tableau annuel')).toBeInTheDocument();
    expect(runProjection).toHaveBeenCalledWith('agence-1', { horizonYears: 10, baseScenario: 'CENTRAL' });
    expect(screen.getByText(MENTION_1)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Les mensualités de vos dettes sont supposées payées par vos revenus, qui ne sont pas modélisés : la valeur nette augmente donc du capital remboursé.'
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText("Valeur réelle (pouvoir d'achat d'aujourd'hui)").length).toBeGreaterThan(0);
    expect(screen.getByText("Aujourd'hui")).toBeInTheDocument();
    expect(screen.getAllByText(/86\s000\s000/).length).toBeGreaterThan(0);
    // Hypothèses affichées par classe, sans indication de personnalisation.
    expect(screen.getByLabelText('Immobilier (%)')).toHaveValue(4);
    expect(screen.getByLabelText('Inflation (%)')).toHaveValue(3);
    expect(screen.queryByText('Personnalisée')).not.toBeInTheDocument();
  });

  it('propose de réessayer après une erreur', async () => {
    const user = userEvent.setup();
    runProjection.mockRejectedValueOnce(new Error('boom'));
    monter();

    await user.click(await screen.findByRole('button', { name: /Réessayer/ }));
    expect(await screen.findByText('Tableau annuel')).toBeInTheDocument();
  });

  it('relance l’appel avec les trois scénarios quand la comparaison est activée', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('Tableau annuel');

    await user.click(screen.getByRole('switch'));

    await waitFor(() =>
      expect(runProjection).toHaveBeenLastCalledWith('agence-1', {
        horizonYears: 10,
        baseScenario: 'CENTRAL',
        compareScenarios: true
      })
    );
  });

  it('relance l’appel avec l’horizon et le scénario choisis', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('Tableau annuel');

    await user.selectOptions(screen.getByLabelText('Scénario de base'), 'OPTIMISTIC');
    const horizon = screen.getByLabelText('Horizon (années)');
    await user.clear(horizon);
    await user.type(horizon, '20');

    await waitFor(() =>
      expect(runProjection).toHaveBeenLastCalledWith('agence-1', { horizonYears: 20, baseScenario: 'OPTIMISTIC' })
    );
  });

  it('relance l’appel avec une surcharge d’hypothèse, la signale, puis la rétablit', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('Tableau annuel');

    const growth = screen.getByLabelText('Immobilier (%)');
    await user.clear(growth);
    await user.type(growth, '7');
    await user.click(screen.getByRole('button', { name: 'Appliquer les hypothèses' }));

    await waitFor(() =>
      expect(runProjection).toHaveBeenLastCalledWith('agence-1', {
        horizonYears: 10,
        baseScenario: 'CENTRAL',
        assumptions: { growthPercentByClass: { REAL_ESTATE: 7 } }
      })
    );
    expect(await screen.findByText('Personnalisée')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rétablir les hypothèses par défaut' }));
    await waitFor(() =>
      expect(runProjection).toHaveBeenLastCalledWith('agence-1', { horizonYears: 10, baseScenario: 'CENTRAL' })
    );
    await waitFor(() => expect(screen.queryByText('Personnalisée')).not.toBeInTheDocument());
  });

  it('refuse une croissance hors bornes sans appeler le serveur', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('Tableau annuel');
    const calls = runProjection.mock.calls.length;

    const growth = screen.getByLabelText('Immobilier (%)');
    await user.clear(growth);
    await user.type(growth, '150');
    await user.click(screen.getByRole('button', { name: 'Appliquer les hypothèses' }));

    expect(await screen.findByText(/comprise entre −50 % et 100 %/)).toBeInTheDocument();
    expect(runProjection.mock.calls.length).toBe(calls);
  });

  it('envoie une opération de chaque type dans le corps exact et affiche l’écart', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('Tableau annuel');
    await screen.findByText('Une simulation ne modifie pas vos données.');
    await waitFor(() => expect(listAssets).toHaveBeenCalled());

    const choisirType = (value: string) => user.selectOptions(screen.getByLabelText("Type d'opération"), value);
    const ajouter = () => user.click(screen.getByRole('button', { name: "Ajouter l'opération" }));

    // Vente : les actifs cédés ne sont pas proposés.
    await screen.findByRole('option', { name: 'Villa Cocody' });
    expect(screen.queryByRole('option', { name: 'Vieux camion' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Actif à vendre'), 'a1');
    await user.type(screen.getByLabelText('Année'), '2');
    await user.type(screen.getByLabelText('Prix de vente (facultatif)'), '1000000');
    await user.type(screen.getByLabelText('Frais (%)'), '2');
    await ajouter();

    await choisirType('BUY_ASSET');
    await user.selectOptions(screen.getByLabelText('Classe'), 'CASH');
    await user.type(screen.getByLabelText("Nom de l'actif"), 'Compte épargne');
    await user.type(screen.getByLabelText('Prix'), '500000');
    await user.type(screen.getByLabelText('Année'), '1');
    await user.type(screen.getByLabelText('Croissance (%) (facultatif)'), '3');
    await ajouter();

    await choisirType('TAKE_LOAN');
    await user.type(screen.getByLabelText('Montant emprunté'), '2000000');
    await user.type(screen.getByLabelText('Taux annuel (%)'), '8');
    await user.type(screen.getByLabelText('Durée (années)'), '5');
    await user.type(screen.getByLabelText('Année'), '1');
    await ajouter();

    await choisirType('PREPAY_LOAN');
    await user.selectOptions(screen.getByLabelText('Dette à rembourser'), 'd1');
    await user.type(screen.getByLabelText('Montant remboursé'), '300000');
    await user.type(screen.getByLabelText('Année'), '2');
    await ajouter();

    await choisirType('MONTHLY_SAVING');
    await user.type(screen.getByLabelText('Montant par mois'), '50000');
    await user.type(screen.getByLabelText("De l'année"), '1');
    await user.type(screen.getByLabelText("À l'année (facultatif)"), '2');
    await ajouter();

    expect(screen.getByText(/Opérations simulées \(5\)/)).toBeInTheDocument();
    expect(runProjection.mock.calls.every(call => ops(call) === undefined)).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Lancer la simulation' }));

    await waitFor(() => expect(runProjection.mock.calls.some(call => ops(call) !== undefined)).toBe(true));
    const call = runProjection.mock.calls.find(c => ops(c) !== undefined) as unknown[];
    expect(call[0]).toBe('agence-1');
    expect(call[1]).toEqual({
      horizonYears: 10,
      baseScenario: 'CENTRAL',
      operations: [
        { type: 'SELL_ASSET', year: 2, assetId: 'a1', salePrice: 1000000, feesPercent: 2 },
        { type: 'BUY_ASSET', year: 1, assetClass: 'CASH', name: 'Compte épargne', price: 500000, growthPercent: 3 },
        { type: 'TAKE_LOAN', year: 1, amount: 2000000, annualRatePercent: 8, termYears: 5 },
        { type: 'PREPAY_LOAN', year: 2, loanId: 'd1', amount: 300000 },
        { type: 'MONTHLY_SAVING', fromYear: 1, toYear: 2, amount: 50000 }
      ]
    });
    expect(await screen.findByText(/Valeur nette à l'année 2 : \+5\s000\s000/)).toBeInTheDocument();
    expect(screen.getByText('Écart avec la base')).toBeInTheDocument();
  });

  it('retire une opération de la liste', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('Tableau annuel');

    await user.selectOptions(screen.getByLabelText("Type d'opération"), 'MONTHLY_SAVING');
    await user.type(screen.getByLabelText('Montant par mois'), '10000');
    await user.type(screen.getByLabelText("De l'année"), '1');
    await user.click(screen.getByRole('button', { name: "Ajouter l'opération" }));
    expect(screen.getByText(/Opérations simulées \(1\)/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retirer' }));
    expect(screen.getByText(/Opérations simulées \(0\)/)).toBeInTheDocument();
  });

  it('signale une opération incomplète sans l’ajouter', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('Tableau annuel');

    await user.click(screen.getByRole('button', { name: "Ajouter l'opération" }));

    expect(await screen.findByText('Renseignez les champs obligatoires avec des valeurs valides.')).toBeInTheDocument();
    expect(screen.getByText(/Opérations simulées \(0\)/)).toBeInTheDocument();
  });

  it('affiche une erreur 422 sur l’opération et le champ concernés', async () => {
    const user = userEvent.setup();
    runProjection.mockImplementation(async (_tenant: string, body: { operations?: unknown[] }) => {
      if (body.operations?.length) {
        throw {
          response: {
            status: 422,
            data: { errors: [{ field: 'operations.0.year', message: 'Année hors de la période projetée' }] }
          }
        };
      }
      return BASE;
    });
    monter();
    await screen.findByText('Tableau annuel');

    await user.selectOptions(screen.getByLabelText("Type d'opération"), 'MONTHLY_SAVING');
    await user.type(screen.getByLabelText('Montant par mois'), '10000');
    await user.type(screen.getByLabelText("De l'année"), '1');
    await user.click(screen.getByRole('button', { name: "Ajouter l'opération" }));
    await user.click(screen.getByRole('button', { name: 'Lancer la simulation' }));

    const alerte = await screen.findByText(/Année hors de la période projetée/);
    expect(alerte.textContent).toMatch(/Opération 1/);
    expect(alerte.textContent).toMatch(/Année :/);
    // La projection de base reste affichée.
    expect(screen.getByText('Tableau annuel')).toBeInTheDocument();
  });

  it('rend les avertissements du contrat en texte lisible', async () => {
    runProjection.mockResolvedValue({
      ...BASE,
      base: {
        ...BASE.base,
        warnings: [
          { code: 'LOW_RELIABILITY_START', sharePercent: 12.5 },
          { code: 'ASSET_WITHOUT_VALUE', assetId: 'a2' },
          { code: 'ASSET_WITHOUT_VALUE', assetId: 'inconnu' },
          { code: 'LOAN_PAYMENT_TOO_LOW', loanId: 'd1' },
          { code: 'NEGATIVE_CASH', year: 3 },
          { code: 'OPERATION_NOT_APPLICABLE', index: 0, reason: 'ASSET_NOT_FOUND' }
        ]
      }
    });
    monter();

    expect(
      await screen.findByText(/12,5 % de la valeur de départ repose sur des valeurs peu fiables\./)
    ).toBeInTheDocument();
    expect(await screen.findByText(/« Stock sans valeur » n'a pas de valeur/)).toBeInTheDocument();
    expect(
      screen.getByText("Un actif n'a pas de valeur : il n'est pas compté dans la projection.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("La mensualité d'une dette ne couvre pas ses intérêts : son capital augmente.")
    ).toBeInTheDocument();
    expect(screen.getByText('La trésorerie devient négative en année 3.')).toBeInTheDocument();
    expect(
      screen.getByText("Une opération ne s'applique plus : l'actif ou la dette n'existe plus ou n'est plus actif.")
    ).toBeInTheDocument();
  });

  it('enregistre, ouvre puis supprime un scénario', async () => {
    const user = userEvent.setup();
    listScenarios.mockResolvedValue([SCENARIO]);
    createScenario.mockResolvedValue(SCENARIO);
    deleteScenario.mockResolvedValue(undefined);
    monter();
    await screen.findByText('Tableau annuel');

    await user.type(screen.getByLabelText('Nom du scénario'), 'Mon plan');
    await user.click(screen.getByRole('button', { name: 'Enregistrer ce scénario' }));
    await waitFor(() =>
      expect(createScenario).toHaveBeenCalledWith('agence-1', {
        name: 'Mon plan',
        horizonYears: 10,
        baseScenario: 'CENTRAL',
        operations: []
      })
    );
    expect(await screen.findByText('Scénario enregistré.')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    await waitFor(() => expect(runScenario).toHaveBeenCalledWith('agence-1', 's1', { compareScenarios: false }));
    expect(screen.getByLabelText('Horizon (années)')).toHaveValue(5);
    expect(screen.getByLabelText('Scénario de base')).toHaveValue('PRUDENT');
    expect(await screen.findByText(/Vente de « Villa Cocody » en année 3/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    const boutons = await screen.findAllByRole('button', { name: 'Supprimer' });
    await user.click(boutons[boutons.length - 1]);
    await waitFor(() => expect(deleteScenario).toHaveBeenCalledWith('agence-1', 's1'));
  });

  it('affiche en clair un conflit 409 à l’enregistrement', async () => {
    const user = userEvent.setup();
    createScenario.mockRejectedValue({ response: { status: 409, data: { error: 'Un scénario porte déjà ce nom.' } } });
    monter();
    await screen.findByText('Tableau annuel');

    await user.type(screen.getByLabelText('Nom du scénario'), 'Doublon');
    await user.click(screen.getByRole('button', { name: 'Enregistrer ce scénario' }));

    expect(await screen.findByText('Un scénario porte déjà ce nom.')).toBeInTheDocument();
    // Un conflit n'est pas un refus de droits : l'écriture reste proposée.
    expect(screen.getByRole('button', { name: 'Enregistrer ce scénario' })).toBeInTheDocument();
  });

  it('retire les boutons d’écriture après un refus 403', async () => {
    const user = userEvent.setup();
    listScenarios.mockResolvedValue([SCENARIO]);
    createScenario.mockRejectedValue({ response: { status: 403, data: { error: 'Accès refusé' } } });
    monter();
    await screen.findByText('Tableau annuel');
    await screen.findByText('Vente de la villa');

    await user.type(screen.getByLabelText('Nom du scénario'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Enregistrer ce scénario' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Enregistrer ce scénario' })).not.toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renommer' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvrir' })).toBeInTheDocument();
  });

  it('renomme un scénario', async () => {
    const user = userEvent.setup();
    listScenarios.mockResolvedValue([SCENARIO]);
    updateScenario.mockResolvedValue({ ...SCENARIO, name: 'Nouveau nom' });
    monter();
    await screen.findByText('Tableau annuel');

    await user.click(await screen.findByRole('button', { name: 'Renommer' }));
    const champ = screen.getByLabelText('Nouveau nom du scénario');
    await user.clear(champ);
    await user.type(champ, 'Nouveau nom');
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    await waitFor(() => expect(updateScenario).toHaveBeenCalledWith('agence-1', 's1', { name: 'Nouveau nom' }));
  });
});
