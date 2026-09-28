import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicCharges } from '../../pages/syndics/SyndicCharges';

/**
 * BUG-2026-09-27-008 : création d'un appel de charges.
 *   (a) un formulaire invalide ne laisse plus de rejet « Uncaught (in promise) » ;
 *   (b) une échéance passée est autorisée (saisie d'arriérés), avec un
 *       avertissement non bloquant sous le champ.
 */

const getSyndicate = vi.fn();
const listSyndicateLots = vi.fn();
const listChargeCalls = vi.fn();
const createChargeCall = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  getSyndicate: (...args: unknown[]) => getSyndicate(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
  listChargeCalls: (...args: unknown[]) => listChargeCalls(...args),
  createChargeCall: (...args: unknown[]) => createChargeCall(...args)
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

async function openCreateModal() {
  renderWithRoute();
  const openButton = await screen.findByRole('button', { name: /Nouvel appel de charges/ });
  await waitFor(() => expect((openButton as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(openButton);
  return screen.findByRole('dialog');
}

const WARNING = "Échéance passée : l'appel sera immédiatement en retard.";

describe('SyndicCharges — création d’un appel de charges (BUG-008)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSyndicate.mockResolvedValue({ id: 'syndic-1', tenantId: 'tenant-1', name: 'Residence Test', status: 'ACTIVE' });
    listSyndicateLots.mockResolvedValue([
      { id: 'lot-1', syndicateId: 'syndic-1', lotNumber: 'A-01', lotType: 'APARTMENT', generalShares: 100 }
    ]);
    listChargeCalls.mockResolvedValue([]);
  });

  it('intercepte le rejet de validation : message sous le champ, aucun appel API', async () => {
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    try {
      const dialog = await openCreateModal();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));

      expect(await within(dialog).findByText('La date est obligatoire')).toBeTruthy();
      expect(createChargeCall).not.toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('unhandledrejection', unhandled);
    }
  });

  it('accepte une échéance passée et affiche un avertissement non bloquant', async () => {
    const dialog = await openCreateModal();
    expect(within(dialog).queryByText(WARNING)).toBeNull();

    const dateInput = within(dialog).getByLabelText("Date d'échéance") as HTMLInputElement;
    fireEvent.mouseDown(dateInput);
    fireEvent.change(dateInput, { target: { value: '15/01/2020' } });
    fireEvent.keyDown(dateInput, { key: 'Enter', code: 'Enter', keyCode: 13 });

    expect(await within(dialog).findByText(WARNING)).toBeTruthy();
  });
});
