import type { Mock } from 'vitest';
import apiClient from '../../utils/api-client';
import { exportAuditLogs, getAuditLogs } from '../../services/audit-service';

/**
 * Journal d'audit de la plateforme (spec 023, phase 4) : chemins et paramètres
 * de `audit-service.ts`. L'API rejette en 400 tout paramètre inconnu : seules
 * les clés définies et non vides partent.
 */

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: vi.fn()
  }
}));

const mockApiClient = apiClient as unknown as { get: Mock };

const PAGE = { success: true, data: { logs: [], nextCursor: null } };

describe('getAuditLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.get.mockResolvedValue({ data: PAGE });
  });

  it('interroge /admin/audit et rend le corps de la réponse', async () => {
    const result = await getAuditLogs();

    expect(mockApiClient.get).toHaveBeenCalledWith('/admin/audit', { params: {} });
    expect(result).toEqual(PAGE);
  });

  it('ne transmet que les clés définies et non vides', async () => {
    await getAuditLogs({
      tenantId: 'tenant-1',
      category: 'DATA',
      outcome: undefined,
      actionKey: '',
      requestId: 'req-1',
      cursor: 'curseur-2',
      limit: 50
    });

    expect(mockApiClient.get).toHaveBeenCalledWith('/admin/audit', {
      params: { tenantId: 'tenant-1', category: 'DATA', requestId: 'req-1', cursor: 'curseur-2', limit: 50 }
    });
  });
});

describe('exportAuditLogs', () => {
  const blob = new Blob(['a;b'], { type: 'text/csv' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('demande le CSV en blob avec les filtres, sans cursor ni limit, et lit le nom de fichier', async () => {
    mockApiClient.get.mockResolvedValue({
      data: blob,
      headers: { 'content-disposition': 'attachment; filename="journal-audit-2026-10-01.csv"' }
    });

    const result = await exportAuditLogs({
      tenantId: 'tenant-1',
      actionKey: '',
      startDate: '2026-09-01',
      cursor: 'x',
      limit: 10
    } as never);

    expect(mockApiClient.get).toHaveBeenCalledWith('/admin/audit/export', {
      params: { tenantId: 'tenant-1', startDate: '2026-09-01' },
      responseType: 'blob'
    });
    expect(result).toEqual({ blob, filename: 'journal-audit-2026-10-01.csv', truncated: false });
  });

  it('signale la troncature lue dans x-export-truncated', async () => {
    mockApiClient.get.mockResolvedValue({
      data: blob,
      headers: { 'content-disposition': 'attachment; filename="j.csv"', 'x-export-truncated': 'true' }
    });

    expect((await exportAuditLogs()).truncated).toBe(true);
  });

  it('retombe sur un nom daté sans Content-Disposition', async () => {
    mockApiClient.get.mockResolvedValue({ data: blob, headers: {} });

    expect((await exportAuditLogs()).filename).toMatch(/^journal-audit-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
