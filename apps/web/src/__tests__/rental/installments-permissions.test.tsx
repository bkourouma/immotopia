import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Installments } from '../../pages/rental/Installments';
import { canOfferPaymentLink } from '../../components/rental/InstallmentPaymentLinkButton';

/**
 * Échéances d'un bail — BUG-2026-11-03-011 (boutons d'écriture visibles pour un
 * profil en lecture seule) et constats (a) lien de paiement sur un brouillon,
 * (b) action « Voir » absente d'une échéance non soldée.
 */

const listInstallments = vi.fn();
let permissions: Set<string> | null = null;

vi.mock('../../services/rental-service', () => ({
  listInstallments: (...a: unknown[]) => listInstallments(...a),
  listLeases: vi.fn(),
  createPayment: vi.fn(),
  allocatePayment: vi.fn(),
  recalculateInstallmentStatuses: vi.fn(),
  calculatePenalties: vi.fn(),
  generateInstallments: vi.fn(),
  deleteAllInstallments: vi.fn(),
  RentalPaymentMethod: { CASH: 'CASH' },
  RentalInstallmentStatus: {}
}));
vi.mock('../../components/rental/PaymentForm', () => ({ PaymentForm: () => null }));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set(), enabled: new Set(), permissions, ready: true })
}));

function echeance(status: string) {
  return {
    id: 'ech-1',
    tenant_id: 'agence-1',
    lease_id: 'bail-1',
    period_year: 2026,
    period_month: 4,
    due_date: '2026-04-05T00:00:00.000Z',
    status,
    currency: 'XOF',
    amount_rent: 100000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    created_at: '',
    updated_at: ''
  };
}

async function monter(status = 'DUE') {
  listInstallments.mockResolvedValue({
    success: true,
    data: [echeance(status)],
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/rental/leases/bail-1/installments']}>
          <Routes>
            <Route path="/tenant/:tenantId/rental/leases/:leaseId/installments" element={<Installments />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
  await screen.findByText('04/2026', undefined, { timeout: 8000 });
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions = null;
});

describe('Échéances — profil en lecture seule', () => {
  it('masque générer, supprimer, encaisser, paiement et lien de paiement', async () => {
    permissions = new Set(['RENTAL_INSTALLMENTS_VIEW', 'RENTAL_PAYMENTS_VIEW']);
    await monter('OVERDUE');
    expect(screen.queryByRole('button', { name: /Générer les échéances/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Autres actions/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Encaisser/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Paiement…/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Envoyer un lien de paiement/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Voir/ })).toBeTruthy();
  });

  it('garde toutes les actions pour un profil complet', async () => {
    permissions = new Set([
      'RENTAL_INSTALLMENTS_VIEW',
      'RENTAL_INSTALLMENTS_GENERATE',
      'RENTAL_PAYMENTS_CREATE',
      'RENTAL_PAYMENTS_ALLOCATE'
    ]);
    await monter('OVERDUE');
    expect(screen.getByRole('button', { name: /Générer les échéances/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Encaisser/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Paiement…/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Envoyer un lien de paiement/ })).toBeTruthy();
  });

  it('propose « Voir » sur une échéance non soldée', async () => {
    await monter('OVERDUE');
    expect(screen.getByRole('button', { name: /Voir/ })).toBeTruthy();
  });
});

describe('Lien de paiement — échéance exigible seulement', () => {
  it.each([
    ['DRAFT', false],
    ['CANCELED', false],
    ['DUE', true],
    ['PARTIAL', true],
    ['OVERDUE', true]
  ])('statut %s -> %s', (statut, attendu) => {
    expect(canOfferPaymentLink(100, statut)).toBe(attendu);
  });

  it.each([
    ['ACTIVE', true],
    ['SUSPENDED', false],
    ['ENDED', false],
    ['CANCELED', false]
  ])('échéance en retard sur un bail %s -> %s', (statut, attendu) => {
    expect(canOfferPaymentLink(100, 'OVERDUE', statut)).toBe(attendu);
  });
});
