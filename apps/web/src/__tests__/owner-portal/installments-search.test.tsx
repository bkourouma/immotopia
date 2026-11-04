import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Installments from '../../pages/OwnerPortal/Installments';

/**
 * Échéances du portail propriétaire : liste paginée par le serveur, pilotée par
 * la barre de recherche (état dans l'URL, paramètres envoyés au service).
 */

const getInstallments = vi.hoisted(() => vi.fn());
const getProperties = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/ownerPortalService', () => ({
  ownerPortalService: {
    getInstallments: (...args: unknown[]) => getInstallments(...args),
    getProperties: (...args: unknown[]) => getProperties(...args)
  }
}));

const ECHEANCE = {
  id: 'i1',
  propertyAddress: 'Villa Angré',
  tenantName: 'Awa Traoré',
  period: '2026-10',
  dueDate: '2026-10-05',
  penaltyAmount: 0,
  paidAmount: 0,
  amount: 150000,
  status: 'DUE'
};

const reponse = (installments: unknown[]) => ({
  data: {
    success: true,
    data: {
      installments,
      summary: {
        total: installments.length,
        due: installments.length,
        overdue: 0,
        paid: 0,
        totalAmount: 150000,
        dueAmount: 150000
      },
      pagination: { page: 1, limit: 20, total: installments.length, totalPages: 1 }
    }
  }
});

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function renderPage(initial = '/owner/installments') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path="/owner/installments" element={<Installments />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const T = { timeout: 8000 };

beforeEach(() => {
  getInstallments.mockReset();
  getProperties.mockReset();
  getInstallments.mockResolvedValue(reponse([ECHEANCE]));
  getProperties.mockResolvedValue({
    data: { success: true, data: { properties: [{ id: 'p1', address: 'Villa Angré' }] } }
  });
});

describe('Échéances propriétaire : recherche multicritères', () => {
  it('charge la première page sans critère et ne demande les biens qu’une fois', async () => {
    renderPage();
    expect(await screen.findByText('Awa Traoré', undefined, T)).toBeInTheDocument();
    expect(getInstallments).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(getProperties).toHaveBeenCalledTimes(1);
  });

  it('envoie la saisie au service après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Awa Traoré', undefined, T);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'traore');
    await vi.waitFor(
      () => expect(getInstallments).toHaveBeenLastCalledWith({ search: 'traore', page: 1, limit: 20 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('q=traore');
  });

  it('applique les critères d’une URL partagée', async () => {
    renderPage('/owner/installments?status=DUE,OVERDUE&periodFrom=2026-01-01&periodTo=2026-12-31');
    await screen.findByText('Awa Traoré', undefined, T);
    expect(getInstallments).toHaveBeenCalledWith({
      status: 'DUE,OVERDUE',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      page: 1,
      limit: 20
    });
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    getInstallments.mockImplementation(async (params: Record<string, unknown>) =>
      reponse(params.search ? [] : [ECHEANCE])
    );
    renderPage('/owner/installments?q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('Awa Traoré', undefined, T)).toBeInTheDocument();
    expect(getInstallments).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
  });
});
