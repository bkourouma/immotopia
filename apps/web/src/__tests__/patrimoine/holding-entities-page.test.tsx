import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HoldingEntitiesPage } from '../../pages/patrimoine/entities/HoldingEntitiesPage';

/**
 * `<HoldingEntitiesPage>` — liste des entités détentrices et création.
 */

const listHoldingEntities = vi.fn();
const createHoldingEntity = vi.fn();
const updateHoldingEntity = vi.fn();
const deleteHoldingEntity = vi.fn();

vi.mock('../../services/patrimoine-entities-service', () => ({
  listHoldingEntities: (...a: unknown[]) => listHoldingEntities(...a),
  createHoldingEntity: (...a: unknown[]) => createHoldingEntity(...a),
  updateHoldingEntity: (...a: unknown[]) => updateHoldingEntity(...a),
  deleteHoldingEntity: (...a: unknown[]) => deleteHoldingEntity(...a)
}));

vi.mock('../../services/crm-service', () => ({
  listContacts: vi.fn().mockResolvedValue({ contacts: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } })
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function entite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entity-1',
    name: 'SCI Les Palmiers',
    legalForm: 'SCI',
    country: 'CI',
    rccm: null,
    taxId: null,
    isActive: true,
    parentEntity: null,
    contact: null,
    propertiesCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

const T = { timeout: 8000 };

function monter(initial = '/tenant/agence-1/patrimoine/entities') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Routes>
            <Route path="/tenant/:tenantId/patrimoine/entities" element={<HoldingEntitiesPage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listHoldingEntities.mockResolvedValue([entite()]);
});

describe('<HoldingEntitiesPage> — liste', () => {
  it('affiche les entités détentrices renvoyées par le serveur', async () => {
    monter();

    expect(await screen.findByText('SCI Les Palmiers')).toBeInTheDocument();
    // Seule l'option « inclure les inactives » part à l'API ; forme juridique et pays se filtrent en local.
    expect(listHoldingEntities).toHaveBeenCalledWith('agence-1', { includeInactive: false });
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('affiche un état vide quand aucune entité n’existe', async () => {
    listHoldingEntities.mockResolvedValue([]);
    monter();

    expect(await screen.findByText('Aucune entité détentrice pour le moment.')).toBeInTheDocument();
  });
});

describe('<HoldingEntitiesPage> — recherche', () => {
  const deuxEntites = () => [
    entite(),
    entite({ id: 'entity-2', name: 'Holding Cocody', legalForm: 'HOLDING', country: 'ML', rccm: 'CI-ABJ-2020-B-1234' })
  ];

  it('filtre les cartes en local, sans accent ni casse, et sur le RCCM', async () => {
    const user = userEvent.setup();
    listHoldingEntities.mockResolvedValue(deuxEntites());
    monter();

    await screen.findByText('SCI Les Palmiers', undefined, T);
    expect(screen.getByText('Holding Cocody')).toBeInTheDocument();
    await user.type(within(screen.getByRole('search')).getByPlaceholderText(/Nom, RCCM/), 'abj-2020');

    await waitFor(() => expect(screen.queryByText('SCI Les Palmiers')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Holding Cocody')).toBeInTheDocument();
    expect(listHoldingEntities).toHaveBeenCalledTimes(1);
  });

  it('applique forme juridique et pays d’une URL partagée en local', async () => {
    listHoldingEntities.mockResolvedValue(deuxEntites());
    monter('/tenant/agence-1/patrimoine/entities?forme=HOLDING&pays=ML');

    expect(await screen.findByText('Holding Cocody', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('SCI Les Palmiers')).not.toBeInTheDocument();
  });

  it('envoie « inclure les inactives » à l’API', async () => {
    listHoldingEntities.mockResolvedValue([entite({ isActive: false })]);
    monter('/tenant/agence-1/patrimoine/entities?inactives=1');

    await waitFor(() => expect(listHoldingEntities).toHaveBeenCalledWith('agence-1', { includeInactive: true }), T);
    expect(await screen.findByText('SCI Les Palmiers', undefined, T)).toBeInTheDocument();
  });

  it('distingue « aucun résultat » de « aucune entité » et propose d’effacer les critères', async () => {
    const user = userEvent.setup();
    monter('/tenant/agence-1/patrimoine/entities?q=zzzz');

    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    expect(screen.queryByText('Aucune entité détentrice pour le moment.')).not.toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('SCI Les Palmiers', undefined, T)).toBeInTheDocument();
  });
});

describe('<HoldingEntitiesPage> — création', () => {
  it('crée une entité et rafraîchit la liste', async () => {
    const user = userEvent.setup();
    createHoldingEntity.mockResolvedValue({});
    monter();

    await screen.findByText('SCI Les Palmiers');
    await user.click(screen.getByRole('button', { name: /Nouvelle entité/ }));

    const nameInput = await screen.findByLabelText('Nom');
    await user.type(nameInput, 'SCI Test');

    await user.click(screen.getByRole('button', { name: 'Créer' }));

    await waitFor(() =>
      expect(createHoldingEntity).toHaveBeenCalledWith(
        'agence-1',
        expect.objectContaining({ name: 'SCI Test', legalForm: 'SCI', country: 'CI' })
      )
    );
  });

  it('refuse la création sans nom', async () => {
    const user = userEvent.setup();
    monter();

    await screen.findByText('SCI Les Palmiers');
    await user.click(screen.getByRole('button', { name: /Nouvelle entité/ }));
    await user.click(screen.getByRole('button', { name: 'Créer' }));

    expect(await screen.findByText("Le nom de l'entité est requis")).toBeInTheDocument();
    expect(createHoldingEntity).not.toHaveBeenCalled();
  });
});
