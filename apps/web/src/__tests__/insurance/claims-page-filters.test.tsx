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

const POLICES = [
  { id: 'pol-1', propertyId: 'prop-1', propertyReference: 'BIEN-0001', insurer: 'Saham', policyNumber: '123' },
  { id: 'pol-2', propertyId: 'prop-2', propertyReference: 'BIEN-0002', insurer: 'NSIA', policyNumber: '456' }
];

function monter(url: string) {
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
  get.mockImplementation((url: string) =>
    Promise.resolve({ data: { success: true, data: url.includes('/insurance/policies') ? POLICES : [] } })
  );
});

describe('Page Sinistres : filtres bien et police (BUG-2026-10-02-012)', () => {
  it('propose les filtres Bien et Police en plus du statut', async () => {
    monter('/tenant/agence-1/patrimoine/claims');
    expect(await screen.findByLabelText('Bien', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByLabelText('Police')).toBeInTheDocument();
    expect(screen.getByLabelText('Statut')).toBeInTheDocument();
  });

  it('transmet le bien et la police de l’URL à l’API', async () => {
    monter('/tenant/agence-1/patrimoine/claims?propertyId=prop-1&policyId=pol-1');
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        '/tenants/agence-1/patrimoine/insurance/claims?propertyId=prop-1&policyId=pol-1&limit=500'
      )
    );
  });
});

describe('Page Sinistres : droits (BUG-2026-10-02-010)', () => {
  it('un 403 affiche un refus clair au lieu de « Impossible de charger les sinistres »', async () => {
    get.mockRejectedValue({ response: { status: 403, data: { message: 'Permission denied' } } });
    monter('/tenant/agence-1/patrimoine/claims');
    expect(await screen.findByText('Accès non autorisé', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Impossible de charger les sinistres.')).not.toBeInTheDocument();
  });
});
