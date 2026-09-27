import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicsList } from '../../pages/syndics/SyndicsList';
import apiClient from '../../utils/api-client';

/**
 * Lot S1 (besoin 7) : le formulaire de création d'une copropriété propose la
 * sélection de l'agence mandante (« Aucune » détache — identité de
 * l'agence). Seul `apiClient` est simulé.
 */

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

const mockApiClient = apiClient as any;

const authValue: AuthContextType = {
  user: {
    id: 'user-1',
    email: 'test@example.com',
    fullName: 'Test User',
    avatarUrl: null,
    globalRole: 'USER',
    emailVerified: true,
    preferredLanguage: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  isAuthenticated: true,
  isLoading: false,
  error: null,
  tenantMembership: {
    id: 'membership-1',
    tenantId: 'tenant-1',
    tenant: { id: 'tenant-1', name: 'Tenant Demo', slug: 'tenant-demo' },
    status: 'ACTIVE'
  },
  tenantClient: null,
  isLoadingMembership: false,
  login: async () => undefined,
  logout: async () => undefined,
  register: async () => undefined,
  refreshToken: async () => undefined,
  clearError: vi.fn(),
  refreshMembership: async () => undefined,
  availableTenants: [],
  activeTenantId: null,
  switchTenant: () => undefined
};

function renderPage() {
  return render(
    <AuthContext.Provider value={authValue}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/tenant-1/syndics']}>
          <Routes>
            <Route path="/tenant/:tenantId/syndics" element={<SyndicsList />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </AuthContext.Provider>
  );
}

describe('SyndicsList — sélection du mandant à la création', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('propose les agences mandantes et envoie le choix à la création', async () => {
    const user = userEvent.setup();
    mockApiClient.get.mockImplementation((url: string) => {
      if (url === '/tenants/tenant-1/syndics') {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url === '/tenants/tenant-1/syndic-mandating-agencies') {
        return Promise.resolve({ data: { success: true, data: [{ id: 'agency-1', name: 'Agence Alpha' }] } });
      }
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });
    mockApiClient.post.mockResolvedValue({
      data: { success: true, data: { id: 'syn-new', mandatingAgencyId: 'agency-1' } }
    });

    renderPage();

    await screen.findByText('Aucune copropriété trouvée');

    await user.click(screen.getByRole('button', { name: /Nouvelle copropriété/ }));

    await user.type(await screen.findByLabelText('Nom'), 'Résidence Test');
    await user.type(screen.getByLabelText('Adresse'), 'Abidjan');

    // Sélecteur du mandant (AntD Select, recherche par libellé).
    const mandantSelect = screen.getByLabelText('Agence mandante');
    await user.click(mandantSelect);
    await user.click(await screen.findByText('Agence Alpha'));

    await user.click(screen.getByRole('button', { name: 'Créer' }));

    await waitFor(() => {
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/tenants/tenant-1/syndics',
        expect.objectContaining({ name: 'Résidence Test', address: 'Abidjan', mandatingAgencyId: 'agency-1' })
      );
    });
  });

  it('n’envoie aucun mandant quand aucun n’est sélectionné (identité de l’agence)', async () => {
    const user = userEvent.setup();
    mockApiClient.get.mockImplementation((url: string) => {
      if (url === '/tenants/tenant-1/syndics') {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url === '/tenants/tenant-1/syndic-mandating-agencies') {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });
    mockApiClient.post.mockResolvedValue({ data: { success: true, data: { id: 'syn-new' } } });

    renderPage();

    await screen.findByText('Aucune copropriété trouvée');

    await user.click(screen.getByRole('button', { name: /Nouvelle copropriété/ }));
    await user.type(await screen.findByLabelText('Nom'), 'Résidence Sans Mandant');
    await user.type(screen.getByLabelText('Adresse'), 'Abidjan');
    await user.click(screen.getByRole('button', { name: 'Créer' }));

    await waitFor(() => {
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/tenants/tenant-1/syndics',
        expect.objectContaining({ name: 'Résidence Sans Mandant' })
      );
    });
    const [, body] = mockApiClient.post.mock.calls[0];
    expect(body.mandatingAgencyId).toBeUndefined();
  });
});
