import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
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

function Adresse() {
  return <div data-testid="adresse">{useLocation().search}</div>;
}

const T = { timeout: 8000 };
const PLACEHOLDER = 'Bien, police, assureur, description…';

function sinistre(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    propertyId: 'prop-1',
    propertyReference: 'BIEN-0001',
    policyId: 'pol-1',
    policyLabel: 'Saham · n° 123',
    occurredAt: '2026-08-10T00:00:00.000Z',
    declaredAt: '2026-08-11T00:00:00.000Z',
    cause: 'WATER_DAMAGE',
    description: 'Fuite',
    status: 'DECLARED',
    claimedAmount: 500000,
    indemnifiedAmount: null,
    outOfPocketAmount: null,
    currency: 'XOF',
    ...overrides
  };
}

/** Adresses des appels « liste des sinistres ». */
function appelsSinistres(): string[] {
  return get.mock.calls.map(call => String(call[0])).filter(url => url.includes('/insurance/claims'));
}

function monter(url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
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
    Promise.resolve({
      data: {
        success: true,
        data: url.includes('/insurance/policies') ? POLICES : { items: [], total: 0, page: 1, limit: 25 }
      }
    })
  );
});

describe('Page Sinistres : recherche multicritères (BUG-2026-10-02-012)', () => {
  it('propose le champ libre, le statut et le bien en ligne, la police sous « Plus de critères »', async () => {
    const user = userEvent.setup({ delay: null });
    monter('/tenant/agence-1/patrimoine/claims');
    const barre = await screen.findByRole('search', {}, T);
    expect(within(barre).getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
    expect(within(barre).getByLabelText('Statut')).toBeInTheDocument();
    expect(within(barre).getByLabelText('Bien')).toBeInTheDocument();
    await user.click(within(barre).getByRole('button', { name: /Plus de critères/ }));
    expect(await within(barre).findByLabelText('Police', {}, T)).toBeInTheDocument();
  });

  it('transmet le bien, la police et le statut de l’URL à l’API', async () => {
    monter('/tenant/agence-1/patrimoine/claims?propertyId=prop-1&policyId=pol-1');
    await waitFor(() =>
      expect(appelsSinistres()).toContain(
        '/tenants/agence-1/patrimoine/insurance/claims?propertyId=prop-1&policyId=pol-1&page=1&limit=25'
      )
    );
  });

  it('envoie le champ libre à l’API après le debounce et le met dans l’URL', async () => {
    const user = userEvent.setup({ delay: null });
    monter('/tenant/agence-1/patrimoine/claims');
    await user.type(await screen.findByPlaceholderText(PLACEHOLDER, {}, T), 'fuite');
    await waitFor(
      () =>
        expect(appelsSinistres()).toContain(
          '/tenants/agence-1/patrimoine/insurance/claims?search=fuite&page=1&limit=25'
        ),
      T
    );
    expect(screen.getByTestId('adresse')).toHaveTextContent('q=fuite');
  });

  it('affiche une page serveur et le total annoncé', async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          success: true,
          data: url.includes('/insurance/policies')
            ? POLICES
            : { items: Array.from({ length: 25 }, (_, i) => sinistre(`sin-${i}`)), total: 30, page: 1, limit: 25 }
        }
      })
    );
    monter('/tenant/agence-1/patrimoine/claims');
    const barre = await screen.findByRole('search', {}, T);
    expect(await within(barre).findByText('30 résultats', {}, T)).toBeInTheDocument();
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(25);
  });

  it('« Effacer les critères » retire le champ libre de l’URL et relance la liste complète', async () => {
    const user = userEvent.setup({ delay: null });
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          success: true,
          data: url.includes('/insurance/policies')
            ? POLICES
            : url.includes('search=')
              ? { items: [], total: 0, page: 1, limit: 25 }
              : { items: [sinistre('sin-1')], total: 1, page: 1, limit: 25 }
        }
      })
    );
    monter('/tenant/agence-1/patrimoine/claims?q=zzz');
    const barre = await screen.findByRole('search', {}, T);
    await user.click(await within(barre).findByRole('button', { name: 'Effacer les critères' }, T));
    expect(await screen.findByText('Saham · n° 123', {}, T)).toBeInTheDocument();
    expect(screen.getByTestId('adresse')).not.toHaveTextContent('q=');
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
