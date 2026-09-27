import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicCharges } from '../../pages/syndics/SyndicCharges';

/**
 * Constat de recette (module 7) : `InputNumber max={paymentOutstanding}`
 * plafonnait silencieusement la saisie à la perte de focus — une saisie de
 * 250 000 sur un reste dû de 200 000 partait donc avec 200 000 sans que
 * personne ne le remarque. Ce test utilise le VRAI antd (pas le mock léger
 * de ChargesPage.test.tsx) : seul un rendu réel du <Form> déclenche la
 * validation du champ et affiche le message d'erreur.
 */

const getSyndicate = vi.fn();
const listSyndicateLots = vi.fn();
const listChargeCalls = vi.fn();
const createChargeCall = vi.fn();
const recordChargePayment = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  getSyndicate: (...args: unknown[]) => getSyndicate(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
  listChargeCalls: (...args: unknown[]) => listChargeCalls(...args),
  createChargeCall: (...args: unknown[]) => createChargeCall(...args),
  recordChargePayment: (...args: unknown[]) => recordChargePayment(...args)
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

function renderWithRoute() {
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

describe('SyndicCharges — validation du montant du paiement (module 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSyndicate.mockResolvedValue({
      id: 'syndic-1',
      tenantId: 'tenant-1',
      name: 'Residence Test',
      address: 'Dakar',
      totalLots: 1,
      totalBuildings: 1,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    listSyndicateLots.mockResolvedValue([
      {
        id: 'lot-1',
        syndicateId: 'syndic-1',
        lotNumber: 'ACA-A1',
        lotType: 'APARTMENT',
        generalShares: 100,
        createdAt: '',
        updatedAt: ''
      }
    ]);
    listChargeCalls.mockResolvedValue([
      {
        id: 'charge-1',
        lotId: 'lot-1',
        syndicateId: 'syndic-1',
        period: '2026-Q2',
        amount: 200000,
        currency: 'XOF',
        dueDate: '2026-06-10T00:00:00.000Z',
        status: 'PENDING',
        payments: [],
        createdAt: '',
        updatedAt: ''
      }
    ]);
  });

  it('refuse une saisie superieure au reste du : message affiche, aucun appel API', async () => {
    renderWithRoute();

    const payButton = await screen.findByText('Enregistrer un paiement');
    fireEvent.click(payButton);

    const amountInput = document.getElementById('amount') as HTMLInputElement;
    expect(amountInput).toBeTruthy();
    fireEvent.change(amountInput, { target: { value: '250000' } });
    fireEvent.blur(amountInput);

    const submitButton = await screen.findByText('Enregistrer');
    fireEvent.click(submitButton);

    expect(await screen.findByText(/Le montant dépasse le reste dû/)).toBeTruthy();

    await waitFor(() => {
      expect(recordChargePayment).not.toHaveBeenCalled();
    });
  });

  it('accepte une saisie egale au reste du', async () => {
    renderWithRoute();
    recordChargePayment.mockResolvedValue({ id: 'payment-1' });

    const payButton = await screen.findByText('Enregistrer un paiement');
    fireEvent.click(payButton);

    const amountInput = document.getElementById('amount') as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '200000' } });
    fireEvent.blur(amountInput);

    const methodSelect = document.getElementById('method');
    expect(methodSelect).toBeTruthy();

    const dateInput = document.getElementById('paidAt') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '10/06/2026' } });
    fireEvent.blur(dateInput);

    const submitButton = await screen.findByText('Enregistrer');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(recordChargePayment).toHaveBeenCalledWith(
        'tenant-1',
        'syndic-1',
        'charge-1',
        expect.objectContaining({ amount: 200000 })
      );
    });
  });
});
