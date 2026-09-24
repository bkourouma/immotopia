import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SaleMandateDetail } from '../../pages/sales/SaleMandateDetail';

/**
 * Fiche mandat — décision sur une offre (lot 9, PRD §5.3).
 *
 * La contre-offre exige un montant : `decideSaleOffer` ne doit pas partir
 * sans lui, et l'écran doit le dire plutôt que d'échouer en silence.
 *
 * `SaleMandateDetail.tsx` importe cinq exports de `sales-service` : les cinq
 * doivent figurer dans le mock (AGENTS.md, Vitest refuse un import non
 * déclaré). Les sélecteurs d'acquéreur et d'affaire CRM (`crm-service`) ne
 * sont sollicités que si la modale « Nouvelle offre » s'ouvre — hors du
 * périmètre de ce test — et restent donc non mockés, sans conséquence.
 */

const getSaleMandate = vi.fn();
const decideSaleOffer = vi.fn();
const createSaleOffer = vi.fn();
const createSaleAgreementFromOffer = vi.fn();
const revokeSaleMandate = vi.fn();

vi.mock('../../services/sales-service', () => ({
  getSaleMandate: (...a: unknown[]) => getSaleMandate(...a),
  decideSaleOffer: (...a: unknown[]) => decideSaleOffer(...a),
  createSaleOffer: (...a: unknown[]) => createSaleOffer(...a),
  createSaleAgreementFromOffer: (...a: unknown[]) => createSaleAgreementFromOffer(...a),
  revokeSaleMandate: (...a: unknown[]) => revokeSaleMandate(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function mandateDetail(overrides: Record<string, unknown> = {}) {
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
    notes: null,
    openOffersCount: 1,
    offersCount: 1,
    agreementId: null,
    agreementStatus: null,
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
    coSellers: [],
    agreements: [],
    commission: null,
    offers: [
      {
        id: 'offer-1',
        number: 'OA-2026-0001',
        mandateId: 'mandate-1',
        buyerContactId: 'contact-1',
        buyerName: 'Moussa Diallo',
        dealId: null,
        amount: 45_000_000,
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
        createdAt: '2026-09-05'
      }
    ],
    ...overrides
  };
}

function mount(url = '/tenant/agence-1/sales/mandates/mandate-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
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

describe('Fiche mandat — décision sur une offre', () => {
  it('refuse la contre-offre sans montant', async () => {
    getSaleMandate.mockResolvedValue(mandateDetail());
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    mount();

    await screen.findByText('OA-2026-0001', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Contre-offre' }));

    await screen.findByText('Montant de la contre-offre', {}, { timeout: 8000 });
    await user.click(screen.getByText('Confirmer'));

    expect(
      await screen.findByText('Indiquez le montant de la contre-offre.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(decideSaleOffer).not.toHaveBeenCalled();
  });

  it('envoie la contre-offre une fois le montant saisi', async () => {
    getSaleMandate.mockResolvedValue(mandateDetail());
    decideSaleOffer.mockResolvedValue({ ...mandateDetail().offers[0], status: 'COUNTERED', counterAmount: 48_000_000 });
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    mount();

    await screen.findByText('OA-2026-0001', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Contre-offre' }));

    const champMontant = await screen.findByRole('spinbutton', {}, { timeout: 8000 });
    await user.type(champMontant, '48000000');
    await user.click(screen.getByText('Confirmer'));

    await waitFor(() =>
      expect(decideSaleOffer).toHaveBeenCalledWith(
        'agence-1',
        'offer-1',
        expect.objectContaining({ action: 'COUNTER', counterAmount: 48_000_000 })
      )
    );
  });

  it('exige un motif pour refuser une offre', async () => {
    getSaleMandate.mockResolvedValue(mandateDetail());
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    mount();

    await screen.findByText('OA-2026-0001', {}, { timeout: 8000 });
    await user.click(screen.getByText('Refuser'));

    await screen.findByText('Motif', {}, { timeout: 8000 });
    await user.click(screen.getByText('Confirmer'));

    expect(
      await screen.findByText('Indiquez un motif d’au moins 3 caractères.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(decideSaleOffer).not.toHaveBeenCalled();
  });
});
