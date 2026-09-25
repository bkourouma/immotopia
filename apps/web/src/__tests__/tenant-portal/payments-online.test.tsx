import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
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

function checkout(overrides: Record<string, unknown> = {}) {
  return {
    id: 'checkout-1',
    codePaiement: 'IMT-CODE1',
    status: 'PENDING' as const,
    amount: 50_000,
    currency: 'FCFA',
    installmentIds: ['ech-1'],
    checkoutUrl: 'https://backend.example.com/api/payment-gateway/simulator/IMT-CODE1',
    providerServiceName: null,
    failureMessage: null,
    paymentId: 'pay-1',
    createdAt: '2026-05-06T09:00:00.000Z',
    completedAt: null,
    ...overrides
  };
}

/** Sonde d'adresse : vérifie que `?paiement=` est bien retiré une fois traité. */
function Adresse() {
  const location = useLocation();
  return <span data-testid="adresse">{`${location.pathname}${location.search}`}</span>;
}

function mount(url = '/tenant/payments') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
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

beforeEach(() => {
  vi.clearAllMocks();

  getInstallments.mockResolvedValue({
    data: {
      success: true,
      data: {
        installments: [installment()],
        summary: { total: 1, paid: 0, due: 1, overdue: 0, partial: 0 },
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
      }
    }
  });
  getPaymentHistory.mockResolvedValue({
    data: {
      success: true,
      data: { payments: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }, totalPaid: 0 }
    }
  });
  getOnlinePaymentAvailability.mockResolvedValue({ available: false, mode: null, feesPaidBy: null });
});

describe('Portail locataire — sélection et paiement en ligne', () => {
  it("n'affiche pas le bouton « Payer en ligne » quand le paiement en ligne est indisponible", async () => {
    mount();

    await screen.findByText('05/2026', {}, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: 'Payer en ligne' })).not.toBeInTheDocument();
  });

  it('redirige vers checkoutUrl après sélection d’une échéance', async () => {
    getOnlinePaymentAvailability.mockResolvedValue({ available: true, mode: 'SIMULATOR', feesPaidBy: 'CLIENT' });
    createOnlinePaymentCheckout.mockResolvedValue(checkout());

    mount();

    await screen.findByText('05/2026', {}, { timeout: 8000 });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Sélectionner 05/2026' }));

    const boutonPayer = await screen.findByRole('button', { name: 'Payer en ligne' });
    expect(boutonPayer).not.toBeDisabled();
    fireEvent.click(boutonPayer);

    await waitFor(() => expect(createOnlinePaymentCheckout).toHaveBeenCalledWith(['ech-1']));
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(checkout().checkoutUrl));
  });

  it('reprend un checkout déjà en cours sur un refus 409', async () => {
    getOnlinePaymentAvailability.mockResolvedValue({ available: true, mode: 'LIVE', feesPaidBy: 'AGENCY' });
    createOnlinePaymentCheckout.mockRejectedValue({
      response: {
        status: 409,
        data: {
          success: false,
          message: 'Un paiement est déjà en cours',
          data: { codePaiement: 'IMT-EXIST', checkoutUrl: 'https://ancien-checkout' }
        }
      }
    });

    mount();

    await screen.findByText('05/2026', {}, { timeout: 8000 });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Sélectionner 05/2026' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Payer en ligne' }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith('https://ancien-checkout'));
  });
});

describe('Portail locataire — suivi du retour PaySecureHub', () => {
  it('affiche « Paiement confirmé » et recharge échéances et historique au succès', async () => {
    getOnlinePaymentCheckout.mockResolvedValue(checkout({ status: 'SUCCESS' }));

    mount('/tenant/payments?paiement=IMT-CODE1');

    expect(await screen.findByText('Paiement confirmé.', {}, { timeout: 8000 })).toBeInTheDocument();

    await waitFor(() => expect(getInstallments.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(getPaymentHistory.mock.calls.length).toBeGreaterThan(1));

    // Le paramètre est retiré une fois le paiement traité.
    await waitFor(() => expect(screen.getByTestId('adresse').textContent).toBe('/tenant/payments'));
  });

  it("affiche le message d'échec du paiement", async () => {
    getOnlinePaymentCheckout.mockResolvedValue(checkout({ status: 'FAILED', failureMessage: 'Solde insuffisant' }));

    mount('/tenant/payments?paiement=IMT-CODE1');

    expect(await screen.findByText('Le paiement a échoué.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Solde insuffisant')).toBeInTheDocument();
    // Un échec ne recharge pas l'historique : rien n'a changé côté agence.
    expect(getInstallments.mock.calls.length).toBe(1);
  });

  it('affiche « en cours de vérification par l’agence » pour un statut REVIEW', async () => {
    getOnlinePaymentCheckout.mockResolvedValue(checkout({ status: 'REVIEW' }));

    mount('/tenant/payments?paiement=IMT-CODE1');

    expect(
      await screen.findByText('En cours de vérification par l’agence.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
  });
});
