import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TableauDeBordChantiers } from '../../pages/finance/TableauDeBordChantiers';
import type { SiteBudgetAlert, SiteDashboardRow } from '../../types/finance-lot3-types';

/**
 * Tableau de bord des chantiers — les garanties de
 * `pages/finance/TableauDeBordChantiers.tsx` (lot 3,
 * specs/018-finance-budget-pilotage/data-model.md §4, §5).
 *
 * Modèle exact de `__tests__/finance/chantiers.test.tsx` : `useBreakpoint`
 * figé en desktop, un mock de `finance-lot3-service` qui couvre CHAQUE export
 * utilisé (Vitest refuse en silence un import non déclaré, AGENTS.md), et des
 * délais `findBy*` de 8 s pour la charge parallèle de la suite complète.
 */

const getSitesDashboard = vi.fn();
const acknowledgeBudgetAlert = vi.fn();

vi.mock('../../services/finance-lot3-service', () => ({
  getSitesDashboard: (...a: unknown[]) => getSitesDashboard(...a),
  acknowledgeBudgetAlert: (...a: unknown[]) => acknowledgeBudgetAlert(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function alerte(overrides: Partial<SiteBudgetAlert> = {}): SiteBudgetAlert {
  return {
    id: 'alerte-1',
    siteId: 'chantier-1',
    siteLabel: 'Villa duplex — Angré Centre',
    budgetId: 'budget-1',
    thresholdPercent: 80,
    engagedAmount: 21_600_000,
    budgetAmount: 26_700_000,
    consumedPercent: 81,
    raisedAt: '2026-09-10T09:00:00.000Z',
    acknowledgedAt: null,
    currency: 'XOF',
    ...overrides
  };
}

function ligne(overrides: Partial<SiteDashboardRow> = {}): SiteDashboardRow {
  return {
    siteId: 'chantier-1',
    siteLabel: 'Villa duplex — Angré Centre',
    zone: 'Angré, Cocody',
    status: 'IN_PROGRESS',
    initialBudget: 25_500_000,
    revisedBudget: 26_700_000,
    engagedAmount: 21_600_000,
    actualCost: 19_500_000,
    progressPercent: 70,
    variance: 5_100_000,
    variancePercent: 19,
    openAlert: null,
    currency: 'XOF',
    ...overrides
  };
}

/** Nettoie casse et accents, pour une vérification insensible aux deux. */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Sonde d'adresse : révèle la navigation déclenchée par l'écran. */
function Adresse() {
  const location = useLocation();
  return <span data-testid="adresse">{location.pathname + location.search}</span>;
}

/**
 * Choisit une option de menu déroulant par son libellé.
 *
 * Un statut choisi dans le filtre (« En cours ») est aussi celui déjà affiché
 * dans la colonne Statut de la ligne : `findByText` seul y verrait alors
 * plusieurs éléments. Seule l'option de la liste déroulante porte la classe
 * `ant-select-item` d'AntD.
 */
async function optionParLibelle(libelle: string): Promise<HTMLElement> {
  return waitFor(() => {
    const candidat = screen.getAllByText(libelle).find(el => el.closest('.ant-select-item'));
    if (!candidat) throw new Error(`Option de menu déroulant introuvable : « ${libelle} »`);
    return candidat;
  });
}

/**
 * La ligne du tableau qui porte ce libellé de chantier.
 *
 * La colonne « Alerte » a pour titre le mot même que porte son étiquette
 * (« Alerte ») : AntD répète le titre de chaque colonne dans un nœud de
 * mesure caché, si bien que `screen.getByText('Alerte')` trouve toujours au
 * moins l'en-tête. On cherche donc DANS la ligne, jamais dans la page entière.
 */
function ligneDuChantier(libelle: string): HTMLElement {
  const ligne = screen.getAllByRole('row').find(row => within(row).queryByText(libelle));
  if (!ligne) throw new Error(`Ligne introuvable pour « ${libelle} »`);
  return ligne;
}

function mountTableau(url = '/tenant/agence-1/finance/tableau-de-bord-chantiers') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/finance/tableau-de-bord-chantiers" element={<TableauDeBordChantiers />} />
            <Route
              path="/tenant/:tenantId/finance/chantiers/:siteId/budget"
              element={<span>budget du chantier</span>}
            />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Tableau de bord — affichage sans aucun recalcul côté écran', () => {
  it('affiche une ligne par chantier, avec ses montants déjà calculés par le serveur', async () => {
    getSitesDashboard.mockResolvedValue({ rows: [ligne()], currency: 'XOF' });
    mountTableau();

    expect(await screen.findByText('Villa duplex — Angré Centre', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Angré, Cocody')).toBeInTheDocument();
    expect(screen.getByText(/25\s500\s000/)).toBeInTheDocument();
    expect(screen.getByText(/26\s700\s000/)).toBeInTheDocument();
    expect(screen.getByText(/21\s600\s000/)).toBeInTheDocument();
    expect(screen.getByText(/19\s500\s000/)).toBeInTheDocument();
  });

  it('lit le signe de l’écart déjà fourni, sans jamais recalculer `revisedBudget - engagedAmount`', async () => {
    // Piège délibéré : un calcul naïf de `revisedBudget - engagedAmount`
    // donnerait ici -100 000 (un dépassement), alors que le champ `variance`
    // fourni par le serveur vaut +50 000 (dans le budget). Si l'écran
    // recalculait l'écart lui-même plutôt que de lire ce champ, ce test le
    // verrait immédiatement au code couleur affiché.
    getSitesDashboard.mockResolvedValue({
      rows: [ligne({ revisedBudget: 1_000_000, engagedAmount: 1_100_000, variance: 50_000, variancePercent: 5 })],
      currency: 'XOF'
    });
    mountTableau();

    expect(await screen.findByText('Dans le budget', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Dépassement')).not.toBeInTheDocument();
  });

  it('affiche un chantier sans budget sans le confondre avec une panne', async () => {
    getSitesDashboard.mockResolvedValue({
      rows: [
        ligne({
          siteId: 'chantier-nouveau',
          siteLabel: 'Extension villa — Bingerville',
          status: 'PLANNED',
          initialBudget: null,
          revisedBudget: null,
          engagedAmount: 0,
          actualCost: 0,
          progressPercent: 0,
          variance: null,
          variancePercent: null,
          openAlert: null
        })
      ],
      currency: 'XOF'
    });
    mountTableau();

    expect(await screen.findByText('Extension villa — Bingerville', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Sans budget')).toBeInTheDocument();
  });

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    getSitesDashboard.mockRejectedValue(new Error('panne'));
    mountTableau();

    expect(
      await screen.findByText('Impossible de charger le tableau de bord des chantiers.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});

describe('Tableau de bord — code couleur sur l’écart', () => {
  it('affiche « Dépassement » quand l’écart fourni est négatif', async () => {
    getSitesDashboard.mockResolvedValue({
      rows: [
        ligne({
          siteId: 'chantier-sans-bien',
          siteLabel: 'Terrain loué — Riviera',
          variance: -500_000,
          variancePercent: -14
        })
      ],
      currency: 'XOF'
    });
    mountTableau();

    expect(await screen.findByText('Dépassement', {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('affiche « Dans le budget » quand l’écart fourni est positif', async () => {
    getSitesDashboard.mockResolvedValue({ rows: [ligne({ variance: 5_100_000 })], currency: 'XOF' });
    mountTableau();

    expect(await screen.findByText('Dans le budget', {}, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('Tableau de bord — alertes', () => {
  it('signale une alerte ouverte, distincte de l’écart', async () => {
    getSitesDashboard.mockResolvedValue({
      // Écart positif (dans le budget) ET alerte ouverte en même temps : les
      // deux sont des informations distinctes (seuil franchi n'est pas
      // synonyme de dépassement, voir l'en-tête du composant).
      rows: [ligne({ variance: 5_100_000, openAlert: alerte() })],
      currency: 'XOF'
    });
    mountTableau();

    await screen.findByText('Villa duplex — Angré Centre', {}, { timeout: 8000 });
    expect(within(ligneDuChantier('Villa duplex — Angré Centre')).getByText('Alerte')).toBeInTheDocument();
    expect(within(ligneDuChantier('Villa duplex — Angré Centre')).getByText('Dans le budget')).toBeInTheDocument();
  });

  it('n’affiche aucune alerte quand la ligne n’en porte pas', async () => {
    getSitesDashboard.mockResolvedValue({ rows: [ligne({ openAlert: null })], currency: 'XOF' });
    mountTableau();

    await screen.findByText('Villa duplex — Angré Centre', {}, { timeout: 8000 });
    expect(within(ligneDuChantier('Villa duplex — Angré Centre')).queryByText('Alerte')).not.toBeInTheDocument();
  });

  it('acquitte une alerte depuis le tableau de bord', async () => {
    getSitesDashboard.mockResolvedValue({ rows: [ligne({ openAlert: alerte() })], currency: 'XOF' });
    acknowledgeBudgetAlert.mockResolvedValue(alerte({ acknowledgedAt: '2026-09-19T00:00:00.000Z' }));
    const user = userEvent.setup({ delay: null });
    mountTableau();

    await screen.findByRole('button', { name: "Acquitter l'alerte" }, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: "Acquitter l'alerte" }));

    await waitFor(() => expect(acknowledgeBudgetAlert).toHaveBeenCalledWith('agence-1', 'alerte-1'));
  });
});

describe('Tableau de bord — filtres et navigation', () => {
  it('filtre par statut en envoyant le code, jamais un libellé traduit', async () => {
    getSitesDashboard.mockResolvedValue({ rows: [ligne()], currency: 'XOF' });
    mountTableau();

    await screen.findByText('Villa duplex — Angré Centre', {}, { timeout: 8000 });

    const combobox = await screen.findByRole('combobox', { name: 'Statut' }, { timeout: 8000 });
    fireEvent.mouseDown(combobox);
    fireEvent.click(await optionParLibelle('En cours'));

    await waitFor(() =>
      expect(getSitesDashboard).toHaveBeenLastCalledWith('agence-1', expect.objectContaining({ status: 'IN_PROGRESS' }))
    );
  });

  it('filtre les chantiers en dépassement avec un booléen, porté par l’URL', async () => {
    getSitesDashboard.mockResolvedValue({ rows: [ligne()], currency: 'XOF' });
    const user = userEvent.setup({ delay: null });
    mountTableau();

    await screen.findByText('Villa duplex — Angré Centre', {}, { timeout: 8000 });
    await user.click(screen.getByRole('checkbox', { name: /dépassement/i }));

    await waitFor(() =>
      expect(getSitesDashboard).toHaveBeenLastCalledWith('agence-1', expect.objectContaining({ onlyOverBudget: true }))
    );
    // Le booléen de la barre s'écrit « 1 » dans l'URL ; le service reçoit bien `true`.
    expect(screen.getByTestId('adresse')).toHaveTextContent('onlyOverBudget=1');
  });

  it('mène vers le budget du chantier, à son chemin exact', async () => {
    getSitesDashboard.mockResolvedValue({ rows: [ligne()], currency: 'XOF' });
    const user = userEvent.setup({ delay: null });
    mountTableau();

    await user.click(await screen.findByRole('button', { name: 'Voir le budget' }, { timeout: 8000 }));

    expect(screen.getByTestId('adresse')).toHaveTextContent('/tenant/agence-1/finance/chantiers/chantier-1/budget');
    expect(await screen.findByText('budget du chantier')).toBeInTheDocument();
  });
});

describe('Tableau de bord — recherche multicritères', () => {
  const T = { timeout: 8000 };
  const lignes = () => screen.getAllByRole('row').slice(1);

  beforeEach(() => {
    getSitesDashboard.mockResolvedValue({
      rows: [
        ligne(),
        ligne({
          siteId: 'chantier-2',
          siteLabel: 'Résidence Palmeraie',
          zone: 'Marcory',
          variance: -500_000,
          variancePercent: -14
        }),
        ligne({ siteId: 'chantier-3', siteLabel: 'Terrain loué — Riviera', zone: null, variance: null })
      ],
      currency: 'XOF'
    });
  });

  it('cherche dans le chantier et la zone, en local, et garde le terme dans l’URL', async () => {
    const user = userEvent.setup({ delay: null });
    mountTableau();

    await screen.findByText('Résidence Palmeraie', {}, T);
    expect(lignes()).toHaveLength(3);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'marcory');

    await waitFor(() => expect(lignes()).toHaveLength(1), T);
    expect(screen.getByText('Résidence Palmeraie')).toBeInTheDocument();
    expect(screen.getByTestId('adresse')).toHaveTextContent('q=marcory');
    // Le champ libre ne part pas au serveur : une seule requête, sans critère.
    expect(getSitesDashboard).toHaveBeenCalledTimes(1);
    expect(getSitesDashboard).toHaveBeenCalledWith('agence-1', { status: undefined, onlyOverBudget: false });
  }, 30000);

  it('envoie le statut et le dépassement de l’URL au serveur, sous leurs clés d’origine', async () => {
    mountTableau('/tenant/agence-1/finance/tableau-de-bord-chantiers?status=PLANNED&onlyOverBudget=1');

    await screen.findByText('Résidence Palmeraie', {}, T);
    expect(getSitesDashboard).toHaveBeenCalledWith('agence-1', { status: 'PLANNED', onlyOverBudget: true });
  });

  it('filtre l’écart minimum et maximum en local, depuis l’URL', async () => {
    mountTableau('/tenant/agence-1/finance/tableau-de-bord-chantiers?ecartMax=0');

    expect(await screen.findByText('Résidence Palmeraie', {}, T)).toBeInTheDocument();
    // Un chantier sans budget (écart nul) n'a pas d'écart à comparer : il sort.
    expect(lignes()).toHaveLength(1);
    expect(screen.queryByText('Villa duplex — Angré Centre')).not.toBeInTheDocument();
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup({ delay: null });
    mountTableau('/tenant/agence-1/finance/tableau-de-bord-chantiers?q=zzz');

    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', {}, T)).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);

    expect(await screen.findByText('Résidence Palmeraie', {}, T)).toBeInTheDocument();
    expect(lignes()).toHaveLength(3);
    expect(screen.getByTestId('adresse').textContent).not.toContain('q=');
  });
});

describe('Vocabulaire (P-1 du PRD)', () => {
  it('n’affiche jamais « débit » ni « crédit »', async () => {
    getSitesDashboard.mockResolvedValue({ rows: [ligne({ openAlert: alerte() })], currency: 'XOF' });
    const { container } = mountTableau();

    await screen.findByText('Villa duplex — Angré Centre', {}, { timeout: 8000 });
    expect(normaliser(container.textContent ?? '')).not.toMatch(/\bdebit\b/);
    expect(normaliser(container.textContent ?? '')).not.toMatch(/\bcredit\b/);
  });
});
