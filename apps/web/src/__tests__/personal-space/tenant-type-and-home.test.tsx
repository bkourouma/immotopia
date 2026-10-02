import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AuthContext from '../../context/AuthContext';
import type { AuthContextType } from '../../types/auth-types';
import { Dashboard } from '../../pages/Dashboard';
import { rememberTenantType, resetTenantTypeCache, useTenantType } from '../../hooks/useTenantType';

/**
 * Type de l'espace (décide de la navigation d'un particulier) et accueil d'un
 * espace personnel : la valeur nette du patrimoine, pas des indicateurs
 * d'agence vides.
 */

const getTenantIdentity = vi.fn();
vi.mock('../../services/personal-space-service', () => ({
  getTenantIdentity: (...a: unknown[]) => getTenantIdentity(...a)
}));

const getTenantDashboard = vi.fn();
vi.mock('../../services/dashboard-service', () => ({
  getTenantDashboard: (...a: unknown[]) => getTenantDashboard(...a)
}));

const TENANT = 'espace-1';

beforeEach(() => {
  vi.clearAllMocks();
  resetTenantTypeCache();
  window.localStorage.removeItem(`immotopia.tenant-type:${TENANT}`);
});

describe('useTenantType', () => {
  it('lit le type renvoyé par le serveur puis le mémorise', async () => {
    getTenantIdentity.mockResolvedValue({ type: 'PARTICULIER', contactPhone: null });
    const { result, rerender } = renderHook(() => useTenantType(TENANT));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('PARTICULIER'));
    rerender();
    expect(getTenantIdentity).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(`immotopia.tenant-type:${TENANT}`)).toBe('PARTICULIER');
  });

  it('n’appelle pas le serveur quand le type est déjà porté, mémorisé, ou désactivé', () => {
    const declared = renderHook(() => useTenantType(TENANT, true, 'PARTICULIER'));
    expect(declared.result.current).toBe('PARTICULIER');

    rememberTenantType(TENANT, 'AGENCY');
    const cached = renderHook(() => useTenantType(TENANT));
    expect(cached.result.current).toBe('AGENCY');

    const disabled = renderHook(() => useTenantType(TENANT, false));
    expect(disabled.result.current).toBeNull();
    expect(getTenantIdentity).not.toHaveBeenCalled();
  });

  it('vaut AGENCY à l’affichage après un échec réseau, sans le mémoriser', async () => {
    getTenantIdentity.mockRejectedValue(new Error('réseau'));
    const { result } = renderHook(() => useTenantType(TENANT));
    await waitFor(() => expect(result.current).toBe('AGENCY'));
    expect(window.localStorage.getItem(`immotopia.tenant-type:${TENANT}`)).toBeNull();
  });
});

describe('Accueil d’un espace personnel', () => {
  const Where: React.FC = () => <div data-testid="lieu">{useLocation().pathname}</div>;

  function monter(type?: 'PARTICULIER') {
    const auth = {
      user: { id: 'u1', email: 'a@b.c', fullName: 'Awa Koné', globalRole: 'USER' },
      isAuthenticated: true,
      isLoading: false,
      tenantMembership: {
        id: 'm1',
        tenantId: TENANT,
        tenant: { id: TENANT, name: 'Espace', slug: 'e', ...(type ? { type } : {}) },
        status: 'ACTIVE'
      },
      tenantClient: null,
      isLoadingMembership: false
    } as unknown as AuthContextType;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <Routes>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="*" element={<Where />} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    );
  }

  it('redirige vers la valeur nette du patrimoine, sans appeler le tableau de bord d’agence', async () => {
    monter('PARTICULIER');
    await waitFor(() =>
      expect(screen.getByTestId('lieu')).toHaveTextContent(`/tenant/${TENANT}/patrimoine/valeur-nette`)
    );
    expect(getTenantDashboard).not.toHaveBeenCalled();
  });

  it('redirige aussi quand le type vient de la fiche de l’espace', async () => {
    getTenantIdentity.mockResolvedValue({ type: 'PARTICULIER', contactPhone: null });
    getTenantDashboard.mockReturnValue(new Promise(() => undefined));
    monter();
    await waitFor(() =>
      expect(screen.getByTestId('lieu')).toHaveTextContent(`/tenant/${TENANT}/patrimoine/valeur-nette`)
    );
  });
});
