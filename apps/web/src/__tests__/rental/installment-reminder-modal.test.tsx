import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { InstallmentReminderModal } from '../../components/rental/reminders/InstallmentReminderModal';
import { InstallmentReminderButton } from '../../components/rental/reminders/InstallmentReminderButton';
import { previewPaymentReminders, sendInstallmentReminder } from '../../services/rental-payment-reminder-service';

vi.mock('../../services/rental-payment-reminder-service', () => ({
  previewPaymentReminders: vi.fn(),
  sendInstallmentReminder: vi.fn(),
  sendReminderBatch: vi.fn(),
  listPaymentReminders: vi.fn(),
  listInstallmentReminders: vi.fn()
}));

const mockPreview = previewPaymentReminders as unknown as ReturnType<typeof vi.fn>;
const mockSend = sendInstallmentReminder as unknown as ReturnType<typeof vi.fn>;

function item(over: Record<string, unknown> = {}) {
  return {
    installmentId: 'ech-1',
    leaseId: 'bail-1',
    leaseReference: 'B-1',
    propertyLabel: 'Villa',
    tenantClientId: 'c-1',
    tenantName: 'Awa Traoré',
    periodYear: 2026,
    periodMonth: 9,
    dueDate: '2026-09-05T12:00:00.000Z',
    daysLate: 10,
    amountDue: 150000,
    currency: 'FCFA',
    eventKey: 'INSTALLMENT_OVERDUE',
    nextLevel: 2,
    lastLevelSent: 1,
    lastSentAt: null,
    channels: ['EMAIL', 'WHATSAPP'],
    paymentLinkIncluded: true,
    eligible: true,
    exclusions: [],
    ...over
  };
}

function preview(it: unknown) {
  return {
    generatedAt: '2026-09-15T00:00:00.000Z',
    groups: [{ leaseId: 'bail-1', items: [it] }],
    totals: { eligible: 1, excluded: 0, amountDue: 150000 }
  };
}

function renderModal(onSent = vi.fn()) {
  render(
    <AntApp>
      <InstallmentReminderModal
        tenantId="agence-1"
        installmentId="ech-1"
        periodLabel="09/2026"
        open
        onClose={vi.fn()}
        onSent={onSent}
      />
    </AntApp>
  );
  return onSent;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPreview.mockResolvedValue(preview(item()));
});

describe('InstallmentReminderModal', () => {
  it('loads the preview and shows level, channels, message and payment link mention', async () => {
    renderModal();
    expect(await screen.findByText(/Un lien de paiement en ligne sera joint au message/)).toBeInTheDocument();
    expect(mockPreview).toHaveBeenCalledWith('agence-1', { installmentId: 'ech-1' });
    expect(screen.getByText(/Awa Traoré/)).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeChecked();
    expect(screen.getByLabelText('WhatsApp')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Envoyer la relance' })).toBeEnabled();
  });

  it('says no link is attached when online payment is unavailable', async () => {
    mockPreview.mockResolvedValue(preview(item({ paymentLinkIncluded: false })));
    renderModal();
    expect(await screen.findByText(/Aucun lien de paiement ne sera joint/)).toBeInTheDocument();
  });

  it('tells when the installment is not in the preview', async () => {
    mockPreview.mockResolvedValue({ ...preview(item()), groups: [] });
    renderModal();
    expect(await screen.findByText("Cette échéance n'est pas relançable pour le moment.")).toBeInTheDocument();
  });

  it('lists exclusion reasons and disables the confirm button', async () => {
    mockPreview.mockResolvedValue(preview(item({ eligible: false, exclusions: ['TOO_SOON', 'PENDING_DECLARATION'] })));
    renderModal();
    expect(await screen.findByText(/Relance trop récente/)).toBeInTheDocument();
    expect(screen.getByText('Paiement déclaré en cours de vérification')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer la relance' })).toBeDisabled();
  });

  it('sends with the selected channels and level, then shows the result', async () => {
    mockSend.mockResolvedValue({
      installmentId: 'ech-1',
      status: 'SENT',
      level: 2,
      reason: null,
      failureCode: null,
      channels: [{ channel: 'EMAIL', status: 'SENT', failureCode: null, reminderId: 'r1' }],
      paymentLinkId: 'l1'
    });
    const onSent = renderModal();
    await screen.findByText(/Un lien de paiement en ligne/);
    await userEvent.click(screen.getByLabelText('WhatsApp'));
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la relance' }));

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('agence-1', 'ech-1', { channels: ['EMAIL'], level: 2 }));
    expect(await screen.findByText(/E-mail : Envoyée/)).toBeInTheDocument();
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('shows the exclusion reasons of a 409 TOO_SOON', async () => {
    mockSend.mockRejectedValue({
      response: { status: 409, data: { code: 'RENTAL_REMINDER_TOO_SOON', data: { exclusions: ['TOO_SOON'] } } }
    });
    const onSent = renderModal();
    await screen.findByText(/Un lien de paiement en ligne/);
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la relance' }));
    expect(await screen.findByText(/La relance n'a pas été envoyée/)).toBeInTheDocument();
    expect(screen.getAllByText(/Relance trop récente/).length).toBeGreaterThan(0);
    expect(onSent).not.toHaveBeenCalled();
  });

  it('shows a partial failure per channel', async () => {
    mockSend.mockResolvedValue({
      installmentId: 'ech-1',
      status: 'SENT',
      level: 2,
      reason: null,
      failureCode: null,
      channels: [
        { channel: 'EMAIL', status: 'SENT', failureCode: null, reminderId: 'r1' },
        { channel: 'WHATSAPP', status: 'FAILED', failureCode: 'PROVIDER_DOWN', reminderId: 'r2' }
      ],
      paymentLinkId: null
    });
    renderModal();
    await screen.findByText(/Un lien de paiement en ligne/);
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la relance' }));
    expect(await screen.findByText(/WhatsApp : L'envoi a échoué \(PROVIDER_DOWN\)/)).toBeInTheDocument();
    expect(screen.getByText(/E-mail : Envoyée/)).toBeInTheDocument();
  });
});

describe('InstallmentReminderButton', () => {
  const base = {
    tenantId: 'agence-1',
    installmentId: 'ech-1',
    remaining: 150000,
    status: 'OVERDUE',
    canAllocate: true
  };
  const renderButton = (props: Partial<React.ComponentProps<typeof InstallmentReminderButton>> = {}) =>
    render(
      <AntApp>
        <InstallmentReminderButton {...base} {...props} />
      </AntApp>
    );

  it('is visible with the allocate permission and opens the modal', async () => {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: /Relancer/ }));
    expect(await screen.findByText(/Un lien de paiement en ligne/)).toBeInTheDocument();
  });

  it('is hidden without RENTAL_PAYMENTS_ALLOCATE', () => {
    renderButton({ canAllocate: false });
    expect(screen.queryByRole('button', { name: /Relancer/ })).not.toBeInTheDocument();
  });

  it('is hidden when the installment is settled or the lease inactive', () => {
    renderButton({ remaining: 0, status: 'PAID' });
    expect(screen.queryByRole('button', { name: /Relancer/ })).not.toBeInTheDocument();
  });

  it('is hidden when the lease is not active', () => {
    renderButton({ leaseStatus: 'TERMINATED' });
    expect(screen.queryByRole('button', { name: /Relancer/ })).not.toBeInTheDocument();
  });
});
