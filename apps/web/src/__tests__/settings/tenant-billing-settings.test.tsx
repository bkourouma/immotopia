import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantBillingSettings } from '../../pages/tenant/TenantBillingSettings';

/**
 * `/tenant/:tenantId/settings/facturation` — factures de la plateforme vues
 * par l'agence : liste, paiement en ligne, retour de paiement `?paiement=`.
 * Les services sont mockés en entier (chaque export utilisé par la page et par
 * `TenantInvoicesSection`).
 */

const getOwnEntitlements = vi.fn();
const useMenuEntryAccess = vi.fn();

// Droits de la personne dans l'agence (même source que le menu) : mockés, sans appel réseau.
vi.mock('../../hooks/useMenuAccess', () => ({
  useMenuEntryAccess: (...a: unknown[]) => useMenuEntryAccess(...a)
}));

vi.mock('../../services/subscription-v2-service', () => ({
  getOwnEntitlements: (...a: unknown[]) => getOwnEntitlements(...a)
}));

const listOwnPlatformInvoices = vi.fn();
const downloadOwnInvoicePdf = vi.fn();
const getPaymentAvailability = vi.fn();
const startInvoiceCheckout = vi.fn();
const getInvoiceCheckout = vi.fn();

vi.mock('../../services/platform-billing-service', () => ({
  listOwnPlatformInvoices: (...a: unknown[]) => listOwnPlatformInvoices(...a),
  downloadOwnInvoicePdf: (...a: unknown[]) => downloadOwnInvoicePdf(...a),
  getPaymentAvailability: (...a: unknown[]) => getPaymentAvailability(...a),
  startInvoiceCheckout: (...a: unknown[]) => startInvoiceCheckout(...a),
  getInvoiceCheckout: (...a: unknown[]) => getInvoiceCheckout(...a)
}));

const ENTITLEMENTS = {
  tenantId: 'tenant-1',
  phase: 'ACTIVE',
  readOnly: false,
  manualReadOnlyReason: null,
  packs: ['AGENCE']
};

const INVOICE = {
  id: 'inv-1',
  tenantId: 'tenant-1',
  invoiceNumber: 'IMT-2026-00001',
  nature: 'PERIOD',
  status: 'OVERDUE',
  issueDate: '2026-02-01T00:00:00.000Z',
  issuedAt: '2026-02-01T00:00:00.000Z',
  dueDate: '2026-02-08T00:00:00.000Z',
  periodStart: '2026-02-01T00:00:00.000Z',
  periodEnd: '2026-03-01T00:00:00.000Z',
  currency: 'FCFA',
  amountExclTax: 29_900,
  taxRate: 18,
  taxAmount: 5_382,
  amountTotal: 35_282,
  paidAt: null,
  paymentMethod: null,
  paymentReference: null,
  canceledAt: null,
  cancelReason: null,
  creditedInvoice: null,
  sentAt: null,
  notes: null
};

const SearchProbe: React.FC = () => <span data-testid="search">{useLocation().search}</span>;

function mount(url = '/tenant/tenant-1/settings/facturation') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route
              path="/tenant/:tenantId/settings/facturation"
              element={
                <>
                  <TenantBillingSettings />
                  <SearchProbe />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getOwnEntitlements.mockReset();
  getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
  useMenuEntryAccess.mockReturnValue({ ready: true, allowed: true });
  listOwnPlatformInvoices.mockResolvedValue({
    invoices: [INVOICE],
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
  });
  getPaymentAvailability.mockResolvedValue({ available: true, mode: 'SIMULATOR' });
});

describe('<TenantBillingSettings> — factures et paiement en ligne', () => {
  it('liste les factures et ouvre le paiement en ligne sur une facture en retard, même en lecture seule', async () => {
    getOwnEntitlements.mockResolvedValue({ ...ENTITLEMENTS, phase: 'READ_ONLY', readOnly: true });
    startInvoiceCheckout.mockResolvedValue({
      checkoutUrl: 'http://localhost:8001/api/payment-gateway/simulator/IMP-abc'
    });
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, assign } });
    try {
      mount();

      expect(await screen.findByRole('heading', { name: 'Facturation' })).toBeInTheDocument();
      expect(await screen.findByText('IMT-2026-00001', {}, { timeout: 5000 })).toBeInTheDocument();
      expect(screen.getByText('En retard')).toBeInTheDocument();
      expect(screen.getByText('Mode démonstration : aucun paiement réel.')).toBeInTheDocument();
      expect(
        await screen.findByText('Réglez la facture en attente ci-dessous pour retrouver l’accès complet.')
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Payer en ligne/ }));

      await waitFor(() => expect(startInvoiceCheckout).toHaveBeenCalledWith('tenant-1', 'inv-1'));
      await waitFor(() =>
        expect(assign).toHaveBeenCalledWith('http://localhost:8001/api/payment-gateway/simulator/IMP-abc')
      );
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it("n'affiche pas l'alerte de lecture seule quand l'abonnement est à jour", async () => {
    mount();

    expect(await screen.findByText('IMT-2026-00001', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText('Compte en lecture seule')).not.toBeInTheDocument();
  });

  it('propose de reprendre un paiement déjà en cours (409)', async () => {
    startInvoiceCheckout.mockRejectedValue({
      response: {
        status: 409,
        data: { message: 'déjà en cours', data: { codePaiement: 'IMP-x', checkoutUrl: 'http://pay/IMP-x' } }
      }
    });
    mount();

    fireEvent.click(await screen.findByRole('button', { name: /Payer en ligne/ }, { timeout: 5000 }));
    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getAllByText('Un paiement est déjà en cours pour cette facture').length).toBeGreaterThan(0);
    expect(within(dialogue).getByRole('button', { name: 'Reprendre le paiement' })).toBeInTheDocument();
  });

  it('au retour de paiement (?paiement=), affiche le succès et recharge les droits', async () => {
    getInvoiceCheckout.mockResolvedValue({ codePaiement: 'IMP-abc', status: 'SUCCESS', failureMessage: null });
    mount('/tenant/tenant-1/settings/facturation?paiement=IMP-abc');

    expect(await screen.findByText('Paiement reçu : la facture est réglée.')).toBeInTheDocument();
    expect(getInvoiceCheckout).toHaveBeenCalledWith('tenant-1', 'IMP-abc');
    await waitFor(() => expect(getOwnEntitlements.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('sans TENANT_SETTINGS_VIEW : « Accès réservé », sans tableau vide ni appel à l’API', async () => {
    useMenuEntryAccess.mockReturnValue({ ready: true, allowed: false });
    mount();

    expect(await screen.findByText('Accès réservé')).toBeInTheDocument();
    expect(useMenuEntryAccess).toHaveBeenCalledWith('tenant-1', 'mon-compte-facturation');
    expect(screen.queryByText('Aucune facture')).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Factures' })).not.toBeInTheDocument();
    expect(listOwnPlatformInvoices).not.toHaveBeenCalled();
    expect(getPaymentAvailability).not.toHaveBeenCalled();
    expect(getOwnEntitlements).not.toHaveBeenCalled();
  });

  it('code de paiement inconnu (404) : arrête le suivi, affiche « Paiement introuvable » et retire le paramètre', async () => {
    getInvoiceCheckout.mockRejectedValue({ response: { status: 404, data: { message: 'Paiement introuvable.' } } });
    mount('/tenant/tenant-1/settings/facturation?paiement=CODE-INCONNU');

    expect(await screen.findByText('Paiement introuvable')).toBeInTheDocument();
    expect(screen.queryByText('Paiement en cours de confirmation.')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(/^$/));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(getInvoiceCheckout).toHaveBeenCalledTimes(1);
  });

  it('erreur réseau pendant le suivi : garde le message « en cours de confirmation » et l’adresse', async () => {
    getInvoiceCheckout.mockRejectedValue(new Error('Network Error'));
    mount('/tenant/tenant-1/settings/facturation?paiement=IMP-abc');

    expect(await screen.findByText('Paiement en cours de confirmation.')).toBeInTheDocument();
    expect(screen.queryByText('Paiement introuvable')).not.toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('?paiement=IMP-abc');
  });

  it("n'affiche pas « Payer en ligne » si le paiement en ligne est indisponible", async () => {
    getPaymentAvailability.mockResolvedValue({ available: false, mode: 'LIVE' });
    mount();

    expect(await screen.findByText('IMT-2026-00001', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Payer en ligne/ })).not.toBeInTheDocument();
  });
});
