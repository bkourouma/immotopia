import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicChargeSchedules } from '../../pages/syndics/SyndicChargeSchedules';

/**
 * Onglet « Programmation » (lot S4, besoin 6). Suit le modèle de
 * `SyndicFinances.test.tsx` : antd réel (pas de mock), frontière posée sur les
 * DEUX modules de service que la page appelle — Vitest refuse tout import
 * qu'un `vi.mock` ne déclare pas explicitement (AGENTS.md).
 */

const listChargeSchedules = vi.fn();
const getChargeSchedule = vi.fn();
const createChargeSchedule = vi.fn();
const updateChargeSchedule = vi.fn();
const deleteChargeSchedule = vi.fn();
const pauseChargeSchedule = vi.fn();
const resumeChargeSchedule = vi.fn();
const executeChargeScheduleNow = vi.fn();
const listChargeScheduleRuns = vi.fn();
const previewChargeSchedule = vi.fn();
const downloadChargeCallNotice = vi.fn();

vi.mock('../../services/syndic-charge-schedule-service', () => ({
  listChargeSchedules: (...args: unknown[]) => listChargeSchedules(...args),
  getChargeSchedule: (...args: unknown[]) => getChargeSchedule(...args),
  createChargeSchedule: (...args: unknown[]) => createChargeSchedule(...args),
  updateChargeSchedule: (...args: unknown[]) => updateChargeSchedule(...args),
  deleteChargeSchedule: (...args: unknown[]) => deleteChargeSchedule(...args),
  pauseChargeSchedule: (...args: unknown[]) => pauseChargeSchedule(...args),
  resumeChargeSchedule: (...args: unknown[]) => resumeChargeSchedule(...args),
  executeChargeScheduleNow: (...args: unknown[]) => executeChargeScheduleNow(...args),
  listChargeScheduleRuns: (...args: unknown[]) => listChargeScheduleRuns(...args),
  previewChargeSchedule: (...args: unknown[]) => previewChargeSchedule(...args),
  downloadChargeCallNotice: (...args: unknown[]) => downloadChargeCallNotice(...args)
}));

const listBudgets = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  listBudgets: (...args: unknown[]) => listBudgets(...args)
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

function mount(url = '/tenant/tenant-1/syndics/syndic-1/programmation') {
  return render(
    <AuthContext.Provider value={authValue}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/syndics/:syndicId/programmation" element={<SyndicChargeSchedules />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </AuthContext.Provider>
  );
}

const SCHEDULE_MONTHLY = {
  id: 'sched-1',
  syndicateId: 'syndic-1',
  label: 'Charges courantes mensuelles',
  frequency: 'MONTHLY',
  issueDay: 1,
  dueOffsetDays: 15,
  amountSource: 'BUDGET',
  budgetId: 'budget-1',
  budget: { id: 'budget-1', label: 'Budget 2026', fiscalYear: 2026, status: 'APPROVED' },
  fixedAmount: null,
  currency: 'XOF',
  startDate: '2026-01-01',
  endDate: null,
  active: true,
  nextRunAt: '2026-10-01T00:00:00.000Z',
  nextPeriod: {
    label: 'Octobre 2026',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    issueDate: '2026-10-01',
    dueDate: '2026-10-16'
  },
  lastRunAt: '2026-09-01T00:00:00.000Z',
  lastRun: {
    id: 'run-0',
    scheduleId: 'sched-1',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    periodLabel: 'Septembre 2026',
    status: 'SUCCESS',
    trigger: 'CRON',
    batchId: 'batch-1',
    callsCreated: 12,
    callsCovered: 2,
    notificationsSent: 10,
    notificationsSkipped: 0,
    notes: null,
    error: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    finishedAt: '2026-09-01T00:01:00.000Z'
  },
  hasIssuedPeriods: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z'
};

beforeEach(() => {
  vi.clearAllMocks();
  listBudgets.mockResolvedValue([
    {
      id: 'budget-1',
      label: 'Budget 2026',
      fiscalYear: 2026,
      status: 'APPROVED',
      totalAmount: 1_000_000,
      currency: 'XOF'
    }
  ]);
});

describe('SyndicChargeSchedules — onglet Programmation (lot S4)', () => {
  it('affiche la liste des programmations avec fréquence, prochaine émission et dernière exécution', async () => {
    listChargeSchedules.mockResolvedValue([SCHEDULE_MONTHLY]);
    mount();

    expect(await screen.findByText('Programmation des appels de charges')).toBeInTheDocument();
    expect(await screen.findByText('Charges courantes mensuelles')).toBeInTheDocument();
    expect(screen.getByText('Mensuelle')).toBeInTheDocument();
    expect(screen.getByText('Octobre 2026')).toBeInTheDocument();
    expect(screen.getByText(/Septembre 2026/)).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('crée une programmation après validation du formulaire', async () => {
    listChargeSchedules.mockResolvedValueOnce([]).mockResolvedValueOnce([SCHEDULE_MONTHLY]);
    createChargeSchedule.mockResolvedValue(SCHEDULE_MONTHLY);
    mount();

    expect(await screen.findByText('Aucune programmation pour cette copropriété.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Nouvelle programmation'));
    const labelInput = await screen.findByLabelText('Libellé');
    fireEvent.change(labelInput, { target: { value: 'Charges courantes mensuelles' } });

    // Source du montant reste BUDGET (valeur par défaut) : le budget approuvé
    // doit être choisi avant de créer, sinon le formulaire refuse.
    const budgetSelect = await screen.findByLabelText('Budget');
    fireEvent.mouseDown(budgetSelect);
    fireEvent.click(await screen.findByText('Budget 2026 (2026)'));

    fireEvent.click(screen.getByText('Créer'));

    await waitFor(() => {
      expect(createChargeSchedule).toHaveBeenCalledWith(
        'tenant-1',
        'syndic-1',
        expect.objectContaining({ label: 'Charges courantes mensuelles', amountSource: 'BUDGET', budgetId: 'budget-1' })
      );
    });
  });

  it('refuse la création sans libellé (validation du formulaire)', async () => {
    listChargeSchedules.mockResolvedValue([]);
    mount();

    fireEvent.click(await screen.findByText('Nouvelle programmation'));
    fireEvent.click(screen.getByText('Créer'));

    expect(await screen.findByText('Le libellé est obligatoire')).toBeInTheDocument();
    expect(createChargeSchedule).not.toHaveBeenCalled();
  });

  it("affiche l'aperçu des prochaines périodes dans le tiroir", async () => {
    listChargeSchedules.mockResolvedValue([SCHEDULE_MONTHLY]);
    previewChargeSchedule.mockResolvedValue({
      scheduleId: 'sched-1',
      active: true,
      periods: [
        {
          label: 'Octobre 2026',
          periodStart: '2026-10-01',
          periodEnd: '2026-10-31',
          issueDate: '2026-10-01',
          dueDate: '2026-10-16',
          totalAmount: 1_000_000,
          currency: 'XOF',
          budgetId: 'budget-1',
          lots: [{ lotId: 'lot-1', lotNumber: 'A01', amount: 500_000 }],
          error: null
        }
      ]
    });
    mount();

    fireEvent.click(await screen.findByText('Ouvrir'));
    fireEvent.click(await screen.findByText('Aperçu'));

    await waitFor(() => expect(previewChargeSchedule).toHaveBeenCalledWith('tenant-1', 'syndic-1', 'sched-1'));
    expect(await screen.findByText('A01')).toBeInTheDocument();
    expect(screen.getAllByText(/500\s000/).length).toBeGreaterThan(0);
  });

  it('exécute la programmation et affiche la synthèse (appels créés, couverts, notifications)', async () => {
    listChargeSchedules.mockResolvedValue([SCHEDULE_MONTHLY]);
    executeChargeScheduleNow.mockResolvedValue({
      run: {
        status: 'SUCCESS',
        alreadyProcessed: false,
        runId: 'run-2',
        periodStart: '2026-10-01',
        periodLabel: 'Octobre 2026',
        batchId: 'batch-2',
        callsCreated: 8,
        callsCovered: 1,
        notificationsSent: 7,
        notificationsSkipped: 0,
        error: null
      },
      schedule: SCHEDULE_MONTHLY
    });
    mount();

    fireEvent.click(await screen.findByText('Exécuter maintenant', {}, { timeout: 15000 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Exécuter' }, { timeout: 15000 }));

    await waitFor(() => expect(executeChargeScheduleNow).toHaveBeenCalledWith('tenant-1', 'syndic-1', 'sched-1'), {
      timeout: 15000
    });
    expect(await screen.findByText(/Exécution réussie/, {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByText(/8 appel/)).toBeInTheDocument();
  });

  it('signale les avis non envoyés dans la synthèse quand notificationsSkipped > 0', async () => {
    listChargeSchedules.mockResolvedValue([SCHEDULE_MONTHLY]);
    executeChargeScheduleNow.mockResolvedValue({
      run: {
        status: 'SUCCESS',
        alreadyProcessed: false,
        runId: 'run-3',
        periodStart: '2026-10-01',
        periodLabel: 'Octobre 2026',
        batchId: 'batch-3',
        callsCreated: 5,
        callsCovered: 0,
        notificationsSent: 3,
        notificationsSkipped: 2,
        error: null
      },
      schedule: SCHEDULE_MONTHLY
    });
    mount();

    fireEvent.click(await screen.findByText('Exécuter maintenant', {}, { timeout: 15000 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Exécuter' }, { timeout: 15000 }));

    expect(
      await screen.findByText(/2 avis non envoyé\(s\) \(détail dans l'historique\)/, {}, { timeout: 15000 })
    ).toBeInTheDocument();
  });

  it('traduit un run FAILED par TENANT_INACTIVE en libellé clair (rejouable via Exécuter maintenant)', async () => {
    const suspended = {
      ...SCHEDULE_MONTHLY,
      lastRun: { ...SCHEDULE_MONTHLY.lastRun, status: 'FAILED', error: 'TENANT_INACTIVE' }
    };
    listChargeSchedules.mockResolvedValue([suspended]);
    mount();

    expect(await screen.findByText(/Agence suspendue/, {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.queryByText('TENANT_INACTIVE')).not.toBeInTheDocument();
    // Rejouable : le bouton reste actif tant que la programmation elle-même l'est.
    expect(screen.getByRole('button', { name: /Exécuter maintenant/ })).not.toBeDisabled();
  });

  it("affiche l'historique des exécutions avec les avis non envoyés (infobulle) et un code d'erreur traduit", async () => {
    listChargeSchedules.mockResolvedValue([SCHEDULE_MONTHLY]);
    listChargeScheduleRuns.mockResolvedValue([
      {
        id: 'run-4',
        scheduleId: 'sched-1',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        periodLabel: 'Août 2026',
        status: 'SUCCESS',
        trigger: 'CRON',
        batchId: 'batch-4',
        callsCreated: 6,
        callsCovered: 1,
        notificationsSent: 3,
        notificationsSkipped: 2,
        notes: 'Avis non envoyé (propriétaire du lot différent du copropriétaire actuel) : A03, A07',
        error: null,
        createdAt: '2026-08-01T00:00:00.000Z',
        finishedAt: '2026-08-01T00:01:00.000Z'
      },
      {
        id: 'run-5',
        scheduleId: 'sched-1',
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        periodLabel: 'Juillet 2026',
        status: 'FAILED',
        trigger: 'CRON',
        batchId: null,
        callsCreated: 0,
        callsCovered: 0,
        notificationsSent: 0,
        notificationsSkipped: 0,
        notes: null,
        error: 'SUBSCRIPTION_DENIED',
        createdAt: '2026-07-01T00:00:00.000Z',
        finishedAt: '2026-07-01T00:01:00.000Z'
      }
    ]);
    mount();

    fireEvent.click(await screen.findByText('Ouvrir'));
    fireEvent.click(await screen.findByText('Historique'));

    await waitFor(() => expect(listChargeScheduleRuns).toHaveBeenCalledWith('tenant-1', 'syndic-1', 'sched-1', 50));
    expect(await screen.findByText('2 avis non envoyé(s)')).toBeInTheDocument();
    expect(await screen.findByText(/Abonnement sans module Syndic/)).toBeInTheDocument();
    expect(screen.queryByText('SUBSCRIPTION_DENIED')).not.toBeInTheDocument();
  });

  it('met en pause puis reprend une programmation', async () => {
    listChargeSchedules
      .mockResolvedValueOnce([SCHEDULE_MONTHLY])
      .mockResolvedValueOnce([{ ...SCHEDULE_MONTHLY, active: false }])
      .mockResolvedValueOnce([SCHEDULE_MONTHLY]);
    pauseChargeSchedule.mockResolvedValue({ ...SCHEDULE_MONTHLY, active: false });
    resumeChargeSchedule.mockResolvedValue(SCHEDULE_MONTHLY);
    mount();

    fireEvent.click(await screen.findByText('Pause'));
    await waitFor(() => expect(pauseChargeSchedule).toHaveBeenCalledWith('tenant-1', 'syndic-1', 'sched-1'));

    fireEvent.click(await screen.findByText('Reprise'));
    await waitFor(() => expect(resumeChargeSchedule).toHaveBeenCalledWith('tenant-1', 'syndic-1', 'sched-1'));
  });

  it('supprimer une programmation déjà émise la désactive au lieu de la supprimer', async () => {
    listChargeSchedules
      .mockResolvedValueOnce([SCHEDULE_MONTHLY])
      .mockResolvedValueOnce([{ ...SCHEDULE_MONTHLY, active: false }]);
    deleteChargeSchedule.mockResolvedValue({
      deleted: false,
      deactivated: true,
      schedule: { ...SCHEDULE_MONTHLY, active: false }
    });
    mount();

    fireEvent.click(await screen.findByRole('button', { name: /Supprimer/ }, { timeout: 15000 }));
    const confirmButtons = await screen.findAllByRole('button', { name: 'Supprimer' }, { timeout: 15000 });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(deleteChargeSchedule).toHaveBeenCalledWith('tenant-1', 'syndic-1', 'sched-1'), {
      timeout: 15000
    });
  });
});
