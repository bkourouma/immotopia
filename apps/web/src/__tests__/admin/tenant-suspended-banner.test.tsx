import React from 'react';
import { describe, it, expect } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import AuthContext from '../../context/AuthContext';
import type { AuthContextType } from '../../types/auth-types';
import { TenantSuspendedBanner } from '../../components/TenantSuspendedBanner';
import { TENANT_SUSPENDED_EVENT } from '../../utils/tenant-events';

/**
 * Lot G5 — bandeau d'agence suspendue.
 *
 * `utils/api-client.ts` (agent du lot F) émet `TENANT_SUSPENDED_EVENT` sur
 * `window` quand l'API répond 403 `{ code: 'TENANT_SUSPENDED' }`. Ce test ne
 * mocke pas l'intercepteur : il déclenche l'évènement directement, comme le
 * ferait une requête refusée.
 */

function makeAuth(over: Partial<AuthContextType>): AuthContextType {
  return {
    user: {
      id: 'user-1',
      email: 'test@example.com',
      fullName: 'Alex Martin',
      avatarUrl: null,
      globalRole: 'USER',
      emailVerified: true,
      preferredLanguage: null,
      isActive: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    },
    isAuthenticated: true,
    isLoading: false,
    error: null,
    tenantMembership: null,
    tenantClient: null,
    isLoadingMembership: false,
    login: async () => undefined,
    logout: async () => undefined,
    register: async () => undefined,
    refreshToken: async () => undefined,
    clearError: () => undefined,
    ...over
  } as AuthContextType;
}

function mount(auth: AuthContextType) {
  return render(
    <AuthContext.Provider value={auth}>
      <TenantSuspendedBanner />
    </AuthContext.Provider>
  );
}

describe('TenantSuspendedBanner', () => {
  it('reste muet tant qu’aucun évènement n’est reçu', () => {
    mount(makeAuth({}));
    expect(screen.queryByText(/Cette agence est suspendue/)).not.toBeInTheDocument();
  });

  it('affiche le bandeau quand l’évènement TENANT_SUSPENDED est reçu', () => {
    mount(makeAuth({}));

    act(() => {
      window.dispatchEvent(new CustomEvent(TENANT_SUSPENDED_EVENT, { detail: { tenantId: 'tenant-1' } }));
    });

    expect(screen.getByText(/Cette agence est suspendue/)).toBeInTheDocument();
  });

  it('se masque quand on ferme le bandeau', () => {
    mount(makeAuth({}));

    act(() => {
      window.dispatchEvent(new CustomEvent(TENANT_SUSPENDED_EVENT, { detail: { tenantId: 'tenant-1' } }));
    });
    const bandeau = screen.getByText(/Cette agence est suspendue/);
    const boutonFermer = bandeau.closest('.ant-alert')!.querySelector('.ant-alert-close-icon') as HTMLElement;
    fireEvent.click(boutonFermer);

    expect(screen.queryByText(/Cette agence est suspendue/)).not.toBeInTheDocument();
  });

  it('ne s’affiche jamais pour le super-administrateur', () => {
    const superAdmin = makeAuth({ user: { ...makeAuth({}).user!, globalRole: 'SUPER_ADMIN' } });
    mount(superAdmin);

    act(() => {
      window.dispatchEvent(new CustomEvent(TENANT_SUSPENDED_EVENT, { detail: { tenantId: 'tenant-1' } }));
    });

    expect(screen.queryByText(/Cette agence est suspendue/)).not.toBeInTheDocument();
  });
});
