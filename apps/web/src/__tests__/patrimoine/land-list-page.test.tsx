import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LandRegularizationListPage } from '../../pages/patrimoine/land/LandRegularizationListPage';
import { resume } from './land-fixtures';

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

function monter(url = '/tenant/agence-1/patrimoine/land') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
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

  it('pré-filtre par bien avec ?propertyId=, affiche le filtre actif et permet de l’effacer', async () => {
    const user = userEvent.setup();
    monter('/tenant/agence-1/patrimoine/land?propertyId=bien-1');

    await screen.findByText('Terrain de Bingerville');
    expect(listLandRegularizations).toHaveBeenCalledWith('agence-1', { status: undefined, propertyId: 'bien-1' });
    expect(screen.getByText('Bien : TER-001')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Effacer ce filtre' }));
    await waitFor(() =>
      expect(listLandRegularizations).toHaveBeenLastCalledWith('agence-1', { status: undefined, propertyId: undefined })
    );
    expect(screen.queryByText('Bien : TER-001')).toBeNull();
  });

  it('filtre sans résultat : libellé générique « Filtré sur un bien »', async () => {
    listLandRegularizations.mockResolvedValue([]);
    monter('/tenant/agence-1/patrimoine/land?propertyId=bien-1');

    expect(await screen.findByText('Filtré sur un bien')).toBeInTheDocument();
  });

  it('filtre par statut côté serveur', async () => {
    monter('/tenant/agence-1/patrimoine/land?status=TERMINEE');

    await screen.findByText('Terrain de Bingerville');
    expect(listLandRegularizations).toHaveBeenCalledWith('agence-1', { status: 'TERMINEE', propertyId: undefined });
  });

  it('ignore un ?status= invalide : rien n’est envoyé à l’API', async () => {
    monter('/tenant/agence-1/patrimoine/land?status=N_IMPORTE_QUOI');

    await screen.findByText('Terrain de Bingerville');
    expect(listLandRegularizations).toHaveBeenCalledWith('agence-1', { status: undefined, propertyId: undefined });
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
