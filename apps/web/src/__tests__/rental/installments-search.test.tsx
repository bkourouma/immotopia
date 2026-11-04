import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Installments } from '../../pages/rental/Installments';

/**
 * Échéances — recherche multicritères (serveur) : page autonome sans préfixe,
 * onglet d'un bail avec le préfixe `ech`.
 */

const listInstallments = vi.hoisted(() => vi.fn());
const listLeases = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../services/rental-service', () => ({
  listInstallments: (...a: unknown[]) => listInstallments(...a),
  listLeases: (...a: unknown[]) => listLeases(...a),
  createPayment: vi.fn(),
  allocatePayment: vi.fn(),
  recalculateInstallmentStatuses: vi.fn(),
  calculatePenalties: vi.fn(),
  generateInstallments: vi.fn(),
  deleteAllInstallments: vi.fn(),
  RentalPaymentMethod: { CASH: 'CASH' }
}));

vi.mock('../../services/property-service', () => ({ listProperties: vi.fn(), getProperty: vi.fn() }));
vi.mock('../../components/rental/PaymentForm', () => ({ PaymentForm: () => null }));

const ECHEANCE = {
  id: 'ech-1',
  tenant_id: 'agence-1',
  lease_id: 'bail-1',
  period_year: 2026,
  period_month: 4,
  due_date: '2026-04-05T00:00:00.000Z',
  status: 'OVERDUE',
  currency: 'XOF',
  amount_rent: 1_250_000,
  amount_service: 0,
  amount_other_fees: 0,
  penalty_amount: 0,
  amount_paid: 0,
  lease: {
    id: 'bail-1',
    lease_number: 'BAIL-2026-0001',
    property: { id: 'p1', title: 'Villa Angré' },
    primaryRenter: { id: 'c1', user: { fullName: 'Aissatou Kouassi' } }
  }
};

const reponse = (data: unknown[]) => ({
  success: true,
  data,
  pagination: { page: 1, limit: 50, total: data.length, totalPages: 1 }
});

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function monter(initial: string, element: React.ReactElement, path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path={path} element={element} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const page = (initial = '/tenant/agence-1/rental/installments') =>
  monter(initial, <Installments />, '/tenant/:tenantId/rental/installments');
const onglet = (initial = '/tenant/agence-1/rental/leases/bail-1') =>
  monter(initial, <Installments leaseId="bail-1" />, '/tenant/:tenantId/rental/leases/:leaseId');

const T = { timeout: 8000 };

beforeEach(() => {
  vi.clearAllMocks();
  listInstallments.mockResolvedValue(reponse([ECHEANCE]));
  listLeases.mockResolvedValue({ success: true, data: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 1 } });
});

describe('Échéances : recherche multicritères', () => {
  it('envoie la saisie au service après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    page();
    await screen.findByText('BAIL-2026-0001', undefined, T);
    expect(listInstallments.mock.calls[0][1]).toMatchObject({ page: 1, limit: 50 });
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'Kouassi');
    await vi.waitFor(
      () => expect(listInstallments.mock.calls.at(-1)?.[1]).toMatchObject({ search: 'Kouassi', page: 1, limit: 50 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('q=Kouassi');
  });

  it('applique les critères d’une URL partagée', async () => {
    page(
      '/tenant/agence-1/rental/installments?status=PARTIAL&overdue=1&dueFrom=2026-01-01&dueTo=2026-03-31&renterClientId=c1'
    );
    await screen.findByText('BAIL-2026-0001', undefined, T);
    expect(listInstallments.mock.calls[0][1]).toMatchObject({
      status: 'PARTIAL',
      overdue: 'true',
      dueFrom: '2026-01-01',
      dueTo: '2026-03-31',
      renterClientId: 'c1',
      page: 1,
      limit: 50
    });
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    listInstallments.mockImplementation(async (_t: string, p: Record<string, unknown>) =>
      reponse(p.search ? [] : [ECHEANCE])
    );
    page('/tenant/agence-1/rental/installments?q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('BAIL-2026-0001', undefined, T)).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
  });

  it('onglet d’un bail : préfixe ech, zone nommée, pas de critère locataire', async () => {
    const user = userEvent.setup();
    onglet();
    const zone = await screen.findByRole('search', { name: 'Rechercher dans les échéances' }, T);
    await user.type(within(zone).getByRole('textbox'), 'avril');
    await vi.waitFor(
      () => expect(listInstallments.mock.calls.at(-1)?.[1]).toMatchObject({ leaseId: 'bail-1', search: 'avril' }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('ech.q=avril');
    expect(listLeases).not.toHaveBeenCalled();
  });
});
