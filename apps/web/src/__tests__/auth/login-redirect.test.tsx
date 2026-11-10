import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * FRI-03 : après connexion, `?redirect=` n'est suivi que pour un chemin
 * interne ; `/\evil.com` (lu comme `//evil.com` par les navigateurs) mène au
 * tableau de bord.
 */

const navigate = vi.fn();
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ login: vi.fn().mockResolvedValue(undefined), error: null, clearError: vi.fn(), isLoading: false })
}));

import { Login } from '../../pages/Login';

async function connectWithRedirect(redirect: string): Promise<void> {
  render(
    <MemoryRouter initialEntries={[`/login?redirect=${encodeURIComponent(redirect)}`]}>
      <Login />
    </MemoryRouter>
  );
  fireEvent.change(await screen.findByLabelText('Adresse email'), { target: { value: 'agent@example.com' } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'motdepasse' } });
  fireEvent.click(screen.getByRole('button', { name: /Se connecter$/ }));
  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
}

describe('Login : cible de redirection', () => {
  beforeEach(() => navigate.mockReset());

  it.each([['/\\evil.com'], ['//evil.com'], ['/%5Cevil.com'], ['https://evil.com'], ['javascript:alert(1)']])(
    'refuse %s et ouvre le tableau de bord',
    async redirect => {
      await connectWithRedirect(redirect);
      expect(navigate).toHaveBeenCalledWith('/dashboard');
    }
  );

  it('suit un chemin interne avec sa requête et son ancre', async () => {
    await connectWithRedirect('/owner/account?tab=docs#top');
    expect(navigate).toHaveBeenCalledWith('/owner/account?tab=docs#top');
  });
});
