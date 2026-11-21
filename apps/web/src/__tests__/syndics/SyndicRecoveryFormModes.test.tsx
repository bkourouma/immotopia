import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { SyndicRecovery } from '../../pages/syndics/SyndicRecovery';
import { authValue, formModes } from './charges-form-modes-mock';

/** Réglage des champs des formulaires de recouvrement (relance, pénalité, échéancier). */

const T = { timeout: 15000 };

vi.mock('../../hooks/useFormFieldModes', async () => (await import('./charges-form-modes-mock')).formModesModule);

const createLatePaymentPenalty = vi.fn();
const createPaymentSchedule = vi.fn();
const emptyPage = { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };

vi.mock('../../services/syndic-service', () => ({
  getOverdueDashboard: vi.fn(async () => ({
    items: [
      {
        chargeCallId: 'call-1',
        lotId: 'lot-1',
        lotNumber: 'A-01',
        owner: { id: 'c-1', firstName: 'Awa', lastName: 'Diop' },
        dueDate: '2026-01-01T00:00:00.000Z',
        outstanding: 10000,
        daysLate: 20
      }
    ],
    totals: { overdueCount: 1, overdueAmount: 10000 }
  })),
  listPaymentRemindersPage: vi.fn(async () => emptyPage),
  listLatePaymentPenaltiesPage: vi.fn(async () => emptyPage),
  listPaymentSchedulesPage: vi.fn(async () => emptyPage),
  listSyndicateLots: vi.fn(async () => []),
  createLatePaymentPenalty: (...args: unknown[]) => createLatePaymentPenalty(...args),
  createManualReminder: vi.fn(),
  createPaymentSchedule: (...args: unknown[]) => createPaymentSchedule(...args),
  getReminderBatchPreview: vi.fn(),
  runReminderBatch: vi.fn(),
  waiveLatePaymentPenalty: vi.fn()
}));

vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));
vi.mock('../../components/primitives/ListSearch', () => ({ ListSearch: () => null }));

async function openModal(buttonName: RegExp) {
  render(
    <AuthContext.Provider value={authValue}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AntApp>
          <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/recouvrement']}>
            <Routes>
              <Route path="/tenant/:tenantId/syndics/:syndicId/recouvrement" element={<SyndicRecovery />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
  const button = await screen.findByRole('button', { name: buttonName }, T);
  await vi.waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false), T);
  fireEvent.click(button);
  return screen.findByRole('dialog', {}, T);
}

describe('SyndicRecovery — champs réglables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    formModes.current = {};
  });

  it('pénalité : jours de retard facultatifs par défaut, masqués sur demande', async () => {
    const dialog = await openModal(/Appliquer pénalité/);
    expect(within(dialog).getByText('Jours de retard (optionnel)')).toBeTruthy();
  }, 60000);

  it('pénalité masquée : champ absent', async () => {
    formModes.current = { daysLate: 'HIDDEN' };
    const dialog = await openModal(/Appliquer pénalité/);
    expect(within(dialog).queryByText(/Jours de retard/)).toBeNull();
  }, 60000);

  it('pénalité, jours obligatoires : message, aucun appel API', async () => {
    formModes.current = { daysLate: 'REQUIRED' };
    const dialog = await openModal(/Appliquer pénalité/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Appliquer la pénalité' }));
    expect(await within(dialog).findByText('Les jours de retard sont obligatoires', {}, T)).toBeTruthy();
    expect(createLatePaymentPenalty).not.toHaveBeenCalled();
  }, 60000);

  it('échéancier masqué : date d’accord absente', async () => {
    formModes.current = { agreedAt: 'HIDDEN' };
    const dialog = await openModal(/Créer échéancier/);
    expect(within(dialog).queryByText(/Date accord/)).toBeNull();
  }, 60000);

  it('échéancier, date obligatoire : message, aucun appel API', async () => {
    formModes.current = { agreedAt: 'REQUIRED' };
    const dialog = await openModal(/Créer échéancier/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer l’échéancier' }));
    expect(await within(dialog).findByText('Indiquez la date de l’accord', {}, T)).toBeTruthy();
    expect(createPaymentSchedule).not.toHaveBeenCalled();
  }, 60000);
});
