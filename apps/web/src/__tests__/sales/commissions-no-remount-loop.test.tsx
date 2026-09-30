import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AuthContext from '../../context/AuthContext';
import type { AuthContextType } from '../../types/auth-types';
import { LanguageProvider } from '../../i18n/LanguageProvider';

/**
 * BUG-2026-09-30-065 — la page Commissions de vente, montée DANS la coquille,
 * ne doit pas la faire se remonter : dès qu'une commission existe, le nombre
 * d'appels de la coquille (droits, assistant, menus) reste borné.
 */

const listSaleCommissions = vi.fn();
vi.mock('../../services/sales-service', () => ({
  listSaleCommissions: (...a: unknown[]) => listSaleCommissions(...a),
  getSaleCommission: vi.fn(),
  createSaleCommissionPayment: vi.fn(),
  voidSaleCommissionPayment: vi.fn()
}));
vi.mock('../../services/treasury-service', () => ({ listTreasuryAccounts: vi.fn().mockResolvedValue([]) }));

const viewport = vi.hoisted(() => ({ desktop: true }));
const getMenuEntitlements = vi.fn();
vi.mock('../../services/entitlements-service', () => ({
  getMenuEntitlements: (...a: unknown[]) => getMenuEntitlements(...a)
}));
const getMyDisabledMenus = vi.fn();
vi.mock('../../services/role-menu-service', () => ({
  getMyDisabledMenus: (...a: unknown[]) => getMyDisabledMenus(...a),
  listMenuAccess: vi.fn(),
  updateMenuAccess: vi.fn()
}));
const aiStatus = vi.fn();
vi.mock('../../utils/api-client', async importOriginal => {
  const actual = await importOriginal<{ default: Record<string, unknown> }>();
  return {
    ...actual,
    default: {
      ...actual.default,
      get: (url: string) => {
        if (String(url).includes('/ai/status')) {
          aiStatus(url);
          return Promise.resolve({ data: { data: { enabled: false } } });
        }
        return Promise.resolve({ data: { data: {} } });
      }
    }
  };
});

vi.mock('antd', async importOriginal => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    Grid: {
      useBreakpoint: () =>
        viewport.desktop ? { xs: true, sm: true, md: true, lg: true, xl: true } : { xs: true, sm: true }
    }
  };
});

const { AppShell } = await import('../../components/shell/AppShell');
const { SaleCommissions } = await import('../../pages/sales/SaleCommissions');

const TENANT = 'agence-1';
const auth = {
  user: {
    id: 'user-1',
    email: 'a@b.c',
    fullName: 'Alex Martin',
    avatarUrl: null,
    globalRole: 'USER',
    emailVerified: true,
    preferredLanguage: null,
    isActive: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  },
  isAuthenticated: true,
  isLoading: false,
  error: null,
  tenantMembership: {
    id: 'm1',
    tenantId: TENANT,
    tenant: { id: TENANT, name: 'Agence', slug: 'agence' },
    status: 'ACTIVE'
  },
  tenantClient: null,
  isLoadingMembership: false,
  login: async () => undefined,
  logout: async () => undefined,
  register: async () => undefined,
  refreshToken: async () => undefined,
  clearError: () => undefined
} as unknown as AuthContextType;

const commission = {
  id: 'commission-1',
  number: 'HT-2026-0001',
  agreementId: 'agreement-1',
  agreementNumber: 'CV-2026-0001',
  mandateId: 'mandate-1',
  propertyLabel: 'REF-001 · Villa Cocody',
  payer: 'SELLER',
  payerName: 'Aissatou Barry',
  baseAmount: 40_000_000,
  amountExclTax: 4_000_000,
  vatRate: 0,
  vatAmount: 0,
  amountInclTax: 4_000_000,
  paidAmount: 0,
  remainingAmount: 4_000_000,
  status: 'DUE',
  agentUserId: null,
  agentName: null,
  agentSharePercent: null,
  agentShareEarned: 0,
  issuedAt: '2026-09-30'
};

beforeEach(() => {
  vi.clearAllMocks();
  getMenuEntitlements.mockResolvedValue({
    moduleAccess: { MODULE_AGENCY: 'FULL' },
    readOnly: false,
    phase: 'ACTIVE',
    enforcement: 'enforce'
  });
  getMyDisabledMenus.mockResolvedValue([]);
  listSaleCommissions.mockResolvedValue({
    items: [commission],
    totals: { amountInclTax: 4_000_000, paidAmount: 0, remainingAmount: 4_000_000 }
  });
});

describe('Commissions de vente dans la coquille', () => {
  it.each([true, false])(
    'ne remonte pas la coquille (desktop=%s) : appels bornés',
    async desktop => {
      viewport.desktop = desktop;
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <LanguageProvider>
          <AuthContext.Provider value={auth}>
            <QueryClientProvider client={queryClient}>
              <AntApp>
                <MemoryRouter initialEntries={[`/tenant/${TENANT}/sales/commissions`]}>
                  <Routes>
                    <Route element={<AppShell />}>
                      <Route path="/tenant/:tenantId/sales/commissions" element={<SaleCommissions />} />
                    </Route>
                  </Routes>
                </MemoryRouter>
              </AntApp>
            </QueryClientProvider>
          </AuthContext.Provider>
        </LanguageProvider>
      );

      expect(await screen.findByText('HT-2026-0001', {}, { timeout: 8000 })).toBeInTheDocument();
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(getMenuEntitlements.mock.calls.length).toBeLessThanOrEqual(3);
      expect(getMyDisabledMenus.mock.calls.length).toBeLessThanOrEqual(3);
      expect(aiStatus.mock.calls.length).toBeLessThanOrEqual(3);
      expect(listSaleCommissions.mock.calls.length).toBeLessThanOrEqual(2);
    },
    30000
  );
});

describe('Commissions de vente — formulaire d’encaissement', () => {
  it('n’instancie aucun useForm non connecté et borne les rendus de la page', async () => {
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let rendus = 0;
    render(
      <QueryClientProvider client={queryClient}>
        <AntApp>
          <MemoryRouter initialEntries={[`/tenant/${TENANT}/sales/commissions`]}>
            <Routes>
              <Route
                path="/tenant/:tenantId/sales/commissions"
                element={
                  <React.Profiler id="page" onRender={() => (rendus += 1)}>
                    <SaleCommissions />
                  </React.Profiler>
                }
              />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    );

    expect(await screen.findByText('HT-2026-0001', {}, { timeout: 8000 })).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(rendus).toBeLessThanOrEqual(8);
    expect(listSaleCommissions).toHaveBeenCalledTimes(1);
    const avertissements = erreurs.mock.calls.filter(args => String(args[0]).includes('not connected'));
    expect(avertissements).toHaveLength(0);
    erreurs.mockRestore();
  }, 30000);
});
