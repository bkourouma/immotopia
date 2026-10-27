import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { SyndicOnlinePayments } from '../../../pages/syndics/SyndicOnlinePayments';

/**
 * Droits de l'écran « Paiements en ligne » : mêmes règles que l'API
 * (vérifier, trancher, reverser = SYNDIC_EDIT ; configurer = SYNDIC_EDIT
 * ET TENANT_SETTINGS_EDIT).
 */

const getSyndicGatewaySettings = vi.fn();
const listSyndicOnlineCheckouts = vi.fn();
const listSyndicGatewayPayouts = vi.fn();
const getSyndicProviderBalance = vi.fn();
const useMyMenuAccess = vi.fn();

vi.mock('../../../services/syndic-online-payment-service', () => ({
  getSyndicGatewaySettings: (...a: unknown[]) => getSyndicGatewaySettings(...a),
  updateSyndicGatewaySettings: vi.fn(),
  testSyndicGatewayConnection: vi.fn(),
  getSyndicProviderBalance: (...a: unknown[]) => getSyndicProviderBalance(...a),
  decideSyndicOnlineCheckout: vi.fn(),
  verifySyndicOnlineCheckout: vi.fn(),
  listSyndicOnlineCheckouts: (...a: unknown[]) => listSyndicOnlineCheckouts(...a),
  listSyndicGatewayPayouts: (...a: unknown[]) => listSyndicGatewayPayouts(...a),
  recordSyndicGatewayPayout: vi.fn()
}));

vi.mock('../../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: (...a: unknown[]) => useMyMenuAccess(...a)
}));

vi.mock('../../../pages/syndics/useSyndicRouteContext', () => ({
  useSyndicRouteContext: () => ({ tenantId: 't1', syndicId: 's1' })
}));

const SETTINGS = {
  syndicateId: 's1',
  provider: 'PAYSECUREHUB' as const,
  mode: 'SIMULATOR' as const,
  isActive: false,
  merchantId: 'MARCHAND-1',
  apiKeyConfigured: true,
  apiKeyLast4: '1234',
  usable: false,
  callbackUrl: 'https://api.example.com/api/payment-gateway/paysecurehub/ipn',
  simulatorAvailable: true,
  encryptionAvailable: true,
  lastTest: null,
  agencyFeesPaidBy: 'CLIENT' as const,
  collectionAccount: { accountNumber: '5525' as const, exists: true, balance: 150000 },
  updatedAt: null
};

const ROW = {
  id: 'co-1',
  codePaiement: 'IMS-ABCDEFGHIJ0123456789',
  status: 'REVIEW',
  origin: 'PORTAL',
  mode: 'LIVE',
  amount: 50000,
  receivedAmount: 45000,
  currency: 'XOF',
  lot: { id: 'lot-1', lotNumber: 'A12' },
  payer: { contactId: 'c1', name: 'Awa Koné' },
  chargeCalls: [{ id: 'cc-1', period: 'T3 2026' }],
  providerServiceName: 'Wave',
  providerTransactionId: 'TX-1',
  providerFees: null,
  failureMessage: null,
  reviewKind: 'AMOUNT_MISMATCH',
  reviewReason: 'Montant différent',
  resolution: null,
  resolutionNote: null,
  resolvedAt: null,
  resolvedByName: null,
  chargePaymentId: null,
  lastCheckedAt: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  completedAt: null
};

function renderPage() {
  return render(
    <AntApp>
      <SyndicOnlinePayments />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSyndicGatewaySettings.mockResolvedValue(SETTINGS);
  getSyndicProviderBalance.mockResolvedValue({ available: false, balance: null, message: 'Mode simulateur' });
  listSyndicGatewayPayouts.mockResolvedValue({ items: [] });
  listSyndicOnlineCheckouts.mockResolvedValue({
    items: [ROW],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    counts: { REVIEW: 1 }
  });
});

describe('SyndicOnlinePayments : droits', () => {
  it('sans SYNDIC_EDIT : lecture seule, aucune action', async () => {
    useMyMenuAccess.mockReturnValue({ permissions: new Set(['SYNDIC_VIEW']), ready: true });
    renderPage();

    await screen.findByText('A12');
    await screen.findByPlaceholderText('•••• 1234');
    expect(screen.queryByRole('button', { name: /Vérifier/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Trancher/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Enregistrer un reversement/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tester la connexion/ })).toBeNull();
  });

  it('SYNDIC_EDIT sans TENANT_SETTINGS_EDIT : actions de suivi, configuration masquée', async () => {
    useMyMenuAccess.mockReturnValue({ permissions: new Set(['SYNDIC_VIEW', 'SYNDIC_EDIT']), ready: true });
    renderPage();

    await screen.findByText('A12');
    await screen.findByPlaceholderText('•••• 1234');
    expect(screen.getByRole('button', { name: /Vérifier/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Trancher/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Enregistrer un reversement/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tester la connexion/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remplacer la clé' })).toBeNull();
  });

  it('administrateur (permissions nulles) : tout est proposé', async () => {
    useMyMenuAccess.mockReturnValue({ permissions: null, ready: true });
    renderPage();

    await screen.findByText('A12');
    await screen.findByPlaceholderText('•••• 1234');
    expect(screen.getByRole('button', { name: /Trancher/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tester la connexion/ })).toBeTruthy();
  });
});
