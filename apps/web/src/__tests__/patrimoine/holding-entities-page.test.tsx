import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/patrimoine/entities']}>
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
    expect(listHoldingEntities).toHaveBeenCalledWith('agence-1', { legalForm: undefined, country: undefined });
  });

  it('affiche un état vide quand aucune entité n’existe', async () => {
    listHoldingEntities.mockResolvedValue([]);
    monter();

    expect(await screen.findByText('Aucune entité détentrice pour le moment.')).toBeInTheDocument();
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
