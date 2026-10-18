import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicCharges } from '../../pages/syndics/SyndicCharges';

/**
 * Lien « Payer cet appel » depuis « Syndic › Finances › Appels de charges »
 * (spec 042, contrat §1.10) : l'action n'est proposée que si la copropriété a
 * un paiement en ligne utilisable et que l'appel a un reste dû ; la fenêtre
 * suit les droits (création et révocation : SYNDIC_EDIT, liste : SYNDIC_VIEW).
 */

// Chaque test monte la page entière (tableau, formulaires, modales Ant Design) : lent sur une machine chargée.
vi.setConfig({ testTimeout: 90_000 });

const getSyndicate = vi.fn();
const listSyndicateLots = vi.fn();
const listChargeCalls = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  getSyndicate: (...args: unknown[]) => getSyndicate(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
  listAllChargeCallsWithSummary: (...args: unknown[]) => listChargeCalls(...args),
  createChargeCall: vi.fn(),
  listSyndicateFunds: vi.fn(async () => []),
  assignChargeCallFund: vi.fn()
}));

vi.mock('../../services/syndic-lot-payment-service', () => ({
  listOpenLotCharges: vi.fn(async () => []),
  getLotAdvance: vi.fn(async () => ({ advance: 0, currency: 'XOF' })),
  previewLotPayment: vi.fn(),
  recordLotPayment: vi.fn()
}));

vi.mock('../../services/syndic-receipt-service', () => ({
  downloadReceiptFile: vi.fn()
}));

vi.mock('../../utils/save-blob', () => ({
  saveBlob: vi.fn()
}));

const getSyndicGatewaySettings = vi.fn();
const createChargeCallPaymentLink = vi.fn();
const listChargeCallPaymentLinks = vi.fn();
const revokeChargeCallPaymentLink = vi.fn();

vi.mock('../../services/syndic-online-payment-service', () => ({
  getSyndicGatewaySettings: (...args: unknown[]) => getSyndicGatewaySettings(...args),
  createChargeCallPaymentLink: (...args: unknown[]) => createChargeCallPaymentLink(...args),
  listChargeCallPaymentLinks: (...args: unknown[]) => listChargeCallPaymentLinks(...args),
  revokeChargeCallPaymentLink: (...args: unknown[]) => revokeChargeCallPaymentLink(...args)
}));

// `null` : pas de filtrage par permission (administrateur de l'agence).
let heldPermissions: Set<string> | null = null;
let permissionsReady = true;
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({
    disabled: new Set<string>(),
    enabled: new Set<string>(),
    permissions: heldPermissions,
    ready: permissionsReady
  })
}));

const authValue: AuthContextType = {
  user: {
    id: 'user-1',
    email: 'test@example.com',
    fullName: 'Test User',
    avatarUrl: null,
    globalRole: 'USER',
    emailVerified: true,
    preferredLanguage: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  isAuthenticated: true,
  isLoading: false,
  error: null,
  tenantMembership: {
    id: 'membership-1',
    tenantId: 'tenant-1',
    tenant: { id: 'tenant-1', name: 'Tenant Demo', slug: 'tenant-demo' },
    status: 'ACTIVE'
  },
  tenantClient: null,
  isLoadingMembership: false,
  login: async () => undefined,
  logout: async () => undefined,
  register: async () => undefined,
  refreshToken: async () => undefined,
  clearError: vi.fn(),
  refreshMembership: async () => undefined,
  availableTenants: [],
  activeTenantId: null,
  switchTenant: () => undefined
};

const CHARGES = [
  {
    id: 'cc-1',
    syndicateId: 'syndic-1',
    lotId: 'lot-1',
    period: '2026-T4',
    amount: 100000,
    paidAmount: 0,
    outstandingAmount: 100000,
    currency: 'XOF',
    dueDate: '2026-12-10T00:00:00.000Z',
    status: 'PENDING',
    createdAt: '',
    updatedAt: ''
  },
  {
    id: 'cc-2',
    syndicateId: 'syndic-1',
    lotId: 'lot-1',
    period: '2026-T3',
    amount: 80000,
    paidAmount: 80000,
    outstandingAmount: 0,
    currency: 'XOF',
    dueDate: '2026-09-10T00:00:00.000Z',
    status: 'PAID',
    createdAt: '',
    updatedAt: ''
  }
];

function renderPage() {
  return render(
    <AuthContext.Provider value={authValue}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/charges']}>
          <Routes>
            <Route path="/tenant/:tenantId/syndics/:syndicId/charges" element={<SyndicCharges />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  heldPermissions = null;
  permissionsReady = true;
  getSyndicate.mockResolvedValue({ id: 'syndic-1', tenantId: 'tenant-1', name: 'Residence Test', status: 'ACTIVE' });
  listSyndicateLots.mockResolvedValue([
    { id: 'lot-1', syndicateId: 'syndic-1', lotNumber: 'A-01', lotType: 'APARTMENT', generalShares: 100 }
  ]);
  listChargeCalls.mockResolvedValue({
    items: CHARGES,
    summary: { totalCount: 2, totalAmount: 180000, pendingCount: 1, overdueCount: 0 }
  });
  getSyndicGatewaySettings.mockResolvedValue({ usable: true });
  listChargeCallPaymentLinks.mockResolvedValue([]);
});

describe('SyndicCharges — lien de paiement d’un appel', () => {
  it('propose « Lien de paiement » sur l’appel à reste dû seulement, et ouvre la fenêtre de CET appel', async () => {
    renderPage();

    const button = await screen.findByRole('button', { name: /Lien de paiement/ });
    // Deux appels, un seul à reste dû.
    expect(screen.getAllByRole('button', { name: /Lien de paiement/ })).toHaveLength(1);
    expect(getSyndicGatewaySettings).toHaveBeenCalledWith('tenant-1', 'syndic-1');

    fireEvent.click(button);

    expect(await screen.findByText('Lien de paiement · appel 2026-T4')).toBeInTheDocument();
    await waitFor(() => expect(listChargeCallPaymentLinks).toHaveBeenCalledWith('tenant-1', 'syndic-1', 'cc-1'));
    expect(screen.getByRole('button', { name: 'Envoyer le lien' })).toBeInTheDocument();
  });

  it('ne propose rien quand la configuration de paiement de la copropriété n’est pas utilisable', async () => {
    getSyndicGatewaySettings.mockResolvedValue({ usable: false });
    renderPage();

    await screen.findByText('2026-T4');
    await waitFor(() => expect(getSyndicGatewaySettings).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Lien de paiement/ })).not.toBeInTheDocument();
  });

  it('ne propose rien quand la configuration est illisible (droit refusé, réseau)', async () => {
    getSyndicGatewaySettings.mockRejectedValue({ response: { status: 403 } });
    renderPage();

    await screen.findByText('2026-T4');
    await waitFor(() => expect(getSyndicGatewaySettings).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Lien de paiement/ })).not.toBeInTheDocument();
  });

  it('sans SYNDIC_EDIT, la fenêtre liste les liens mais ne permet ni création ni révocation', async () => {
    heldPermissions = new Set(['SYNDIC_VIEW']);
    listChargeCallPaymentLinks.mockResolvedValue([
      {
        id: 'lk-1',
        createdAt: '2026-10-10T08:00:00.000Z',
        expiresAt: '2026-10-17T08:00:00.000Z',
        revokedAt: null,
        status: 'ACTIVE',
        viewCount: 0,
        lastViewedAt: null,
        createdByUserId: 'user-1',
        payment: { status: 'NONE', amount: null, updatedAt: null }
      }
    ]);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Lien de paiement/ }));

    expect(await screen.findByText('Actif')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Envoyer le lien' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Révoquer' })).not.toBeInTheDocument();
  });

  it('tant que les droits ne sont pas connus, la fenêtre n’offre pas la création', async () => {
    permissionsReady = false;
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Lien de paiement/ }));

    expect(await screen.findByText('Aucun lien actif.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Envoyer le lien' })).not.toBeInTheDocument();
  });

  it('l’URL montrée une fois ne survit pas à la fermeture de la fenêtre', async () => {
    createChargeCallPaymentLink.mockResolvedValue({
      linkId: 'lk-9',
      url: 'https://app.example.com/payer-charges#JETON-EN-CLAIR',
      expiresAt: '2026-10-23T08:00:00.000Z',
      amountDue: 100000,
      currency: 'XOF'
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Lien de paiement/ }));
    fireEvent.click(await screen.findByLabelText('Copier le lien'));
    fireEvent.click(screen.getByRole('button', { name: 'Créer le lien' }));
    expect(await screen.findByDisplayValue(/JETON-EN-CLAIR/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByDisplayValue(/JETON-EN-CLAIR/)).not.toBeInTheDocument());

    // Rouvrir la fenêtre repart d'un formulaire vierge : l'URL n'est jamais relue.
    fireEvent.click(screen.getByRole('button', { name: /Lien de paiement/ }));
    expect(await screen.findByRole('button', { name: 'Envoyer le lien' })).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/JETON-EN-CLAIR/)).not.toBeInTheDocument();
  });
});
