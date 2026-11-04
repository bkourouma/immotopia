import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Leases from '../../pages/OwnerPortal/Leases';
import Properties from '../../pages/OwnerPortal/Properties';
import Deposits from '../../pages/OwnerPortal/Deposits';
import Revenues from '../../pages/OwnerPortal/Revenues';

/**
 * Baux, biens, dépôts et revenus du portail propriétaire : listes reçues en
 * entier, filtrées et paginées en local par la barre de recherche (état dans
 * l'URL, appel au service sans filtre).
 */

const getLeases = vi.hoisted(() => vi.fn());
const getProperties = vi.hoisted(() => vi.fn());
const getDeposits = vi.hoisted(() => vi.fn());
const getDepositMovements = vi.hoisted(() => vi.fn());
const getRevenueSummary = vi.hoisted(() => vi.fn());
const getRevenuesByProperty = vi.hoisted(() => vi.fn());
const getRevenuesByMonth = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/ownerPortalService', () => ({
  ownerPortalService: {
    getLeases: (...args: unknown[]) => getLeases(...args),
    getProperties: (...args: unknown[]) => getProperties(...args),
    getDeposits: (...args: unknown[]) => getDeposits(...args),
    getDepositMovements: (...args: unknown[]) => getDepositMovements(...args),
    getRevenueSummary: (...args: unknown[]) => getRevenueSummary(...args),
    getRevenuesByProperty: (...args: unknown[]) => getRevenuesByProperty(...args),
    getRevenuesByMonth: (...args: unknown[]) => getRevenuesByMonth(...args)
  }
}));
// Le graphique (recharts) n'a rien à voir avec la recherche du tableau.
vi.mock('../../components/OwnerPortal/RevenueChart', () => ({ RevenueChart: () => <div>graphique</div> }));

const T = { timeout: 8000 };
const ok = (data: unknown) => ({ data: { success: true, data } });

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function renderPage(element: React.ReactElement, initial: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path="/owner/*" element={element} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const barre = () => within(screen.getByRole('search')).getByRole('textbox');
const effacerDernier = () => {
  const boutons = screen.getAllByRole('button', { name: 'Effacer les critères' });
  return boutons[boutons.length - 1];
};

beforeEach(() => {
  vi.clearAllMocks();
  getProperties.mockResolvedValue(
    ok({
      properties: [
        { id: 'p1', address: 'Villa Angré' },
        { id: 'p2', address: 'Studio Plateau' }
      ],
      summary: { total: 2, rented: 1, available: 1, inMaintenance: 0 }
    })
  );
});

describe('Baux propriétaire : recherche locale', () => {
  const bail = (id: string, propertyAddress: string, tenantName: string, status = 'ACTIVE') => ({
    id,
    propertyAddress,
    tenantName,
    startDate: '2026-01-01',
    endDate: null,
    monthlyRent: 150000,
    status
  });
  const reponse = ok({
    leases: [
      { ...bail('l1', 'Villa Angré', 'Awa Traoré'), propertyId: 'p1' },
      { ...bail('l2', 'Studio Plateau', 'Koffi Yao', 'ENDED'), propertyId: 'p2' }
    ],
    summary: { active: 1, ended: 1, suspended: 0 }
  });

  it('appelle le service sans filtre et filtre les lignes en local', async () => {
    const user = userEvent.setup();
    getLeases.mockResolvedValue(reponse);
    renderPage(<Leases />, '/owner/leases');
    expect(await screen.findByText(/Awa Traoré/, undefined, T)).toBeInTheDocument();
    expect(getLeases).toHaveBeenCalledWith();
    await user.type(barre(), 'koffi');
    await vi.waitFor(() => expect(screen.queryByText(/Awa Traoré/)).not.toBeInTheDocument(), T);
    expect(screen.getByText(/Koffi Yao/)).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('q=koffi');
  });

  it('applique l’URL initiale (statut) et efface les critères', async () => {
    const user = userEvent.setup();
    getLeases.mockResolvedValue(reponse);
    renderPage(<Leases />, '/owner/leases?status=ENDED');
    expect(await screen.findByText(/Koffi Yao/, undefined, T)).toBeInTheDocument();
    expect(screen.queryByText(/Awa Traoré/)).not.toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[0]);
    expect(await screen.findByText(/Awa Traoré/, undefined, T)).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).not.toContain('status=');
  });

  it('filtre par bien (identifiant)', async () => {
    getLeases.mockResolvedValue(reponse);
    renderPage(<Leases />, '/owner/leases?propertyId=p2');
    expect(await screen.findByText(/Koffi Yao/, undefined, T)).toBeInTheDocument();
    expect(screen.queryByText(/Awa Traoré/)).not.toBeInTheDocument();
  });

  it('filtre par bien sur l’identifiant : deux lots de même adresse ne se confondent pas', async () => {
    getProperties.mockResolvedValue(
      ok({
        properties: [
          { id: 'p1', address: 'Résidence Soleil' },
          { id: 'p2', address: 'Résidence Soleil' }
        ],
        summary: { total: 2, rented: 2, available: 0, inMaintenance: 0 }
      })
    );
    getLeases.mockResolvedValue(
      ok({
        leases: [
          { ...bail('l1', 'Résidence Soleil', 'Awa Traoré'), propertyId: 'p1' },
          { ...bail('l2', 'Résidence Soleil', 'Koffi Yao'), propertyId: 'p2' }
        ],
        summary: { active: 2, ended: 0, suspended: 0 }
      })
    );
    renderPage(<Leases />, '/owner/leases?propertyId=p2');
    expect(await screen.findByText(/Koffi Yao/, undefined, T)).toBeInTheDocument();
    expect(screen.queryByText(/Awa Traoré/)).not.toBeInTheDocument();
  });
});

describe('Biens propriétaire : recherche locale', () => {
  const bien = (id: string, address: string, status: string, tenantName: string) => ({
    id,
    address,
    propertyType: 'APPARTEMENT',
    status,
    transactionModes: ['RENTAL'],
    currentLease: {
      id: `l-${id}`,
      tenantName,
      startDate: '2026-01-01',
      endDate: null,
      monthlyRent: 1,
      status: 'ACTIVE'
    }
  });
  const reponse = ok({
    properties: [
      bien('p1', 'Villa Angré', 'RENTED', 'Awa Traoré'),
      bien('p2', 'Studio Plateau', 'AVAILABLE', 'Koffi Yao')
    ],
    summary: { total: 2, rented: 1, available: 1, inMaintenance: 0 }
  });

  it('filtre les cartes par adresse', async () => {
    const user = userEvent.setup();
    getProperties.mockResolvedValue(reponse);
    renderPage(<Properties />, '/owner/properties');
    expect(await screen.findByText('Villa Angré', undefined, T)).toBeInTheDocument();
    expect(getProperties).toHaveBeenCalledWith();
    await user.type(barre(), 'plateau');
    await vi.waitFor(() => expect(screen.queryByText('Villa Angré')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Studio Plateau')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('q=plateau');
  });

  it('applique le statut de l’URL et propose d’effacer quand rien ne correspond', async () => {
    const user = userEvent.setup();
    getProperties.mockResolvedValue(reponse);
    renderPage(<Properties />, '/owner/properties?status=RESERVED');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    await user.click(effacerDernier());
    expect(await screen.findByText('Villa Angré', undefined, T)).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).not.toContain('status=');
  });
});

describe('Dépôts propriétaire : recherche locale', () => {
  const depot = (id: string, propertyAddress: string, tenantName: string, status: string) => ({
    id,
    propertyAddress,
    tenantName,
    depositAmount: 300000,
    currentHeldAmount: 300000,
    status
  });
  const reponse = ok({
    deposits: [
      depot('d1', 'Villa Angré', 'Awa Traoré', 'HELD'),
      depot('d2', 'Studio Plateau', 'Koffi Yao', 'REFUNDED')
    ],
    summary: { total: 2, totalHeld: 300000, totalReleased: 300000 }
  });

  it('filtre par locataire en local', async () => {
    const user = userEvent.setup();
    getDeposits.mockResolvedValue(reponse);
    renderPage(<Deposits />, '/owner/deposits');
    expect(await screen.findByText('Awa Traoré', undefined, T)).toBeInTheDocument();
    await user.type(barre(), 'koffi');
    await vi.waitFor(() => expect(screen.queryByText('Awa Traoré')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Koffi Yao')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('q=koffi');
  });

  it('applique le statut de l’URL puis efface', async () => {
    const user = userEvent.setup();
    getDeposits.mockResolvedValue(reponse);
    renderPage(<Deposits />, '/owner/deposits?status=REFUNDED');
    expect(await screen.findByText('Koffi Yao', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('Awa Traoré')).not.toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[0]);
    expect(await screen.findByText('Awa Traoré', undefined, T)).toBeInTheDocument();
  });
});

describe('Revenus propriétaire : recherche locale du tableau par bien', () => {
  beforeEach(() => {
    getRevenueSummary.mockResolvedValue(
      ok({ currentMonth: 1, lastMonth: 1, currentYear: 1, lastYear: 1, allTime: 1, averageMonthly: 1 })
    );
    getRevenuesByMonth.mockResolvedValue(ok([]));
    getRevenuesByProperty.mockResolvedValue(
      ok([
        { propertyId: 'p1', propertyAddress: 'Villa Angré', revenue: 100000, paymentCount: 2 },
        { propertyId: 'p2', propertyAddress: 'Studio Plateau', revenue: 50000, paymentCount: 1 }
      ])
    );
  });

  it('filtre le tableau sans relancer le calcul des revenus', async () => {
    const user = userEvent.setup();
    renderPage(<Revenues />, '/owner/revenues');
    expect(await screen.findByRole('table', undefined, T)).toBeInTheDocument();
    expect(screen.getByText('Villa Angré')).toBeInTheDocument();
    const appels = getRevenuesByProperty.mock.calls.length;
    await user.type(barre(), 'plateau');
    await vi.waitFor(() => expect(screen.queryByText('Villa Angré')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Studio Plateau')).toBeInTheDocument();
    expect(getRevenuesByProperty.mock.calls.length).toBe(appels);
    expect(screen.getByTestId('url').textContent).toContain('q=plateau');
  });

  it('applique l’URL initiale et efface', async () => {
    const user = userEvent.setup();
    renderPage(<Revenues />, '/owner/revenues?q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    await user.click(effacerDernier());
    expect(await screen.findByText('Villa Angré', undefined, T)).toBeInTheDocument();
  });
});
