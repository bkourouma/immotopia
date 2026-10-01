import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InsuranceClaimsPage from '../../pages/insurance/InsuranceClaimsPage';

const get = vi.fn();

vi.mock('../../utils/api-client', () => ({
  default: { get: (...a: unknown[]) => get(...a), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function sinistre(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sin-1',
    propertyId: 'prop-1',
    propertyReference: 'BIEN-0001',
    policyId: 'pol-1',
    policyLabel: 'Saham · n° 123',
    ticketId: null,
    ticketTitle: null,
    expenseId: null,
    occurredAt: '2026-08-10T00:00:00.000Z',
    declaredAt: '2026-08-11T00:00:00.000Z',
    cause: 'WATER_DAMAGE',
    description: 'Fuite',
    status: 'DECLARED',
    claimedAmount: 500000,
    indemnifiedAmount: null,
    deductible: null,
    outOfPocketAmount: null,
    currency: 'XOF',
    rejectionReason: null,
    insurerNotifiedAt: null,
    expertiseAt: null,
    settledAt: null,
    rejectedAt: null,
    closedAt: null,
    allowedNextStatuses: ['INSURER_NOTIFIED'],
    documentsCount: 0,
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
    ...overrides
  };
}

function monter(url = '/tenant/agence-1/patrimoine/claims') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/patrimoine/claims" element={<InsuranceClaimsPage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: { success: true, data: [sinistre()] } });
});

describe('Page Sinistres', () => {
  it('liste les sinistres avec reste à charge « — » avant règlement', async () => {
    monter();
    expect(await screen.findByText('Saham · n° 123', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Dégât des eaux')).toBeInTheDocument();
    expect(screen.getByText('Déclaré')).toBeInTheDocument();
    expect(get.mock.calls[0][0]).toBe('/tenants/agence-1/patrimoine/insurance/claims?limit=500');
    expect(screen.getByRole('link', { name: 'BIEN-0001' })).toHaveAttribute(
      'href',
      '/tenant/agence-1/properties/prop-1'
    );
  });

  it('transmet le statut de l’URL à l’API', async () => {
    monter('/tenant/agence-1/patrimoine/claims?status=SETTLED');
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get.mock.calls[0][0]).toBe('/tenants/agence-1/patrimoine/insurance/claims?status=SETTLED&limit=500');
  });

  it('avertit que la liste est tronquée au plafond de 500 sinistres', async () => {
    const beaucoup = Array.from({ length: 500 }, (_, i) => sinistre({ id: `sin-${i}` }));
    get.mockResolvedValue({ data: { success: true, data: beaucoup } });
    monter();
    expect(
      await screen.findByText(/La liste est limitée aux 500 sinistres/, {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByText('500 sinistres affichés (liste limitée)')).toBeInTheDocument();
  });

  it('n’avertit pas sous le plafond et annonce le total', async () => {
    monter();
    await screen.findByText('Saham · n° 123', {}, { timeout: 8000 });
    expect(screen.queryByText(/La liste est limitée/)).not.toBeInTheDocument();
    expect(screen.getByText('1 sinistre')).toBeInTheDocument();
  });

  it('affiche l’état vide', async () => {
    get.mockResolvedValue({ data: { success: true, data: [] } });
    monter();
    expect(await screen.findByText(/Aucun sinistre/, {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('affiche l’erreur de chargement', async () => {
    get.mockRejectedValue(new Error('boom'));
    monter();
    expect(await screen.findByText('Impossible de charger les sinistres.', {}, { timeout: 8000 })).toBeInTheDocument();
  });
});
