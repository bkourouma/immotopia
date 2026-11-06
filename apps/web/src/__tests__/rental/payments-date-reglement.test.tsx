import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Payments } from '../../pages/rental/Payments';
import { PaymentDetailPage } from '../../pages/rental/PaymentDetailPage';

/**
 * Date d'un paiement : celle du règlement, pas celle de la saisie.
 *
 * Un loyer encaissé le 6 mai et saisi le 20 mai doit se lire « 06/05/2026 » dans
 * la liste, la vue carte et le détail. `initiated_at` (la saisie) reste visible
 * dans le détail, comme information secondaire.
 */

const listPayments = vi.fn();
const getPayment = vi.fn();
const listLeases = vi.fn();

vi.mock('../../services/rental-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/rental-service')>();
  return {
    ...actual,
    listPayments: (...a: unknown[]) => listPayments(...a),
    getPayment: (...a: unknown[]) => getPayment(...a),
    listLeases: (...a: unknown[]) => listLeases(...a)
  };
});

vi.mock('../../components/rental/PaymentForm', () => ({ PaymentForm: () => <div>formulaire de saisie</div> }));
vi.mock('../../components/rental/AllocatePaymentForm', () => ({
  AllocatePaymentForm: () => <div>formulaire d’affectation</div>
}));
vi.mock('../../components/rental/PaymentDeclarationsList', () => ({
  PaymentDeclarationsList: () => <div>liste des déclarations</div>
}));
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set<string>(), permissions: null })
}));

let isDesktop = true;
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: !isDesktop, isTablet: false, isDesktop })
}));

vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: vi.fn().mockResolvedValue([])
}));

const SAISIE = '2026-05-20T12:00:00.000Z';
const REGLEMENT = '2026-05-06T12:00:00.000Z';

function paiement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    tenant_id: 'agence-1',
    lease_id: 'bail-1',
    amount: 200_000,
    currency: 'XOF',
    method: 'CASH',
    status: 'SUCCESS',
    initiated_at: SAISIE,
    succeeded_at: REGLEMENT,
    allocations: [],
    depositMovements: [],
    created_at: '',
    updated_at: '',
    ...overrides
  };
}

function mountListe(paiements: unknown[]) {
  listPayments.mockResolvedValue({
    success: true,
    data: paiements,
    pagination: { page: 1, limit: 50, total: paiements.length, totalPages: 1 }
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
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

function mountDetail(data: unknown) {
  getPayment.mockResolvedValue({ success: true, data });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
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

beforeEach(() => {
  vi.clearAllMocks();
  isDesktop = true;
});

describe('Paiements — date du règlement (liste)', () => {
  it('affiche la date du règlement, pas celle de la saisie', async () => {
    mountListe([paiement()]);

    expect(await screen.findByText('06/05/2026', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('20/05/2026')).not.toBeInTheDocument();
  });

  it('retombe sur la date de saisie quand le paiement n’a pas encore de date de règlement', async () => {
    mountListe([paiement({ status: 'PENDING', succeeded_at: null })]);

    expect(await screen.findByText('20/05/2026', {}, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('Paiements — date du règlement (vue carte)', () => {
  it('nomme la carte et sa ligne de détail avec la date du règlement', async () => {
    isDesktop = false;
    mountListe([paiement()]);

    const carte = await screen.findByLabelText('Paiement du 06/05/2026', {}, { timeout: 8000 });
    expect(within(carte).getByText(/06\/05\/2026/)).toBeInTheDocument();
    expect(screen.queryByText(/20\/05\/2026/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Paiement du 20/05/2026')).not.toBeInTheDocument();
  });
});

describe('Détail d’un paiement — date du règlement', () => {
  it('met la date du règlement en tête et garde la date de saisie en information secondaire', async () => {
    mountDetail(paiement());

    const libelle = await screen.findByText('Date du règlement', {}, { timeout: 8000 });
    const ligneReglement = libelle.closest('tr') as HTMLElement;
    expect(within(ligneReglement).getByText('06/05/2026')).toBeInTheDocument();

    const ligneSaisie = screen.getByText("Date d'initiation").closest('tr') as HTMLElement;
    expect(within(ligneSaisie).getByText('20/05/2026')).toBeInTheDocument();

    // La date du règlement passe avant celle de la saisie.
    expect(
      libelle.compareDocumentPosition(screen.getByText("Date d'initiation")) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('sans date de règlement, la date principale est celle de la saisie', async () => {
    mountDetail(paiement({ status: 'PENDING', succeeded_at: null }));

    const libelle = await screen.findByText('Date du règlement', {}, { timeout: 8000 });
    const ligne = libelle.closest('tr') as HTMLElement;
    expect(within(ligne).getByText('20/05/2026')).toBeInTheDocument();
  });
});
