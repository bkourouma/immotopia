import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AuthContext from '../../context/AuthContext';
import type { AuthContextType } from '../../types/auth-types';
import { Dashboard } from '../../pages/Dashboard';
import type { TenantDashboard } from '../../services/dashboard-service';

/**
 * Tableau de bord — ce que l'écran doit garantir.
 *
 * Trois invariants, et ce sont eux qui distinguent un poste de travail d'un
 * rapport :
 *
 * 1. **Chaque chiffre mène quelque part.** Une tuile, une ligne de file et une
 *    entrée de légende ouvrent la liste filtrée qui les produit. Le chemin
 *    vient du serveur : le test vérifie qu'il est suivi tel quel, sans être
 *    recomposé côté écran.
 * 2. **Une permission manquante rend `—`, jamais `0`.** Et la tuile
 *    correspondante n'est alors pas cliquable : elle ne peut mener qu'à un
 *    écran interdit.
 * 3. **Les graphiques ne s'empilent pas sous 992 px.** Ils passent en onglets,
 *    un groupe à la fois.
 *
 * Les tracés eux-mêmes ne sont pas testés ici : `ResponsiveContainer` mesure
 * une largeur nulle en jsdom et ne rend aucun `<path>`. Ce qui est vérifié est
 * ce qui reste lisible et atteignable sans le tracé — titres, légendes, liens —
 * c'est-à-dire précisément la couche accessible au clavier.
 */

const TENANT = 'agence-1';

const getTenantDashboard = vi.fn();

vi.mock('../../services/dashboard-service', () => ({
  getTenantDashboard: (...args: unknown[]) => getTenantDashboard(...args)
}));

let estDesktop = true;
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    screens: {},
    active: estDesktop ? 'xl' : 'xs',
    isMobile: !estDesktop,
    isTablet: false,
    isDesktop: estDesktop
  })
}));

function tableau(over: Partial<TenantDashboard> = {}): TenantDashboard {
  const base = `/tenant/${TENANT}`;
  return {
    properties: {
      total: 42,
      published: 30,
      occupancyRate: 61.9,
      byStatus: [
        { key: 'RENTED', count: 24, href: `${base}/properties?status=RENTED` },
        { key: 'AVAILABLE', count: 16, href: `${base}/properties?status=AVAILABLE` },
        { key: 'SOLD', count: 2, href: `${base}/properties?status=SOLD` }
      ],
      byType: [
        { key: 'APPARTEMENT', count: 20, href: `${base}/properties?propertyType=APPARTEMENT` },
        { key: 'MAISON_VILLA', count: 12, href: `${base}/properties?propertyType=MAISON_VILLA` }
      ]
    },
    clients: {
      total: 88,
      byStatus: [
        { key: 'LEAD', count: 50, href: `${base}/crm/contacts?status=LEAD` },
        { key: 'ACTIVE_CLIENT', count: 38, href: `${base}/crm/contacts?status=ACTIVE_CLIENT` }
      ]
    },
    monthlyRevenue: {
      amount: 12_400_000,
      previousAmount: 10_000_000,
      expected: 15_000_000,
      currency: 'FCFA',
      periodStart: '2026-09-01T00:00:00.000Z',
      periodEnd: '2026-10-01T00:00:00.000Z'
    },
    transactions: { total: 14, deals: 9, leases: 5 },
    revenueSeries: [
      { month: '2026-08-01T00:00:00.000Z', encaisse: 9_000_000, attendu: 11_000_000 },
      { month: '2026-09-01T00:00:00.000Z', encaisse: 12_400_000, attendu: 15_000_000 }
    ],
    rental: {
      activeLeases: 5,
      leasesByStatus: [{ key: 'ACTIVE', count: 5, amount: 2_250_000, href: `${base}/rental/leases?status=ACTIVE` }],
      installmentsByStatus: [
        { key: 'OVERDUE', count: 4, amount: 1_850_000, href: `${base}/rental/installments?status=OVERDUE` },
        { key: 'DUE', count: 7, amount: 3_200_000, href: `${base}/rental/installments?status=DUE` }
      ],
      paymentsByMethod: [
        { key: 'MOBILE_MONEY', count: 30, amount: 8_000_000, href: `${base}/rental/payments` },
        { key: 'CASH', count: 12, amount: 4_400_000, href: `${base}/rental/payments` }
      ],
      overdue: { count: 4, amount: 1_850_000 },
      dueThisWeek: { count: 7, amount: 3_200_000 },
      pendingDeclarations: 2
    },
    pipeline: [
      { key: 'NEW', count: 12, amount: 0, href: `${base}/crm/deals?stage=NEW` },
      { key: 'WON', count: 3, amount: 45_000_000, href: `${base}/crm/deals?stage=WON` }
    ],
    maintenance: {
      open: 3,
      byStatus: [{ key: 'DECLARED', count: 3, href: `${base}/admin/maintenance/tickets` }],
      byPriority: [{ key: 'URGENT', count: 1, href: `${base}/admin/maintenance/tickets` }]
    },
    syndic: {
      syndicates: 2,
      lots: 40,
      chargeCallsByStatus: [{ key: 'PAID', count: 10, amount: 5_000_000, href: `${base}/syndics` }],
      recoveryRate: 72.5
    },
    patrimoine: {
      workProgramsByStatus: [
        { key: 'PLANNED', count: 2, amount: 3_000_000, href: `${base}/patrimoine/work-programs?status=PLANNED` }
      ],
      plannedCost: 3_000_000
    },
    workQueue: [
      {
        id: 'installment:e-1',
        kind: 'OVERDUE_INSTALLMENT',
        title: 'BAIL-2026-0184 · Villa Cocody',
        description: '450 000 FCFA · 12 j de retard',
        amount: 450_000,
        currency: 'FCFA',
        occurredAt: '2026-09-03T00:00:00.000Z',
        severity: 'danger',
        href: `${base}/rental/installments/e-1`
      }
    ],
    recentActivity: [
      {
        id: 'payment:p-1',
        type: 'PAYMENT_SUCCEEDED',
        title: 'Paiement encaissé',
        description: '300 000 FCFA - bail BAIL-2026-0183',
        occurredAt: '2026-09-14T10:00:00.000Z',
        href: `${base}/rental/payments/p-1`
      }
    ],
    ...over
  };
}

function auth(over: Partial<AuthContextType> = {}): AuthContextType {
  return {
    user: {
      id: 'user-1',
      email: 'koffi@example.com',
      fullName: 'Koffi N’Guessan',
      avatarUrl: null,
      globalRole: 'USER',
      emailVerified: true,
      isActive: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    },
    isAuthenticated: true,
    isLoading: false,
    error: null,
    tenantMembership: {
      id: 'membership-1',
      tenantId: TENANT,
      tenant: { id: TENANT, name: 'Agence Demo', slug: 'agence-demo' },
      status: 'ACTIVE'
    },
    tenantClient: null,
    isLoadingMembership: false,
    login: async () => undefined,
    logout: async () => undefined,
    register: async () => undefined,
    refreshToken: async () => undefined,
    clearError: () => undefined,
    ...over
  } as unknown as AuthContextType;
}

/** Affiche l'URL atteinte, pour vérifier où mène un clic. */
const Temoin: React.FC = () => {
  const location = useLocation();
  return <div data-testid="url">{`${location.pathname}${location.search}`}</div>;
};

function monter(donnees: TenantDashboard = tableau(), session: Partial<AuthContextType> = {}) {
  getTenantDashboard.mockResolvedValue({ success: true, data: donnees });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <AuthContext.Provider value={auth(session)}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <Routes>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="*" element={<Temoin />} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  estDesktop = true;
  getTenantDashboard.mockReset();
});

describe('Tableau de bord — les chiffres mènent quelque part', () => {
  it('ouvre les échéances en retard depuis la tuile « Impayés »', async () => {
    const utilisateur = userEvent.setup();
    monter();

    const tuile = await screen.findByText('Impayés');
    await utilisateur.click(tuile);

    await waitFor(() =>
      expect(screen.getByTestId('url')).toHaveTextContent(`/tenant/${TENANT}/rental/installments?status=OVERDUE`)
    );
  });

  it('suit le chemin fourni par le serveur depuis la file « à traiter »', async () => {
    const utilisateur = userEvent.setup();
    monter();

    const ligne = await screen.findByRole('link', { name: /BAIL-2026-0184/ });
    await utilisateur.click(ligne);

    await waitFor(() =>
      expect(screen.getByTestId('url')).toHaveTextContent(`/tenant/${TENANT}/rental/installments/e-1`)
    );
  });

  it('rend chaque tranche de camembert atteignable au clavier, par sa légende', async () => {
    monter();

    // La légende du parc : un lien par statut, chiffré et nommé.
    const lien = await screen.findByRole('link', { name: /Loué/ });
    expect(lien).toHaveAttribute('href', `/tenant/${TENANT}/properties?status=RENTED`);
  });
});

describe('Tableau de bord — permissions et états', () => {
  it('rend « — » et retire le lien quand le module est hors de portée', async () => {
    const utilisateur = userEvent.setup();
    monter(tableau({ properties: null, maintenance: null }));

    const tuile = (await screen.findByText('Biens')).closest('.ant-card') as HTMLElement;
    // Pendant le chargement la tuile affiche « … » : la valeur n'est jugée
    // qu'une fois la réponse arrivée, sinon le test passerait sur le squelette.
    await waitFor(() => expect(within(tuile).getByText('—')).toBeInTheDocument());
    expect(within(tuile).getByText('Module non accessible')).toBeInTheDocument();

    // Un zéro se cliquerait vers une liste vide ; un tiret ne mène nulle part.
    await utilisateur.click(tuile);
    expect(screen.queryByTestId('url')).not.toBeInTheDocument();

    // Et la carte de graphique du module absent n'est pas rendue du tout.
    expect(screen.queryByText('Parc par statut')).not.toBeInTheDocument();
  });

  it('annonce une file vide plutôt qu’une liste vide', async () => {
    monter(tableau({ workQueue: [] }));

    expect(await screen.findByText("Rien à traiter aujourd'hui")).toBeInTheDocument();
  });

  it('propose de réessayer quand le chargement échoue', async () => {
    getTenantDashboard.mockRejectedValue(new Error('réseau'));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

    render(
      <QueryClientProvider client={queryClient}>
        <AntApp>
          <AuthContext.Provider value={auth()}>
            <MemoryRouter initialEntries={['/dashboard']}>
              <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </AntApp>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Impossible de charger les indicateurs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('ne lance qu’une seule requête au montage', async () => {
    monter();

    await screen.findByText('Impayés');
    expect(getTenantDashboard).toHaveBeenCalledTimes(1);
    expect(getTenantDashboard).toHaveBeenCalledWith(TENANT);
  });
});

describe('Tableau de bord — disposition', () => {
  it('empile les graphiques en onglets sous 992 px', async () => {
    estDesktop = false;
    monter();

    const onglets = await screen.findAllByRole('tab');
    expect(onglets.map(onglet => onglet.textContent)).toEqual(['Finances', 'Parc', 'Commercial', 'Exploitation']);
  });

  it('pose les graphiques côte à côte au-dessus de 992 px, sans onglets', async () => {
    estDesktop = true;
    monter();

    await screen.findByText('Trésorerie sur 12 mois');
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    // Les neuf cartes de modules, toutes visibles d'un coup.
    expect(screen.getByText('Entonnoir commercial')).toBeInTheDocument();
    expect(screen.getByText('Appels de charges')).toBeInTheDocument();
    expect(screen.getByText('Programmes de travaux')).toBeInTheDocument();
  });
});

describe('Tableau de bord — à qui appartient cet écran', () => {
  const proprietaire = { id: 'client-1', clientType: 'OWNER' } as AuthContextType['tenantClient'];
  const locataire = { id: 'client-2', clientType: 'RENTER' } as AuthContextType['tenantClient'];

  it('garde le collaborateur qui est AUSSI propriétaire d’un bien de son agence', async () => {
    // Le défaut corrigé : cet écran regardait `tenantClient` seul et renvoyait
    // vers `/owner`. Un collaborateur enregistré comme propriétaire n'atteignait
    // donc jamais son tableau de bord, alors que la coquille, elle, lui servait
    // bien la navigation collaborateur. L'appartenance à l'agence l'emporte.
    monter(tableau(), { tenantClient: proprietaire });

    expect(await screen.findByText('Impayés')).toBeInTheDocument();
    expect(screen.queryByTestId('url')).not.toBeInTheDocument();
  });

  it('renvoie au portail propriétaire un client sans appartenance à l’agence', async () => {
    monter(tableau(), { tenantClient: proprietaire, tenantMembership: null });

    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('/owner'));
  });

  it('renvoie au portail locataire un locataire sans appartenance à l’agence', async () => {
    monter(tableau(), { tenantClient: locataire, tenantMembership: null });

    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('/tenant'));
  });
});
