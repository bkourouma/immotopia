import apiClient from '../../utils/api-client';
import {
  createChargeSchedule,
  deleteChargeSchedule,
  downloadChargeCallNotice,
  executeChargeScheduleNow,
  getChargeSchedule,
  listChargeScheduleRuns,
  listChargeSchedules,
  pauseChargeSchedule,
  previewChargeSchedule,
  resendChargeScheduleRunNotices,
  resumeChargeSchedule,
  updateChargeSchedule
} from '../../services/syndic-charge-schedule-service';

// Frontière réseau (AGENTS.md) : seul `api-client` est mocké, le service réel
// tourne par-dessus.
vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

const mockApiClient = apiClient as any;

describe('syndic-charge-schedule-service (lot S4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listChargeSchedules envoie GET .../programmations', async () => {
    mockApiClient.get.mockResolvedValue({ data: { success: true, data: [{ id: 'sched-1' }] } });

    const result = await listChargeSchedules('tenant-1', 'syndic-1');

    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/programmations');
    expect(result).toEqual([{ id: 'sched-1' }]);
  });

  it('getChargeSchedule envoie GET .../programmations/:scheduleId', async () => {
    mockApiClient.get.mockResolvedValue({ data: { success: true, data: { id: 'sched-1' } } });

    const result = await getChargeSchedule('tenant-1', 'syndic-1', 'sched-1');

    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/programmations/sched-1');
    expect(result).toEqual({ id: 'sched-1' });
  });

  it('createChargeSchedule envoie POST avec le corps exact', async () => {
    mockApiClient.post.mockResolvedValue({ data: { success: true, data: { id: 'sched-1' } } });

    const body = {
      label: 'Charges T1',
      frequency: 'QUARTERLY' as const,
      issueDay: 5,
      dueOffsetDays: 15,
      amountSource: 'BUDGET' as const,
      budgetId: 'budget-1',
      currency: 'XOF',
      startDate: '2026-01-01'
    };
    await createChargeSchedule('tenant-1', 'syndic-1', body);

    expect(mockApiClient.post).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/programmations', body);
  });

  it('updateChargeSchedule envoie PATCH .../programmations/:scheduleId', async () => {
    mockApiClient.patch.mockResolvedValue({ data: { success: true, data: { id: 'sched-1', active: false } } });

    await updateChargeSchedule('tenant-1', 'syndic-1', 'sched-1', { label: 'Nouveau libellé' });

    expect(mockApiClient.patch).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/programmations/sched-1', {
      label: 'Nouveau libellé'
    });
  });

  it('deleteChargeSchedule envoie DELETE et renvoie deleted/deactivated', async () => {
    mockApiClient.delete.mockResolvedValue({
      data: { success: true, data: { deleted: false, deactivated: true, schedule: { id: 'sched-1' } } }
    });

    const result = await deleteChargeSchedule('tenant-1', 'syndic-1', 'sched-1');

    expect(mockApiClient.delete).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/programmations/sched-1');
    expect(result.deactivated).toBe(true);
  });

  it('pauseChargeSchedule et resumeChargeSchedule envoient POST sur leurs sous-routes', async () => {
    mockApiClient.post.mockResolvedValue({ data: { success: true, data: { id: 'sched-1', active: false } } });
    await pauseChargeSchedule('tenant-1', 'syndic-1', 'sched-1');
    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/tenants/tenant-1/syndics/syndic-1/programmations/sched-1/pause',
      {}
    );

    mockApiClient.post.mockResolvedValue({ data: { success: true, data: { id: 'sched-1', active: true } } });
    await resumeChargeSchedule('tenant-1', 'syndic-1', 'sched-1');
    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/tenants/tenant-1/syndics/syndic-1/programmations/sched-1/reprise',
      {}
    );
  });

  it('executeChargeScheduleNow envoie POST .../executer et renvoie run + schedule', async () => {
    mockApiClient.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          run: { status: 'SUCCESS', alreadyProcessed: false, runId: 'run-1', callsCreated: 3 },
          schedule: { id: 'sched-1' }
        }
      }
    });

    const result = await executeChargeScheduleNow('tenant-1', 'syndic-1', 'sched-1');

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/tenants/tenant-1/syndics/syndic-1/programmations/sched-1/executer',
      {}
    );
    expect(result.run.callsCreated).toBe(3);
  });

  it('listChargeScheduleRuns transmet la limite en paramètre', async () => {
    mockApiClient.get.mockResolvedValue({ data: { success: true, data: [] } });

    await listChargeScheduleRuns('tenant-1', 'syndic-1', 'sched-1', 20);

    expect(mockApiClient.get).toHaveBeenCalledWith(
      '/tenants/tenant-1/syndics/syndic-1/programmations/sched-1/executions',
      { params: { limit: 20 } }
    );
  });

  it('resendChargeScheduleRunNotices envoie POST .../executions/:runId/renvoyer-avis', async () => {
    mockApiClient.post.mockResolvedValue({
      data: { success: true, data: { resent: 2, stillSkipped: 0, run: { id: 'run-1' } } }
    });

    const result = await resendChargeScheduleRunNotices('tenant-1', 'syndic-1', 'sched-1', 'run-1');

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/tenants/tenant-1/syndics/syndic-1/programmations/sched-1/executions/run-1/renvoyer-avis',
      {}
    );
    expect(result.resent).toBe(2);
  });

  it('previewChargeSchedule envoie GET .../apercu', async () => {
    mockApiClient.get.mockResolvedValue({ data: { success: true, data: { scheduleId: 'sched-1', periods: [] } } });

    const result = await previewChargeSchedule('tenant-1', 'syndic-1', 'sched-1');

    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/programmations/sched-1/apercu');
    expect(result.scheduleId).toBe('sched-1');
  });

  it('downloadChargeCallNotice demande le PDF en blob et déclenche le téléchargement', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    mockApiClient.get.mockResolvedValue({ data: blob });

    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    // jsdom ne fournit pas ces méthodes.
    (window.URL as any).createObjectURL = createObjectURL;
    (window.URL as any).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = originalCreateElement(tag);
      if (tag === 'a') element.click = clickSpy;
      return element;
    });

    await downloadChargeCallNotice('tenant-1', 'syndic-1', 'charge-1', 'avis.pdf');

    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/charges/charge-1/avis', {
      responseType: 'blob'
    });
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalled();
  });
});
