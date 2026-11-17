import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicCharges } from '../../pages/syndics/SyndicCharges';
import { formModes } from './charges-form-modes-mock';

/** Réglage des champs « Fonds alimenté » et « Charge récurrente » du formulaire d'appel de charges. */

const T = { timeout: 15000 };

vi.mock('../../hooks/useFormFieldModes', async () => (await import('./charges-form-modes-mock')).formModesModule);

const getSyndicate = vi.fn();
const listSyndicateLots = vi.fn();
const listChargeCalls = vi.fn();
const createChargeCall = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  getSyndicate: (...args: unknown[]) => getSyndicate(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
  listChargeCallsPage: async (...args: unknown[]) => {
    const page = await listChargeCalls(...args);
    return page && { pagination: { page: 1, limit: 20, total: page.items.length, totalPages: 1 }, ...page };
  },
  createChargeCall: (...args: unknown[]) => createChargeCall(...args),
  listSyndicateFunds: vi.fn(async () => [{ id: 'fund-1', name: 'Fonds travaux' }]),
  assignChargeCallFund: vi.fn()
}));

vi.mock('../../services/syndic-lot-type-rates-service', () => ({
  getLotTypeRates: vi.fn(),
  updateLotTypeRates: vi.fn()
}));
vi.mock('../../services/syndic-lot-payment-service', () => ({
  listOpenLotCharges: vi.fn(async () => []),
  getLotAdvance: vi.fn(async () => ({ advance: 0, currency: 'XOF' })),
  previewLotPayment: vi.fn(),
  recordLotPayment: vi.fn()
}));
vi.mock('../../services/syndic-receipt-service', () => ({ downloadReceiptFile: vi.fn() }));
vi.mock('../../utils/save-blob', () => ({ saveBlob: vi.fn() }));

const authValue = {
  user: { id: 'user-1', email: 't@example.com', fullName: 'T', globalRole: 'USER', isActive: true },
  isAuthenticated: true,
  isLoading: false,
  error: null,
  tenantMembership: {
    id: 'm',
    tenantId: 'tenant-1',
    tenant: { id: 'tenant-1', name: 'T', slug: 't' },
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
} as unknown as AuthContextType;

async function openCreateModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue}>
        <AntApp>
          <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/charges']}>
            <Routes>
              <Route path="/tenant/:tenantId/syndics/:syndicId/charges" element={<SyndicCharges />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  const openButton = await screen.findByRole('button', { name: /Nouvel appel de charges/ }, T);
  await waitFor(() => expect((openButton as HTMLButtonElement).disabled).toBe(false), T);
  fireEvent.click(openButton);
  return screen.findByRole('dialog', {}, T);
}

describe('SyndicCharges — champs réglables du formulaire de création', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    formModes.current = {};
    getSyndicate.mockResolvedValue({ id: 'syndic-1', tenantId: 'tenant-1', name: 'Residence', status: 'ACTIVE' });
    listSyndicateLots.mockResolvedValue([
      { id: 'lot-1', syndicateId: 'syndic-1', lotNumber: 'A-01', lotType: 'APARTMENT', generalShares: 100 }
    ]);
    listChargeCalls.mockResolvedValue({
      items: [],
      summary: { totalCount: 0, totalAmount: 0, pendingCount: 0, overdueCount: 0 }
    });
  });

  it('sans réglage : fonds facultatif et charge récurrente présents', async () => {
    const dialog = await openCreateModal();
    expect(await within(dialog).findByText('Fonds alimenté (optionnel)', {}, T)).toBeTruthy();
    expect(within(dialog).getByText('Charge récurrente')).toBeTruthy();
  }, 60000);

  it('champs masqués : absents du formulaire', async () => {
    formModes.current = { fundId: 'HIDDEN', isRecurring: 'HIDDEN' };
    const dialog = await openCreateModal();
    expect(within(dialog).queryByText(/Fonds alimenté/)).toBeNull();
    expect(within(dialog).queryByText('Charge récurrente')).toBeNull();
  }, 60000);

  it('fonds obligatoire : message de validation, aucun appel API', async () => {
    formModes.current = { fundId: 'REQUIRED' };
    const dialog = await openCreateModal();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    expect(await within(dialog).findByText('Le fonds alimenté est obligatoire', {}, T)).toBeTruthy();
    expect(createChargeCall).not.toHaveBeenCalled();
  }, 60000);
});
