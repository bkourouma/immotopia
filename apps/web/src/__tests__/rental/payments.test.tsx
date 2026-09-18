import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Payments } from '../../pages/rental/Payments';

/**
 * Paiements — les garanties de l'écran.
 *
 * `userEvent` est configuré sans délai, et les `findBy*` portent un délai
 * explicite : monter des `<Tabs>` et une `<Modal>` d'Ant Design dans jsdom coûte
 * cher, et le défaut d'une seconde de Testing Library échoue sous charge
 * parallèle sans rien dire du code.
 */

const listPayments = vi.fn();
const createPayment = vi.fn();
const allocatePayment = vi.fn();

const listLeases = vi.fn();

vi.mock('../../services/rental-service', () => ({
  listPayments: (...a: unknown[]) => listPayments(...a),
  listLeases: (...a: unknown[]) => listLeases(...a),
  createPayment: (...a: unknown[]) => createPayment(...a),
  allocatePayment: (...a: unknown[]) => allocatePayment(...a),
  RentalPaymentStatus: {},
  RentalPaymentMethod: {}
}));

vi.mock('../../components/rental/PaymentForm', () => ({ PaymentForm: () => <div>formulaire de saisie</div> }));
vi.mock('../../components/rental/AllocatePaymentForm', () => ({
  AllocatePaymentForm: ({ onSubmit }: { onSubmit: (d: unknown) => void }) => (
    <button onClick={() => onSubmit({ installmentIds: ['ech-1'] })}>valider l’affectation</button>
  )
}));
vi.mock('../../components/rental/PaymentDeclarationsList', () => ({
  PaymentDeclarationsList: () => <div>liste des déclarations</div>
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function paiement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    tenant_id: 'agence-1',
    lease_id: 'bail-1',
    amount: 1_000_000,
    currency: 'GNF',
    method: 'CASH',
    status: 'PENDING',
    initiated_at: '2026-05-06T09:30:00.000Z',
    allocations: [],
    depositMovements: [],
    created_at: '',
    updated_at: '',
    ...overrides
  };
}

/** Sonde d'adresse : le test vérifie qu'on NE quitte PAS l'écran. */
function Adresse() {
  const location = useLocation();
  return <span data-testid="adresse">{location.pathname}</span>;
}

function mount(paiements: unknown[], url = '/tenant/agence-1/rental/payments') {
  listPayments.mockResolvedValue({
    success: true,
    data: paiements,
    pagination: { page: 1, limit: 50, total: paiements.length, totalPages: 1 }
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/rental/payments" element={<Payments />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  allocatePayment.mockResolvedValue({ success: true });
});

describe('Paiements — montant affecté', () => {
  it('compte un paiement entièrement versé au dépôt comme affecté', async () => {
    // Le cas que la duplication du calcul rendait fragile : ce paiement n'a
    // AUCUNE allocation, tout est parti au dépôt de garantie. Un calcul qui ne
    // sommerait que les allocations l'annoncerait comme entièrement à affecter,
    // et proposerait de l'affecter une seconde fois.
    mount([
      paiement({
        amount: 2_500_000,
        allocations: [],
        depositMovements: [{ id: 'd1', amount: 2_500_000 }]
      })
    ]);

    expect(await screen.findByText('Affecté', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Affecter' })).not.toBeInTheDocument();
  });

  it('additionne allocations ET mouvements de dépôt', async () => {
    mount([
      paiement({
        amount: 1_000_000,
        allocations: [{ id: 'a1', amount: 300_000 }],
        depositMovements: [{ id: 'd1', amount: 200_000 }]
      })
    ]);

    // 1 000 000 − (300 000 + 200 000) = 500 000.
    const restes = await screen.findAllByText(/500\s000\sGNF/, {}, { timeout: 8000 });
    expect(restes.length).toBeGreaterThan(0);
  });

  it('propose d’affecter tant qu’il reste quelque chose', async () => {
    mount([paiement({ allocations: [{ id: 'a1', amount: 400_000 }] })]);
    expect(await screen.findByRole('button', { name: 'Affecter' }, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('Paiements — affectation', () => {
  it('NE quitte PAS l’écran après une affectation réussie', async () => {
    // L'ancienne version renvoyait vers la liste globale des échéances, y
    // compris depuis l'onglet d'un bail : on se retrouvait ailleurs sans
    // l'avoir demandé, et il fallait revenir pour affecter le suivant.
    const user = userEvent.setup({ delay: null });
    mount([paiement()]);

    await user.click(await screen.findByRole('button', { name: 'Affecter' }, { timeout: 8000 }));
    await user.click(await screen.findByText('valider l’affectation'));

    await waitFor(() => expect(allocatePayment).toHaveBeenCalled());
    expect(screen.getByTestId('adresse')).toHaveTextContent('/tenant/agence-1/rental/payments');
  });
});

describe('Paiements — état dans l’URL', () => {
  it('restaure le filtre de statut depuis l’adresse', async () => {
    mount([paiement()], '/tenant/agence-1/rental/payments?status=SUCCESS');
    await waitFor(() => expect(listPayments).toHaveBeenCalled());
    expect(listPayments.mock.calls[0][1]).toMatchObject({ status: 'SUCCESS' });
  });

  it('restaure l’onglet des déclarations depuis l’adresse', async () => {
    // Un lien vers les déclarations en attente doit être partageable, et le
    // retour depuis le détail d'un paiement doit retrouver l'onglet d'origine.
    mount([paiement()], '/tenant/agence-1/rental/payments?onglet=declarations');
    expect(await screen.findByText('liste des déclarations', {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('n’envoie pas de statut quand aucun filtre n’est posé', async () => {
    mount([paiement()]);
    await waitFor(() => expect(listPayments).toHaveBeenCalled());
    expect(listPayments.mock.calls[0][1].status).toBeUndefined();
  });
});

describe('Paiements — filtre par locataire', () => {
  beforeEach(() => {
    listLeases.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'bail-1',
          lease_number: 'BAIL-2026-0001',
          primaryRenter: { id: 'cli-1', user: { fullName: 'Mariam Diomandé' } }
        },
        {
          id: 'bail-2',
          lease_number: 'BAIL-2026-0002',
          primaryRenter: { id: 'cli-2', user: { fullName: 'Seydou Traoré' } }
        }
      ],
      pagination: { page: 1, limit: 500, total: 2, totalPages: 1 }
    });
  });

  it('transmet le locataire choisi à l’API', async () => {
    // Le filtre vit dans l'URL : un écran filtré doit être partageable.
    mount([], '/tenant/agence-1/rental/payments?renterClientId=cli-2');
    await waitFor(() => expect(listPayments).toHaveBeenCalled(), { timeout: 8000 });
    expect(listPayments.mock.calls[0][1]).toMatchObject({ renterClientId: 'cli-2' });
  });

  it('nomme le bail et le payeur sur chaque ligne', async () => {
    // Sans ces deux colonnes, la liste montre un montant et une date sans
    // jamais dire qui a payé quoi.
    mount([
      paiement({
        lease: { id: 'bail-2', lease_number: 'BAIL-2026-0002', property: { id: 'b2', title: 'Entrepôt Treichville' } },
        renterClient: { id: 'cli-2', user: { fullName: 'Seydou Traoré' } }
      })
    ]);
    expect(await screen.findByText('BAIL-2026-0002', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Entrepôt Treichville')).toBeInTheDocument();
    expect(screen.getByText('Seydou Traoré')).toBeInTheDocument();
  });
});
