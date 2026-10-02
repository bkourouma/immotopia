import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { InstallmentPaymentLinkButton } from '../../components/rental/InstallmentPaymentLinkButton';
import { InstallmentPaymentLinksPanel } from '../../components/rental/InstallmentPaymentLinksPanel';
import {
  createInstallmentPaymentLinkToCopy,
  listInstallmentPaymentLinks,
  revokeInstallmentPaymentLink,
  sendInstallmentPaymentLink
} from '../../services/installment-payment-link-service';

/** `vi.mock` couvre chaque export du service utilisé par les composants. */
vi.mock('../../services/installment-payment-link-service', () => ({
  createInstallmentPaymentLinkToCopy: vi.fn(),
  listInstallmentPaymentLinks: vi.fn(),
  revokeInstallmentPaymentLink: vi.fn(),
  sendInstallmentPaymentLink: vi.fn()
}));

const mockCopy = createInstallmentPaymentLinkToCopy as unknown as ReturnType<typeof vi.fn>;
const mockList = listInstallmentPaymentLinks as unknown as ReturnType<typeof vi.fn>;
const mockRevoke = revokeInstallmentPaymentLink as unknown as ReturnType<typeof vi.fn>;
const mockSend = sendInstallmentPaymentLink as unknown as ReturnType<typeof vi.fn>;

const link = {
  id: 'link-1',
  createdAt: '2026-09-01T10:00:00.000Z',
  expiresAt: '2026-10-01T10:00:00.000Z',
  revokedAt: null,
  status: 'ACTIVE' as const,
  viewCount: 7,
  lastViewedAt: '2026-09-05T08:00:00.000Z',
  createdByUserId: 'user-1',
  payment: { status: 'PENDING' as const, amount: 150000, updatedAt: '2026-09-05T08:05:00.000Z' }
};

function renderPanel(props: Partial<React.ComponentProps<typeof InstallmentPaymentLinksPanel>> = {}) {
  return render(
    <AntApp>
      <InstallmentPaymentLinksPanel
        tenantId="agence-1"
        installmentId="ech-1"
        remaining={150000}
        status="DUE"
        {...props}
      />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([link]);
});

describe('InstallmentPaymentLinksPanel', () => {
  it('lists the links with view count and payment state, without any token', async () => {
    renderPanel();
    expect(await screen.findByText('7')).toBeInTheDocument();
    expect(screen.getByText('Paiement en cours')).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledWith('agence-1', 'ech-1');
    expect(document.body.textContent).not.toMatch(/token|jeton|#/i);
  });

  it('sends the link and shows the channel used', async () => {
    mockSend.mockResolvedValueOnce({ sent: true, channel: 'WHATSAPP', linkId: 'link-2' });
    renderPanel();
    await screen.findByText('7');
    await userEvent.click(screen.getByRole('button', { name: /Envoyer un lien de paiement/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Envoyer le lien' }));

    expect(await screen.findByText('Lien de paiement envoyé par WhatsApp.')).toBeInTheDocument();
    expect(mockSend).toHaveBeenCalledWith('agence-1', 'ech-1', 7);
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it.each([
    ['NO_ELIGIBLE_CHANNEL', 'Aucun canal éligible'],
    ['EVENT_DISABLED', "Cet envoi est désactivé dans la configuration de l'agence."],
    ['SEND_FAILED', "L'envoi a échoué"],
    ['RENTER_CONTACT_NOT_FOUND', 'Fiche du locataire introuvable']
  ])('explains why nothing was sent (%s)', async (reason, expected) => {
    mockSend.mockResolvedValueOnce({ sent: false, reason });
    renderPanel();
    await screen.findByText('7');
    await userEvent.click(screen.getByRole('button', { name: /Envoyer un lien de paiement/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Envoyer le lien' }));

    expect(await screen.findByText(expected, { exact: false })).toBeInTheDocument();
    // Rien n'est parti : la liste n'est pas rechargée.
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('creates a link to copy, shows the url once, then never again', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mockCopy.mockResolvedValueOnce({
      linkId: 'link-3',
      url: 'https://app.test/payer#jeton-secret',
      expiresAt: '2026-10-08T10:00:00.000Z',
      amountDue: 150000,
      currency: 'FCFA'
    });
    renderPanel();
    await screen.findByText('7');
    await userEvent.click(screen.getByRole('button', { name: /Envoyer un lien de paiement/ }));
    await userEvent.click(await screen.findByRole('radio', { name: 'Copier le lien' }));
    await userEvent.click(screen.getByRole('button', { name: 'Créer le lien' }));

    const input = (await screen.findByDisplayValue('https://app.test/payer#jeton-secret')) as HTMLInputElement;
    expect(input.value).toBe('https://app.test/payer#jeton-secret');
    await userEvent.click(screen.getByRole('button', { name: 'Copier' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://app.test/payer#jeton-secret'));
    expect(mockCopy).toHaveBeenCalledWith('agence-1', 'ech-1', 7);
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => {
      const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
      expect(inputs.some(i => i.value.includes('jeton-secret'))).toBe(false);
    });

    // Rouvert : le formulaire repart de zéro, l'URL n'est pas relue.
    await userEvent.click(screen.getByRole('button', { name: /Envoyer un lien de paiement/ }));
    await screen.findByRole('button', { name: 'Envoyer le lien' });
    expect(document.body.textContent).not.toContain('jeton-secret');
  });

  it('revokes a link after confirmation then reloads the list', async () => {
    mockRevoke.mockResolvedValueOnce(undefined);
    renderPanel();
    await screen.findByText('7');
    await userEvent.click(screen.getByRole('button', { name: 'Révoquer' }));
    const confirm = await screen.findByText('Révoquer ce lien ?');
    expect(mockRevoke).not.toHaveBeenCalled();
    const popover = confirm.closest('.ant-popover') as HTMLElement;
    await userEvent.click(within(popover).getByRole('button', { name: 'Révoquer' }));

    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith('agence-1', 'ech-1', 'link-1'));
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it('hides creation and revocation without the create permission', async () => {
    renderPanel({ canCreate: false });
    await screen.findByText('7');
    expect(screen.queryByRole('button', { name: /Envoyer un lien de paiement/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Révoquer' })).toBeNull();
  });

  it('renders nothing and loads nothing without the view permission', () => {
    renderPanel({ canView: false });
    expect(screen.queryByText('Lien de paiement Mobile Money')).toBeNull();
    expect(mockList).not.toHaveBeenCalled();
  });

  it('offers no creation on a settled installment', async () => {
    renderPanel({ remaining: 0, status: 'PAID' });
    await screen.findByText('7');
    expect(screen.queryByRole('button', { name: /Envoyer un lien de paiement/ })).toBeNull();
  });
});

describe('InstallmentPaymentLinkButton', () => {
  it.each([
    [0, 'PAID'],
    [100, 'CANCELED']
  ])('is hidden when remaining=%s and status=%s', (remaining, status) => {
    render(
      <AntApp>
        <InstallmentPaymentLinkButton tenantId="a" installmentId="e" remaining={remaining} status={status} />
      </AntApp>
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
