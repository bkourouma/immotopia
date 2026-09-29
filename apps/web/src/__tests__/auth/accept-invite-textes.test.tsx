import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AcceptInvitePage } from '../../pages/auth/AcceptInvitePage';

/**
 * Page `/auth/accept-invite` — orthographe des libellés.
 *
 * La recette navigateur du 29 septembre 2026 a relevé des textes français sans
 * accent (« Creez votre mot de passe… equipe », « Retour a la connexion »,
 * « Minimum 8 caracteres »…). Le texte français est la clé de traduction : une
 * faute d'accent affichait aussi une clé sans traduction. Ce fichier ne touche
 * PAS au comportement d'acceptation, couvert par `accept-invite.test.tsx`.
 */

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

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
  mockUseAuth.mockReset();
});

describe('<AcceptInvitePage> — libellés accentués', () => {
  it('nouveau compte : consigne, lien de retour et règles du mot de passe', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });
    const user = userEvent.setup();

    renderPage();

    expect(screen.getByText('Créez votre mot de passe pour rejoindre votre équipe.')).toBeInTheDocument();
    expect(screen.getByText('Retour à la connexion')).toBeInTheDocument();

    // Un mot de passe trop court et sans caractère spécial déclenche les deux règles.
    await user.type(screen.getByLabelText('Mot de passe'), 'Ab1');
    await user.click(screen.getByRole('button', { name: "Accepter l'invitation" }));
    expect(await screen.findByText('Minimum 8 caractères.')).toBeInTheDocument();
    expect(screen.getByText('Ajoutez au moins un caractère spécial.')).toBeInTheDocument();
  });

  it('compte déjà connecté : consigne accentuée', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });

    renderPage();

    expect(screen.getByText('Vous êtes connecté : confirmez pour rejoindre cette équipe.')).toBeInTheDocument();
  });
});
