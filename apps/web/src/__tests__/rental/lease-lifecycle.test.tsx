import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { App as AntApp } from 'antd';
import { LeaseLifecyclePanel } from '../../components/rental/LeaseLifecyclePanel';
import type { LeaseEvent, LeaseEventsData, FinalSettlement } from '../../services/lease-lifecycle-service';

/**
 * Panneau « Vie du bail » (Lot 5 §A).
 *
 * Le contrat d'API n'est pas encore servi par le backend (l'agent API
 * travaille en parallèle sur le même contrat) : ces tests montent le panneau
 * contre un mock du service, pas contre une vraie API.
 */

const getLeaseEvents = vi.fn();
const reviseLease = vi.fn();
const renewLease = vi.fn();
const addLeaseAmendment = vi.fn();
const terminateLease = vi.fn();
const getFinalSettlement = vi.fn();

vi.mock('../../services/lease-lifecycle-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/lease-lifecycle-service')>();
  return {
    ...actual,
    getLeaseEvents: (...a: unknown[]) => getLeaseEvents(...a),
    reviseLease: (...a: unknown[]) => reviseLease(...a),
    renewLease: (...a: unknown[]) => renewLease(...a),
    addLeaseAmendment: (...a: unknown[]) => addLeaseAmendment(...a),
    terminateLease: (...a: unknown[]) => terminateLease(...a),
    getFinalSettlement: (...a: unknown[]) => getFinalSettlement(...a)
  };
});

function makeEvent(overrides: Partial<LeaseEvent>): LeaseEvent {
  return {
    id: 'evt-1',
    type: 'AMENDMENT',
    effectiveDate: '2026-09-15',
    previousRent: null,
    newRent: null,
    previousCharges: null,
    newCharges: null,
    revisionRate: null,
    previousEndDate: null,
    newEndDate: null,
    noticeDate: null,
    initiatedBy: null,
    moveOutDate: null,
    summary: null,
    details: null,
    createdAt: '2026-09-16T10:00:00.000Z',
    createdByName: 'Fatou Camara',
    ...overrides
  };
}

function leaseActif(overrides: Partial<LeaseEventsData['lease']> = {}): LeaseEventsData['lease'] {
  return {
    status: 'ACTIVE',
    startDate: '2025-01-01',
    endDate: '2027-08-31',
    rentAmount: 150000,
    serviceChargeAmount: 10000,
    moveOutDate: null,
    terminated: false,
    ...overrides
  };
}

function mount() {
  return render(
    <AntApp>
      <LeaseLifecyclePanel tenantId="agence-1" leaseId="bail-1" />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Historique — une phrase par type d’événement', () => {
  it('affiche les quatre phrases attendues', async () => {
    getLeaseEvents.mockResolvedValue({
      lease: leaseActif(),
      events: [
        makeEvent({
          id: 'rev-1',
          type: 'REVISION',
          effectiveDate: '2026-10-01',
          previousRent: 150000,
          newRent: 157500,
          revisionRate: 5,
          details: { installmentsUpdated: 4 }
        }),
        makeEvent({
          id: 'ren-1',
          type: 'RENEWAL',
          newEndDate: '2028-08-31',
          details: { installmentsCreated: 12 }
        }),
        makeEvent({
          id: 'ame-1',
          type: 'AMENDMENT',
          effectiveDate: '2026-09-15',
          summary: 'changement de destination'
        }),
        makeEvent({
          id: 'ter-1',
          type: 'TERMINATION',
          effectiveDate: '2026-12-31',
          noticeDate: '2026-09-30',
          initiatedBy: 'TENANT'
        })
      ]
    });

    mount();

    expect(await screen.findByText(/Loyer révisé de/)).toHaveTextContent(
      'Loyer révisé de 150 000 à 157 500 FCFA au 01/10/2026 (+5 %) — 4 échéance(s) recalculée(s)'
    );
    expect(screen.getByText(/Bail renouvelé jusqu’au/)).toHaveTextContent(
      'Bail renouvelé jusqu’au 31/08/2028 — 12 échéance(s) créée(s)'
    );
    expect(screen.getByText(/Avenant du/)).toHaveTextContent('Avenant du 15/09/2026 : changement de destination');
    expect(screen.getByText(/Bail résilié au/)).toHaveTextContent(
      'Bail résilié au 31/12/2026, à l’initiative du locataire (préavis du 30/09/2026)'
    );
  });
});

describe('Révision du loyer', () => {
  it('envoie la charge utile attendue, avec le mois d’effet au format YYYY-MM', async () => {
    const user = userEvent.setup({ delay: null });
    getLeaseEvents.mockResolvedValue({ lease: leaseActif(), events: [] });
    reviseLease.mockResolvedValue(makeEvent({ type: 'REVISION' }));

    mount();

    await user.click(await screen.findByRole('button', { name: /Réviser le loyer/ }));

    const champLoyer = await screen.findByLabelText('Nouveau loyer');
    await user.clear(champLoyer);
    await user.type(champLoyer, '157500');

    const moisAttendu = dayjs().add(1, 'month').format('YYYY-MM');

    await user.click(screen.getByRole('button', { name: 'Réviser' }));

    await waitFor(() => expect(reviseLease).toHaveBeenCalledTimes(1));
    expect(reviseLease).toHaveBeenCalledWith('agence-1', 'bail-1', {
      effectiveMonth: moisAttendu,
      newRent: 157500,
      newCharges: 10000,
      revisionRate: undefined,
      summary: undefined
    });
  });

  it('affiche le message 409 de l’API tel quel', async () => {
    const user = userEvent.setup({ delay: null });
    getLeaseEvents.mockResolvedValue({ lease: leaseActif(), events: [] });
    reviseLease.mockRejectedValue({
      response: {
        data: {
          message:
            "Des échéances de cette période sont déjà réglées, même en partie : choisissez un mois d'effet postérieur."
        }
      }
    });

    mount();

    await user.click(await screen.findByRole('button', { name: /Réviser le loyer/ }));
    await screen.findByLabelText('Nouveau loyer');
    await user.click(screen.getByRole('button', { name: 'Réviser' }));

    expect(
      await screen.findByText(
        "Des échéances de cette période sont déjà réglées, même en partie : choisissez un mois d'effet postérieur."
      )
    ).toBeInTheDocument();
  });
});

describe('Résiliation du bail', () => {
  it('demande confirmation avant l’envoi, puis affiche l’avertissement quand des échéances sont facturées après la fin', async () => {
    const user = userEvent.setup({ delay: null });

    getLeaseEvents.mockResolvedValueOnce({ lease: leaseActif(), events: [] }).mockResolvedValueOnce({
      lease: leaseActif({ terminated: true, endDate: '2026-12-31' }),
      events: [
        makeEvent({
          id: 'ter-1',
          type: 'TERMINATION',
          effectiveDate: '2026-12-31',
          noticeDate: '2026-09-30',
          initiatedBy: 'TENANT',
          details: { billedAfterEnd: 3 }
        })
      ]
    });
    terminateLease.mockResolvedValue(makeEvent({ type: 'TERMINATION' }));
    getFinalSettlement.mockResolvedValue({
      depositHeld: 300000,
      arrears: 0,
      deductions: [],
      deductionsTotal: 0,
      balanceToRefund: 300000,
      exitInspectionStatus: 'NONE'
    } satisfies FinalSettlement);

    mount();

    await user.click(await screen.findByRole('button', { name: /Résilier le bail/ }));

    const champPreavis = await screen.findByLabelText('Date de préavis');
    fireEvent.change(champPreavis, { target: { value: '30/09/2026' } });
    fireEvent.keyDown(champPreavis, { key: 'Enter', code: 'Enter' });

    const champFin = screen.getByLabelText('Date de fin');
    fireEvent.change(champFin, { target: { value: '31/12/2026' } });
    fireEvent.keyDown(champFin, { key: 'Enter', code: 'Enter' });

    fireEvent.mouseDown(screen.getByLabelText('À l’initiative de'));
    fireEvent.click(await screen.findByText('Locataire'));

    // Clic sur l'OK de la modale de saisie : ne doit PAS encore appeler l'API,
    // une confirmation explicite s'intercale d'abord (résiliation définitive).
    await user.click(screen.getByRole('button', { name: 'Résilier' }));
    expect(terminateLease).not.toHaveBeenCalled();

    const dialogueConfirmation = (await screen.findAllByRole('dialog')).find(d =>
      d.textContent?.includes('définitive')
    );
    expect(dialogueConfirmation).toBeTruthy();
    await user.click(within(dialogueConfirmation!).getByRole('button', { name: 'Résilier' }));

    await waitFor(() => expect(terminateLease).toHaveBeenCalledTimes(1));
    expect(terminateLease).toHaveBeenCalledWith('agence-1', 'bail-1', {
      noticeDate: '2026-09-30',
      effectiveDate: '2026-12-31',
      initiatedBy: 'TENANT',
      moveOutDate: undefined,
      summary: undefined
    });

    expect(
      await screen.findByText('3 échéance(s) déjà réglée(s) après la fin du bail : à régulariser par un avoir.')
    ).toBeInTheDocument();
  });
});

describe('Solde de tout compte', () => {
  it('affiche « À restituer au locataire » quand le solde est positif', async () => {
    getLeaseEvents.mockResolvedValue({
      lease: leaseActif({ terminated: true, endDate: '2026-12-31' }),
      events: [makeEvent({ type: 'TERMINATION', effectiveDate: '2026-12-31' })]
    });
    getFinalSettlement.mockResolvedValue({
      depositHeld: 300000,
      arrears: 20000,
      deductions: [{ label: 'Peinture à refaire', amount: 30000 }],
      deductionsTotal: 30000,
      balanceToRefund: 250000,
      exitInspectionStatus: 'FINALIZED'
    } satisfies FinalSettlement);

    mount();

    expect(await screen.findByText(/À restituer au locataire/)).toBeInTheDocument();
    expect(screen.getByText('Peinture à refaire')).toBeInTheDocument();
    expect(
      screen.queryByText("L'état des lieux de sortie n'est pas finalisé : les retenues peuvent encore évoluer.")
    ).not.toBeInTheDocument();
  });

  it('affiche « Reste dû par le locataire » quand le solde est négatif', async () => {
    getLeaseEvents.mockResolvedValue({
      lease: leaseActif({ terminated: true, endDate: '2026-12-31' }),
      events: [makeEvent({ type: 'TERMINATION', effectiveDate: '2026-12-31' })]
    });
    getFinalSettlement.mockResolvedValue({
      depositHeld: 100000,
      arrears: 150000,
      deductions: [],
      deductionsTotal: 0,
      balanceToRefund: -50000,
      exitInspectionStatus: 'FINALIZED'
    } satisfies FinalSettlement);

    mount();

    expect(await screen.findByText(/Reste dû par le locataire/)).toBeInTheDocument();
  });

  it("ajoute une note quand l'état des lieux de sortie n'est pas finalisé", async () => {
    getLeaseEvents.mockResolvedValue({
      lease: leaseActif({ terminated: true, endDate: '2026-12-31' }),
      events: [makeEvent({ type: 'TERMINATION', effectiveDate: '2026-12-31' })]
    });
    getFinalSettlement.mockResolvedValue({
      depositHeld: 300000,
      arrears: 0,
      deductions: [],
      deductionsTotal: 0,
      balanceToRefund: 300000,
      exitInspectionStatus: 'DRAFT'
    } satisfies FinalSettlement);

    mount();

    expect(
      await screen.findByText("L'état des lieux de sortie n'est pas finalisé : les retenues peuvent encore évoluer.")
    ).toBeInTheDocument();
  });
});
