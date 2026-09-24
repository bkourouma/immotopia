import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantSwitcher } from '../../components/TenantSwitcher';

/**
 * `<TenantSwitcher>` — sélecteur d'agence de l'en-tête (lot F, plan §F3).
 *
 * `useAuth` est simulé : ce composant ne teste pas `AuthContext` (couvert
 * ailleurs), seulement ce qu'il fait de `availableTenants` /
 * `activeTenantId` / `switchTenant`.
 */

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => useAuthMock()
}));

beforeEach(() => {
  useAuthMock.mockReset();
});

describe('<TenantSwitcher> — une seule agence', () => {
  it('ne rend rien', () => {
    useAuthMock.mockReturnValue({
      availableTenants: [{ id: 'agence-1', name: 'Agence Unique', slug: 'agence-unique' }],
      activeTenantId: 'agence-1',
      switchTenant: vi.fn()
    });

    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <TenantSwitcher />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('ne rend rien non plus sans aucune agence', () => {
    useAuthMock.mockReturnValue({ availableTenants: [], activeTenantId: null, switchTenant: vi.fn() });

    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <TenantSwitcher />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe('<TenantSwitcher> — plusieurs agences', () => {
  it("affiche l'agence courante et permet d'en changer, vide le cache et revient au tableau de bord", async () => {
    const switchTenant = vi.fn();
    useAuthMock.mockReturnValue({
      availableTenants: [
        { id: 'agence-1', name: 'Agence Un', slug: 'agence-un' },
        { id: 'agence-2', name: 'Agence Deux', slug: 'agence-deux' }
      ],
      activeTenantId: 'agence-1',
      switchTenant
    });

    const queryClient = new QueryClient();
    const clearSpy = vi.spyOn(queryClient, 'clear');
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/tenant/agence-1/properties']}>
          <Routes>
            <Route path="/dashboard" element={<div>Tableau de bord</div>} />
            <Route path="*" element={<TenantSwitcher />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Le nom de l'agence courante est affiché sur le déclencheur.
    expect(screen.getByText('Agence Un')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "Changer d'agence" }));
    const autreAgence = await screen.findByText('Agence Deux');
    await user.click(autreAgence);

    expect(switchTenant).toHaveBeenCalledWith('agence-2');
    expect(clearSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('Tableau de bord')).toBeInTheDocument());
  });

  it("ne fait rien en sélectionnant l'agence déjà active", async () => {
    const switchTenant = vi.fn();
    useAuthMock.mockReturnValue({
      availableTenants: [
        { id: 'agence-1', name: 'Agence Un', slug: 'agence-un' },
        { id: 'agence-2', name: 'Agence Deux', slug: 'agence-deux' }
      ],
      activeTenantId: 'agence-1',
      switchTenant
    });

    const queryClient = new QueryClient();
    const clearSpy = vi.spyOn(queryClient, 'clear');
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TenantSwitcher />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await user.click(screen.getByRole('button', { name: "Changer d'agence" }));
    const memeAgence = await screen.findAllByText('Agence Un');
    // Le déclencheur et l'entrée du menu portent tous deux le texte : on
    // clique la dernière occurrence, celle du menu.
    await user.click(memeAgence[memeAgence.length - 1]);

    expect(switchTenant).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
  });
});
