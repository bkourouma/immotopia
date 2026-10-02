import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Register } from '../../pages/Register';
import { register } from '../../services/auth-service';

/**
 * Inscription libre (`/register`) — recette navigateur du 29 septembre 2026.
 *
 * `POST /api/auth/register` répondait 422 « confirmPassword : Ce champ est
 * obligatoire » : le formulaire demande bien la confirmation, mais
 * `auth-service.register` ne l'envoyait pas alors que `registerSchema` (API)
 * l'exige. Personne ne pouvait donc créer de compte. Deuxième défaut, qui
 * masquait le premier : un refus du serveur ne laissait rien de visible.
 *
 * Modèle de mock : `api-client` (frontière réseau), comme
 * `accept-invite.test.tsx` — le vrai service tourne par-dessus, pour que le
 * corps vérifié ici soit celui réellement posté.
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

const MOT_DE_PASSE = 'MotDePasse#123';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Register />
    </MemoryRouter>
  );
}

async function remplirEtEnvoyer(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nom complet'), 'Jean Dupont');
  await user.type(screen.getByLabelText('Adresse email'), 'jean.dupont@example.com');
  await user.type(screen.getByLabelText('Mot de passe'), MOT_DE_PASSE);
  await user.type(screen.getByLabelText('Confirmer le mot de passe'), MOT_DE_PASSE);
  await user.click(screen.getByRole('button', { name: "S'inscrire" }));
}

beforeEach(() => {
  post.mockReset();
});

describe('auth-service.register', () => {
  it('envoie confirmPassword avec le reste, comme l’exige registerSchema', async () => {
    post.mockResolvedValue({ data: { success: true } });

    await register({
      email: 'jean.dupont@example.com',
      password: MOT_DE_PASSE,
      confirmPassword: MOT_DE_PASSE,
      fullName: 'Jean Dupont'
    });

    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/auth/register');
    expect(body).toEqual({
      email: 'jean.dupont@example.com',
      password: MOT_DE_PASSE,
      confirmPassword: MOT_DE_PASSE,
      fullName: 'Jean Dupont'
    });
  });
});

describe('<Register>', () => {
  it('poste la confirmation saisie dans le formulaire', async () => {
    post.mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();

    renderPage();
    await remplirEtEnvoyer(user);

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/auth/register');
    expect(body.confirmPassword).toBe(MOT_DE_PASSE);
    expect(body).toMatchObject({ email: 'jean.dupont@example.com', fullName: 'Jean Dupont', password: MOT_DE_PASSE });
    expect(
      await screen.findByText('Inscription réussie ! Veuillez vérifier votre email pour activer votre compte.')
    ).toBeInTheDocument();
  });

  it('affiche un refus de champ du serveur : bandeau ET message sous le champ', async () => {
    post.mockRejectedValue({
      response: {
        status: 422,
        data: {
          success: false,
          message: 'Les données fournies sont invalides.',
          errors: [{ field: 'confirmPassword', message: 'Ce champ est obligatoire' }]
        }
      }
    });
    const user = userEvent.setup();

    renderPage();
    await remplirEtEnvoyer(user);

    expect(await screen.findByText("L'inscription a été refusée : vérifiez les champs signalés.")).toBeInTheDocument();
    expect(screen.getByText('Ce champ est obligatoire')).toBeInTheDocument();
  });

  it('affiche un refus portant sur un champ que le formulaire ne montre pas', async () => {
    post.mockRejectedValue({
      response: {
        status: 422,
        data: {
          success: false,
          message: 'Les données fournies sont invalides.',
          errors: [{ field: 'role', message: 'Rôle non autorisé' }]
        }
      }
    });
    const user = userEvent.setup();

    renderPage();
    await remplirEtEnvoyer(user);

    expect(await screen.findByText('Rôle non autorisé')).toBeInTheDocument();
  });

  it('dit que l’inscription a échoué quand le serveur ne répond pas', async () => {
    post.mockRejectedValue(new Error('Network Error'));
    const user = userEvent.setup();

    renderPage();
    await remplirEtEnvoyer(user);

    expect(await screen.findByText("Une erreur est survenue lors de l'inscription.")).toBeInTheDocument();
  });
});
