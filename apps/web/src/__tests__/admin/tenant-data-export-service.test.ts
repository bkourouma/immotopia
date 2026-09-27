import type { Mock } from 'vitest';
import apiClient from '../../utils/api-client';
import {
  deleteTenantDataExport,
  downloadTenantDataExport,
  getTenantDataExport,
  listTenantDataExports,
  requestTenantDataExport,
  type TenantDataExport
} from '../../services/tenant-data-export-service';

/**
 * Export des données d'une agence (lot S7, besoin 8) — chemins et méthodes
 * de `tenant-data-export-service.ts`. `api-client` est mocké à la frontière
 * réseau ; le téléchargement passe par `saveBlob`, mocké séparément pour ne
 * pas dépendre du DOM.
 */

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn()
  }
}));

const saveBlob = vi.fn();
vi.mock('../../utils/save-blob', () => ({
  saveBlob: (...a: unknown[]) => saveBlob(...a),
  filenameFromDisposition: (disposition: unknown, fallback: string) => {
    const header = String(disposition ?? '');
    const match = header.match(/filename="?([^";]+)"?/i);
    return match?.[1] ?? fallback;
  }
}));

const mockApiClient = apiClient as unknown as { get: Mock; post: Mock; delete: Mock };

const ROW: TenantDataExport = {
  id: 'exp-1',
  tenantId: 'tenant-1',
  status: 'READY',
  requestedBy: { id: 'user-1', fullName: 'Awa Koné', email: 'awa@example.com' },
  sizeBytes: 12_345,
  modelCount: 40,
  rowCount: 5_000,
  fileCount: 12,
  missingFileCount: 0,
  error: null,
  startedAt: '2026-09-01T10:00:00.000Z',
  finishedAt: '2026-09-01T10:05:00.000Z',
  expiresAt: '2026-09-08T10:05:00.000Z',
  createdAt: '2026-09-01T09:59:00.000Z',
  downloadPath: '/api/admin/tenants/tenant-1/data-exports/exp-1/download'
};

describe('tenant-data-export-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('demande un export (POST, corps vide)', async () => {
    mockApiClient.post.mockResolvedValueOnce({ data: { success: true, data: ROW } });
    const result = await requestTenantDataExport('tenant-1');
    expect(mockApiClient.post).toHaveBeenCalledWith('/admin/tenants/tenant-1/data-exports');
    expect(result).toEqual(ROW);
  });

  it('liste les exports de l’agence', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: [ROW] } });
    const result = await listTenantDataExports('tenant-1');
    expect(mockApiClient.get).toHaveBeenCalledWith('/admin/tenants/tenant-1/data-exports');
    expect(result).toEqual([ROW]);
  });

  it('récupère un export précis', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: ROW } });
    const result = await getTenantDataExport('tenant-1', 'exp-1');
    expect(mockApiClient.get).toHaveBeenCalledWith('/admin/tenants/tenant-1/data-exports/exp-1');
    expect(result).toEqual(ROW);
  });

  it('supprime un export', async () => {
    mockApiClient.delete.mockResolvedValueOnce({ data: { success: true } });
    await deleteTenantDataExport('tenant-1', 'exp-1');
    expect(mockApiClient.delete).toHaveBeenCalledWith('/admin/tenants/tenant-1/data-exports/exp-1');
  });

  it('télécharge l’archive avec le nom tiré de Content-Disposition', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: 'zip-content',
      headers: { 'content-disposition': 'attachment; filename="agence-export.zip"' }
    });
    await downloadTenantDataExport('tenant-1', 'exp-1');
    expect(mockApiClient.get).toHaveBeenCalledWith('/admin/tenants/tenant-1/data-exports/exp-1/download', {
      responseType: 'blob'
    });
    expect(saveBlob).toHaveBeenCalledWith('zip-content', 'agence-export.zip');
  });

  it('retombe sur immotopia-export.zip sans en-tête', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: 'zip-content', headers: {} });
    await downloadTenantDataExport('tenant-1', 'exp-1');
    expect(saveBlob).toHaveBeenCalledWith('zip-content', 'immotopia-export.zip');
  });
});
