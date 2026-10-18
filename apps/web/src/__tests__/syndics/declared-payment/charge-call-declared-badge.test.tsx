import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../../context/AuthContext';
import { AuthContextType } from '../../../types/auth-types';
import { ChargeCallTable } from '../../../components/syndics/ChargeCallTable';
import { SyndicCharges } from '../../../pages/syndics/SyndicCharges';
import type { ChargeCall } from '../../../types/syndic-types';

/**
 * Pastille « Paiement déclaré » sur les appels de charges (spec 047, T055) : la table l'affiche
 * pour les appels visés par une déclaration en attente, la page SyndicCharges la calcule depuis
 * le service des déclarations (échec silencieux) et ajoute un bandeau d'information.
 */

vi.setConfig({ testTimeout: 90_000 });

const getSyndicate = vi.fn();
const listSyndicateLots = vi.fn();
const listChargeCalls = vi.fn();
const listSyndicDeclarations = vi.fn();

vi.mock('../../../services/syndic-service', () => ({
  getSyndicate: (...args: unknown[]) => getSyndicate(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
  listAllChargeCallsWithSummary: (...args: unknown[]) => listChargeCalls(...args),
  createChargeCall: vi.fn(),
  listSyndicateFunds: vi.fn(async () => []),
  assignChargeCallFund: vi.fn()
}));

vi.mock('../../../services/syndic-lot-payment-service', () => ({
  listOpenLotCharges: vi.fn(async () => []),
  getLotAdvance: vi.fn(async () => ({ advance: 0, currency: 'XOF' })),
  previewLotPayment: vi.fn(),
  recordLotPayment: vi.fn()
}));

vi.mock('../../../services/syndic-receipt-service', () => ({
  downloadReceiptFile: vi.fn()
}));

vi.mock('../../../utils/save-blob', () => ({
  saveBlob: vi.fn()
}));

vi.mock('../../../services/syndic-declared-payment-service', () => ({
  listSyndicDeclarations: (...args: unknown[]) => listSyndicDeclarations(...args)
}));

vi.mock('../../../components/syndics/online-payment/useOnlinePaymentUsable', () => ({
  useSyndicOnlinePaymentUsable: () => false
}));

vi.mock('../../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({
    disabled: new Set<string>(),
    enabled: new Set<string>(),
    permissions: null,
    ready: true
  })
}));

function call(overrides: Partial<ChargeCall>): ChargeCall {
  return {
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
    updatedAt: '',
    ...overrides
  } as ChargeCall;
}

const PENDING_CALL = call({ id: 'cc-1', period: '2026-T4' });
const PAID_CALL = call({
  id: 'cc-2',
  period: '2026-T3',
  status: 'PAID',
  paidAmount: 80000,
  outstandingAmount: 0
});

describe('<ChargeCallTable> — pastille « Paiement déclaré »', () => {
  it('sans la prop, le rendu est inchangé', () => {
    render(<ChargeCallTable items={[PENDING_CALL]} />);
    expect(screen.getByText('En attente')).toBeInTheDocument();
    expect(screen.queryByText('Paiement déclaré')).not.toBeInTheDocument();
  });

  it('ajoute la pastille sur l’appel visé, à côté du statut', () => {
    render(<ChargeCallTable items={[PENDING_CALL]} declaredPendingCallIds={new Set(['cc-1'])} />);
    expect(screen.getByText('En attente')).toBeInTheDocument();
    expect(screen.getByText('Paiement déclaré')).toBeInTheDocument();
  });

  it('n’ajoute rien sur un appel absent de l’ensemble', () => {
    render(<ChargeCallTable items={[PENDING_CALL]} declaredPendingCallIds={new Set(['autre'])} />);
    expect(screen.queryByText('Paiement déclaré')).not.toBeInTheDocument();
  });

  it('n’affiche jamais la pastille sur un appel déjà payé', () => {
    const { container } = render(<ChargeCallTable items={[PAID_CALL]} declaredPendingCallIds={new Set(['cc-2'])} />);
    // Seule la pastille de statut « Payé » existe sur la ligne.
    expect(container.querySelectorAll('.ant-tag')).toHaveLength(1);
    expect(screen.queryByText('Paiement déclaré')).not.toBeInTheDocument();
  });

  it('ne pose la pastille que sur les appels visés', () => {
    render(<ChargeCallTable items={[PENDING_CALL, PAID_CALL]} declaredPendingCallIds={new Set(['cc-1', 'cc-2'])} />);
    expect(screen.getAllByText('Paiement déclaré')).toHaveLength(1);
  });
});

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

const DECLARATION = {
  id: 'decl-1',
  status: 'PENDING',
  lines: [{ id: 'l1', lot: { id: 'lot-1', lotNumber: 'A-01' }, chargeCalls: [{ id: 'cc-1', period: '2026-T4' }] }]
};

describe('SyndicCharges — paiements déclarés en attente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSyndicate.mockResolvedValue({ id: 'syndic-1', tenantId: 'tenant-1', name: 'Residence Test', status: 'ACTIVE' });
    listSyndicateLots.mockResolvedValue([
      { id: 'lot-1', syndicateId: 'syndic-1', lotNumber: 'A-01', lotType: 'APARTMENT', generalShares: 100 }
    ]);
    listChargeCalls.mockResolvedValue({
      items: [PENDING_CALL, PAID_CALL],
      summary: { totalCount: 2, totalAmount: 180000, pendingCount: 1, overdueCount: 0 }
    });
  });

  it('interroge les déclarations PENDING, pose la pastille sur l’appel visé et affiche le bandeau avec son lien', async () => {
    listSyndicDeclarations.mockResolvedValue({
      items: [DECLARATION],
      pagination: { page: 1, limit: 100, total: 3, totalPages: 1 },
      counts: { pending: 3, overdue: 0, suspectedDuplicate: 0 }
    });
    renderPage();

    expect(await screen.findByText('Paiement déclaré')).toBeInTheDocument();
    expect(screen.getAllByText('Paiement déclaré')).toHaveLength(1);
    expect(listSyndicDeclarations).toHaveBeenCalledWith('tenant-1', 'syndic-1', { status: 'PENDING', limit: 100 });

    expect(screen.getByText('3 paiement(s) déclaré(s) en attente de validation.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Voir les paiements' });
    expect(link).toHaveAttribute('href', '/tenant/tenant-1/syndics/syndic-1/paiements-en-ligne');
  });

  it('sans déclaration en attente : ni pastille ni bandeau', async () => {
    listSyndicDeclarations.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      counts: { pending: 0, overdue: 0, suspectedDuplicate: 0 }
    });
    renderPage();

    await screen.findByText('2026-T4');
    await waitFor(() => expect(listSyndicDeclarations).toHaveBeenCalled());
    expect(screen.queryByText('Paiement déclaré')).not.toBeInTheDocument();
    expect(screen.queryByText(/en attente de validation/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Voir les paiements' })).not.toBeInTheDocument();
  });

  it('un échec du service (403 compris) ne casse pas la page et n’affiche aucune erreur', async () => {
    listSyndicDeclarations.mockRejectedValue({ response: { status: 403, data: { error: 'Accès refusé' } } });
    renderPage();

    expect(await screen.findByText('2026-T4')).toBeInTheDocument();
    await waitFor(() => expect(listSyndicDeclarations).toHaveBeenCalled());
    expect(screen.queryByText('Accès refusé')).not.toBeInTheDocument();
    expect(screen.queryByText('Paiement déclaré')).not.toBeInTheDocument();
    expect(screen.queryByText(/en attente de validation/)).not.toBeInTheDocument();
  });
});
