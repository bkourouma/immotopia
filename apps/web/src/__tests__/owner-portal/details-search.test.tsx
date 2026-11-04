import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import LeaseDetails from '../../pages/OwnerPortal/LeaseDetails';
import PatrimoinePropertyDetails from '../../pages/OwnerPortal/PatrimoinePropertyDetails';
import PropertyDetails from '../../pages/OwnerPortal/PropertyDetails';

/**
 * Détails (bail, bien patrimonial, bien) : les listes d'un onglet sont reçues en
 * entier et filtrées en local par une barre propre à l'onglet (préfixe d'URL).
 */

const getLeaseDetails = vi.hoisted(() => vi.fn());
const getPropertyDetailsOwner = vi.hoisted(() => vi.fn());
const getPropertyDetailsPatrimoine = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/ownerPortalService', () => ({
  ownerPortalService: {
    getLeaseDetails: (...args: unknown[]) => getLeaseDetails(...args),
    getPropertyDetails: (...args: unknown[]) => getPropertyDetailsOwner(...args)
  }
}));
vi.mock('../../services/owner-portal-patrimoine-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/owner-portal-patrimoine-service')>(
    '../../services/owner-portal-patrimoine-service'
  );
  return {
    ...actual,
    ownerPortalPatrimoineService: {
      ...actual.ownerPortalPatrimoineService,
      getPropertyDetails: (...a: unknown[]) => getPropertyDetailsPatrimoine(...a)
    }
  };
});

const T = { timeout: 8000 };

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function renderRoute(path: string, element: React.ReactElement, initial: string) {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[initial]}>
        <Url />
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

const barre = (nom: string) => within(screen.getByRole('search', { name: nom })).getAllByRole('textbox')[0];
const effacerDernier = () => {
  const boutons = screen.getAllByRole('button', { name: 'Effacer les critères' });
  return boutons[boutons.length - 1];
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Détail d’un bail : recherche locale par onglet', () => {
  const echeance = (id: string, mois: number, status: string, due: string) => ({
    id,
    period_year: 2026,
    period_month: mois,
    due_date: due,
    status,
    amount_rent: 100000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0
  });
  const bail = () => ({
    success: true,
    data: {
      lease: {
        id: 'l1',
        lease_number: 'BAIL-001',
        start_date: '2026-01-01',
        end_date: null,
        rent_amount: 100000,
        service_charge_amount: 0,
        security_deposit_amount: 0,
        status: 'ACTIVE',
        property: { id: 'p1', address: 'Villa Angré', title: 'Villa' },
        primaryRenter: { user: { fullName: 'Awa Traoré', email: 'awa@example.com' } },
        coRenters: []
      },
      installments: [
        echeance('i1', 1, 'PAID', '2026-01-05'),
        echeance('i2', 2, 'OVERDUE', '2026-02-05'),
        echeance('i3', 3, 'DUE', '2026-03-05')
      ],
      paymentHistory: [
        { id: 'pay1', amount: 100000, succeeded_at: '2026-01-06T10:00:00Z', method: 'CASH', allocations: [] },
        { id: 'pay2', amount: 250000, succeeded_at: '2026-02-07T10:00:00Z', method: 'MOBILE_MONEY', allocations: [] }
      ],
      balance: { totalDue: 0, totalPaid: 0, remaining: 0 },
      deposit: null
    }
  });
  const monter = (tab: string, extra = '') =>
    renderRoute('/owner/leases/:id', <LeaseDetails />, `/owner/leases/l1?tab=${tab}${extra}`);

  it('échéances : filtre par statut venu de l’URL, puis efface', async () => {
    const user = userEvent.setup();
    getLeaseDetails.mockResolvedValue({ data: bail() });
    monter('installments', '&ech.statut=OVERDUE');
    expect(await screen.findByText('2026-02', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('2026-01')).not.toBeInTheDocument();
    expect(screen.getByRole('search', { name: 'Rechercher dans les échéances' })).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[0]);
    expect(await screen.findByText('2026-01', undefined, T)).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).not.toContain('ech.statut');
  });

  it('échéances : la saisie filtre les lignes et s’écrit avec le préfixe ech', async () => {
    const user = userEvent.setup();
    getLeaseDetails.mockResolvedValue({ data: bail() });
    monter('installments');
    expect(await screen.findByText('2026-01', undefined, T)).toBeInTheDocument();
    await user.type(barre('Rechercher dans les échéances'), '2026-03');
    await vi.waitFor(() => expect(screen.queryByText('2026-01')).not.toBeInTheDocument(), T);
    expect(screen.getByText('2026-03')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('ech.q=2026-03');
  });

  it('paiements : filtre par méthode de l’URL', async () => {
    getLeaseDetails.mockResolvedValue({ data: bail() });
    monter('payments', '&pai.methode=MOBILE_MONEY');
    expect(await screen.findByRole('search', { name: 'Rechercher dans les paiements' }, T)).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getAllByText(/250/).length).toBeGreaterThan(0), T);
    expect(screen.queryByText(/100\s000/)).not.toBeInTheDocument();
  });
});

describe('Détail patrimoine : recherche locale des travaux', () => {
  const travail = (id: string, title: string, status: string) => ({
    id,
    title,
    status,
    plannedDate: '2026-03-01',
    completedDate: null,
    estimatedCost: 1_000_000,
    actualCost: null,
    currency: 'XOF'
  });
  const details = () => ({
    sections: { valuation: false, yield: false, loans: false, works: true, documents: true },
    property: {
      id: 'prop-1',
      title: 'Villa Cocody',
      address: 'Rue des Jardins',
      city: 'Abidjan',
      ownerSharePercent: null
    },
    works: [travail('w1', 'Réfection toiture', 'PLANNED'), travail('w2', 'Peinture façade', 'COMPLETED')],
    documents: [
      {
        id: 'd1',
        documentType: 'TITLE_DEED',
        fileName: 'titre-foncier.pdf',
        fileSize: 1,
        mimeType: 'application/pdf',
        expirationDate: null,
        createdAt: '2026-01-01',
        downloadPath: '/x'
      },
      {
        id: 'd2',
        documentType: 'INSURANCE',
        fileName: 'assurance.pdf',
        fileSize: 1,
        mimeType: 'application/pdf',
        expirationDate: null,
        createdAt: '2026-01-02',
        downloadPath: '/y'
      }
    ]
  });
  const monter = (tab: string, extra = '') =>
    renderRoute(
      '/owner/patrimoine/:propertyId',
      <PatrimoinePropertyDetails />,
      `/owner/patrimoine/prop-1?tab=${tab}${extra}`
    );

  it('travaux : la saisie filtre et s’écrit avec le préfixe trv', async () => {
    const user = userEvent.setup();
    getPropertyDetailsPatrimoine.mockResolvedValue(details());
    monter('travaux');
    expect(await screen.findByText('Réfection toiture', undefined, T)).toBeInTheDocument();
    await user.type(barre('Rechercher dans les travaux'), 'peinture');
    await vi.waitFor(() => expect(screen.queryByText('Réfection toiture')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Peinture façade')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('trv.q=peinture');
  });

  it('travaux : applique le statut de l’URL puis efface', async () => {
    const user = userEvent.setup();
    getPropertyDetailsPatrimoine.mockResolvedValue(details());
    monter('travaux', '&trv.status=COMPLETED');
    expect(await screen.findByText('Peinture façade', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('Réfection toiture')).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Effacer les critères' })[0]);
    expect(await screen.findByText('Réfection toiture', undefined, T)).toBeInTheDocument();
  });

  it('documents : filtre sur le nom du fichier et propose d’effacer', async () => {
    const user = userEvent.setup();
    getPropertyDetailsPatrimoine.mockResolvedValue(details());
    monter('documents', '&doc.q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    await user.click(effacerDernier());
    expect(await screen.findByText('titre-foncier.pdf', undefined, T)).toBeInTheDocument();
    expect(screen.getByText('assurance.pdf')).toBeInTheDocument();
  });
});

describe('Détail d’un bien : recherche locale de l’historique de maintenance', () => {
  const ticket = (id: string, title: string) => ({
    id,
    title,
    category: 'PLOMBERIE',
    priority: 'HIGH',
    status: 'RESOLVED',
    created_at: '2026-02-01'
  });
  const bien = () => ({
    data: {
      success: true,
      data: {
        property: {
          id: 'p1',
          address: 'Villa Angré',
          title: 'Villa',
          propertyType: 'APPARTEMENT',
          status: 'RENTED',
          transactionModes: ['RENTAL'],
          description: '',
          media: [],
          documents: []
        },
        currentLease: null,
        leaseHistory: [],
        revenueStats: { totalReceived: 0, currentMonth: 0, averageMonthly: 0 },
        maintenanceHistory: [ticket('t1', 'Fuite évier'), ticket('t2', 'Serrure cassée')]
      }
    }
  });

  it('filtre les tickets et écrit la saisie avec le préfixe mnt', async () => {
    const user = userEvent.setup();
    getPropertyDetailsOwner.mockResolvedValue(bien());
    renderRoute('/owner/properties/:id', <PropertyDetails />, '/owner/properties/p1?tab=maintenance');
    expect(await screen.findByText('Fuite évier', undefined, T)).toBeInTheDocument();
    await user.type(barre("Rechercher dans l'historique de maintenance"), 'serrure');
    await vi.waitFor(() => expect(screen.queryByText('Fuite évier')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Serrure cassée')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('mnt.q=serrure');
  });

  it('applique l’URL initiale et efface', async () => {
    const user = userEvent.setup();
    getPropertyDetailsOwner.mockResolvedValue(bien());
    renderRoute('/owner/properties/:id', <PropertyDetails />, '/owner/properties/p1?tab=maintenance&mnt.q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    await user.click(effacerDernier());
    expect(await screen.findByText('Fuite évier', undefined, T)).toBeInTheDocument();
  });
});
