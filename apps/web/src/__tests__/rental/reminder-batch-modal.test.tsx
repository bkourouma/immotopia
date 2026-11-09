import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { ReminderBatchModal } from '../../components/rental/reminders/ReminderBatchModal';
import { ReminderBatchButton } from '../../components/rental/reminders/ReminderBatchButton';
import type { RentalReminderPreviewDto, RentalReminderPreviewItemDto } from '../../types/rental-payment-reminder';

const previewPaymentReminders = vi.fn();
const sendReminderBatch = vi.fn();

vi.mock('../../services/rental-payment-reminder-service', () => ({
  previewPaymentReminders: (...a: unknown[]) => previewPaymentReminders(...a),
  sendReminderBatch: (...a: unknown[]) => sendReminderBatch(...a)
}));

function item(id: string, over: Partial<RentalReminderPreviewItemDto> = {}): RentalReminderPreviewItemDto {
  return {
    installmentId: id,
    leaseId: 'bail-1',
    leaseReference: 'BAIL-001',
    propertyLabel: 'Villa Cocody',
    tenantClientId: 'loc-1',
    tenantName: 'Awa Traoré',
    periodYear: 2026,
    periodMonth: 4,
    dueDate: '2026-04-05T00:00:00.000Z',
    daysLate: 12,
    amountDue: 100000,
    currency: 'XOF',
    eventKey: 'INSTALLMENT_OVERDUE',
    nextLevel: 1,
    lastLevelSent: null,
    lastSentAt: null,
    channels: ['EMAIL', 'WHATSAPP'],
    paymentLinkIncluded: true,
    eligible: true,
    exclusions: [],
    ...over
  };
}

function previewOf(items: RentalReminderPreviewItemDto[]): RentalReminderPreviewDto {
  const eligible = items.filter(i => i.eligible).length;
  return {
    generatedAt: '2026-11-09T00:00:00.000Z',
    groups: items.length
      ? [
          {
            leaseId: 'bail-1',
            leaseReference: 'BAIL-001',
            propertyLabel: 'Villa Cocody',
            tenantClientId: 'loc-1',
            tenantName: 'Awa Traoré',
            totalDue: items.reduce((s, i) => s + i.amountDue, 0),
            items
          }
        ]
      : [],
    totals: { eligible, excluded: items.length - eligible, amountDue: 0 }
  };
}

function monter(props: Partial<React.ComponentProps<typeof ReminderBatchModal>> = {}) {
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(
    <AntApp>
      <ReminderBatchModal tenantId="agence-1" open onClose={onClose} onDone={onDone} {...props} />
    </AntApp>
  );
  return { onClose, onDone };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReminderBatchModal', () => {
  it("charge l'aperçu avec les filtres par défaut et affiche le groupe", async () => {
    previewPaymentReminders.mockResolvedValue(previewOf([item('e1')]));
    monter({ leaseId: 'bail-9' });
    await screen.findByText('Awa Traoré');
    expect(previewPaymentReminders).toHaveBeenCalledWith('agence-1', {
      minDaysLate: 1,
      daysBefore: 0,
      leaseId: 'bail-9'
    });
    expect(screen.getByText('BAIL-001 · Villa Cocody')).toBeTruthy();
    expect(screen.getByText('12 jours de retard')).toBeTruthy();
    expect(screen.getByText('Lien de paiement')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Envoyer 1 relance\(s\)/ })).toBeTruthy();
  });

  it('affiche un état vide', async () => {
    previewPaymentReminders.mockResolvedValue(previewOf([]));
    monter();
    await screen.findByText('Aucune échéance à relancer pour le moment.');
    expect((screen.getByRole('button', { name: /Envoyer 0 relance\(s\)/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('exclut les lignes non éligibles de la sélection et en donne les motifs', async () => {
    previewPaymentReminders.mockResolvedValue(
      previewOf([
        item('e1'),
        item('e2', {
          eligible: false,
          channels: [],
          nextLevel: null,
          exclusions: ['PENDING_DECLARATION', 'NO_CONTACT_CHANNEL']
        })
      ])
    );
    monter();
    await screen.findByText('Awa Traoré');
    expect(screen.getByText(/Paiement déclaré en cours de vérification/)).toBeTruthy();
    expect(screen.getByText(/Aucun e-mail ni WhatsApp utilisable/)).toBeTruthy();
    const rows = screen.getAllByRole('row');
    const boxes = rows.flatMap(r => within(r).queryAllByRole('checkbox'));
    // 1 case d'en-tête + 2 lignes
    const ligneExclue = boxes[boxes.length - 1] as HTMLInputElement;
    const ligneEligible = boxes[boxes.length - 2] as HTMLInputElement;
    expect(ligneExclue.disabled).toBe(true);
    expect(ligneEligible.checked).toBe(true);
    expect(screen.getByText('1 éligible(s)')).toBeTruthy();
    expect(screen.getByText('1 exclue(s)')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Envoyer 1 relance\(s\)/ })).toBeTruthy();
  });

  it('plafonne la sélection par défaut à 200 et le signale', async () => {
    const items = Array.from({ length: 250 }, (_, i) => item(`e${i}`));
    previewPaymentReminders.mockResolvedValue(previewOf(items));
    monter();
    await screen.findByText('Sélection limitée à 200 échéances');
    expect(screen.getByRole('button', { name: /Envoyer 200 relance\(s\)/ })).toBeTruthy();
  });

  it('envoie la sélection et affiche le résultat ligne par ligne', async () => {
    previewPaymentReminders.mockResolvedValue(previewOf([item('e1'), item('e2'), item('e3')]));
    sendReminderBatch.mockResolvedValue({
      results: [
        {
          installmentId: 'e1',
          status: 'SENT',
          level: 1,
          reason: null,
          failureCode: null,
          channels: [{ channel: 'EMAIL', status: 'SENT', failureCode: null, reminderId: 'r1' }],
          paymentLinkId: 'l1'
        },
        {
          installmentId: 'e2',
          status: 'SKIPPED',
          level: null,
          reason: 'TOO_SOON',
          failureCode: null,
          channels: [],
          paymentLinkId: null
        },
        {
          installmentId: 'e3',
          status: 'FAILED',
          level: 1,
          reason: null,
          failureCode: 'PROVIDER_DOWN',
          channels: [],
          paymentLinkId: null
        }
      ],
      totals: { sent: 1, skipped: 1, failed: 1 }
    });
    const { onClose, onDone } = monter();
    const user = userEvent.setup();
    await screen.findByText('Awa Traoré');
    await user.click(screen.getByRole('button', { name: /Envoyer 3 relance\(s\)/ }));
    await screen.findByText('1 envoyée(s)');
    expect(sendReminderBatch).toHaveBeenCalledWith('agence-1', { installmentIds: ['e1', 'e2', 'e3'] });
    expect(screen.getByText('1 ignorée(s)')).toBeTruthy();
    expect(screen.getByText('1 échec(s)')).toBeTruthy();
    expect(screen.getByText(/Relance trop récente/)).toBeTruthy();
    expect(screen.getByText(/PROVIDER_DOWN/)).toBeTruthy();
    expect(screen.getByText('Ignorée')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('envoie 150 lignes en tranches séquentielles de 100 maximum', async () => {
    const items = Array.from({ length: 150 }, (_, i) => item(`e${i}`));
    previewPaymentReminders.mockResolvedValue(previewOf(items));
    sendReminderBatch.mockImplementation(async (_t: string, body: { installmentIds: string[] }) => ({
      results: body.installmentIds.map(id => ({
        installmentId: id,
        status: 'SENT',
        level: 1,
        reason: null,
        failureCode: null,
        channels: [],
        paymentLinkId: null
      })),
      totals: { sent: body.installmentIds.length, skipped: 0, failed: 0 }
    }));
    monter();
    const user = userEvent.setup();
    await screen.findByText('Awa Traoré');
    await user.click(screen.getByRole('button', { name: /Envoyer 150 relance\(s\)/ }));
    await screen.findByText('150 envoyée(s)');
    expect(sendReminderBatch).toHaveBeenCalledTimes(2);
    expect(sendReminderBatch.mock.calls[0][1].installmentIds).toHaveLength(100);
    expect(sendReminderBatch.mock.calls[1][1].installmentIds).toHaveLength(50);
  });

  it("s'arrête sur une erreur de tranche et garde ce qui est déjà parti", async () => {
    const items = Array.from({ length: 150 }, (_, i) => item(`e${i}`));
    previewPaymentReminders.mockResolvedValue(previewOf(items));
    sendReminderBatch
      .mockResolvedValueOnce({
        results: Array.from({ length: 100 }, (_, i) => ({
          installmentId: `e${i}`,
          status: 'SENT',
          level: 1,
          reason: null,
          failureCode: null,
          channels: [],
          paymentLinkId: null
        })),
        totals: { sent: 100, skipped: 0, failed: 0 }
      })
      .mockRejectedValueOnce({ response: { data: { message: 'Service indisponible' } } });
    monter();
    const user = userEvent.setup();
    await screen.findByText('Awa Traoré');
    await user.click(screen.getByRole('button', { name: /Envoyer 150 relance\(s\)/ }));
    await screen.findByText('Service indisponible');
    expect(screen.getByText('100 envoyée(s)')).toBeTruthy();
    expect(sendReminderBatch).toHaveBeenCalledTimes(2);
  });

  it('recharge avec les nouveaux filtres sur « Actualiser »', async () => {
    previewPaymentReminders.mockResolvedValue(previewOf([item('e1')]));
    monter();
    const user = userEvent.setup();
    await screen.findByText('Awa Traoré');
    const jours = screen.getByLabelText('Jours avant échéance (0 à 30)');
    await user.clear(jours);
    await user.type(jours, '5');
    await user.click(screen.getByRole('button', { name: /Actualiser/ }));
    await waitFor(() => expect(previewPaymentReminders).toHaveBeenCalledTimes(2));
    expect(previewPaymentReminders.mock.calls[1][1]).toMatchObject({ minDaysLate: 1, daysBefore: 5 });
  });
});

describe('ReminderBatchButton', () => {
  it('ne rend rien sans le droit', () => {
    const { container } = render(
      <AntApp>
        <ReminderBatchButton tenantId="agence-1" canAllocate={false} />
      </AntApp>
    );
    expect(container.querySelector('button')).toBeNull();
  });

  it('ouvre la modale', async () => {
    previewPaymentReminders.mockResolvedValue(previewOf([]));
    render(
      <AntApp>
        <ReminderBatchButton tenantId="agence-1" canAllocate />
      </AntApp>
    );
    await userEvent.setup().click(screen.getByRole('button', { name: /Relancer en lot/ }));
    await screen.findByText('Aucune échéance à relancer pour le moment.');
  });
});
