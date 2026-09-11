import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Installments } from '../../pages/rental/Installments';

/**
 * Échéances — les garanties de l'écran « Encaisser ».
 *
 * Les requêtes `findBy*` portent un délai explicite de 8 s. Le défaut de
 * Testing Library est d'une seconde, ce qui suffit isolément mais pas sous la
 * charge parallèle de la suite complète : l'échec était intermittent et ne
 * signalait rien du code. Le même constat avait déjà conduit à relever
 * `testTimeout` dans `vite.config.ts` pour les suites qui montent la coquille.
 *
 * Trois défauts de l'ancienne version ont ici un test qui échoue s'ils
 * reviennent. Le premier est de loin le plus grave : il ne se voit pas à
 * l'écran, il se voit en comptabilité.
 */

const listInstallments = vi.fn();
const createPayment = vi.fn();
const allocatePayment = vi.fn();
const recalculateInstallmentStatuses = vi.fn();
const calculatePenalties = vi.fn();
const generateInstallments = vi.fn();
const deleteAllInstallments = vi.fn();

vi.mock('../../services/rental-service', () => ({
  listInstallments: (...a: unknown[]) => listInstallments(...a),
  createPayment: (...a: unknown[]) => createPayment(...a),
  allocatePayment: (...a: unknown[]) => allocatePayment(...a),
  recalculateInstallmentStatuses: (...a: unknown[]) => recalculateInstallmentStatuses(...a),
  calculatePenalties: (...a: unknown[]) => calculatePenalties(...a),
  generateInstallments: (...a: unknown[]) => generateInstallments(...a),
  deleteAllInstallments: (...a: unknown[]) => deleteAllInstallments(...a),
  RentalPaymentMethod: { CASH: 'CASH' },
  RentalInstallmentStatus: {}
}));

vi.mock('../../components/rental/PaymentForm', () => ({ PaymentForm: () => null }));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function echeance(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ech-1',
    tenant_id: 'agence-1',
    lease_id: 'bail-1',
    period_year: 2026,
    period_month: 4,
    due_date: '2026-04-05T00:00:00.000Z',
    status: 'OVERDUE',
    currency: 'GNF',
    amount_rent: 1_250_000,
    amount_service: 75_000,
    amount_other_fees: 0,
    penalty_amount: 132_500,
    amount_paid: 0,
    created_at: '',
    updated_at: '',
    ...overrides
  };
}

function mount(url = '/tenant/agence-1/rental/leases/bail-1/installments') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/rental/leases/:leaseId/installments" element={<Installments />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listInstallments.mockResolvedValue({
    success: true,
    data: [echeance()],
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
  });
  createPayment.mockResolvedValue({ success: true, data: { id: 'paiement-1' } });
  allocatePayment.mockResolvedValue({ success: true });
});

describe('Échéances — idempotence de l’encaissement', () => {
  it('réutilise la MÊME clé quand un encaissement est retenté', async () => {
    // Le test le plus important du fichier. L'ancienne version concaténait
    // `Date.now()` a la clé : chaque tentative en produisait une nouvelle, donc
    // deux envois du même encaissement créaient DEUX paiements. Risque R6 du
    // §11.1, classé critique — l'erreur se voit en comptabilité, pas à l'écran.
    const user = userEvent.setup({ delay: null });
    createPayment.mockRejectedValueOnce(new Error('réseau coupé'));

    mount();
    const bouton = await screen.findByRole('button', { name: /Encaisser/ }, { timeout: 8000 });

    await user.click(bouton);
    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1));

    // Attendre que le bouton redevienne actionnable. Pendant l'appel, il porte
    // `loading` et Ant Design le désactive : sans délai entre les frappes, le
    // second clic devancerait le re-rendu et serait avalé.
    await waitFor(() => expect(bouton).not.toBeDisabled());

    await user.click(bouton);
    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(2));

    const premiere = createPayment.mock.calls[0][1].idempotencyKey;
    const seconde = createPayment.mock.calls[1][1].idempotencyKey;
    expect(premiere).toBeTruthy();
    expect(seconde).toBe(premiere);
  });

  it('encaisse le reste dû, pénalités comprises', async () => {
    // 1 250 000 de loyer + 75 000 de charges + 132 500 de pénalités.
    const user = userEvent.setup({ delay: null });
    mount();
    await user.click(await screen.findByRole('button', { name: /Encaisser/ }, { timeout: 8000 }));

    await waitFor(() => expect(createPayment).toHaveBeenCalled());
    expect(createPayment.mock.calls[0][1]).toMatchObject({ amount: 1_457_500, method: 'CASH', currency: 'GNF' });
  });

  it('affecte le paiement à l’échéance encaissée', async () => {
    const user = userEvent.setup({ delay: null });
    mount();
    await user.click(await screen.findByRole('button', { name: /Encaisser/ }, { timeout: 8000 }));

    await waitFor(() => expect(allocatePayment).toHaveBeenCalled());
    expect(allocatePayment.mock.calls[0][2]).toEqual({ installmentIds: ['ech-1'] });
  });

  it('n’offre pas d’encaisser une échéance soldée', async () => {
    listInstallments.mockResolvedValue({
      success: true,
      data: [echeance({ status: 'PAID', amount_paid: 1_457_500 })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
    });
    mount();

    expect(await screen.findByText('Payé', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Encaisser/ })).not.toBeInTheDocument();
  });
});

describe('Échéances — ce qui part au montage', () => {
  it('n’écrit RIEN en base au simple affichage de l’écran', async () => {
    // L'ancienne version lançait, sans le dire, un recalcul de statuts et un
    // calcul de pénalités a chaque montage — deux écritures pour une lecture,
    // répétées a chaque aller-retour quand l'écran est monté en onglet.
    mount();
    await screen.findByText('En retard', {}, { timeout: 8000 });

    expect(recalculateInstallmentStatuses).not.toHaveBeenCalled();
    expect(calculatePenalties).not.toHaveBeenCalled();
    expect(generateInstallments).not.toHaveBeenCalled();
  });

  it('ne charge la liste qu’une seule fois', async () => {
    // Deux `useEffect` indépendants déclenchaient chacun un chargement.
    mount();
    await screen.findByText('En retard', {}, { timeout: 8000 });
    expect(listInstallments).toHaveBeenCalledTimes(1);
  });
});

describe('Échéances — filtrage serveur', () => {
  it('transmet le filtre de l’URL au service', async () => {
    mount('/tenant/agence-1/rental/leases/bail-1/installments?overdue=true&status=OVERDUE');

    await waitFor(() => expect(listInstallments).toHaveBeenCalled());
    expect(listInstallments.mock.calls[0][1]).toMatchObject({
      leaseId: 'bail-1',
      status: 'OVERDUE',
      overdue: true,
      page: 1,
      limit: 50
    });
  });

  it('n’envoie pas `overdue: false` quand le filtre est absent', async () => {
    // Envoyer `false` filtrerait sur « pas en retard » au lieu de ne pas
    // filtrer : un serveur qui distingue les deux ne renverrait pas la même
    // chose.
    mount();
    await waitFor(() => expect(listInstallments).toHaveBeenCalled());
    expect(listInstallments.mock.calls[0][1].overdue).toBeUndefined();
  });
});
