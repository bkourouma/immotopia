import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';

/**
 * Notifications WhatsApp — « Tester l'envoi » et « Envoyer l'invitation groupe
 * à tous » (BUG-2026-09-29-012). Les fonctions de service existaient mais
 * aucun bouton ne les appelait.
 *
 * Seul `apiClient` est simulé : le vrai service et le vrai écran tournent
 * par-dessus.
 */

vi.mock('../../utils/api-client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import apiClient from '../../utils/api-client';
import { WhatsAppNotificationsPage } from '../../pages/communication/WhatsAppNotificationsPage';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const apiError = (status: number, message: string) => ({
  message: `Request failed with status code ${status}`,
  response: { status, data: { success: false, message } }
});

const ITEM = {
  key: 'APPOINTMENT_REMINDER',
  label: 'Rappel rendez-vous',
  description: 'Rappel de rendez-vous CRM.',
  recipientLabel: 'Contact',
  enabled: true,
  bodyOverride: null,
  contentSid: null,
  contentVariablesJson: null,
  configId: null,
  tenantId: null,
  defaultBody: 'Rappel : vous avez un rendez-vous prévu le {{appointmentDate}}.',
  createdAt: null,
  updatedAt: null
};

function renderPage() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/t1/communication/whatsapp-notifications']}>
        <Routes>
          <Route
            path="/tenant/:tenantId/communication/whatsapp-notifications"
            element={<WhatsAppNotificationsPage />}
          />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: { success: true, data: [ITEM] } });
});

describe('Tester l’envoi', () => {
  it('envoie un message d’essai au numéro saisi', async () => {
    post.mockResolvedValue({ data: { success: true, data: { messageId: 'm1' } } });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Tester l'envoi/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Numéro WhatsApp'), '+2250700000000');
    await user.type(within(dialog).getByLabelText('Message'), 'Essai de la recette');
    await user.click(within(dialog).getByRole('button', { name: "Envoyer l'essai" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/tenants/t1/whatsapp-notifications/test-send', {
        to: '+2250700000000',
        message: 'Essai de la recette'
      })
    );
    expect(await screen.findByText('Message d’essai envoyé.')).toBeInTheDocument();
  });

  it('affiche le message clair de l’API quand le fournisseur n’est pas configuré', async () => {
    post.mockRejectedValue(
      apiError(
        400,
        "L'envoi WhatsApp n'est pas configuré pour cette agence. Contactez l'administrateur de la plateforme pour l'activer."
      )
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Tester l'envoi/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Numéro WhatsApp'), '+2250700000000');
    await user.type(within(dialog).getByLabelText('Message'), 'Essai');
    await user.click(within(dialog).getByRole('button', { name: "Envoyer l'essai" }));

    expect(await screen.findByText(/n'est pas configuré pour cette agence/)).toBeInTheDocument();
    expect(screen.queryByText(/Request failed/)).not.toBeInTheDocument();
  });
});

describe('Invitation au groupe WhatsApp en masse', () => {
  it('demande confirmation avant l’envoi de masse, puis affiche le bilan', async () => {
    post.mockResolvedValue({
      data: { success: true, data: { totalEligible: 5, processed: 5, sent: 4, skipped: 1, failed: 0 } }
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Envoyer l'invitation au groupe/ }));
    // Rien n'est parti tant que la personne n'a pas confirmé.
    expect(post).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/tous les contacts/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Envoyer' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/tenants/t1/whatsapp-notifications/group-invite/send-all', {
        limit: undefined,
        force: undefined
      })
    );
    expect(await screen.findByText(/4 invitation\(s\) envoyée\(s\)/)).toBeInTheDocument();
  });

  it('annuler la confirmation n’envoie rien', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Envoyer l'invitation au groupe/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));

    expect(post).not.toHaveBeenCalled();
  });

  it('affiche le refus clair de l’API quand le fournisseur n’est pas configuré', async () => {
    post.mockRejectedValue(apiError(400, "L'envoi WhatsApp n'est pas configuré pour cette agence."));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Envoyer l'invitation au groupe/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText(/n'est pas configuré pour cette agence/)).toBeInTheDocument();
  });
});
