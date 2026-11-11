import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantBillingSettings } from '../../pages/tenant/TenantBillingSettings';
import { TenantSubscriptionSettings } from '../../pages/tenant/TenantSubscriptionSettings';

/**
 * Les écritures d'abonnement (payer une facture, demander une extension) exigent
 * `TENANT_SETTINGS_EDIT` côté API ; un gestionnaire ou un agent n'a que la lecture
 * et ne doit pas voir un bouton qui finirait en 403.
 */

type Access = { permissions: Set<string> | null; ready: boolean };
const myAccess = vi.hoisted(() => ({ current: { permissions: null, ready: true } as Access }));

vi.mock('../../hooks/useMenuAccess', () => ({
  useMenuEntryAccess: () => ({ ready: true, allowed: true }),
  useMyMenuAccess: () => myAccess.current
}));

const getOwnEntitlements = vi.hoisted(() => vi.fn());
vi.mock('../../services/subscription-v2-service', () => ({
  getOwnEntitlements: (...a: unknown[]) => getOwnEntitlements(...a)
}));

const listExtensionOffers = vi.hoisted(() => vi.fn());
const listOwnExtensionRequests = vi.hoisted(() => vi.fn());
vi.mock('../../services/subscription-extras-service', () => ({
  createExtensionRequest: vi.fn(),
  listExtensionOffers: (...a: unknown[]) => listExtensionOffers(...a),
  listOwnExtensionRequests: (...a: unknown[]) => listOwnExtensionRequests(...a)
}));

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

const listOwnPlatformInvoices = vi.hoisted(() => vi.fn());
vi.mock('../../services/platform-billing-service', () => ({
  listOwnPlatformInvoices: (...a: unknown[]) => listOwnPlatformInvoices(...a),
  downloadOwnInvoicePdf: vi.fn(),
  getPaymentAvailability: vi.fn().mockResolvedValue({ available: true, mode: 'SIMULATOR' }),
  startInvoiceCheckout: vi.fn(),
  getInvoiceCheckout: vi.fn()
}));

const INVOICE = {
  id: 'inv-1',
  tenantId: 'tenant-1',
  invoiceNumber: 'IMT-2026-00001',
  nature: 'PERIOD',
  status: 'ISSUED',
  issueDate: '2026-02-01T00:00:00.000Z',
  dueDate: '2026-02-08T00:00:00.000Z',
  periodStart: '2026-02-01T00:00:00.000Z',
  periodEnd: '2026-03-01T00:00:00.000Z',
  currency: 'FCFA',
  amountTotal: 35282
};

const ENTITLEMENTS = {
  tenantId: 'tenant-1',
  phase: 'ACTIVE',
  readOnly: false,
  manualReadOnlyReason: null,
  packs: ['AGENCE'],
  modules: [],
  features: [],
  capacities: {}
};

const REQUEST = {
  id: 'req-1',
  createdAt: '2026-02-01T00:00:00.000Z',
  catalogCode: null,
  quantity: 5,
  message: 'Besoin de cinq lots',
  status: 'PENDING'
};

function mount(path: 'facturation' | 'abonnement') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[`/tenant/tenant-1/settings/${path}`]}>
          <Routes>
            <Route path="/tenant/:tenantId/settings/facturation" element={<TenantBillingSettings />} />
            <Route path="/tenant/:tenantId/settings/abonnement" element={<TenantSubscriptionSettings />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const T = { timeout: 8000 };

beforeEach(() => {
  myAccess.current = { permissions: null, ready: true };
  getOwnEntitlements.mockReset();
  getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
  listOwnPlatformInvoices.mockReset();
  listOwnPlatformInvoices.mockResolvedValue({
    invoices: [INVOICE],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
  });
  listExtensionOffers.mockResolvedValue([]);
  listOwnExtensionRequests.mockResolvedValue([REQUEST]);
});

describe('écritures d’abonnement et permissions', () => {
  it('lecture seule : pas de « Payer en ligne », mais montant et PDF visibles', async () => {
    myAccess.current = { permissions: new Set(['TENANT_SETTINGS_VIEW']), ready: true };
    mount('facturation');
    expect(await screen.findByText('IMT-2026-00001', undefined, T)).toBeInTheDocument();
    expect(await screen.findByText(/Paiement réservé à l'administrateur/, undefined, T)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Payer en ligne/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Traduction arabe/ })).toBeInTheDocument();
  });

  it('lecture seule : pas de « Envoyer la demande », la liste des demandes reste lisible', async () => {
    myAccess.current = { permissions: new Set(['TENANT_SETTINGS_VIEW']), ready: true };
    mount('abonnement');
    expect(await screen.findByText('Besoin de cinq lots', undefined, T)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Envoyer la demande/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Demande réservée à l'administrateur/)).toBeInTheDocument();
  });

  it('tant que les droits ne sont pas connus : aucun bouton d’écriture', async () => {
    myAccess.current = { permissions: null, ready: false };
    mount('facturation');
    await screen.findByText('IMT-2026-00001', undefined, T);
    expect(screen.queryByRole('button', { name: /Payer en ligne/ })).not.toBeInTheDocument();
  });

  it('avec TENANT_SETTINGS_EDIT : « Payer en ligne » et « Envoyer la demande » actifs', async () => {
    myAccess.current = { permissions: new Set(['TENANT_SETTINGS_VIEW', 'TENANT_SETTINGS_EDIT']), ready: true };
    const billing = mount('facturation');
    expect(await screen.findByRole('button', { name: /Payer en ligne/ }, T)).toBeEnabled();
    billing.unmount();
    mount('abonnement');
    expect(await screen.findByRole('button', { name: /Envoyer la demande/ }, T)).toBeEnabled();
  });

  it('sans restriction connue (permissions null) : comportement inchangé', async () => {
    mount('facturation');
    expect(await screen.findByRole('button', { name: /Payer en ligne/ }, T)).toBeInTheDocument();
  });
});
