import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Payments } from '../../pages/rental/Payments';
import { PaymentDetailPage } from '../../pages/rental/PaymentDetailPage';
import { PaymentForm } from '../../components/rental/PaymentForm';

/**
 * Paiements locatifs — un refus 400/409 de l'API s'affiche tel quel.
 *
 * L'API refuse un changement de statut impossible, une seconde affectation sur
 * la même échéance, une devise différente de celle du bail, un montant hors
 * plafond. Chacun renvoie un message français précis : l'écran doit le montrer,
 * sans le remplacer par un texte générique et sans se transformer en page
 * d'erreur (la personne doit pouvoir corriger et recommencer).
 */

const listPayments = vi.fn();
const getPayment = vi.fn();
const createPayment = vi.fn();
const allocatePayment = vi.fn();
const updatePaymentStatus = vi.fn();
const listInstallments = vi.fn();
const listLeases = vi.fn();

vi.mock('../../services/rental-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/rental-service')>();
  return {
    ...actual,
    listPayments: (...a: unknown[]) => listPayments(...a),
    getPayment: (...a: unknown[]) => getPayment(...a),
    createPayment: (...a: unknown[]) => createPayment(...a),
    allocatePayment: (...a: unknown[]) => allocatePayment(...a),
    updatePaymentStatus: (...a: unknown[]) => updatePaymentStatus(...a),
    listInstallments: (...a: unknown[]) => listInstallments(...a),
    listLeases: (...a: unknown[]) => listLeases(...a)
  };
});

vi.mock('../../components/rental/PaymentDeclarationsList', () => ({
  PaymentDeclarationsList: () => <div>liste des déclarations</div>
}));
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set<string>(), permissions: null })
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: vi.fn().mockResolvedValue([])
}));

const DELAI = { timeout: 8000 };

/** Erreur telle que l'expose `api-client` (axios) : le corps de la réponse porte le message. */
function refus(status: number, message: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { response: { status, data: { success: false, message, ...extra } } });
}

function paiement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    tenant_id: 'agence-1',
    lease_id: 'bail-1',
    amount: 300_000,
    currency: 'XOF',
    method: 'CASH',
    status: 'PENDING',
    initiated_at: '2026-05-06T09:30:00.000Z',
    succeeded_at: null,
    allocations: [],
    depositMovements: [],
    created_at: '',
    updated_at: '',
    ...overrides
  };
}

function echeance() {
  return {
    id: 'ech-1',
    tenant_id: 'agence-1',
    lease_id: 'bail-1',
    period_month: 6,
    period_year: 2026,
    due_date: '2026-06-05T12:00:00.000Z',
    amount_rent: 150_000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    currency: 'XOF',
    status: 'PENDING'
  };
}

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function mountDetail(data: unknown) {
  getPayment.mockResolvedValue({ success: true, data });
  return render(
    <QueryClientProvider client={queryClient()}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/rental/payments/pay-1']}>
          <Routes>
            <Route path="/tenant/:tenantId/rental/payments/:paymentId" element={<PaymentDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function mountListe(paiements: unknown[]) {
  listPayments.mockResolvedValue({
    success: true,
    data: paiements,
    pagination: { page: 1, limit: 50, total: paiements.length, totalPages: 1 }
  });
  return render(
    <QueryClientProvider client={queryClient()}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/rental/payments']}>
          <Routes>
            <Route path="/tenant/:tenantId/rental/payments" element={<Payments />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

/** Coche l'unique échéance proposée puis valide le formulaire d'affectation. */
async function validerAffectation(boite: HTMLElement) {
  const user = userEvent.setup({ delay: null });
  await user.click(await within(boite).findByRole('checkbox', {}, DELAI));
  await user.click(within(boite).getByRole('button', { name: 'Allouer le paiement' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  listInstallments.mockResolvedValue({
    success: true,
    data: [echeance()],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 }
  });
  listLeases.mockResolvedValue({
    success: true,
    data: [],
    pagination: { page: 1, limit: 500, total: 0, totalPages: 0 }
  });
});

describe('Détail d’un paiement — changement de statut refusé', () => {
  it('affiche le message de l’API et garde l’écran du paiement', async () => {
    const motif = 'Un paiement « En attente » ne peut pas passer à « Réussi ».';
    updatePaymentStatus.mockRejectedValue(refus(409, motif));
    mountDetail(paiement());

    await screen.findByText('Détails du paiement', {}, DELAI);
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByText('Réussi', { selector: '.ant-select-item-option-content' }));

    expect(await screen.findByText(motif, {}, DELAI)).toBeInTheDocument();
    // L'écran n'est pas remplacé par une page d'erreur : le paiement et son
    // sélecteur de statut restent là pour une autre tentative.
    expect(screen.getByText('Détails du paiement')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryByText('Paiement non trouvé')).not.toBeInTheDocument();
  });
});

describe('Détail d’un paiement — affectation refusée', () => {
  it('affiche le message de l’API dans la fenêtre d’affectation, qui reste ouverte', async () => {
    const motif = 'Cette échéance est déjà soldée par un autre paiement.';
    allocatePayment.mockRejectedValue(refus(409, motif));
    mountDetail(paiement({ status: 'SUCCESS', succeeded_at: '2026-05-06T12:00:00.000Z' }));

    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Allouer aux échéances' }, DELAI));
    const boite = await screen.findByRole('dialog', {}, DELAI);
    await validerAffectation(boite);

    expect(await within(boite).findByText(motif, {}, DELAI)).toBeInTheDocument();
    expect(screen.getByText('Détails du paiement')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Liste des paiements — affectation refusée', () => {
  it('affiche le message de l’API dans la fenêtre d’affectation, qui reste ouverte', async () => {
    const motif = 'Cette échéance est déjà soldée par un autre paiement.';
    allocatePayment.mockRejectedValue(refus(409, motif));
    mountListe([paiement({ status: 'SUCCESS', succeeded_at: '2026-05-06T12:00:00.000Z' })]);

    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Affecter' }, DELAI));
    const boite = await screen.findByRole('dialog', {}, DELAI);
    await validerAffectation(boite);

    expect(await within(boite).findByText(motif, {}, DELAI)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('refus d’un paiement non encaissé : le message de l’API, pas un texte générique', async () => {
    const motif = 'Seul un paiement encaissé (statut « Réussi ») peut être affecté à une échéance.';
    allocatePayment.mockRejectedValue(refus(409, motif));
    mountListe([paiement({ status: 'SUCCESS' })]);

    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Affecter' }, DELAI));
    const boite = await screen.findByRole('dialog', {}, DELAI);
    await validerAffectation(boite);

    expect(await within(boite).findByText(motif, {}, DELAI)).toBeInTheDocument();
    expect(within(boite).queryByText(/Une erreur est survenue/)).not.toBeInTheDocument();
  });
});

describe('Liste des paiements — encaissement refusé', () => {
  it('affiche le message de l’API (devise différente de celle du bail) et garde le formulaire', async () => {
    const motif = 'La devise du paiement (EUR) est différente de celle du bail (FCFA).';
    createPayment.mockRejectedValue(refus(400, motif));
    // Depuis la liste globale, le bail est obligatoire (BUG-2026-11-04-033).
    listLeases.mockResolvedValue({
      success: true,
      data: [{ id: 'bail-1', lease_number: 'BAIL-1', currency: 'FCFA', property: { title: 'Villa' } }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });
    mountListe([]);

    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: /Nouveau paiement/ }, DELAI));
    const boite = await screen.findByRole('dialog', {}, DELAI);
    await user.click(await within(boite).findByRole('combobox', { name: /Bail/ }, DELAI));
    await user.click(await screen.findByText(/BAIL-1 — Villa/, {}, DELAI));
    await user.type(await within(boite).findByPlaceholderText('Ex: 150000'), '150000');
    await user.click(within(boite).getByRole('button', { name: 'Enregistrer le paiement' }));

    await waitFor(() => expect(createPayment).toHaveBeenCalled(), DELAI);
    expect((await within(boite).findAllByText(motif, {}, DELAI)).length).toBeGreaterThan(0);
    expect(within(boite).getByRole('button', { name: 'Enregistrer le paiement' })).toBeInTheDocument();
  });
});

describe('Formulaire de paiement — erreurs de validation de l’API', () => {
  function monter(erreur: unknown) {
    const onSubmit = vi.fn().mockRejectedValue(erreur);
    render(
      <QueryClientProvider client={queryClient()}>
        <AntApp>
          <PaymentForm tenantId="agence-1" leaseId="bail-1" onSubmit={onSubmit} />
        </AntApp>
      </QueryClientProvider>
    );
    return onSubmit;
  }

  async function soumettre() {
    const user = userEvent.setup({ delay: null });
    await user.type(await screen.findByPlaceholderText('Ex: 150000'), '150000');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
  }

  it('montre sous le champ Montant le plafond refusé par l’API', async () => {
    const plafond = 'Le montant dépasse le maximum autorisé (9 999 999 999,99).';
    const onSubmit = monter(
      refus(400, 'Les données fournies sont invalides.', { errors: [{ field: 'amount', message: plafond }] })
    );
    await soumettre();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled(), DELAI);
    expect(await screen.findByText(plafond, {}, DELAI)).toBeInTheDocument();
  });

  it('montre aussi le motif d’un champ que le formulaire n’affiche pas', async () => {
    // `leaseId` n'a pas de champ à l'écran : sans bandeau, le refus passait
    // sans qu'aucun message ne s'affiche.
    const motif = 'Identifiant de bail invalide.';
    const onSubmit = monter(
      refus(400, 'Les données fournies sont invalides.', { errors: [{ field: 'leaseId', message: motif }] })
    );
    await soumettre();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled(), DELAI);
    expect((await screen.findAllByText(new RegExp(motif), {}, DELAI)).length).toBeGreaterThan(0);
  });
});
