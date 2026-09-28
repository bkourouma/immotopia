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
 * `listSyndicates` tourne désormais toutes les pages de l'API (voir
 * `syndic-list-service.test.ts`) : une agence avec plus de 12 copropriétés
 * doit rester lisible dans `<SyndicsList>`, d'où une pagination côté écran
 * (12 par page), qui se remet à la page 1 quand la recherche change. Rendu
 * avec le vrai antd (pas de mock) : le comportement dépend de `<Pagination>`
 * réel.
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

function makeSyndicates(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `syndic-${index + 1}`,
    tenantId: 'tenant-1',
    name: `Résidence ${String(index + 1).padStart(2, '0')}`,
    address: 'Abidjan',
    totalLots: 4,
    totalBuildings: 1,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
}

describe('SyndicsList — pagination écran (lot syndic-ecarts, tâche 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rend la 25e copropriété atteignable en page 3, et la recherche la retrouve depuis la page 1', async () => {
    const user = userEvent.setup();
    const syndicates = makeSyndicates(25);

    mockApiClient.get.mockImplementation((url: string, config?: { params?: { page?: number; limit?: number } }) => {
      if (url === '/tenants/tenant-1/syndics') {
        const page = config?.params?.page ?? 1;
        const limit = config?.params?.limit ?? 100;
        const start = (page - 1) * limit;
        const data = syndicates.slice(start, start + limit);
        return Promise.resolve({
          data: { success: true, data, pagination: { page, limit, total: syndicates.length, totalPages: 1 } }
        });
      }
      if (url === '/tenants/tenant-1/syndic-mandating-agencies') {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });

    renderPage();

    await screen.findByText('Résidence 01');
    expect(screen.queryByText('Résidence 25')).not.toBeInTheDocument();

    // 25 copropriétés, 12 par page : 3 pages.
    await user.click(screen.getByTitle('3'));
    expect(await screen.findByText('Résidence 25')).toBeInTheDocument();

    // La recherche filtre depuis n'importe quelle page et revient à la page 1.
    await user.type(screen.getByPlaceholderText('Rechercher par nom, adresse ou référence cadastrale'), 'Résidence 25');
    expect(await screen.findByText('Résidence 25')).toBeInTheDocument();
    expect(screen.queryByText('Résidence 01')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics', { params: { page: 1, limit: 100 } });
    });
  });
});
