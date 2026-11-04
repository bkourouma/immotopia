import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SaleMandateDetail } from '../../pages/sales/SaleMandateDetail';

/**
 * Fiche mandat : onglet dans l'URL (`?onglet=`) et recherche locale des offres
 * (préfixe `off`), seulement au-delà de 10 offres.
 */

const getSaleMandate = vi.fn();
vi.mock('../../services/sales-service', () => ({
  getSaleMandate: (...a: unknown[]) => getSaleMandate(...a),
  decideSaleOffer: vi.fn(),
  createSaleOffer: vi.fn(),
  createSaleAgreementFromOffer: vi.fn(),
  revokeSaleMandate: vi.fn()
}));
vi.mock('../../components/signature/MandateSignatures', () => ({
  MandateSignatures: () => <div>Signatures du mandat</div>
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const T = { timeout: 8000 };

function offre(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `offer-${index}`,
    number: `OA-${String(index).padStart(4, '0')}`,
    mandateId: 'mandate-1',
    buyerContactId: `contact-${index}`,
    buyerName: `Acquéreur ${index}`,
    dealId: null,
    amount: 1_000_000 * index,
    financing: 'CASH',
    conditions: null,
    validUntil: null,
    isExpired: false,
    status: 'SUBMITTED',
    counterAmount: null,
    agreedPrice: null,
    decidedAt: null,
    decidedByName: null,
    decisionReason: null,
    agreementId: null,
    createdAt: '2026-09-05',
    ...overrides
  };
}

function mandat(offers: unknown[]) {
  return {
    id: 'mandate-1',
    number: 'MV-2026-0001',
    propertyId: 'property-1',
    propertyLabel: 'REF-001 · Villa Cocody',
    propertyStatus: 'AVAILABLE',
    sellerClientId: 'client-1',
    sellerName: 'Aissatou Barry',
    mandateType: 'EXCLUSIVE',
    askingPrice: 50_000_000,
    minimumPrice: null,
    commissionMode: 'PERCENT',
    commissionRate: 5,
    commissionFixedAmount: null,
    commissionPayer: 'SELLER',
    agentUserId: null,
    agentName: null,
    agentSharePercent: null,
    startDate: '2026-09-01',
    endDate: '2027-03-01',
    status: 'ACTIVE',
    isExpired: false,
    revokedAt: null,
    revokeReason: null,
    signedAt: null,
    notes: null,
    openOffersCount: offers.length,
    offersCount: offers.length,
    agreementId: null,
    agreementStatus: null,
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
    coSellers: [],
    agreements: [],
    commission: null,
    offers
  };
}

function Adresse() {
  return <div data-testid="adresse">{useLocation().search}</div>;
}

function mount(url = '/tenant/agence-1/sales/mandates/mandate-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/sales/mandates/:id" element={<SaleMandateDetail />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Fiche mandat : onglets dans l’URL', () => {
  it('ouvre l’onglet demandé par ?onglet= et ne monte pas les autres', async () => {
    getSaleMandate.mockResolvedValue(mandat([offre(1)]));
    mount('/tenant/agence-1/sales/mandates/mandate-1?onglet=signatures');
    expect(await screen.findByText('Signatures du mandat', {}, T)).toBeInTheDocument();
    expect(screen.queryByText('OA-0001')).not.toBeInTheDocument();
  });

  it('écrit l’onglet choisi dans l’URL', async () => {
    const user = userEvent.setup({ delay: null });
    getSaleMandate.mockResolvedValue(mandat([offre(1)]));
    mount();
    await screen.findByText('OA-0001', {}, T);
    await user.click(screen.getByRole('tab', { name: 'Historique' }));
    await waitFor(() => expect(screen.getByTestId('adresse')).toHaveTextContent('onglet=historique'), T);
  });
});

describe('Fiche mandat : recherche des offres', () => {
  it('n’affiche pas de barre jusqu’à 10 offres', async () => {
    getSaleMandate.mockResolvedValue(mandat(Array.from({ length: 10 }, (_, i) => offre(i + 1))));
    mount();
    await screen.findByText('OA-0001', {}, T);
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });

  it('au-delà de 10 offres : barre nommée, recherche locale et URL préfixée', async () => {
    const user = userEvent.setup({ delay: null });
    getSaleMandate.mockResolvedValue(mandat(Array.from({ length: 12 }, (_, i) => offre(i + 1))));
    mount();
    const barre = await screen.findByRole('search', { name: 'Rechercher dans les offres' }, T);
    expect(within(barre).getByText('12 résultats')).toBeInTheDocument();
    await user.type(within(barre).getByPlaceholderText('Numéro, acquéreur, financement…'), 'Acquéreur 11');
    await waitFor(() => expect(screen.queryByText('OA-0001')).not.toBeInTheDocument(), T);
    expect(screen.getByText('OA-0011')).toBeInTheDocument();
    expect(screen.getByTestId('adresse')).toHaveTextContent('off.q=');
  });
});
