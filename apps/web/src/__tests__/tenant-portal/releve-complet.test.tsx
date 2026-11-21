import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TenantPayments from '../../pages/TenantPortal/Payments';
import type { AccountStatement, ThirdPartyMovementLine } from '../../types/finance-types';

/**
 * « Mon relevé » du portail locataire : relevé vide d'un bail récent (PR #226, aucun compte de
 * tiers encore créé) et relevé de plus d'une page (le serveur en rend 50 par défaut).
 * Mêmes précautions que `finance/releve.test.tsx` : mock couvrant chaque export, délais généreux.
 */

const getMyStatement = vi.fn();
vi.mock('../../services/finance-service', () => ({
  getAccountStatement: vi.fn(),
  getAccountStatementPdfUrl: vi.fn(),
  getMyStatement: (...a: unknown[]) => getMyStatement(...a)
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));
vi.mock('../../services/tenantPortalService', () => ({
  tenantPortalService: {
    getInstallments: vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: {
          installments: [],
          summary: { total: 0, paid: 0, due: 0, overdue: 0, partial: 0 },
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
        }
      }
    }),
    getPaymentHistory: vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: { payments: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }, totalPaid: 0 }
      }
    })
  }
}));
vi.mock('../../components/TenantPortal/InstallmentDetails', () => ({ default: () => null }));
vi.mock('../../components/TenantPortal/PaymentDeclarationModal', () => ({ default: () => null }));

function ligne(n: number): ThirdPartyMovementLine {
  return {
    id: `mvt-${n}`,
    movementDate: '2026-01-05',
    type: 'INSTALLMENT',
    label: `Loyer numéro ${n}`,
    amountBilled: 100_000,
    amountSettled: null,
    balanceAfter: 100_000 * n,
    currency: 'XOF',
    leaseId: 'bail-1'
  };
}

function releve(over: Partial<AccountStatement> = {}): AccountStatement {
  return {
    accountId: 'cpt-1',
    label: 'Awa Locataire',
    kind: 'TENANT',
    openingBalance: 0,
    closingBalance: 0,
    currency: 'XOF',
    movements: [],
    total: 0,
    ...over
  };
}

function mountPortail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/portal/tenant/payments']}>
        <TenantPayments />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ tenantClient: { id: 'client-9', tenantId: 'agence-9', clientType: 'RENTER' } });
});

describe('Mon relevé — portail locataire', () => {
  it('affiche un état vide propre pour un bail récent sans mouvement (pas d’erreur, pas de NaN)', async () => {
    getMyStatement.mockResolvedValue(releve({ accountId: '', label: 'Awa Locataire' }));

    const user = userEvent.setup({ delay: null });
    const { container } = mountPortail();
    await user.click(await screen.findByText('Mon relevé', {}, { timeout: 15000 }));

    expect(await screen.findByText('Aucun mouvement enregistré.', {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByText('Awa Locataire')).toBeInTheDocument();
    expect(screen.queryByText('Impossible de charger votre relevé.')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN|undefined/);
    // Une seule page lue : rien à enchaîner.
    expect(getMyStatement).toHaveBeenCalledTimes(1);
  }, 30000);

  it('enchaîne les pages quand le relevé en compte plus que la première (aucune ligne perdue)', async () => {
    const premiere = Array.from({ length: 3 }, (_, i) => ligne(i + 1));
    const suite = [ligne(4), ligne(5)];
    getMyStatement
      .mockResolvedValueOnce(releve({ movements: premiere, total: 5, closingBalance: 500_000 }))
      .mockResolvedValueOnce(releve({ movements: suite, total: 5, closingBalance: 500_000 }));

    const user = userEvent.setup({ delay: null });
    mountPortail();
    await user.click(await screen.findByText('Mon relevé', {}, { timeout: 15000 }));

    expect(await screen.findByText('Loyer numéro 5', {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByText('Loyer numéro 1')).toBeInTheDocument();
    expect(getMyStatement).toHaveBeenCalledTimes(2);
    // Première page sans paramètre, la suivante à partir des lignes déjà reçues.
    expect(getMyStatement.mock.calls[0][0]).toBeUndefined();
    expect(getMyStatement.mock.calls[1][0]).toEqual({ skip: 3, take: 200 });
  }, 30000);
});
