import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { ChargeCallPaymentLinkButton } from '../../components/syndics/ChargeCallPaymentLinkButton';
import { ChargeCallPaymentLinksPanel } from '../../components/syndics/ChargeCallPaymentLinksPanel';
import { ChargeCallTable } from '../../components/syndics/ChargeCallTable';
import {
  createChargeCallPaymentLink,
  listChargeCallPaymentLinks,
  revokeChargeCallPaymentLink
} from '../../services/syndic-online-payment-service';
import type { ChargeCall } from '../../types/syndic-types';

/** `vi.mock` couvre chaque export du service utilisé par les composants. */
vi.mock('../../services/syndic-online-payment-service', () => ({
  createChargeCallPaymentLink: vi.fn(),
  listChargeCallPaymentLinks: vi.fn(),
  revokeChargeCallPaymentLink: vi.fn()
}));

const mockCreate = createChargeCallPaymentLink as unknown as ReturnType<typeof vi.fn>;
const mockList = listChargeCallPaymentLinks as unknown as ReturnType<typeof vi.fn>;
const mockRevoke = revokeChargeCallPaymentLink as unknown as ReturnType<typeof vi.fn>;

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

function renderPanel(props: Partial<React.ComponentProps<typeof ChargeCallPaymentLinksPanel>> = {}) {
  return render(
    <AntApp>
      <ChargeCallPaymentLinksPanel
        tenantId="agence-1"
        syndicId="syndic-1"
        chargeId="appel-1"
        remaining={150000}
        status="PENDING"
        {...props}
      />
    </AntApp>
  );
}

async function openModal() {
  await userEvent.click(screen.getByRole('button', { name: /Payer cet appel/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([link]);
});

describe('ChargeCallPaymentLinksPanel', () => {
  it('lists the links with view count and payment state, without any token', async () => {
    renderPanel();
    expect(await screen.findByText('7')).toBeInTheDocument();
    expect(screen.getByText('Paiement en cours')).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.queryByText('Automatique')).toBeNull();
    expect(mockList).toHaveBeenCalledWith('agence-1', 'syndic-1', 'appel-1');
    expect(document.body.textContent).not.toMatch(/token|jeton|#/i);
  });

  it('flags a link created automatically by a notice or a reminder', async () => {
    mockList.mockResolvedValue([{ ...link, createdByUserId: null }]);
    renderPanel();
    expect(await screen.findByText('Automatique')).toBeInTheDocument();
  });

  it('sends the link and shows the channel used', async () => {
    mockCreate.mockResolvedValueOnce({
      sent: true,
      channel: 'WHATSAPP',
      linkId: 'link-2',
      expiresAt: '2026-10-08T10:00:00.000Z',
      amountDue: 150000,
      currency: 'XOF'
    });
    renderPanel();
    await screen.findByText('7');
    await openModal();
    await userEvent.click(await screen.findByRole('button', { name: 'Envoyer le lien' }));

    expect(await screen.findByText('Lien de paiement envoyé par WhatsApp.')).toBeInTheDocument();
    expect(mockCreate).toHaveBeenCalledWith('agence-1', 'syndic-1', 'appel-1', { delivery: 'SEND', ttlDays: 7 });
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it.each([
    ['NO_ELIGIBLE_CHANNEL', 'Aucun canal éligible'],
    ['EVENT_DISABLED', "Cet envoi est désactivé dans la configuration de l'agence."],
    ['SEND_FAILED', "L'envoi a échoué"],
    ['RECIPIENT_NOT_FOUND', 'Copropriétaire du lot introuvable']
  ])('explains why nothing was sent (%s)', async (reason, expected) => {
    mockCreate.mockResolvedValueOnce({ sent: false, reason });
    renderPanel();
    await screen.findByText('7');
    await openModal();
    await userEvent.click(await screen.findByRole('button', { name: 'Envoyer le lien' }));

    expect(await screen.findByText(expected, { exact: false })).toBeInTheDocument();
    // Rien n'est parti : la liste n'est pas rechargée.
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('creates a link to copy, shows the url once, then never again', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mockCreate.mockResolvedValueOnce({
      linkId: 'link-3',
      url: 'https://app.test/payer#jeton-secret',
      expiresAt: '2026-10-08T10:00:00.000Z',
      amountDue: 150000,
      currency: 'XOF'
    });
    renderPanel();
    await screen.findByText('7');
    await openModal();
    await userEvent.click(await screen.findByRole('radio', { name: 'Copier le lien' }));
    await userEvent.click(screen.getByRole('button', { name: 'Créer le lien' }));

    const input = (await screen.findByDisplayValue('https://app.test/payer#jeton-secret')) as HTMLInputElement;
    expect(input.value).toBe('https://app.test/payer#jeton-secret');
    expect(screen.getByText(/Montant dû/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copier' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://app.test/payer#jeton-secret'));
    expect(mockCreate).toHaveBeenCalledWith('agence-1', 'syndic-1', 'appel-1', { delivery: 'COPY', ttlDays: 7 });
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => {
      const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
      expect(inputs.some(i => i.value.includes('jeton-secret'))).toBe(false);
    });

    // Rouvert : le formulaire repart de zéro, l'URL n'est pas relue.
    await openModal();
    await screen.findByRole('button', { name: 'Envoyer le lien' });
    expect(document.body.textContent).not.toContain('jeton-secret');
  });

  it('explains that online payment is not configured for the building', async () => {
    mockCreate.mockRejectedValueOnce({
      response: { data: { success: false, message: 'texte serveur', code: 'ONLINE_PAYMENT_UNAVAILABLE' } }
    });
    renderPanel();
    await screen.findByText('7');
    await openModal();
    await userEvent.click(await screen.findByRole('button', { name: 'Envoyer le lien' }));

    expect(await screen.findByText('Paiement en ligne non configuré pour cette copropriété.')).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('explains that nothing is left to pay', async () => {
    mockCreate.mockRejectedValueOnce({
      response: { data: { success: false, message: 'texte serveur', code: 'ONLINE_PAYMENT_NOTHING_DUE' } }
    });
    renderPanel();
    await screen.findByText('7');
    await openModal();
    await userEvent.click(await screen.findByRole('button', { name: 'Envoyer le lien' }));

    expect(await screen.findByText(/il ne reste rien à payer/)).toBeInTheDocument();
  });

  it('revokes a link after confirmation then reloads the list', async () => {
    mockRevoke.mockResolvedValueOnce({ revoked: true });
    renderPanel();
    await screen.findByText('7');
    await userEvent.click(screen.getByRole('button', { name: 'Révoquer' }));
    const confirm = await screen.findByText('Révoquer ce lien ?');
    expect(mockRevoke).not.toHaveBeenCalled();
    const popover = confirm.closest('.ant-popover') as HTMLElement;
    await userEvent.click(within(popover).getByRole('button', { name: 'Révoquer' }));

    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith('agence-1', 'syndic-1', 'appel-1', 'link-1'));
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it('hides creation and revocation without the edit permission', async () => {
    renderPanel({ canCreate: false });
    await screen.findByText('7');
    expect(screen.queryByRole('button', { name: /Payer cet appel/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Révoquer' })).toBeNull();
  });

  it('renders nothing and loads nothing without the view permission', () => {
    renderPanel({ canView: false });
    expect(screen.queryByText('Actif')).toBeNull();
    expect(mockList).not.toHaveBeenCalled();
  });

  it('offers no creation on a settled call', async () => {
    renderPanel({ remaining: 0, status: 'PAID' });
    await screen.findByText('7');
    expect(screen.queryByRole('button', { name: /Payer cet appel/ })).toBeNull();
  });
});

describe('ChargeCallPaymentLinkButton', () => {
  it.each([
    [0, 'PAID'],
    [100, 'PAID']
  ])('is hidden when remaining=%s and status=%s', (remaining, status) => {
    render(
      <AntApp>
        <ChargeCallPaymentLinkButton tenantId="a" syndicId="s" chargeId="c" remaining={remaining} status={status} />
      </AntApp>
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ChargeCallTable avec lien de paiement', () => {
  const charge = (over: Partial<ChargeCall>): ChargeCall =>
    ({
      id: 'appel-1',
      syndicateId: 'syndic-1',
      lotId: 'lot-1',
      period: '2026-T1',
      amount: 100000,
      currency: 'XOF',
      dueDate: '2026-10-16T00:00:00.000Z',
      status: 'PENDING',
      outstandingAmount: 100000,
      paidAmount: 0,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      ...over
    }) as ChargeCall;

  const actions = (over: Partial<NonNullable<React.ComponentProps<typeof ChargeCallTable>['paymentLinks']>> = {}) => ({
    tenantId: 'agence-1',
    syndicId: 'syndic-1',
    canCreate: true,
    canView: true,
    onOpenLinks: vi.fn(),
    ...over
  });

  it('shows the button on a call with a balance and opens the links list', async () => {
    const paymentLinks = actions();
    render(
      <AntApp>
        <ChargeCallTable items={[charge({})]} paymentLinks={paymentLinks} />
      </AntApp>
    );
    expect(screen.getByRole('button', { name: /Payer cet appel/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Liens de paiement/ }));
    expect(paymentLinks.onOpenLinks).toHaveBeenCalledWith(expect.objectContaining({ id: 'appel-1' }));
  });

  it('has no button without SYNDIC_EDIT, keeps the list with SYNDIC_VIEW', () => {
    render(
      <AntApp>
        <ChargeCallTable items={[charge({})]} paymentLinks={actions({ canCreate: false })} />
      </AntApp>
    );
    expect(screen.queryByRole('button', { name: /Payer cet appel/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Liens de paiement/ })).toBeInTheDocument();
  });

  it('has no button on a settled call', () => {
    render(
      <AntApp>
        <ChargeCallTable
          items={[charge({ status: 'PAID', outstandingAmount: 0, paidAmount: 100000 })]}
          paymentLinks={actions()}
        />
      </AntApp>
    );
    expect(screen.queryByRole('button', { name: /Payer cet appel/ })).toBeNull();
  });
});
