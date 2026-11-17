import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicsList } from '../../pages/syndics/SyndicsList';

/** Formulaires paramétrables : « Créer une copropriété » (formKey syndic.copropriete), hook mocké. */

const modes = vi.hoisted(() => ({ current: {} as Record<string, string> }));
vi.mock('../../hooks/useFormFieldModes', () => ({
  useFormFieldModes: () => ({
    loading: false,
    mode: (key: string, fallback = 'OPTIONAL') => modes.current[key] ?? fallback,
    isVisible: (key: string) => modes.current[key] !== 'HIDDEN',
    isRequired: (key: string, fallback: boolean) => (modes.current[key] ? modes.current[key] === 'REQUIRED' : fallback)
  })
}));

const createSyndicate = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/syndic-service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../services/syndic-service');
  return {
    ...actual,
    listSyndicates: vi.fn().mockResolvedValue([]),
    createSyndicate: (...args: unknown[]) => createSyndicate(...args),
    deleteSyndicate: vi.fn()
  };
});
vi.mock('../../services/document-branding-service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../services/document-branding-service');
  return { ...actual, listMandatingAgencies: vi.fn().mockResolvedValue([]) };
});

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

async function openCreateModal(user: ReturnType<typeof userEvent.setup>) {
  render(
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
  await user.click(await screen.findByRole('button', { name: /Créer une copropriété/ }, { timeout: 5000 }));
  await user.type(await screen.findByLabelText('Nom'), 'Résidence Test');
  await user.type(screen.getByLabelText('Adresse'), 'Abidjan');
}

describe('Créer une copropriété : modes de champs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modes.current = {};
  });

  it('un champ masqué est absent du formulaire et du corps envoyé', async () => {
    modes.current = { registrationNo: 'HIDDEN' };
    createSyndicate.mockResolvedValue({ id: 's-1' });
    const user = userEvent.setup();
    await openCreateModal(user);
    expect(screen.queryByLabelText("N° d'immatriculation")).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(createSyndicate).toHaveBeenCalled());
    expect(createSyndicate.mock.calls[0][1]).not.toHaveProperty('registrationNo');
  });

  it('un champ obligatoire bloque l’envoi avec un message', async () => {
    modes.current = { cadastralReference: 'REQUIRED' };
    const user = userEvent.setup();
    await openCreateModal(user);
    await user.click(screen.getByRole('button', { name: 'Créer' }));

    expect(await screen.findByText('Ce champ est obligatoire')).toBeTruthy();
    expect(createSyndicate).not.toHaveBeenCalled();
  });
});
