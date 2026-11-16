import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicMandatingAgencies } from '../../pages/syndics/SyndicMandatingAgencies';
import apiClient from '../../utils/api-client';

/** Formulaires paramétrables : « Agence mandante » (formKey syndic.agence-mandante), hook mocké. */

const modes = vi.hoisted(() => ({ current: {} as Record<string, string> }));
vi.mock('../../hooks/useFormFieldModes', () => ({
  useFormFieldModes: () => ({
    loading: false,
    mode: (key: string, fallback = 'OPTIONAL') => modes.current[key] ?? fallback,
    isVisible: (key: string) => modes.current[key] !== 'HIDDEN',
    isRequired: (key: string, fallback: boolean) => (modes.current[key] ? modes.current[key] === 'REQUIRED' : fallback)
  })
}));

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() }
}));
const mockApiClient = apiClient as any;

const authValue = {
  user: { id: 'user-1', email: 'test@example.com', fullName: 'Test User' },
  isAuthenticated: true,
  isLoading: false,
  error: null,
  tenantMembership: {
    id: 'm-1',
    tenantId: 'tenant-1',
    tenant: { id: 'tenant-1', name: 'T', slug: 't' },
    status: 'ACTIVE'
  },
  tenantClient: null,
  isLoadingMembership: false,
  activeTenantId: null,
  availableTenants: []
} as unknown as AuthContextType;

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

async function openCreateDrawer(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('Aucune agence mandante enregistrée');
  await user.click(screen.getByRole('button', { name: /Nouvelle agence mandante/ }));
  return screen.findByLabelText('Nom');
}

describe('Agence mandante : modes de champs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modes.current = {};
    mockApiClient.get.mockResolvedValue({ data: { success: true, data: [] } });
  });

  it('un champ masqué est absent du formulaire et du corps envoyé', async () => {
    modes.current = { phone: 'HIDDEN' };
    mockApiClient.post.mockResolvedValue({
      data: { success: true, data: { id: 'a-1', name: 'Agence Beta', syndicateCount: 0 } }
    });
    const user = userEvent.setup();
    renderPage();
    await user.type(await openCreateDrawer(user), 'Agence Beta');
    expect(screen.queryByLabelText('Téléphone')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(mockApiClient.post).toHaveBeenCalled());
    const body = mockApiClient.post.mock.calls[0][1];
    expect(body).not.toHaveProperty('phone');
    expect(body).toHaveProperty('rccm', null);
  });

  it('un champ obligatoire bloque l’envoi avec un message', async () => {
    modes.current = { rccm: 'REQUIRED' };
    const user = userEvent.setup();
    renderPage();
    await user.type(await openCreateDrawer(user), 'Agence Beta');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Ce champ est obligatoire')).toBeTruthy();
    expect(mockApiClient.post).not.toHaveBeenCalled();
  });
});
