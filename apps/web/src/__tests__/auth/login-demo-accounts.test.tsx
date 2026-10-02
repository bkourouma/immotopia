import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Écran de connexion : le menu de comptes de test n'existe que si le build
 * porte `VITE_SHOW_DEMO_ACCOUNTS=true` (ou en mode DEV de Vite). Le flag est
 * lu à l'import du module : chaque test réimporte `Login` après avoir posé
 * l'environnement.
 */

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ login: vi.fn(), error: null, clearError: vi.fn(), isLoading: false })
}));

async function renderLogin(): Promise<void> {
  vi.resetModules();
  const { Login } = await import('../../pages/Login');
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

describe('Login — comptes de démonstration', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('affiche le menu quand VITE_SHOW_DEMO_ACCOUNTS vaut true, et il remplit le formulaire', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_SHOW_DEMO_ACCOUNTS', 'true');
    await renderLogin();

    const select = await screen.findByTestId('dev-accounts-select');
    fireEvent.mouseDown(within(select).getByRole('combobox'));
    fireEvent.click(await screen.findByText('Admin Test Syndic'));

    await waitFor(() => {
      expect(screen.getByLabelText('Adresse email')).toHaveValue('syndic@packs.immotopia.test');
    });
    expect(screen.getByPlaceholderText('••••••••')).toHaveValue('PackTest@2026');
  });

  it('n’affiche aucun menu sans le flag, hors mode DEV', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_SHOW_DEMO_ACCOUNTS', 'false');
    await renderLogin();

    expect(await screen.findByLabelText('Adresse email')).toBeInTheDocument();
    expect(screen.queryByTestId('dev-accounts-select')).not.toBeInTheDocument();
    expect(screen.queryByText('Choisir un compte de test')).not.toBeInTheDocument();
  });
});
