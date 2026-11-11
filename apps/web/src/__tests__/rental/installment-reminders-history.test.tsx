import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InstallmentRemindersHistoryPanel } from '../../components/rental/reminders/InstallmentRemindersHistoryPanel';
import { listInstallmentReminders } from '../../services/rental-payment-reminder-service';

vi.mock('../../services/rental-payment-reminder-service', () => ({
  previewPaymentReminders: vi.fn(),
  sendInstallmentReminder: vi.fn(),
  sendReminderBatch: vi.fn(),
  listPaymentReminders: vi.fn(),
  listInstallmentReminders: vi.fn()
}));

const mockList = listInstallmentReminders as unknown as ReturnType<typeof vi.fn>;

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    tenant_id: 'agence-1',
    installment_id: 'ech-1',
    lease_id: 'bail-1',
    level: 1,
    channel: 'EMAIL',
    status: 'SENT',
    sent_by: 'u1',
    sent_by_name: 'Moussa Diallo',
    sent_at: '2026-09-10T10:00:00.000Z',
    payment_link_id: 'l1',
    failure_code: null,
    leaseReference: 'B-1',
    tenantName: 'Awa',
    periodYear: 2026,
    periodMonth: 9,
    amountDue: 150000,
    ...over
  };
}

const renderPanel = (canView = true) =>
  render(<InstallmentRemindersHistoryPanel tenantId="agence-1" installmentId="ech-1" canView={canView} />);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InstallmentRemindersHistoryPanel', () => {
  it('lists the reminders with sender, link mention and failure cause', async () => {
    mockList.mockResolvedValue([
      row(),
      row({
        id: 'r2',
        channel: 'WHATSAPP',
        status: 'FAILED',
        failure_code: 'PROVIDER_DOWN',
        payment_link_id: null,
        level: 2
      })
    ]);
    renderPanel();
    expect(await screen.findAllByText('Moussa Diallo')).toHaveLength(2);
    expect(screen.getByText('Lien joint')).toBeInTheDocument();
    expect(screen.getByText('Échec')).toBeInTheDocument();
    expect(screen.getByText("L'envoi a échoué (PROVIDER_DOWN)")).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledWith('agence-1', 'ech-1');
  });

  it('shows an empty state', async () => {
    mockList.mockResolvedValue([]);
    renderPanel();
    expect(await screen.findByText('Aucune relance envoyée pour cette échéance.')).toBeInTheDocument();
  });

  it('shows a discreet alert when loading fails', async () => {
    mockList.mockRejectedValue(new Error('boom'));
    renderPanel();
    expect(await screen.findByText("Impossible de charger l'historique des relances.")).toBeInTheDocument();
  });

  it('renders nothing without the view permission', () => {
    renderPanel(false);
    expect(screen.queryByText('Historique des relances')).not.toBeInTheDocument();
    expect(mockList).not.toHaveBeenCalled();
  });
});
