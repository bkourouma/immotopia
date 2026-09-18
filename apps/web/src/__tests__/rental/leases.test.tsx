import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Leases } from '../../pages/rental/Leases';

/**
 * Baux — les garanties de l'écran.
 *
 * Le défaut central se compte, il ne se voit pas : le champ de recherche avait
 * **deux déclencheurs**. Taper puis valider — le geste naturel — lançait deux
 * requêtes identiques.
 */

const listLeases = vi.fn();
const deleteLease = vi.fn();

vi.mock('../../services/rental-service', () => ({
  listLeases: (...a: unknown[]) => listLeases(...a),
  deleteLease: (...a: unknown[]) => deleteLease(...a),
  RentalLeaseStatus: {}
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function bail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bail-1',
    tenant_id: 'agence-1',
    property_id: 'prop-1',
    primary_renter_client_id: 'c1',
    lease_number: 'BAIL-2026-0001',
    status: 'ACTIVE',
    start_date: '2026-01-01T00:00:00.000Z',
    end_date: '2026-12-31T00:00:00.000Z',
    currency: 'GNF',
    rent_amount: 1_250_000,
    service_charge_amount: 0,
    security_deposit_amount: 0,
    penalty_grace_days: 0,
    penalty_mode: 'PERCENT_OF_BALANCE',
    penalty_rate: 0,
    penalty_fixed_amount: 0,
    billing_frequency: 'MONTHLY',
    due_day_of_month: 5,
    created_by_user_id: 'u1',
    created_at: '',
    updated_at: '',
    property: { id: 'prop-1', internalReference: 'BIEN-0001', address: 'Kipé', title: 'Villa Kipé' },
    primaryRenter: {
      id: 'c1',
      userId: 'u2',
      clientType: 'RENTER',
      user: { id: 'u2', fullName: 'Aissatou Diallo', email: 'a@b.c' }
    },
    ...overrides
  };
}

function monter(url = '/tenant/agence-1/rental/leases') {
  listLeases.mockResolvedValue({
    success: true,
    data: [bail()],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/rental/leases" element={<Leases />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Appels de la LISTE, par opposition à ceux qui alimentent le filtre.
 *
 * L'écran interroge `listLeases` deux fois pour deux raisons distinctes : la
 * liste paginée que l'on regarde, et la liste complète dont on tire les options
 * du filtre « locataire ». Seule la première dépend de la recherche — compter
 * les appels bruts mélangerait les deux et ferait échouer le test pour une
 * raison qui n'a rien à voir avec ce qu'il vérifie.
 */
const appelsDeLaListe = () => listLeases.mock.calls.filter(([, filtres]) => filtres && 'page' in filtres);

describe('Baux — un seul déclencheur de recherche', () => {
  it('ne relance pas deux fois la même requête quand on tape puis valide', async () => {
    // L'ancienne version appelait `onChange` ET `onSearch` : le premier
    // relançait l'effet, le second refaisait la requête avec les mêmes
    // paramètres.
    const user = userEvent.setup({ delay: null });
    monter();
    await waitFor(() => expect(appelsDeLaListe()).toHaveLength(1));

    const champ = await screen.findByLabelText('Rechercher un bail', {}, { timeout: 8000 });
    await user.type(champ, 'BAIL-2026');
    await user.keyboard('{Enter}');

    // Après le silence de 250 ms, un SEUL appel supplémentaire.
    await waitFor(() => expect(appelsDeLaListe().at(-1)?.[1]).toMatchObject({ search: 'BAIL-2026' }), {
      timeout: 3000
    });
    expect(appelsDeLaListe()).toHaveLength(2);
  });

  it('ne recharge pas les options du filtre à chaque frappe', async () => {
    // La liste complète sert uniquement à peupler le sélecteur de locataires.
    // La recharger à chaque caractère tapé serait neuf requêtes pour rien.
    const user = userEvent.setup({ delay: null });
    monter();
    await waitFor(() => expect(listLeases).toHaveBeenCalled());

    const champ = await screen.findByLabelText('Rechercher un bail', {}, { timeout: 8000 });
    await user.type(champ, 'BAIL-2026');

    await waitFor(() => expect(appelsDeLaListe().at(-1)?.[1]).toMatchObject({ search: 'BAIL-2026' }), {
      timeout: 3000
    });
    const appelsDuFiltre = listLeases.mock.calls.filter(([, f]) => f && !('page' in f));
    expect(appelsDuFiltre).toHaveLength(1);
  });

  it('restaure la recherche depuis l’URL', async () => {
    monter('/tenant/agence-1/rental/leases?q=BAIL-2026-0001');
    await waitFor(() => expect(appelsDeLaListe()).not.toHaveLength(0));
    expect(appelsDeLaListe()[0][1]).toMatchObject({ search: 'BAIL-2026-0001' });
  });
});

describe('Baux — montant de référence', () => {
  it('affiche le loyer pour un bien en location', async () => {
    monter();
    const montants = await screen.findAllByText(/1\s250\s000/, {}, { timeout: 8000 });
    expect(montants.length).toBeGreaterThan(0);
  });

  it('affiche le PRIX pour un bien uniquement en vente', async () => {
    // Un bien en vente seule n'a pas de loyer : afficher `rent_amount` y
    // donnerait zéro, ou pire, un montant sans rapport.
    listLeases.mockResolvedValue({
      success: true,
      data: [
        bail({
          rent_amount: 0,
          property: {
            id: 'prop-9',
            internalReference: 'BIEN-0009',
            address: 'Kaloum',
            title: 'Boutique',
            transactionModes: ['SALE'],
            price: 45_000_000,
            currency: 'GNF'
          }
        })
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AntApp>
          <MemoryRouter initialEntries={['/tenant/agence-1/rental/leases']}>
            <Routes>
              <Route path="/tenant/:tenantId/rental/leases" element={<Leases />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    );

    const montants = await screen.findAllByText(/45\s000\s000/, {}, { timeout: 8000 });
    expect(montants.length).toBeGreaterThan(0);
  });
});

describe('Baux — accessibilité des actions', () => {
  it('nomme le menu de chaque ligne par son numéro de bail', async () => {
    // Trois actions en icône seule, avec `Tooltip` : invisibles au clavier et
    // indistinguables d'une ligne à l'autre.
    monter();
    expect(
      await screen.findByRole('button', { name: 'Autres actions pour le bail BAIL-2026-0001' }, { timeout: 8000 })
    ).toBeInTheDocument();
  });
});

describe('Baux — filtre par locataire', () => {
  it('transmet le locataire choisi à l’API', async () => {
    monter('/tenant/agence-1/rental/leases?primaryRenterClientId=cli-2');
    await waitFor(() => expect(appelsDeLaListe()).not.toHaveLength(0), { timeout: 8000 });
    expect(appelsDeLaListe()[0][1]).toMatchObject({ primaryRenterClientId: 'cli-2' });
  });
});
