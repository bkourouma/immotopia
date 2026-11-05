import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TenantPayments from '../../pages/TenantPortal/Payments';

/**
 * Portail locataire — paiement en ligne (Lot 7, contrat
 * `docs/finance/LOT-7-CONTRAT-PAIEMENT-EN-LIGNE.md` §3.3 et §5) : bouton
 * absent si indisponible, redirection vers `checkoutUrl`, reprise d'un
 * checkout `PENDING` sur 409, et suivi du retour `?paiement=<code>` jusqu'à un
 * état définitif.
 *
 * `tenantPortalService` n'a qu'un seul export (l'objet lui-même) : le mock
 * repart de l'implémentation réelle (`importOriginal`) et ne remplace que les
 * deux méthodes exercées ici, pour que Vitest ne se plaigne pas d'un export
 * manquant si un composant enfant en appelle une autre.
 */

const getInstallments = vi.fn();
const getPaymentHistory = vi.fn();

vi.mock('../../services/tenantPortalService', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/tenantPortalService')>();
  return {
    tenantPortalService: {
      ...actual.tenantPortalService,
      getInstallments: (...a: unknown[]) => getInstallments(...a),
      getPaymentHistory: (...a: unknown[]) => getPaymentHistory(...a)
    }
  };
});

const getOnlinePaymentAvailability = vi.fn();
const createOnlinePaymentCheckout = vi.fn();
const getOnlinePaymentCheckout = vi.fn();

vi.mock('../../services/payment-gateway-service', () => ({
  getOnlinePaymentAvailability: (...a: unknown[]) => getOnlinePaymentAvailability(...a),
  createOnlinePaymentCheckout: (...a: unknown[]) => createOnlinePaymentCheckout(...a),
  getOnlinePaymentCheckout: (...a: unknown[]) => getOnlinePaymentCheckout(...a)
}));

function installment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ech-1',
    period: '05/2026',
    dueDate: '2026-05-05',
    amount: 50_000,
    paid: 0,
    balance: 50_000,
    status: 'DUE',
    items: [],
    payments: [],
    ...overrides
  };
}

function mount(url = '/tenant/payments') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/payments" element={<TenantPayments />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

// jsdom rend `window.location.assign` non configurable : la redirection passe
// par un module dédié (`utils/external-redirect`), remplacé ici.
const assignMock = vi.fn();
vi.mock('../../utils/external-redirect', () => ({
  redirectToExternalUrl: (url: string) => assignMock(url)
}));

/** Deux pages d'échéances : ech-1 (50 000) en page 1, ech-2 (30 000) en page 2. */
function reponsePage(page: number) {
  const ligne =
    page === 1 ? installment() : installment({ id: 'ech-2', period: '06/2026', amount: 30_000, balance: 30_000 });
  return {
    data: {
      success: true,
      data: {
        installments: [ligne],
        summary: { total: 2, paid: 0, due: 2, overdue: 0, partial: 0 },
        pagination: { page, limit: 20, total: 40, totalPages: 2 }
      }
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getInstallments.mockImplementation(async (params: { page?: number }) => reponsePage(params?.page ?? 1));
  getPaymentHistory.mockResolvedValue({
    data: {
      success: true,
      data: { payments: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }, totalPaid: 0 }
    }
  });
  getOnlinePaymentAvailability.mockResolvedValue({ available: true, mode: 'LIVE', feesPaidBy: 'AGENCY' });
  createOnlinePaymentCheckout.mockResolvedValue({ checkoutUrl: 'https://checkout.example.com' });
});

async function selectionnerSurDeuxPages(user: ReturnType<typeof userEvent.setup>) {
  mount();
  await screen.findByText('05/2026', {}, { timeout: 8000 });
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Sélectionner 05/2026' }));
  await user.click(await screen.findByTitle('2'));
  await screen.findByText('06/2026', {}, { timeout: 8000 });
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Sélectionner 06/2026' }));
}

const normaliser = (texte: string | null) => (texte ?? '').replace(/[^0-9]/g, '');

describe('Portail locataire — sélection des échéances sur plusieurs pages', () => {
  it('additionne les échéances de deux pages et envoie exactement ces ids', async () => {
    const user = userEvent.setup();
    await selectionnerSurDeuxPages(user);

    await waitFor(() => expect(screen.getByText('2 échéance(s) sélectionnée(s)')).toBeInTheDocument());
    expect(normaliser(screen.getByText(/Total à payer/).textContent)).toContain('80000');

    fireEvent.click(screen.getByRole('button', { name: 'Payer en ligne' }));
    await waitFor(() => expect(createOnlinePaymentCheckout).toHaveBeenCalledTimes(1));
    expect([...createOnlinePaymentCheckout.mock.calls[0][0]].sort()).toEqual(['ech-1', 'ech-2']);
  }, 300_000);

  it('conserve la sélection quand on change de page', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('05/2026', {}, { timeout: 8000 });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Sélectionner 05/2026' }));
    await user.click(await screen.findByTitle('2'));
    await screen.findByText('06/2026', {}, { timeout: 8000 });

    expect(screen.getByText('1 échéance(s) sélectionnée(s)')).toBeInTheDocument();
    expect(normaliser(screen.getByText(/Total à payer/).textContent)).toContain('50000');
  });

  it('vide la sélection quand un critère de recherche change', async () => {
    const user = userEvent.setup();
    await selectionnerSurDeuxPages(user);
    await screen.findByText('2 échéance(s) sélectionnée(s)');

    await user.type(
      within(screen.getByRole('search', { name: 'Rechercher dans les échéances' })).getByPlaceholderText(
        'Période, libellé…'
      ),
      'juin'
    );

    await waitFor(() => expect(screen.queryByText(/échéance\(s\) sélectionnée\(s\)/)).not.toBeInTheDocument(), {
      timeout: 8000
    });
    expect(screen.getByText('Sélectionnez une ou plusieurs échéances à régler en ligne.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Payer en ligne' })).toBeDisabled());
  });

  it("recale le montant d'une échéance sélectionnée quand la liste est rechargée", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('05/2026', {}, { timeout: 8000 });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Sélectionner 05/2026' }));
    expect(normaliser(screen.getByText(/Total à payer/).textContent)).toContain('50000');

    getInstallments.mockImplementation(async (params: { page?: number }) =>
      (params?.page ?? 1) === 1
        ? {
            data: {
              success: true,
              data: { ...reponsePage(1).data.data, installments: [installment({ balance: 20_000 })] }
            }
          }
        : reponsePage(2)
    );
    await user.click(await screen.findByTitle('2'));
    await screen.findByText('06/2026', {}, { timeout: 8000 });
    await user.click(await screen.findByTitle('1'));
    await screen.findByText('05/2026', {}, { timeout: 8000 });

    await waitFor(() => expect(normaliser(screen.getByText(/Total à payer/).textContent)).toBe('20000'));
    expect(screen.getByText('1 échéance(s) sélectionnée(s)')).toBeInTheDocument();
  }, 300_000);

  it('retire de la sélection une échéance qui revient soldée', async () => {
    const user = userEvent.setup();
    await selectionnerSurDeuxPages(user);
    await screen.findByText('2 échéance(s) sélectionnée(s)');

    getInstallments.mockImplementation(async (params: { page?: number }) =>
      (params?.page ?? 1) === 1
        ? {
            data: {
              success: true,
              data: { ...reponsePage(1).data.data, installments: [installment({ balance: 0, status: 'PAID' })] }
            }
          }
        : reponsePage(2)
    );
    await user.click(await screen.findByTitle('1'));
    await screen.findByText('05/2026', {}, { timeout: 8000 });

    await waitFor(() => expect(screen.getByText('1 échéance(s) sélectionnée(s)')).toBeInTheDocument());
    expect(normaliser(screen.getByText(/Total à payer/).textContent)).toBe('30000');
  }, 300_000);

  it('désactive les cases non cochées à 24 échéances sélectionnées et affiche le message', async () => {
    const lignes = Array.from({ length: 25 }, (_, n) =>
      installment({ id: `ech-${n + 1}`, period: `P${String(n + 1).padStart(2, '0')}`, balance: 1000, amount: 1000 })
    );
    getInstallments.mockImplementation(async (params: { page?: number }) => {
      const page = params?.page ?? 1;
      return {
        data: {
          success: true,
          data: {
            installments: page === 1 ? lignes.slice(0, 20) : lignes.slice(20),
            summary: { total: 25, paid: 0, due: 25, overdue: 0, partial: 0 },
            pagination: { page, limit: 20, total: 25, totalPages: 2 }
          }
        }
      };
    });
    const user = userEvent.setup();
    mount();
    await screen.findByText('P01', {}, { timeout: 8000 });
    // « Tout sélectionner » : 20 lignes de la page 1, puis seulement 4 des 5 de la page 2.
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    await user.click(await screen.findByTitle('2'));
    await screen.findByText('P21', {}, { timeout: 8000 });
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    await waitFor(() => expect(screen.getByText('24 échéance(s) sélectionnée(s)')).toBeInTheDocument());
    expect(screen.getByText('24 échéances au plus par paiement en ligne.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Sélectionner P25' })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner P24' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Sélectionner P25' })).toBeEnabled());
    expect(screen.queryByText('24 échéances au plus par paiement en ligne.')).not.toBeInTheDocument();
  }, 300_000);
});
