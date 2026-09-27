import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicMandatingAgencies } from '../../pages/syndics/SyndicMandatingAgencies';
import apiClient from '../../utils/api-client';

/**
 * Lot S1 (besoin 7) : la page « Agences mandantes ». Seul `apiClient` est
 * simulé (frontière réseau) — `<App>` d'AntD fournit le contexte de
 * `message`/`modal` qu'utilisent la page et `useConfirmAction`.
 */

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn()
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
        <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/mandants']}>
          <Routes>
            <Route path="/tenant/:tenantId/syndics/mandants" element={<SyndicMandatingAgencies />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </AuthContext.Provider>
  );
}

const AGENCY_ONE = {
  id: 'agency-1',
  name: 'Agence Alpha',
  legalName: null,
  address: null,
  phone: '+225 07 00 00 00',
  email: 'contact@alpha.ci',
  rccm: null,
  taxId: null,
  hasLogo: false,
  hasSignature: false,
  hasStamp: false,
  logoUrl: null,
  signatureUrl: null,
  stampUrl: null,
  syndicateCount: 2,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

describe('SyndicMandatingAgencies — liste et création', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('charge et affiche la liste des agences mandantes', async () => {
    mockApiClient.get.mockResolvedValue({ data: { success: true, data: [AGENCY_ONE] } });

    renderPage();

    expect(await screen.findByText('Agence Alpha')).toBeTruthy();
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndic-mandating-agencies');
    expect(screen.getByText('+225 07 00 00 00')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('affiche un état vide sans agence mandante', async () => {
    mockApiClient.get.mockResolvedValue({ data: { success: true, data: [] } });

    renderPage();

    expect(await screen.findByText('Aucune agence mandante enregistrée')).toBeTruthy();
  });

  it('crée une agence mandante puis bascule le tiroir en édition (images disponibles)', async () => {
    const user = userEvent.setup();
    mockApiClient.get.mockResolvedValue({ data: { success: true, data: [] } });
    mockApiClient.post.mockResolvedValue({
      data: { success: true, data: { ...AGENCY_ONE, id: 'agency-new', name: 'Agence Beta', syndicateCount: 0 } }
    });

    renderPage();

    await screen.findByText('Aucune agence mandante enregistrée');

    await user.click(screen.getByRole('button', { name: /Nouvelle agence mandante/ }));

    const nameInput = await screen.findByLabelText('Nom');
    await user.type(nameInput, 'Agence Beta');

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/tenants/tenant-1/syndic-mandating-agencies',
        expect.objectContaining({ name: 'Agence Beta' })
      );
    });

    // Le tiroir reste ouvert et bascule en mode édition : les blocs d'image
    // apparaissent, ce qui n'était pas le cas en mode création.
    expect(await screen.findByText('Images pour les documents')).toBeTruthy();
  });

  it("affiche le message d'erreur 409 quand le nom est déjà pris", async () => {
    const user = userEvent.setup();
    mockApiClient.get.mockResolvedValue({ data: { success: true, data: [AGENCY_ONE] } });
    mockApiClient.post.mockRejectedValue({
      response: { status: 409, data: { success: false, error: 'Une agence mandante porte déjà ce nom.' } }
    });

    renderPage();

    await screen.findByText('Agence Alpha');

    await user.click(screen.getByRole('button', { name: /Nouvelle agence mandante/ }));
    await user.type(await screen.findByLabelText('Nom'), 'Agence Alpha');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Une agence mandante porte déjà ce nom.')).toBeTruthy();
  });

  it('supprime une agence mandante sans copropriété rattachée', async () => {
    const user = userEvent.setup();
    const deletable = { ...AGENCY_ONE, id: 'agency-2', name: 'Agence Gamma', syndicateCount: 0 };
    mockApiClient.get.mockResolvedValue({ data: { success: true, data: [deletable] } });
    mockApiClient.delete.mockResolvedValue({ data: { success: true, data: { id: 'agency-2' } } });

    renderPage();

    await screen.findByText('Agence Gamma');

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => {
      expect(mockApiClient.delete).toHaveBeenCalledWith('/tenants/tenant-1/syndic-mandating-agencies/agency-2');
    });
  });
});
