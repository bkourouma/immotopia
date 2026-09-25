import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { SubscriptionTab } from '../../components/admin/tenant-detail/SubscriptionTab';

/**
 * Lot G1 — onglet Abonnement de la fiche agence : changer d'offre et résilier.
 *
 * Le service est mocké en entier : Vitest refuse tout import qu'un `vi.mock`
 * ne déclare pas explicitement, contrairement à Jest.
 */

const getAdminSubscription = vi.fn();
const createAdminSubscription = vi.fn();
const updateAdminSubscription = vi.fn();
const cancelAdminSubscription = vi.fn();

vi.mock('../../services/admin-subscription-service', () => ({
  getAdminSubscription: (...a: unknown[]) => getAdminSubscription(...a),
  createAdminSubscription: (...a: unknown[]) => createAdminSubscription(...a),
  updateAdminSubscription: (...a: unknown[]) => updateAdminSubscription(...a),
  cancelAdminSubscription: (...a: unknown[]) => cancelAdminSubscription(...a)
}));

const SUBSCRIPTION = {
  id: 'sub-1',
  tenantId: 'tenant-1',
  planKey: 'BASIC' as const,
  billingCycle: 'MONTHLY' as const,
  status: 'ACTIVE' as const,
  startAt: '2026-01-01T00:00:00.000Z',
  currentPeriodStart: '2026-01-01T00:00:00.000Z',
  currentPeriodEnd: '2026-02-01T00:00:00.000Z',
  cancelAt: null,
  canceledAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

function mount() {
  return render(
    <AntApp>
      <SubscriptionTab tenantId="tenant-1" tenantName="Agence Demo" />
    </AntApp>
  );
}

async function optionParLibelle(libelle: string): Promise<HTMLElement> {
  return waitFor(() => {
    const candidat = screen.getAllByText(libelle).find(el => el.closest('.ant-select-item'));
    if (!candidat) throw new Error(`Option introuvable : « ${libelle} »`);
    return candidat;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getAdminSubscription.mockResolvedValue(SUBSCRIPTION);
});

describe('SubscriptionTab — abonnement existant', () => {
  it('affiche l’offre, le cycle et le statut actuels', async () => {
    mount();

    expect(await screen.findByText('Abonnement actuel')).toBeInTheDocument();
    // « Basic » et « Mensuel » apparaissent à la fois dans le résumé et dans
    // les `Select` du formulaire de modification, déjà pré-remplis.
    expect(screen.getAllByText('Basic').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mensuel').length).toBeGreaterThan(0);
  });

  it('change d’offre et enregistre la modification', async () => {
    updateAdminSubscription.mockResolvedValue({ ...SUBSCRIPTION, planKey: 'ELITE' });
    mount();

    await screen.findByText('Abonnement actuel');

    const comboboxes = screen.getAllByRole('combobox');
    fireEvent.mouseDown(comboboxes[0]);
    fireEvent.click(await optionParLibelle('Elite'));

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));

    await waitFor(() =>
      expect(updateAdminSubscription).toHaveBeenCalledWith('tenant-1', {
        planKey: 'ELITE',
        billingCycle: 'MONTHLY',
        status: 'ACTIVE'
      })
    );
    expect(await screen.findByText('Abonnement mis à jour')).toBeInTheDocument();
  });

  it('résilie l’abonnement après confirmation', async () => {
    cancelAdminSubscription.mockResolvedValue({ ...SUBSCRIPTION, status: 'ACTIVE', cancelAt: '2026-02-01T00:00:00.000Z' });
    mount();

    await screen.findByText('Abonnement actuel');
    fireEvent.click(screen.getByRole('button', { name: 'Résilier' }));

    const dialogue = await screen.findByRole('dialog');
    expect(dialogue).toHaveTextContent("Résilier l'abonnement de « Agence Demo » ?");

    fireEvent.click(within(dialogue).getByRole('button', { name: 'Résilier' }));

    await waitFor(() => expect(cancelAdminSubscription).toHaveBeenCalledWith('tenant-1'));
    expect(await screen.findByText('Abonnement résilié')).toBeInTheDocument();
  });
});

describe('SubscriptionTab — sans abonnement', () => {
  it('propose de créer un abonnement', async () => {
    getAdminSubscription.mockResolvedValue(null);
    createAdminSubscription.mockResolvedValue({ ...SUBSCRIPTION, planKey: 'PRO' });
    mount();

    expect(await screen.findByText('Cette agence n’a pas encore d’abonnement.')).toBeInTheDocument();

    // L'icône « plus » du bouton porte elle-même un aria-label, concaténé au
    // nom accessible : motif plutôt qu'égalité stricte.
    fireEvent.click(screen.getByRole('button', { name: /Créer un abonnement/ }));
    fireEvent.click(await screen.findByRole('button', { name: "Créer l'abonnement" }));

    await waitFor(() =>
      expect(createAdminSubscription).toHaveBeenCalledWith('tenant-1', { planKey: 'PRO', billingCycle: 'MONTHLY' })
    );
  });
});
