import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantSubscriptionSettings } from '../../pages/tenant/TenantSubscriptionSettings';

/**
 * `/tenant/:tenantId/settings/abonnement` — abonnement vu par l'agence :
 * formule en consultation, factures et paiement en ligne, demande
 * d'extension (vague 3). Les deux services sont mockés en entier (chaque
 * export utilisé par la page et sa section Factures).
 */

const getOwnEntitlements = vi.fn();
const createExtensionRequest = vi.fn();
const listOwnExtensionRequests = vi.fn();

vi.mock('../../services/subscription-v2-service', () => ({
  getOwnEntitlements: (...a: unknown[]) => getOwnEntitlements(...a)
}));

vi.mock('../../services/subscription-extras-service', () => ({
  createExtensionRequest: (...a: unknown[]) => createExtensionRequest(...a),
  listOwnExtensionRequests: (...a: unknown[]) => listOwnExtensionRequests(...a)
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

// Carte du palier personnel : pour une agence, l'usage renvoie `AGENCY` et la carte disparaît.
vi.mock('../../services/personal-space-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/personal-space-service')>(
    '../../services/personal-space-service'
  );
  return {
    ...actual,
    getAssetUsage: vi.fn().mockResolvedValue({ plan: 'AGENCY', limit: null, used: 0, canAdd: true, upgrade: null }),
    getTenantIdentity: vi.fn().mockResolvedValue({ type: 'AGENCY', contactPhone: null })
  };
});

const ENTITLEMENTS = {
  tenantId: 'tenant-1',
  subscriptionId: 'sub-1',
  status: 'TRIALING',
  phase: 'TRIAL',
  readOnly: false,
  readOnlyReason: null,
  manualReadOnlyAt: null,
  manualReadOnlyReason: null,
  trialEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
  graceEndsAt: null,
  billingCycle: 'MONTHLY',
  currentPeriodStart: '2026-01-01T00:00:00.000Z',
  currentPeriodEnd: '2026-02-01T00:00:00.000Z',
  packs: ['AGENCE'],
  modules: ['MODULE_AGENCY'],
  moduleAccess: { MODULE_AGENCY: 'FULL', MODULE_SYNDIC: 'NONE', MODULE_PROMOTER: 'NONE' },
  features: [],
  capacities: {
    LOTS: { included: 100, extensions: 0, overrides: 0, limit: 100, used: 42, remaining: 58, overBy: 0 },
    COPROPRIETES: { included: 0, extensions: 0, overrides: 0, limit: 0, used: 0, remaining: 0, overBy: 0 },
    CHANTIERS: { included: 0, extensions: 0, overrides: 0, limit: 0, used: 0, remaining: 0, overBy: 0 }
  },
  quotaPolicy: 'BILL_OVERAGE',
  enforcement: 'enforce',
  computedAt: '2026-01-15T00:00:00.000Z'
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

function mount(url = '/tenant/tenant-1/settings/abonnement') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/settings/abonnement" element={<TenantSubscriptionSettings />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getOwnEntitlements.mockReset();
  listOwnExtensionRequests.mockResolvedValue([]);
  listOwnPlatformInvoices.mockResolvedValue({
    invoices: [INVOICE],
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
  });
  getPaymentAvailability.mockResolvedValue({ available: true, mode: 'SIMULATOR' });
});

describe('<TenantSubscriptionSettings> — formule', () => {
  it("affiche les packs, la période, les jours d'essai restants et la consommation", async () => {
    getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
    mount();

    expect(await screen.findByText('Formule')).toBeInTheDocument();
    expect(screen.getByText('AGENCE')).toBeInTheDocument();
    expect(screen.getByText('42 / 100')).toBeInTheDocument();
    expect(getOwnEntitlements).toHaveBeenCalledWith('tenant-1');

    // La formule se consulte : aucun bouton de modification des packs.
    expect(screen.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument();
  });

  it("envoie une demande d'extension à l'API (plus de mailto)", async () => {
    getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
    createExtensionRequest.mockResolvedValue({
      id: 'req-1',
      tenantId: 'tenant-1',
      requestedByUserId: 'u-1',
      requestedByName: 'Awa',
      catalogCode: null,
      catalogName: null,
      quantity: null,
      message: 'Il nous faut 50 lots',
      status: 'OPEN',
      handledAt: null,
      handledByUserId: null,
      handledNote: null,
      createdAt: '2026-02-02T00:00:00.000Z'
    });
    const user = userEvent.setup();
    mount();

    await screen.findByText('Formule');
    await user.type(screen.getByLabelText('Votre demande'), 'Il nous faut 50 lots');
    await user.click(screen.getByRole('button', { name: /Envoyer la demande/ }));

    await waitFor(() =>
      expect(createExtensionRequest).toHaveBeenCalledWith('tenant-1', {
        catalogCode: null,
        quantity: null,
        message: 'Il nous faut 50 lots'
      })
    );
    expect(await screen.findByRole('table', { name: 'Mes demandes' })).toBeInTheDocument();
  });

  it("indique l'absence d'abonnement", async () => {
    getOwnEntitlements.mockResolvedValue({ ...ENTITLEMENTS, phase: 'NONE' });
    mount();

    expect(await screen.findByText("Cette agence n'a pas encore d'abonnement.")).toBeInTheDocument();
  });

  it('affiche le motif quand la lecture seule manuelle est active (Baba, 25/09)', async () => {
    getOwnEntitlements.mockResolvedValue({
      ...ENTITLEMENTS,
      phase: 'READ_ONLY',
      readOnly: true,
      readOnlyReason: 'MANUAL',
      manualReadOnlyAt: '2026-01-20T00:00:00.000Z',
      manualReadOnlyReason: 'Abus signalé'
    });
    mount();

    expect(await screen.findByText('Compte en lecture seule')).toBeInTheDocument();
    expect(screen.getByText('Décidée par ImmoTopia. Motif : Abus signalé')).toBeInTheDocument();
  });
});

describe('<TenantSubscriptionSettings> — factures et paiement en ligne', () => {
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

      expect(await screen.findByText('IMT-2026-00001', {}, { timeout: 5000 })).toBeInTheDocument();
      expect(screen.getByText('En retard')).toBeInTheDocument();
      expect(screen.getByText('Mode démonstration : aucun paiement réel.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Payer en ligne/ }));

      await waitFor(() => expect(startInvoiceCheckout).toHaveBeenCalledWith('tenant-1', 'inv-1'));
      await waitFor(() =>
        expect(assign).toHaveBeenCalledWith('http://localhost:8001/api/payment-gateway/simulator/IMP-abc')
      );
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('propose de reprendre un paiement déjà en cours (409)', async () => {
    getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
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

  it('au retour de paiement, affiche le succès et recharge les droits', async () => {
    getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
    getInvoiceCheckout.mockResolvedValue({ codePaiement: 'IMP-abc', status: 'SUCCESS', failureMessage: null });
    mount('/tenant/tenant-1/settings/abonnement?paiement=IMP-abc');

    expect(await screen.findByText('Paiement reçu : la facture est réglée.')).toBeInTheDocument();
    expect(getInvoiceCheckout).toHaveBeenCalledWith('tenant-1', 'IMP-abc');
    await waitFor(() => expect(getOwnEntitlements.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("n'affiche pas « Payer en ligne » si le paiement en ligne est indisponible", async () => {
    getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
    getPaymentAvailability.mockResolvedValue({ available: false, mode: 'LIVE' });
    mount();

    expect(await screen.findByText('IMT-2026-00001', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Payer en ligne/ })).not.toBeInTheDocument();
  });
});
