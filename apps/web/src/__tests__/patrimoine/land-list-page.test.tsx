import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LandRegularizationListPage } from '../../pages/patrimoine/land/LandRegularizationListPage';
import { resume } from './land-fixtures';

const T = { timeout: 8000 };
const listLandRegularizations = vi.fn();
const listLandTracks = vi.fn();
const createLandRegularization = vi.fn();

vi.mock('../../pages/patrimoine/land/land-regularization-service', () => ({
  listLandRegularizations: (...a: unknown[]) => listLandRegularizations(...a),
  listLandTracks: (...a: unknown[]) => listLandTracks(...a),
  createLandRegularization: (...a: unknown[]) => createLandRegularization(...a)
}));
vi.mock('../../services/property-service', () => ({
  listProperties: vi.fn().mockResolvedValue({ properties: [], pagination: {} }),
  getProperty: vi
    .fn()
    .mockResolvedValue({ id: 'bien-1', title: 'Terrain de Bingerville', internalReference: 'TER-001' })
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

const AUTRE_DOSSIER = () =>
  resume({
    id: 'reg-2',
    propertyId: 'bien-2',
    status: 'TERMINEE',
    trackLabel: 'Parcours personnalisé',
    validationStatus: 'NON_APPLICABLE',
    currentStepLabel: 'Remise du titre',
    property: { id: 'bien-2', internalReference: 'TER-002', title: 'Parcelle de Yopougon' }
  });

function monter(url = '/tenant/agence-1/patrimoine/land') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Url />
          <Routes>
            <Route path="/tenant/:tenantId/patrimoine/land" element={<LandRegularizationListPage />} />
            <Route path="/tenant/:tenantId/patrimoine/land/:regularizationId" element={<div>detail-dossier</div>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listLandRegularizations.mockResolvedValue([resume()]);
  listLandTracks.mockResolvedValue([]);
});

describe('<LandRegularizationListPage>', () => {
  it('affiche la progression, les frais, la prochaine échéance et les étapes en retard', async () => {
    monter();

    expect(await screen.findByText('Terrain de Bingerville')).toBeInTheDocument();
    expect(screen.getByText('TER-001')).toBeInTheDocument();
    expect(screen.getByText('2 étape(s) sur 6')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Avancement du dossier' })).toHaveAttribute('aria-valuenow', '33');
    expect(screen.getByText(/1.250.000 XOF/)).toBeInTheDocument();
    expect(screen.getByText('En cours')).toBeInTheDocument();
    expect(screen.getByText('1', { selector: '.ant-tag' })).toBeInTheDocument();
    // Échéance à minuit UTC : affichée le jour prévu, quel que soit le fuseau.
    expect(screen.getByText('15/11/2026')).toBeInTheDocument();
  });

  it('affiche un état vide invitant à ouvrir un dossier', async () => {
    listLandRegularizations.mockResolvedValue([]);
    monter();

    expect(
      await screen.findByText("Aucun dossier de régularisation foncière n'est ouvert pour cette agence.")
    ).toBeInTheDocument();
  });

  it('affiche un état de chargement puis la liste', async () => {
    let resoudre: (valeur: unknown) => void = () => undefined;
    listLandRegularizations.mockReturnValue(new Promise(resolve => (resoudre = resolve)));
    monter();

    expect(screen.queryByText('Terrain de Bingerville')).toBeNull();
    resoudre([resume()]);
    expect(await screen.findByText('Terrain de Bingerville')).toBeInTheDocument();
  });

  it('affiche une erreur de chargement avec la possibilité de réessayer', async () => {
    listLandRegularizations.mockRejectedValue(new Error('réseau'));
    monter();

    expect(await screen.findByText('Impossible de charger les dossiers de régularisation.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument();
  });

  it('pré-filtre par bien avec ?propertyId= (lien du bien) et permet d’effacer le critère', async () => {
    const user = userEvent.setup();
    listLandRegularizations.mockResolvedValue([resume(), AUTRE_DOSSIER()]);
    monter('/tenant/agence-1/patrimoine/land?propertyId=bien-1');

    await screen.findByText('Terrain de Bingerville', undefined, T);
    // Le filtrage est local : la requête ne porte plus ni statut ni bien.
    expect(listLandRegularizations).toHaveBeenCalledWith('agence-1');
    expect(screen.queryByText('Parcelle de Yopougon')).toBeNull();
    expect(screen.getByTestId('url').textContent).toContain('propertyId=bien-1');

    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('Parcelle de Yopougon', undefined, T)).toBeInTheDocument();
    expect(screen.getByText('Terrain de Bingerville')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).not.toContain('propertyId');
  });

  it('un bien sans dossier (?propertyId=) : « aucun résultat » avec l’effacement, pas l’invite à créer', async () => {
    listLandRegularizations.mockResolvedValue([]);
    monter('/tenant/agence-1/patrimoine/land?propertyId=bien-1');

    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    expect(screen.queryByText("Aucun dossier de régularisation foncière n'est ouvert pour cette agence.")).toBeNull();
  });

  it('filtre par statut en local avec ?status=', async () => {
    listLandRegularizations.mockResolvedValue([resume(), AUTRE_DOSSIER()]);
    monter('/tenant/agence-1/patrimoine/land?status=TERMINEE');

    expect(await screen.findByText('Parcelle de Yopougon', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('Terrain de Bingerville')).toBeNull();
    expect(listLandRegularizations).toHaveBeenCalledWith('agence-1');
  });

  it('ignore un ?status= invalide : tous les dossiers restent affichés', async () => {
    listLandRegularizations.mockResolvedValue([resume(), AUTRE_DOSSIER()]);
    monter('/tenant/agence-1/patrimoine/land?status=N_IMPORTE_QUOI');

    expect(await screen.findByText('Terrain de Bingerville', undefined, T)).toBeInTheDocument();
    expect(screen.getByText('Parcelle de Yopougon')).toBeInTheDocument();
  });

  it('cherche sans casse ni accent dans le bien, la référence, la filière et l’étape', async () => {
    const user = userEvent.setup();
    listLandRegularizations.mockResolvedValue([resume(), AUTRE_DOSSIER()]);
    monter();
    await screen.findByText('Terrain de Bingerville', undefined, T);

    const champ = within(screen.getByRole('search')).getByPlaceholderText('Bien, référence, filière, étape…');
    await user.type(champ, 'YOPOUGON');
    await waitFor(() => expect(screen.queryByText('Terrain de Bingerville')).toBeNull(), T);
    expect(screen.getByText('Parcelle de Yopougon')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('q=YOPOUGON');

    await user.clear(champ);
    await user.type(champ, 'bornage');
    await waitFor(() => expect(screen.queryByText('Parcelle de Yopougon')).toBeNull(), T);
    expect(screen.getByText('Terrain de Bingerville')).toBeInTheDocument();
  });

  it('ouvre la modale de création depuis « Nouveau dossier »', async () => {
    const user = userEvent.setup();
    monter();

    await screen.findByText('Terrain de Bingerville');
    await user.click(screen.getByRole('button', { name: /Nouveau dossier/ }));

    await waitFor(() => expect(screen.getByText('Nouveau dossier de régularisation')).toBeInTheDocument());
    expect(listLandTracks).toHaveBeenCalledWith('agence-1');
  });
  it('FR-009 : une filière CI_ACD porte l’étiquette « À valider » dans la liste', async () => {
    listLandRegularizations.mockResolvedValue([
      resume({ id: 'reg-1', validationStatus: 'A_VALIDER' }),
      resume({
        id: 'reg-2',
        track: 'PERSONNALISEE',
        trackLabel: 'Parcours personnalisé',
        validationStatus: 'NON_APPLICABLE',
        property: { id: 'bien-2', internalReference: 'TER-002', title: 'Parcelle de Yopougon' }
      })
    ]);
    monter();

    await screen.findByText('Parcelle de Yopougon');
    expect(screen.getAllByText('À valider')).toHaveLength(1);
  });

  it('un 403 affiche un refus clair, sans bouton « Nouveau dossier »', async () => {
    listLandRegularizations.mockRejectedValue({ response: { status: 403, data: { message: 'Permission denied' } } });
    monter();

    expect(await screen.findByText('Accès non autorisé')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nouveau dossier/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Impossible de charger les dossiers de régularisation.')).not.toBeInTheDocument();
  });
});
