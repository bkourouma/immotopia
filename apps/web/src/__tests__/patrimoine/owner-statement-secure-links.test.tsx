import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { OwnerStatementSecureLinks } from '../../components/patrimoine/OwnerStatementSecureLinks';
import {
  createOwnerStatementSecureLink,
  listOwnerStatementSecureLinks,
  revokeOwnerStatementSecureLink,
  sendOwnerMonthlyReport
} from '../../services/patrimoine-service';

/** `vi.mock` couvre chaque export du service utilisé par la section. */
vi.mock('../../services/patrimoine-service', () => ({
  createOwnerStatementSecureLink: vi.fn(),
  listOwnerStatementSecureLinks: vi.fn(),
  revokeOwnerStatementSecureLink: vi.fn(),
  sendOwnerMonthlyReport: vi.fn()
}));

const mockCreate = createOwnerStatementSecureLink as unknown as ReturnType<typeof vi.fn>;
const mockList = listOwnerStatementSecureLinks as unknown as ReturnType<typeof vi.fn>;
const mockRevoke = revokeOwnerStatementSecureLink as unknown as ReturnType<typeof vi.fn>;
const mockSend = sendOwnerMonthlyReport as unknown as ReturnType<typeof vi.fn>;

const link = {
  id: 'link-1',
  scope: 'OWNER_MONTHLY_REPORT' as const,
  createdAt: '2026-09-01T10:00:00.000Z',
  expiresAt: '2026-10-01T10:00:00.000Z',
  revokedAt: null,
  createdByUserId: 'user-1',
  viewCount: 7,
  lastViewedAt: '2026-09-05T08:00:00.000Z',
  status: 'ACTIVE' as const
};

function renderSection() {
  return render(
    <AntApp>
      <OwnerStatementSecureLinks tenantId="agence-1" statementId="rel-1" />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([link]);
});

describe('OwnerStatementSecureLinks', () => {
  it('lists the active links with their view count', async () => {
    renderSection();
    expect(await screen.findByText('7')).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledWith('agence-1', 'rel-1');
  });

  it('shows an empty state when there is no active link', async () => {
    mockList.mockResolvedValue([]);
    renderSection();
    expect(await screen.findByText('Aucun lien actif.')).toBeInTheDocument();
  });

  it('shows an error when the list fails', async () => {
    mockList.mockRejectedValue(new Error('boom'));
    renderSection();
    expect(await screen.findByText('Erreur de chargement des liens sécurisés')).toBeInTheDocument();
  });

  it.each([
    [{ sent: true, channel: 'WHATSAPP' }, 'Rapport envoyé par WhatsApp.'],
    [{ sent: true, channel: 'EMAIL' }, 'Rapport envoyé par e-mail.'],
    [
      { sent: false, channel: null, reason: 'NO_ELIGIBLE_CHANNEL' },
      'Aucun canal éligible : consentement ou coordonnées manquants.'
    ],
    [
      { sent: false, channel: null, reason: 'EVENT_DISABLED' },
      "Cet envoi est désactivé dans la configuration de l'agence."
    ],
    [
      { sent: false, channel: null, reason: 'SEND_FAILED' },
      "L'envoi a échoué : réessayez plus tard ou vérifiez la configuration des fournisseurs."
    ]
  ])('reports the send outcome %o', async (result, expected) => {
    mockSend.mockResolvedValueOnce(result);
    renderSection();
    await screen.findByText('7');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer le rapport du mois' }));
    expect(await screen.findByText(expected, { exact: false })).toBeInTheDocument();
    expect(mockSend).toHaveBeenCalledWith('agence-1', 'rel-1');
    // La liste est rechargée après l'envoi (un envoi réussi crée un lien actif).
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it('creates a link, copies its url to the clipboard and reloads the list', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mockCreate.mockResolvedValueOnce({
      id: 'link-2',
      url: 'https://app.test/rapport-proprietaire#jeton-secret',
      expiresAt: '2026-10-01T10:00:00.000Z'
    });
    renderSection();
    await screen.findByText('7');
    await userEvent.click(screen.getByRole('button', { name: 'Copier le lien sécurisé' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://app.test/rapport-proprietaire#jeton-secret'));
    expect(await screen.findByText('Lien sécurisé copié dans le presse-papiers.')).toBeInTheDocument();
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    expect(document.body.textContent).not.toContain('jeton-secret');
  });

  it('revokes a link after confirmation then reloads the list', async () => {
    mockRevoke.mockResolvedValueOnce(undefined);
    renderSection();
    await screen.findByText('7');
    await userEvent.click(screen.getByRole('button', { name: 'Révoquer' }));
    const confirm = await screen.findByText('Révoquer ce lien ?');
    expect(mockRevoke).not.toHaveBeenCalled();
    const popover = confirm.closest('.ant-popover') as HTMLElement;
    await userEvent.click(within(popover).getByRole('button', { name: 'Révoquer' }));

    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith('agence-1', 'rel-1', 'link-1'));
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });
});
