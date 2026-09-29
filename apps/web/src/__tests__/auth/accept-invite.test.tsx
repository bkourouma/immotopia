import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AcceptInvitePage } from '../../pages/auth/AcceptInvitePage';

/**
 * Correctif securite (invitations) — volet ecran :
 *
 * - un NOUVEAU compte voit les champs mot de passe et les remplit ;
 * - un compte DEJA connecte (meme e-mail) ne voit PAS ces champs, et
 *   n'envoie pas de mot de passe a l'acceptation ;
 * - quand l'API refuse avec `INVITATION_REQUIRES_LOGIN` (compte existant,
 *   pas de session), l'ecran propose un lien de connexion plutot qu'un
 *   simple message d'erreur.
 *
 * Modele de mock : `api-client` (frontiere reseau), comme
 * `tenant-create.test.tsx`. `useAuth` est simule directement : c'est l'etat
 * dont depend l'ecran, pas un appel reseau que ce fichier doit rejouer.
 */

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

import apiClient from '../../utils/api-client';
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const mockUseAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth()
}));

const TOKEN = '11111111-1111-1111-1111-111111111111';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/auth/accept-invite?token=${TOKEN}`]}>
      <AcceptInvitePage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  post.mockReset();
  mockUseAuth.mockReset();
});

describe('<AcceptInvitePage>', () => {
  it("nouveau compte : affiche les champs mot de passe et les envoie a l'acceptation", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });
    post.mockResolvedValue({ data: { success: true, data: { membership: {}, user: {} } } });
    const user = userEvent.setup();

    renderPage();

    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nom complet'), 'Jean Dupont');
    await user.type(screen.getByLabelText('Mot de passe'), 'MotDePasse#123');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'MotDePasse#123');
    await user.click(screen.getByRole('button', { name: "Accepter l'invitation" }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [, body] = post.mock.calls[0];
    expect(body).toMatchObject({ token: TOKEN, password: 'MotDePasse#123', fullName: 'Jean Dupont' });
  });

  it('compte deja connecte : masque les champs mot de passe et accepte sans mot de passe', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    post.mockResolvedValue({ data: { success: true, data: { membership: {}, user: {} } } });
    const user = userEvent.setup();

    renderPage();

    expect(screen.queryByLabelText('Mot de passe')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nom complet')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "Accepter l'invitation" }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [, body] = post.mock.calls[0];
    expect(body).toEqual({ token: TOKEN });
    expect(body.password).toBeUndefined();
  });

  it("compte existant sans session : propose de se connecter plutot qu'un simple message d'erreur", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });
    post.mockRejectedValue({
      response: {
        data: {
          success: false,
          code: 'INVITATION_REQUIRES_LOGIN',
          message:
            'Un compte existe déjà avec cette adresse e-mail. Connectez-vous avec ce compte pour accepter cette invitation.'
        }
      }
    });
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByLabelText('Nom complet'), 'Jean Dupont');
    await user.type(screen.getByLabelText('Mot de passe'), 'MotDePasse#123');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'MotDePasse#123');
    await user.click(screen.getByRole('button', { name: "Accepter l'invitation" }));

    expect(await screen.findByText('Connectez-vous pour accepter')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
  });
});
