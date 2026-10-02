import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Register } from '../../pages/Register';

/**
 * Lot 4E : l'inscription répond pareil que l'adresse existe ou non. L'écran
 * affiche donc toujours le même message de succès, n'a plus d'erreur
 * « adresse déjà utilisée », et remonte tel quel un refus 429 ou 503.
 */

vi.mock('../../utils/api-client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import apiClient from '../../utils/api-client';
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const NEUTRAL = 'Si cette adresse est valide, un e-mail de vérification vient de vous être envoyé.';

async function remplirEtEnvoyer() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );
  await user.type(screen.getByLabelText('Nom complet'), 'Awa Diallo');
  await user.type(screen.getByLabelText('Adresse email'), 'awa@example.com');
  await user.type(screen.getByLabelText('Mot de passe'), 'Abcdef1!');
  await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Abcdef1!');
  await user.click(screen.getByRole('button', { name: "S'inscrire" }));
}

beforeEach(() => {
  post.mockReset();
});

describe('Register', () => {
  it('affiche le message neutre après un succès et envoie seulement e-mail, mot de passe, confirmation et nom', async () => {
    post.mockResolvedValue({ data: { success: true, message: NEUTRAL } });
    await remplirEtEnvoyer();

    expect(await screen.findByText(NEUTRAL)).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/auth/register', {
      email: 'awa@example.com',
      password: 'Abcdef1!',
      // Exigée par registerSchema côté API.
      confirmPassword: 'Abcdef1!',
      fullName: 'Awa Diallo'
    });
    expect(screen.queryByText(/déjà utilisée/i)).not.toBeInTheDocument();
  });

  it('remonte le refus 429 du limiteur', async () => {
    post.mockRejectedValue({
      response: {
        status: 429,
        data: {
          code: 'SIGNUP_RATE_LIMITED',
          message: "Trop de tentatives d'inscription. Veuillez réessayer dans une heure."
        }
      }
    });
    await remplirEtEnvoyer();

    await waitFor(() =>
      expect(
        screen.getByText("Trop de tentatives d'inscription. Veuillez réessayer dans une heure.")
      ).toBeInTheDocument()
    );
    expect(screen.queryByText(NEUTRAL)).not.toBeInTheDocument();
  });

  it("remonte l'indisponibilité 503 (production sans serveur d'e-mails)", async () => {
    post.mockRejectedValue({
      response: {
        status: 503,
        data: { code: 'SIGNUP_UNAVAILABLE', message: "L'inscription est momentanément indisponible." }
      }
    });
    await remplirEtEnvoyer();

    await waitFor(() => expect(screen.getByText("L'inscription est momentanément indisponible.")).toBeInTheDocument());
  });
});
