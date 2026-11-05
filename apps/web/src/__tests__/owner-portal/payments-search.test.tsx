import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Payments from '../../pages/OwnerPortal/Payments';

/**
 * Paiements du portail propriétaire : liste paginée par le serveur, pilotée par
 * la barre de recherche (état dans l'URL, paramètres envoyés au service).
 */

const getPayments = vi.hoisted(() => vi.fn());
const getProperties = vi.hoisted(() => vi.fn());
const getPaymentDetails = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/ownerPortalService', () => ({
  ownerPortalService: {
    getPayments: (...args: unknown[]) => getPayments(...args),
    getProperties: (...args: unknown[]) => getProperties(...args),
    getPaymentDetails: (...args: unknown[]) => getPaymentDetails(...args)
  }
}));

const PAIEMENT = {
  id: 'pay1',
  propertyAddress: 'Villa Angré',
  tenantName: 'Awa Traoré',
  amount: 150000,
  date: '2026-10-05T09:30:00.000Z',
  method: 'MOBILE_MONEY',
  status: 'SUCCESS'
};

const reponse = (payments: unknown[]) => ({
  data: {
    success: true,
    data: {
      payments,
      summary: { total: payments.length, totalAmount: 150000, thisMonth: 1, thisYear: 1 },
      pagination: { page: 1, limit: 20, total: payments.length, totalPages: 1 }
    }
  }
});

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function renderPage(initial = '/owner/payments') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path="/owner/payments" element={<Payments />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const T = { timeout: 8000 };

beforeEach(() => {
  getPayments.mockReset();
  getProperties.mockReset();
  getPaymentDetails.mockReset();
  getPayments.mockResolvedValue(reponse([PAIEMENT]));
  getProperties.mockResolvedValue({
    data: { success: true, data: { properties: [{ id: 'p1', address: 'Villa Angré' }] } }
  });
});

describe('Paiements propriétaire : recherche multicritères', () => {
  it('charge la première page sans critère et ne demande les biens qu’une fois', async () => {
    renderPage();
    expect(await screen.findByText('Awa Traoré', undefined, T)).toBeInTheDocument();
    expect(getPayments).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(getProperties).toHaveBeenCalledTimes(1);
  });

  it('envoie la saisie au service après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Awa Traoré', undefined, T);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'OM-123');
    await vi.waitFor(() => expect(getPayments).toHaveBeenLastCalledWith({ search: 'OM-123', page: 1, limit: 20 }), T);
    expect(screen.getByTestId('url').textContent).toContain('q=OM-123');
  });

  it('applique les critères d’une URL partagée', async () => {
    renderPage('/owner/payments?method=CASH,MOBILE_MONEY&periodFrom=2026-01-01');
    await screen.findByText('Awa Traoré', undefined, T);
    expect(getPayments).toHaveBeenCalledWith({
      method: 'CASH,MOBILE_MONEY',
      startDate: '2026-01-01',
      page: 1,
      limit: 20
    });
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    getPayments.mockImplementation(async (params: Record<string, unknown>) => reponse(params.search ? [] : [PAIEMENT]));
    renderPage('/owner/payments?q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('Awa Traoré', undefined, T)).toBeInTheDocument();
    expect(getPayments).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
  });
});
