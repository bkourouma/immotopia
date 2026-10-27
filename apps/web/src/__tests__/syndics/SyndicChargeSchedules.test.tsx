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
const resendChargeScheduleRunNotices = vi.fn();

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
  downloadChargeCallNotice: (...args: unknown[]) => downloadChargeCallNotice(...args),
  resendChargeScheduleRunNotices: (...args: unknown[]) => resendChargeScheduleRunNotices(...args)
}));

const listBudgets = vi.fn();
const listSyndicateLots = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  listBudgets: (...args: unknown[]) => listBudgets(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args)
}));

const getLotTypeRates = vi.fn();

vi.mock('../../services/syndic-lot-type-rates-service', () => ({
  getLotTypeRates: (...args: unknown[]) => getLotTypeRates(...args),
  updateLotTypeRates: vi.fn()
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
  listSyndicateLots.mockResolvedValue([
    { id: 'lot-1', syndicateId: 'syndic-1', lotNumber: 'A01', lotType: 'APARTMENT', generalShares: 100 },
    { id: 'lot-2', syndicateId: 'syndic-1', lotNumber: 'A02', lotType: 'APARTMENT', generalShares: 300 }
  ]);
  getLotTypeRates.mockResolvedValue({
    rates: { APARTMENT: 25000 },
    lotTypesPresent: [{ lotType: 'APARTMENT', count: 2 }],
    missingTypes: [],
    isEmpty: false,
    updatedAt: null
  });
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

  it("affiche l'historique des exécutions avec les avis non envoyés en clair (sans survol) et un code d'erreur traduit", async () => {
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
    // Compteurs ET raison visibles directement dans le tableau, sans survol.
    expect(await screen.findByText(/3 avis envoyé\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/2 non envoyé\(s\)/)).toBeInTheDocument();
    expect(
      screen.getByText('Avis non envoyé (propriétaire du lot différent du copropriétaire actuel) : A03, A07')
    ).toBeInTheDocument();
    expect(await screen.findByText(/Abonnement sans module Syndic/)).toBeInTheDocument();
    expect(screen.queryByText('SUBSCRIPTION_DENIED')).not.toBeInTheDocument();
  });

  it("renvoie les avis non envoyés depuis l'historique et affiche le résultat", async () => {
    listChargeSchedules.mockResolvedValue([SCHEDULE_MONTHLY]);
    const run4 = {
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
      notes: 'Avis non envoyé (copropriétaire sans e-mail ni WhatsApp exploitable) : A03, A07',
      error: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      finishedAt: '2026-08-01T00:01:00.000Z'
    };
    listChargeScheduleRuns.mockResolvedValue([run4]);
    resendChargeScheduleRunNotices.mockResolvedValue({
      resent: 2,
      stillSkipped: 0,
      run: { ...run4, notificationsSent: 5, notificationsSkipped: 0, notes: null }
    });
    mount();

    fireEvent.click(await screen.findByText('Ouvrir'));
    fireEvent.click(await screen.findByText('Historique'));
    await waitFor(() => expect(listChargeScheduleRuns).toHaveBeenCalled());

    fireEvent.click(await screen.findByText('Renvoyer les avis non envoyés'));
    fireEvent.click(await screen.findByRole('button', { name: 'Renvoyer' }));

    await waitFor(() =>
      expect(resendChargeScheduleRunNotices).toHaveBeenCalledWith('tenant-1', 'syndic-1', 'sched-1', 'run-4')
    );
    expect(await screen.findByText(/2 avis envoyé\(s\)\./)).toBeInTheDocument();
  });

  it("renvoi partiel : affiche la cause de ce qui reste non envoyé et l'échéance décalée", async () => {
    listChargeSchedules.mockResolvedValue([SCHEDULE_MONTHLY]);
    const run5 = {
      id: 'run-5',
      scheduleId: 'sched-1',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      periodLabel: 'Août 2026',
      status: 'SUCCESS',
      trigger: 'CRON',
      batchId: 'batch-5',
      callsCreated: 6,
      callsCovered: 1,
      notificationsSent: 3,
      notificationsSkipped: 2,
      notes:
        "Échéance décalée au 03/11/2026\nAvis non envoyé (le serveur de messagerie a refusé l'e-mail) : A-01, A-02",
      error: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      finishedAt: '2026-08-01T00:01:00.000Z'
    };
    listChargeScheduleRuns.mockResolvedValue([run5]);
    resendChargeScheduleRunNotices.mockResolvedValue({ resent: 0, stillSkipped: 2, run: { ...run5 } });
    mount();

    fireEvent.click(await screen.findByText('Ouvrir'));
    fireEvent.click(await screen.findByText('Historique'));
    await waitFor(() => expect(listChargeScheduleRuns).toHaveBeenCalled());

    expect(await screen.findByText('Échéance décalée au 03/11/2026')).toBeInTheDocument();
    fireEvent.click(await screen.findByText('Renvoyer les avis non envoyés'));
    fireEvent.click(await screen.findByRole('button', { name: 'Renvoyer' }));

    expect(await screen.findByText(/0 avis envoyé\(s\), 2 toujours non envoyé\(s\)\./)).toBeInTheDocument();
    expect(
      screen.getAllByText("Avis non envoyé (le serveur de messagerie a refusé l'e-mail) : A-01, A-02").length
    ).toBeGreaterThanOrEqual(2);
  });

  it("l'aperçu avertit quand l'échéance serait déjà passée à l'émission", async () => {
    listChargeSchedules.mockResolvedValue([SCHEDULE_MONTHLY]);
    previewChargeSchedule.mockResolvedValue({
      scheduleId: 'sched-1',
      active: true,
      periods: [
        {
          label: 'Octobre 2026',
          periodStart: '2026-10-01',
          periodEnd: '2026-10-31',
          issueDate: '2026-11-01',
          dueDate: '2026-10-16',
          totalAmount: 1_000_000,
          currency: 'XOF',
          budgetId: 'budget-1',
          lots: [{ lotId: 'lot-1', lotNumber: 'A01', amount: 500_000 }],
          error: null,
          dueDatePassed: true,
          effectiveDueDate: '2026-11-03',
          warnings: ["L'échéance du 16/10/2026 serait déjà passée à l'émission : elle sera décalée au 03/11/2026."]
        }
      ]
    });
    mount();

    fireEvent.click(await screen.findByText('Ouvrir'));
    fireEvent.click(await screen.findByText('Aperçu'));

    expect(
      await screen.findByText(
        'L’échéance du 16/10/2026 serait déjà passée à l’émission : elle sera décalée au 03/11/2026.'
      )
    ).toBeInTheDocument();
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

  it("modifie une programmation sans envoyer la clé `active` (refusée par l'API stricte)", async () => {
    listChargeSchedules.mockResolvedValue([SCHEDULE_MONTHLY]);
    previewChargeSchedule.mockResolvedValue({ scheduleId: 'sched-1', active: true, periods: [] });
    updateChargeSchedule.mockResolvedValue(SCHEDULE_MONTHLY);
    mount();

    fireEvent.click(await screen.findByText('Ouvrir'));
    const labelInput = await screen.findByLabelText('Libellé');
    fireEvent.change(labelInput, { target: { value: 'Charges renommées' } });
    fireEvent.click(screen.getByText('Enregistrer'));

    await waitFor(() => expect(updateChargeSchedule).toHaveBeenCalled());
    const payload = updateChargeSchedule.mock.calls[0][3] as Record<string, unknown>;
    expect(payload).toMatchObject({ label: 'Charges renommées' });
    expect(payload).not.toHaveProperty('active');
    expect(pauseChargeSchedule).not.toHaveBeenCalled();
    expect(resumeChargeSchedule).not.toHaveBeenCalled();
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

  describe('mode de répartition (menu lot 2)', () => {
    async function openFixedDrawer(label: string) {
      listChargeSchedules.mockResolvedValue([]);
      createChargeSchedule.mockResolvedValue(SCHEDULE_MONTHLY);
      mount();
      fireEvent.click(await screen.findByText('Nouvelle programmation'));
      fireEvent.change(await screen.findByLabelText('Libellé'), { target: { value: label } });
      fireEvent.mouseDown(screen.getByLabelText('Source du montant'));
      fireEvent.click(await screen.findByTitle('Montant fixe'));
      return screen.findByText('Par type de lot');
    }

    it('montant fixe équitable : aperçu par lot et envoi de allocationMethod EQUAL', async () => {
      await openFixedDrawer('Charges équitables');
      fireEvent.click(screen.getByText('Équitablement'));
      fireEvent.change(await screen.findByLabelText('Montant total par période'), { target: { value: '100000' } });

      expect(await screen.findByText('A01')).toBeInTheDocument();
      expect(screen.getByText('A02')).toBeInTheDocument();
      expect(screen.getAllByText(/50\s000/).length).toBeGreaterThan(0);

      fireEvent.click(screen.getByText('Créer'));
      await waitFor(() =>
        expect(createChargeSchedule).toHaveBeenCalledWith(
          'tenant-1',
          'syndic-1',
          expect.objectContaining({ amountSource: 'FIXED', allocationMethod: 'EQUAL', fixedAmount: 100000 })
        )
      );
    });

    it('par tantièmes (défaut) : aperçu au prorata des tantièmes', async () => {
      await openFixedDrawer('Charges tantièmes');
      fireEvent.change(await screen.findByLabelText('Montant total par période'), { target: { value: '100000' } });

      expect(await screen.findByText('A01')).toBeInTheDocument();
      expect(screen.getAllByText(/25\s000/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/75\s000/).length).toBeGreaterThan(0);

      fireEvent.click(screen.getByText('Créer'));
      await waitFor(() =>
        expect(createChargeSchedule).toHaveBeenCalledWith(
          'tenant-1',
          'syndic-1',
          expect.objectContaining({ allocationMethod: 'SHARES', fixedAmount: 100000 })
        )
      );
    });

    it('par type de lot : aucun montant à saisir, aperçu du barème et fixedAmount null', async () => {
      await openFixedDrawer('Charges barème');
      fireEvent.click(screen.getByText('Par type de lot'));

      await waitFor(() => expect(getLotTypeRates).toHaveBeenCalledWith('tenant-1', 'syndic-1'));
      expect(await screen.findByText('A01')).toBeInTheDocument();
      expect(screen.queryByLabelText('Montant total par période')).toBeNull();
      // 2 appartements à 25 000 : total 50 000.
      expect(screen.getAllByText(/50\s000/).length).toBeGreaterThan(0);

      fireEvent.click(screen.getByText('Créer'));
      await waitFor(() =>
        expect(createChargeSchedule).toHaveBeenCalledWith(
          'tenant-1',
          'syndic-1',
          expect.objectContaining({ allocationMethod: 'BY_LOT_TYPE', fixedAmount: null })
        )
      );
    });

    it('par type de lot avec un barème vide : avertissement, lien vers la copropriété, création bloquée', async () => {
      getLotTypeRates.mockResolvedValue({
        rates: {},
        lotTypesPresent: [{ lotType: 'APARTMENT', count: 2 }],
        missingTypes: ['APARTMENT'],
        isEmpty: true,
        updatedAt: null
      });
      await openFixedDrawer('Charges barème vide');
      fireEvent.click(screen.getByText('Par type de lot'));

      expect(await screen.findByText(/Le barème par type de lot de cette copropriété est vide/)).toBeInTheDocument();
      const link = screen.getByText('Paramétrer le barème de la copropriété').closest('a');
      expect(link?.getAttribute('href')).toBe('/tenant/tenant-1/syndics/syndic-1');

      fireEvent.click(screen.getByText('Créer'));
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(createChargeSchedule).not.toHaveBeenCalled();
    });

    it('barème indisponible (échec de chargement) : avertissement, création refusée', async () => {
      getLotTypeRates.mockRejectedValue(new Error('boom'));
      await openFixedDrawer('Charges barème en panne');
      fireEvent.click(screen.getByText('Par type de lot'));

      expect(await screen.findByText(/barème par type de lot est indisponible/)).toBeInTheDocument();
      fireEvent.click(screen.getByText('Créer'));
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(createChargeSchedule).not.toHaveBeenCalled();
    });

    it('un budget n’affiche pas le sélecteur et envoie SHARES', async () => {
      listChargeSchedules.mockResolvedValueOnce([]).mockResolvedValue([SCHEDULE_MONTHLY]);
      createChargeSchedule.mockResolvedValue(SCHEDULE_MONTHLY);
      mount();
      fireEvent.click(await screen.findByText('Nouvelle programmation'));
      fireEvent.change(await screen.findByLabelText('Libellé'), { target: { value: 'Budget' } });
      expect(screen.queryByText('Par type de lot')).toBeNull();
      fireEvent.mouseDown(await screen.findByLabelText('Budget'));
      fireEvent.click(await screen.findByText('Budget 2026 (2026)'));
      fireEvent.click(screen.getByText('Créer'));
      await waitFor(() =>
        expect(createChargeSchedule).toHaveBeenCalledWith(
          'tenant-1',
          'syndic-1',
          expect.objectContaining({ amountSource: 'BUDGET', allocationMethod: 'SHARES', fixedAmount: null })
        )
      );
    });

    describe('lots annexes (BUG-2026-10-19-004)', () => {
      const ANNEX_LABEL = 'Inclure les lots annexes (parkings, caves, locaux…)';

      it("l'interrupteur n'apparaît qu'en montant fixe + par tantièmes", async () => {
        listChargeSchedules.mockResolvedValue([]);
        mount();
        fireEvent.click(await screen.findByText('Nouvelle programmation'));
        await screen.findByLabelText('Libellé');
        // Source budget : pas d'interrupteur.
        expect(screen.queryByText(ANNEX_LABEL)).not.toBeInTheDocument();

        fireEvent.mouseDown(screen.getByLabelText('Source du montant'));
        fireEvent.click(await screen.findByTitle('Montant fixe'));
        expect(await screen.findByText(ANNEX_LABEL)).toBeInTheDocument();
        expect(
          screen.getByText('Décoché, seuls les appartements, bureaux et commerces sont appelés.')
        ).toBeInTheDocument();

        fireEvent.click(screen.getByText('Équitablement'));
        await waitFor(() => expect(screen.queryByText(ANNEX_LABEL)).not.toBeInTheDocument());
        fireEvent.click(screen.getByText('Par tantièmes'));
        expect(await screen.findByText(ANNEX_LABEL)).toBeInTheDocument();
      });

      it('est coché par défaut et envoyé à la création', async () => {
        await openFixedDrawer('Charges annexes');
        expect(await screen.findByRole('switch')).toBeChecked();
        fireEvent.change(await screen.findByLabelText('Montant total par période'), { target: { value: '100000' } });
        fireEvent.click(screen.getByText('Créer'));
        await waitFor(() =>
          expect(createChargeSchedule).toHaveBeenCalledWith(
            'tenant-1',
            'syndic-1',
            expect.objectContaining({ allocationMethod: 'SHARES', includeAnnexLots: true })
          )
        );
      });

      it('décoché, envoie includeAnnexLots false', async () => {
        await openFixedDrawer('Charges principales');
        fireEvent.click(await screen.findByRole('switch'));
        fireEvent.change(await screen.findByLabelText('Montant total par période'), { target: { value: '100000' } });
        fireEvent.click(screen.getByText('Créer'));
        await waitFor(() =>
          expect(createChargeSchedule).toHaveBeenCalledWith(
            'tenant-1',
            'syndic-1',
            expect.objectContaining({ includeAnnexLots: false })
          )
        );
      });

      it('charge la valeur de la programmation en modification', async () => {
        listChargeSchedules.mockResolvedValue([
          {
            ...SCHEDULE_MONTHLY,
            amountSource: 'FIXED',
            budgetId: null,
            budget: null,
            fixedAmount: 100000,
            allocationMethod: 'SHARES',
            includeAnnexLots: false
          }
        ]);
        previewChargeSchedule.mockResolvedValue({ scheduleId: 'sched-1', active: true, periods: [] });
        updateChargeSchedule.mockResolvedValue(SCHEDULE_MONTHLY);
        mount();
        fireEvent.click(await screen.findByText('Ouvrir'));
        expect(await screen.findByRole('switch')).not.toBeChecked();
        fireEvent.click(screen.getByText('Enregistrer'));
        await waitFor(() => expect(updateChargeSchedule).toHaveBeenCalled());
        expect(updateChargeSchedule.mock.calls[0][3]).toMatchObject({ includeAnnexLots: false });
      });
    });

    it('la liste affiche « Barème par type de lot » à la place du montant fixe', async () => {
      listChargeSchedules.mockResolvedValue([
        {
          ...SCHEDULE_MONTHLY,
          id: 'sched-2',
          label: 'Charges au barème',
          amountSource: 'FIXED',
          budgetId: null,
          budget: null,
          fixedAmount: null,
          allocationMethod: 'BY_LOT_TYPE'
        }
      ]);
      mount();
      expect(await screen.findByText('Charges au barème')).toBeInTheDocument();
      expect(screen.getByText('Barème par type de lot')).toBeInTheDocument();
    });
  });
});
