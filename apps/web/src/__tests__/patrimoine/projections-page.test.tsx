import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectionsPage } from '../../pages/patrimoine/ProjectionsPage';

/**
 * `<ProjectionsPage>` — projections de la valeur nette, hypothèses modifiables,
 * simulations d'opérations et scénarios enregistrés (lot 3).
 */

/**
 * Seul `utils/api-client` est simulé (frontière réseau, `.claude/rules/testing.md`) :
 * les vrais services et composants tournent par-dessus, donc les URL et les corps
 * vérifiés ici sont ceux réellement envoyés par l'écran.
 */
vi.mock('../../utils/api-client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const patch = apiClient.patch as unknown as ReturnType<typeof vi.fn>;
const del = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const BASE_URL = '/tenants/agence-1/patrimoine';
const envelope = (data: unknown) => ({ data: { data } });

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

type Body = {
  horizonYears?: number;
  operations?: unknown[];
  compareScenarios?: boolean;
  [key: string]: unknown;
};

const ASSETS = [
  {
    id: 'a1',
    name: 'Villa Cocody',
    status: 'ACTIVE',
    assetClass: 'REAL_ESTATE',
    currentValue: { amount: 1 },
    outstandingDebtXof: 5_000_000
  },
  {
    id: 'a2',
    name: 'Stock sans valeur',
    status: 'ACTIVE',
    assetClass: 'INVENTORY',
    currentValue: null,
    outstandingDebtXof: 0
  },
  {
    id: 'a3',
    name: 'Vieux camion',
    status: 'DISPOSED',
    assetClass: 'VEHICLE',
    currentValue: { amount: 1 },
    outstandingDebtXof: 0
  },
  {
    id: 'a4',
    name: 'Compte courant',
    status: 'ACTIVE',
    assetClass: 'CASH',
    currentValue: { amount: 1 },
    outstandingDebtXof: 0
  },
  {
    id: 'a5',
    name: 'Terrain nu',
    status: 'ACTIVE',
    assetClass: 'REAL_ESTATE',
    currentValue: { amount: 1 },
    outstandingDebtXof: 0
  }
];

/** Corps des appels `POST /projections` reçus par le réseau simulé. */
const projectionBodies = (): Body[] =>
  post.mock.calls.filter(call => call[0] === `${BASE_URL}/projections`).map(call => call[1] as Body);
const withOps = () => projectionBodies().filter(body => body.operations !== undefined);
const postsTo = (url: string) => post.mock.calls.filter(call => call[0] === url);

let scenarios: unknown[];

beforeEach(() => {
  vi.clearAllMocks();
  scenarios = [];
  get.mockImplementation(async (url: string) => {
    if (url === `${BASE_URL}/assets`) return envelope(ASSETS);
    if (url === `${BASE_URL}/debts`) return envelope([{ id: 'd1', lender: 'Banque du Sahel', status: 'ACTIVE' }]);
    if (url === `${BASE_URL}/scenarios`) return envelope(scenarios);
    throw new Error(`GET inattendu : ${url}`);
  });
  post.mockImplementation(async (url: string, body: Body) => {
    if (url === `${BASE_URL}/projections`) return envelope(body.operations?.length ? SIMULATED : BASE);
    if (url === `${BASE_URL}/scenarios/s1/run`) return envelope(SIMULATED);
    throw new Error(`POST inattendu : ${url}`);
  });
  patch.mockResolvedValue(envelope(SCENARIO));
  del.mockResolvedValue({ data: undefined });
});

/** Réponse d'erreur telle que la lève axios. */
const httpError = (status: number, data: unknown) => ({ response: { status, data } });

/** Les prochaines projections échouent (toute la suite `POST /projections`). */
const failProjections = (build: (body: Body) => unknown | null) =>
  post.mockImplementation(async (url: string, body: Body) => {
    if (url === `${BASE_URL}/projections`) {
      const failure = build(body);
      if (failure) throw failure;
      return envelope(BASE);
    }
    throw new Error(`POST inattendu : ${url}`);
  });

const MENTION_1 = 'Ces projections reposent sur des hypothèses indicatives, elles ne sont pas une prévision.';

const MENTION_2 =
  'Les mensualités de vos dettes sont supposées payées par vos revenus, qui ne sont pas modélisés : la valeur nette augmente donc du capital remboursé.';
const MENTION_3 = 'Une simulation ne modifie pas vos données.';

describe('<ProjectionsPage>', () => {
  it('affiche un état vide explicite quand aucun actif n’est valorisé, avec un lien vers Mes actifs', async () => {
    post.mockResolvedValue(
      envelope({ assumptionsUsed: ASSUMPTIONS, base: { points: [point(0, 0, 0), point(1, 0, 0)], warnings: [] } })
    );
    monter();

    expect(await screen.findByText(/Ajoutez un actif avec une valeur pour lancer une projection/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mes actifs' })).toHaveAttribute(
      'href',
      '/tenant/agence-1/patrimoine/actifs'
    );
    expect(screen.queryByText('Tableau annuel')).not.toBeInTheDocument();
    // Les trois mentions restent visibles même sans projection.
    expect(screen.getByText(MENTION_1)).toBeInTheDocument();
    expect(screen.getByText(MENTION_2)).toBeInTheDocument();
    expect(screen.getByText(MENTION_3)).toBeInTheDocument();
  });

  it('affiche la projection, le tableau annuel et les trois mentions obligatoires', async () => {
    monter();

    expect(await screen.findByText('Tableau annuel')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith(`${BASE_URL}/projections`, { horizonYears: 10, baseScenario: 'CENTRAL' });
    expect(screen.getByText(MENTION_1)).toBeInTheDocument();
    expect(screen.getByText(MENTION_2)).toBeInTheDocument();
    expect(screen.getByText(MENTION_3)).toBeInTheDocument();
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
    post.mockRejectedValueOnce(new Error('boom'));
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
      expect(post).toHaveBeenLastCalledWith(`${BASE_URL}/projections`, {
        horizonYears: 10,
        baseScenario: 'CENTRAL',
        compareScenarios: true
      })
    );
  });

  it('relance l’appel avec l’horizon et le scénario choisis, un seul appel par saisie', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('Tableau annuel');

    await user.selectOptions(screen.getByLabelText('Scénario de base'), 'OPTIMISTIC');
    const horizon = screen.getByLabelText('Horizon (années)');
    await user.clear(horizon);
    await user.type(horizon, '20');

    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith(`${BASE_URL}/projections`, { horizonYears: 20, baseScenario: 'OPTIMISTIC' })
    );
    // Aucun appel pour les valeurs intermédiaires (« 2 »).
    expect(projectionBodies().some(body => body.horizonYears === 2)).toBe(false);
  });

  it('signale un horizon vide ou nul sans rien envoyer, puis reprend après un délai d’inactivité', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      monter();
      await screen.findByText('Tableau annuel');
      const horizon = screen.getByLabelText('Horizon (années)');
      const calls = () => projectionBodies().length;
      const before = calls();

      fireEvent.change(horizon, { target: { value: '' } });
      expect(screen.getByText('Indiquez un horizon de 1 à 30 ans')).toBeInTheDocument();
      fireEvent.change(horizon, { target: { value: '0' } });
      expect(screen.getByText('Indiquez un horizon de 1 à 30 ans')).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(calls()).toBe(before);

      // Anti-rebond : deux saisies rapprochées, un seul appel, après 400 ms.
      fireEvent.change(horizon, { target: { value: '1' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      fireEvent.change(horizon, { target: { value: '15' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(calls()).toBe(before);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      await waitFor(() => expect(calls()).toBe(before + 1));
      expect(projectionBodies().at(-1)).toEqual({ horizonYears: 15, baseScenario: 'CENTRAL' });
      expect(screen.queryByText('Indiquez un horizon de 1 à 30 ans')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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
      expect(post).toHaveBeenLastCalledWith(`${BASE_URL}/projections`, {
        horizonYears: 10,
        baseScenario: 'CENTRAL',
        assumptions: { growthPercentByClass: { REAL_ESTATE: 7 } }
      })
    );
    expect(await screen.findByText('Personnalisée')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rétablir les hypothèses par défaut' }));
    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith(`${BASE_URL}/projections`, { horizonYears: 10, baseScenario: 'CENTRAL' })
    );
    await waitFor(() => expect(screen.queryByText('Personnalisée')).not.toBeInTheDocument());
  });

  it('refuse une croissance hors bornes sans appeler le serveur', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('Tableau annuel');
    const calls = post.mock.calls.length;

    const growth = screen.getByLabelText('Immobilier (%)');
    await user.clear(growth);
    await user.type(growth, '150');
    await user.click(screen.getByRole('button', { name: 'Appliquer les hypothèses' }));

    expect(await screen.findByText(/comprise entre −50 % et 100 %/)).toBeInTheDocument();
    expect(post.mock.calls.length).toBe(calls);
  });

  it('envoie une opération de chaque type dans le corps exact, sans comparaison, et affiche l’écart', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('Tableau annuel');
    await screen.findByText(MENTION_3);
    await user.click(screen.getByRole('switch'));
    await waitFor(() => expect(projectionBodies().at(-1)?.compareScenarios).toBe(true));

    const choisirType = (value: string) => user.selectOptions(screen.getByLabelText("Type d'opération"), value);
    const ajouter = () => user.click(screen.getByRole('button', { name: "Ajouter l'opération" }));

    // Vente : seuls les actifs en cours, valorisés et hors trésorerie sont proposés.
    await screen.findByRole('option', { name: 'Villa Cocody' });
    expect(screen.getByRole('option', { name: 'Terrain nu' })).toBeInTheDocument();
    for (const absent of ['Vieux camion', 'Stock sans valeur', 'Compte courant']) {
      expect(screen.queryByRole('option', { name: absent })).not.toBeInTheDocument();
    }
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
    expect(withOps()).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Lancer la simulation' }));

    await waitFor(() => expect(withOps()).toHaveLength(1));
    // `compareScenarios` n'est demandé que pour la projection de base.
    expect(withOps()[0]).toEqual({
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

  it('prévient qu’une vente ne solde pas la dette adossée à l’actif choisi', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('Tableau annuel');
    await screen.findByRole('option', { name: 'Villa Cocody' });
    const note = /La dette adossée à cet actif n'est pas soldée par la vente/;

    expect(screen.queryByText(note)).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Actif à vendre'), 'a1');
    expect(screen.getByText(note)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Actif à vendre'), 'a5');
    expect(screen.queryByText(note)).not.toBeInTheDocument();
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

  it.each([
    ['operations.0.year', 'Année hors de la période projetée', /Année :/],
    ['operations.0.assetId', 'Un compte de trésorerie ne se vend pas', /Actif :/]
  ])('affiche une erreur 422 sur %s, avec le message du serveur', async (field, message, label) => {
    const user = userEvent.setup();
    failProjections(body => (body.operations?.length ? httpError(422, { errors: [{ field, message }] }) : null));
    monter();
    await screen.findByText('Tableau annuel');

    await user.selectOptions(screen.getByLabelText("Type d'opération"), 'MONTHLY_SAVING');
    await user.type(screen.getByLabelText('Montant par mois'), '10000');
    await user.type(screen.getByLabelText("De l'année"), '1');
    await user.click(screen.getByRole('button', { name: "Ajouter l'opération" }));
    await user.click(screen.getByRole('button', { name: 'Lancer la simulation' }));

    const alerte = await screen.findByText(new RegExp(message));
    expect(alerte.textContent).toMatch(/Opération 1/);
    expect(alerte.textContent).toMatch(label);
    // La projection de base reste affichée.
    expect(screen.getByText('Tableau annuel')).toBeInTheDocument();
  });

  it('rend les avertissements du contrat en texte lisible', async () => {
    post.mockResolvedValue(
      envelope({
        ...BASE,
        base: {
          ...BASE.base,
          warnings: [
            { code: 'LOW_RELIABILITY_START', sharePercent: 12.5 },
            { code: 'ASSET_WITHOUT_VALUE', assetId: 'a2' },
            { code: 'ASSET_WITHOUT_VALUE', assetId: 'inconnu' },
            { code: 'LOAN_PAYMENT_TOO_LOW', loanId: 'd1' },
            { code: 'LOAN_MATURED_WITH_BALANCE', loanId: 'd1' },
            { code: 'NEGATIVE_CASH', year: 3 },
            { code: 'OPERATION_NOT_APPLICABLE', index: 0, reason: 'ASSET_NOT_FOUND' }
          ]
        }
      })
    );
    monter();

    expect(
      await screen.findByText(/12,5 % de la valeur de départ repose sur des valeurs peu fiables\./)
    ).toBeInTheDocument();
    expect(await screen.findByText(/« Stock sans valeur » n'a pas de valeur/)).toBeInTheDocument();
    expect(
      screen.getByText("Un actif n'a pas de valeur : il n'est pas compté dans la projection.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "La mensualité d'une dette ne couvre pas ses intérêts : son capital ne diminue pas et les intérêts non payés ne sont pas comptés."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Une dette est arrivée à échéance avec un solde restant dû : ce solde est conservé tel quel, sans intérêt.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('La trésorerie devient négative en année 3.')).toBeInTheDocument();
    expect(
      screen.getByText("Une opération ne s'applique plus : l'actif ou la dette n'existe plus ou n'est plus actif.")
    ).toBeInTheDocument();
  });

  it('enregistre, ouvre puis supprime un scénario', async () => {
    const user = userEvent.setup();
    scenarios = [SCENARIO];
    post.mockImplementation(async (url: string, body: Body) => {
      if (url === `${BASE_URL}/scenarios`) return envelope(SCENARIO);
      if (url === `${BASE_URL}/scenarios/s1/run`) return envelope(SIMULATED);
      return envelope(body.operations?.length ? SIMULATED : BASE);
    });
    monter();
    await screen.findByText('Tableau annuel');

    await user.type(screen.getByLabelText('Nom du scénario'), 'Mon plan');
    await user.click(screen.getByRole('button', { name: 'Enregistrer ce scénario' }));
    await waitFor(() => expect(postsTo(`${BASE_URL}/scenarios`)).toHaveLength(1));
    expect(postsTo(`${BASE_URL}/scenarios`)[0][1]).toEqual({
      name: 'Mon plan',
      horizonYears: 10,
      baseScenario: 'CENTRAL',
      assumptions: {},
      operations: []
    });
    expect(await screen.findByText('Scénario enregistré.')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    await waitFor(() => expect(postsTo(`${BASE_URL}/scenarios/s1/run`)).toHaveLength(1));
    expect(postsTo(`${BASE_URL}/scenarios/s1/run`)[0][1]).toEqual({});
    expect(screen.getByLabelText('Horizon (années)')).toHaveValue(5);
    expect(screen.getByLabelText('Scénario de base')).toHaveValue('PRUDENT');
    expect(await screen.findByText(/Vente de « Villa Cocody » en année 3/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    const boutons = await screen.findAllByRole('button', { name: 'Supprimer' });
    await user.click(boutons[boutons.length - 1]);
    await waitFor(() => expect(del).toHaveBeenCalledWith(`${BASE_URL}/scenarios/s1`));
  });

  it('met à jour un scénario avec les réglages courants, sans nom, hypothèses vides comprises', async () => {
    const user = userEvent.setup();
    scenarios = [SCENARIO];
    monter();
    await screen.findByText('Tableau annuel');

    await user.selectOptions(screen.getByLabelText('Scénario de base'), 'OPTIMISTIC');
    await user.selectOptions(screen.getByLabelText("Type d'opération"), 'MONTHLY_SAVING');
    await user.type(screen.getByLabelText('Montant par mois'), '10000');
    await user.type(screen.getByLabelText("De l'année"), '1');
    await user.click(screen.getByRole('button', { name: "Ajouter l'opération" }));

    await user.click(await screen.findByRole('button', { name: 'Mettre à jour' }));
    const confirmations = await screen.findAllByRole('button', { name: 'Mettre à jour' });
    await user.click(confirmations[confirmations.length - 1]);

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][0]).toBe(`${BASE_URL}/scenarios/s1`);
    const body = patch.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('name');
    expect(body).toEqual({
      horizonYears: 10,
      baseScenario: 'OPTIMISTIC',
      assumptions: {},
      operations: [{ type: 'MONTHLY_SAVING', fromYear: 1, amount: 10000 }]
    });
    expect(await screen.findByText('Scénario mis à jour.')).toBeInTheDocument();
  });

  it('affiche en clair un conflit 409 à l’enregistrement', async () => {
    const user = userEvent.setup();
    post.mockImplementation(async (url: string) => {
      if (url === `${BASE_URL}/scenarios`) throw httpError(409, { error: 'Un scénario porte déjà ce nom.' });
      return envelope(BASE);
    });
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
    scenarios = [SCENARIO];
    post.mockImplementation(async (url: string) => {
      if (url === `${BASE_URL}/scenarios`) throw httpError(403, { error: 'Accès refusé' });
      return envelope(BASE);
    });
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
    scenarios = [SCENARIO];
    patch.mockResolvedValue(envelope({ ...SCENARIO, name: 'Nouveau nom' }));
    monter();
    await screen.findByText('Tableau annuel');

    await user.click(await screen.findByRole('button', { name: 'Renommer' }));
    const champ = screen.getByLabelText('Nouveau nom du scénario');
    await user.clear(champ);
    await user.type(champ, 'Nouveau nom');
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    await waitFor(() => expect(patch).toHaveBeenCalledWith(`${BASE_URL}/scenarios/s1`, { name: 'Nouveau nom' }));
  });
});
