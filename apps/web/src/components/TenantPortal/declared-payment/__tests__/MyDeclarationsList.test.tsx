import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** « Mes déclarations » du portail locataire (spec 049). Seul le service est simulé. */

const listMyDeclarations = vi.fn();
const cancelMyDeclaration = vi.fn();
vi.mock('../../../../services/tenant-portal-declared-payment-service', async importOriginal => {
  const original = await importOriginal<typeof import('../../../../services/tenant-portal-declared-payment-service')>();
  return {
    ...original,
    listMyDeclarations: (...a: unknown[]) => listMyDeclarations(...a),
    cancelMyDeclaration: (...a: unknown[]) => cancelMyDeclaration(...a)
  };
});

import MyDeclarationsList from '../MyDeclarationsList';

const DELAI = { timeout: 8000 };

function declaration(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    status: 'PENDING',
    leaseId: 'l1',
    installment: { id: 'i1', periodYear: 2026, periodMonth: 10, dueDate: '2026-10-05T00:00:00Z' },
    receivingNumber: { operator: 'ORANGE', phone: '+2250707070707' },
    payerPhone: null,
    amount: 150000,
    acceptedAmount: null,
    paidAt: '2026-11-08T10:00:00Z',
    reference: 'MP2611.0001',
    rejectReason: null,
    reviewNote: null,
    canCancel: true,
    createdAt: '2026-11-08T10:05:00Z',
    reviewedAt: null,
    ...over
  };
}

function page(items: unknown[]) {
  return { items, total: items.length, page: 1, pageSize: 10 };
}

function monter(onChanged = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MyDeclarationsList onChanged={onChanged} />
      </AntApp>
    </QueryClientProvider>
  );
  return onChanged;
}

beforeEach(() => {
  listMyDeclarations.mockReset();
  cancelMyDeclaration.mockReset();
});

describe('Mes déclarations', () => {
  it('liste vide : message dédié', async () => {
    listMyDeclarations.mockResolvedValue(page([]));
    monter();
    expect(await screen.findByText('Aucune déclaration de paiement pour le moment.', {}, DELAI)).toBeInTheDocument();
  });

  it('en attente : statut lisible et bouton d’annulation', async () => {
    listMyDeclarations.mockResolvedValue(page([declaration()]));
    monter();
    expect((await screen.findAllByText('En attente de validation', {}, DELAI)).length).toBeGreaterThan(0);
    expect(screen.getByText('MP2611.0001', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler la déclaration' })).toBeInTheDocument();
  });

  it('rejetée : motif lisible et note, sans bouton d’annulation', async () => {
    listMyDeclarations.mockResolvedValue(
      page([
        declaration({
          status: 'REJECTED',
          canCancel: false,
          rejectReason: 'AMOUNT_MISMATCH',
          reviewNote: 'Le montant reçu est de 100 000 FCFA.'
        })
      ])
    );
    monter();
    expect(await screen.findByText('Rejetée', {}, DELAI)).toBeInTheDocument();
    expect(screen.getByText(/Montant ne correspondant pas/)).toBeInTheDocument();
    expect(screen.getByText('Le montant reçu est de 100 000 FCFA.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annuler la déclaration' })).toBeNull();
  });

  it('validée avec un montant retenu différent : le montant retenu est affiché', async () => {
    listMyDeclarations.mockResolvedValue(
      page([declaration({ status: 'APPROVED', canCancel: false, acceptedAmount: 140000, reviewNote: 'Écart accepté' })])
    );
    monter();
    expect(await screen.findByText('Validée', {}, DELAI)).toBeInTheDocument();
    expect(screen.getByText(/Montant retenu/)).toBeInTheDocument();
    expect(screen.getByText(/Écart accepté/)).toBeInTheDocument();
  });

  it('annulation confirmée : appelle l’API, prévient la page et recharge la liste', async () => {
    listMyDeclarations.mockResolvedValue(page([declaration()]));
    cancelMyDeclaration.mockResolvedValue(declaration({ status: 'CANCELED', canCancel: false }));
    const onChanged = monter();
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Annuler la déclaration' }, DELAI));
    const confirmer = await screen.findAllByRole('button', { name: 'Annuler la déclaration' }, DELAI);
    await user.click(confirmer[confirmer.length - 1]);
    await waitFor(() => expect(cancelMyDeclaration).toHaveBeenCalledWith('d1'), DELAI);
    await waitFor(() => expect(onChanged).toHaveBeenCalled(), DELAI);
    await waitFor(() => expect(listMyDeclarations.mock.calls.length).toBeGreaterThan(1), DELAI);
  });

  it('refus 409 à l’annulation : message du serveur', async () => {
    listMyDeclarations.mockResolvedValue(page([declaration()]));
    cancelMyDeclaration.mockRejectedValue({
      response: {
        status: 409,
        data: {
          success: false,
          message: 'Cette déclaration a déjà été traitée.',
          code: 'RENTAL_DECLARATION_ALREADY_REVIEWED'
        }
      }
    });
    monter();
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Annuler la déclaration' }, DELAI));
    const confirmer = await screen.findAllByRole('button', { name: 'Annuler la déclaration' }, DELAI);
    await user.click(confirmer[confirmer.length - 1]);
    expect(await screen.findByText('Cette déclaration a déjà été traitée.', {}, DELAI)).toBeInTheDocument();
  });

  it('erreur de chargement : message et bouton Réessayer', async () => {
    listMyDeclarations.mockRejectedValueOnce(new Error('réseau'));
    listMyDeclarations.mockResolvedValue(page([declaration()]));
    monter();
    const user = userEvent.setup({ delay: null });
    expect(await screen.findByText('Impossible de charger vos déclarations.', {}, DELAI)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect((await screen.findAllByText('En attente de validation', {}, DELAI)).length).toBeGreaterThan(0);
  });
});
