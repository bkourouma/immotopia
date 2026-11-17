import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { SyndicOwnerAccount } from '../../pages/syndics/SyndicOwnerAccount';
import apiClient from '../../utils/api-client';
import { authValue, formModes } from './charges-form-modes-mock';

/** Réglage du champ « Référence » du formulaire d'ajustement du compte d'un lot. */

const T = { timeout: 15000 };

vi.mock('../../hooks/useFormFieldModes', async () => (await import('./charges-form-modes-mock')).formModesModule);

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));
vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));
vi.mock('../../components/primitives/ListSearch', () => ({ ListSearch: () => null }));

const mockApiClient = apiClient as any;

async function openAdjustmentModal() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthContext.Provider value={authValue}>
        <AntApp>
          <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/lots/lot-1/compte']}>
            <Routes>
              <Route path="/tenant/:tenantId/syndics/:syndicId/lots/:lotId/compte" element={<SyndicOwnerAccount />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByRole('button', { name: /Ajouter ajustement/ }, T));
  return screen.findByRole('dialog', {}, T);
}

describe('SyndicOwnerAccount — champ réglable « Référence »', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    formModes.current = {};
    mockApiClient.get.mockImplementation((url: string) => {
      if (url.endsWith('/compte')) {
        return Promise.resolve({
          data: {
            success: true,
            data: { id: 'acc-1', lotId: 'lot-1', balance: 0, currency: 'XOF', lot: { id: 'lot-1', lotNumber: 'A-01' } }
          }
        });
      }
      if (url.endsWith('/avance')) {
        return Promise.resolve({ data: { success: true, data: { advance: 0, currency: 'XOF' } } });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });
  });

  it('sans réglage : référence facultative', async () => {
    const dialog = await openAdjustmentModal();
    expect(within(dialog).getByText('Référence (optionnel)')).toBeTruthy();
  }, 60000);

  it('masquée : absente du formulaire', async () => {
    formModes.current = { reference: 'HIDDEN' };
    const dialog = await openAdjustmentModal();
    expect(within(dialog).queryByText(/Référence/)).toBeNull();
  }, 60000);

  it('obligatoire : message de validation, aucun envoi', async () => {
    formModes.current = { reference: 'REQUIRED' };
    const dialog = await openAdjustmentModal();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText('La référence est obligatoire', {}, T)).toBeTruthy();
    expect(mockApiClient.post).not.toHaveBeenCalled();
  }, 60000);
});
