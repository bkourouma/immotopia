import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Leases } from '../../pages/rental/Leases';

/**
 * Baux — recherche multicritères (serveur) : saisie → service + URL, URL initiale,
 * « Effacer les critères ».
 */

const listLeases = vi.hoisted(() => vi.fn());
const deleteLease = vi.hoisted(() => vi.fn());
const getProperty = vi.hoisted(() => vi.fn());
const listProperties = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../services/rental-service', () => ({
  listLeases: (...a: unknown[]) => listLeases(...a),
  deleteLease: (...a: unknown[]) => deleteLease(...a),
  RentalLeaseStatus: {}
}));

vi.mock('../../services/property-service', () => ({
  listProperties: (...a: unknown[]) => listProperties(...a),
  getProperty: (...a: unknown[]) => getProperty(...a)
}));

const BAIL = {
  id: 'bail-1',
  lease_number: 'BAIL-2026-0001',
  status: 'ACTIVE',
  start_date: '2026-01-01T00:00:00.000Z',
  end_date: '2026-12-31T00:00:00.000Z',
  currency: 'XOF',
  rent_amount: 1_250_000,
  property: { id: 'prop-1', internalReference: 'BIEN-0001', address: 'Angré', title: 'Villa Angré' },
  primaryRenter: { id: 'c1', user: { id: 'u2', fullName: 'Aissatou Kouassi', email: 'a@b.c' } }
};

const reponse = (data: unknown[]) => ({
  success: true,
  data,
  pagination: { page: 1, limit: 20, total: data.length, totalPages: 1 }
});

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function monter(initial = '/tenant/agence-1/rental/leases') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path="/tenant/:tenantId/rental/leases" element={<Leases />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const T = { timeout: 8000 };
const appelsDeLaListe = () => listLeases.mock.calls.filter(([, f]) => f && 'page' in f);

beforeEach(() => {
  vi.clearAllMocks();
  listLeases.mockResolvedValue(reponse([BAIL]));
  getProperty.mockResolvedValue({ id: 'prop-1', title: 'Villa Angré', internalReference: 'BIEN-0001' });
  listProperties.mockResolvedValue({ properties: [] });
});

describe('Baux : recherche multicritères', () => {
  it('charge la première page sans critère, avec la barre de recherche', async () => {
    monter();
    expect(await screen.findByText('BAIL-2026-0001', undefined, T)).toBeInTheDocument();
    expect(appelsDeLaListe()[0][1]).toEqual({ page: 1, limit: 20 });
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('envoie la saisie au service après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('BAIL-2026-0001', undefined, T);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'Kouassi');
    await vi.waitFor(() => expect(appelsDeLaListe().at(-1)?.[1]).toMatchObject({ search: 'Kouassi', page: 1 }), T);
    expect(screen.getByTestId('url').textContent).toContain('q=Kouassi');
  });

  it('applique les critères d’une URL partagée (clés existantes conservées)', async () => {
    monter('/tenant/agence-1/rental/leases?q=2026&status=ACTIVE&primaryRenterClientId=c1&propertyId=prop-1');
    await screen.findByText('BAIL-2026-0001', undefined, T);
    expect(appelsDeLaListe()[0][1]).toEqual({
      search: '2026',
      status: 'ACTIVE',
      primaryRenterClientId: 'c1',
      propertyId: 'prop-1',
      page: 1,
      limit: 20
    });
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    listLeases.mockImplementation(async (_t: string, p: Record<string, unknown>) => reponse(p.search ? [] : [BAIL]));
    monter('/tenant/agence-1/rental/leases?q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('BAIL-2026-0001', undefined, T)).toBeInTheDocument();
    expect(appelsDeLaListe().at(-1)?.[1]).toEqual({ page: 1, limit: 20 });
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
  });
});
