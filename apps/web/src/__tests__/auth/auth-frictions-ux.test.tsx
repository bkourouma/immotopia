import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * Frictions du parcours d'authentification (audit UX du 21/11) : focus à
 * l'ouverture, gestionnaire de mots de passe, validation en ligne, afficher /
 * masquer le mot de passe, lien de réinitialisation sans jeton.
 */

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ login: vi.fn(), error: null, clearError: vi.fn(), isLoading: false })
}));
vi.mock('../../utils/api-client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { Login } from '../../pages/Login';
import { Register } from '../../pages/Register';
import { ResetPassword } from '../../pages/ResetPassword';

function renderAt(ui: React.ReactElement, path: string) {
  return render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

describe('Login', () => {
  it("met le focus sur l'adresse e-mail et laisse le gestionnaire de mots de passe remplir le formulaire", async () => {
    const { container } = renderAt(<Login />, '/login');

    expect(await screen.findByLabelText('Adresse email')).toHaveFocus();
    expect(container.querySelector('form')).not.toHaveAttribute('autocomplete', 'off');
    expect(screen.getByPlaceholderText('••••••••')).toHaveAttribute('autocomplete', 'current-password');
  });

  it("annonce l'invitation acceptée au retour de l'écran d'invitation", async () => {
    renderAt(<Login />, '/login?invite=accepted');

    expect(
      await screen.findByText('Invitation acceptée. Connectez-vous pour accéder à votre espace.')
    ).toBeInTheDocument();
  });
});

describe('Register', () => {
  it('met le focus sur le nom, signale un e-mail invalide dès la sortie du champ, puis bascule afficher / masquer', async () => {
    const user = userEvent.setup();
    renderAt(<Register />, '/register');

    expect(screen.getByLabelText('Nom complet')).toHaveFocus();

    await user.type(screen.getByLabelText('Adresse email'), 'pas-un-email');
    await user.tab();
    expect(await screen.findByText('Veuillez entrer une adresse email valide.')).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse email')).toHaveAttribute('aria-invalid', 'true');

    const mdp = screen.getByLabelText('Mot de passe');
    expect(mdp).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Afficher les mots de passe' }));
    expect(mdp).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Confirmer le mot de passe')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Masquer les mots de passe' })).toBeInTheDocument();
  });

  it('place le focus sur le premier champ en erreur à la soumission', async () => {
    const user = userEvent.setup();
    renderAt(<Register />, '/register');

    await user.type(screen.getByLabelText('Nom complet'), 'Awa Diallo');
    await user.click(screen.getByRole('button', { name: "S'inscrire" }));

    expect(await screen.findByText("L'adresse email est requise.")).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse email')).toHaveFocus();
  });
});

describe('ResetPassword', () => {
  it('sans jeton dans le lien, propose de demander un nouveau lien au lieu d’un formulaire inutilisable', async () => {
    renderAt(<ResetPassword />, '/reset-password');

    expect(await screen.findByText('Lien de réinitialisation incomplet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Demander un nouveau lien' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nouveau mot de passe')).not.toBeInTheDocument();
  });
});
