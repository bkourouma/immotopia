import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** Accueil du portail locataire : erreur avec « Réessayer », solde et paiement en tête. */

const getDashboard = vi.fn();
vi.mock('../../../services/tenantPortalService', () => ({
  tenantPortalService: { getDashboard: (...a: unknown[]) => getDashboard(...a) }
}));

const getOnlinePaymentAvailability = vi.fn();
vi.mock('../../../services/payment-gateway-service', () => ({
  getOnlinePaymentAvailability: (...a: unknown[]) => getOnlinePaymentAvailability(...a)
}));

import TenantDashboard from '../Dashboard';

const donnees = {
  lease: {
    id: 'l1',
    propertyAddress: '12 rue des Lilas',
    startDate: '2026-01-01',
    endDate: null,
    monthlyRent: 150000,
    serviceCharges: 10000,
    status: 'ACTIVE'
  },
  currentBalance: 160000,
  overdueInstallmentsCount: 0,
  nextInstallment: { id: 'e1', period: '2026-11', dueDate: '2026-11-05', amount: 160000, status: 'DUE' },
  recentPayments: [],
  depositInfo: { amount: 300000, status: 'COLLECTED', heldAmount: 0, collectedAmount: 300000 },
  maintenanceTickets: { total: 0, open: 0, inProgress: 0, resolved: 0 }
};

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TenantDashboard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getOnlinePaymentAvailability.mockResolvedValue({ available: true, mode: 'LIVE', feesPaidBy: 'AGENCY' });
});

describe('Accueil locataire', () => {
  it('propose « Réessayer » après une erreur de chargement', async () => {
    const user = userEvent.setup();
    getDashboard.mockRejectedValueOnce(new Error('réseau')).mockResolvedValue({
      data: { success: true, data: donnees }
    });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('Solde à régler')).toBeInTheDocument();
    expect(getDashboard).toHaveBeenCalledTimes(2);
  });

  it('place le solde et « Payer en ligne » avant les informations du bail', async () => {
    getDashboard.mockResolvedValue({ data: { success: true, data: donnees } });
    mount();

    const solde = await screen.findByText('Solde à régler');
    const bail = screen.getByText('Informations du bail');
    expect(solde.compareDocumentPosition(bail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: /Payer en ligne/ })).toBeInTheDocument());
  });
});
