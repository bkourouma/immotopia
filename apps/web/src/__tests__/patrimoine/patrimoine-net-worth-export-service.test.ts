import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '../../utils/api-client';
import { downloadNetWorthExport } from '../../services/patrimoine-net-worth-export-service';

vi.mock('../../utils/api-client', () => ({ default: { get: vi.fn() } }));

const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('downloadNetWorthExport', () => {
  it('appelle la route d’export en blob et lit le nom de fichier de la réponse', async () => {
    const blob = new Blob(['x']);
    mockGet.mockResolvedValueOnce({
      data: blob,
      headers: { 'content-disposition': "attachment; filename*=UTF-8''situation-patrimoniale-2026-09-29.pdf" }
    });

    const result = await downloadNetWorthExport('agence-1', 'pdf');

    expect(mockGet).toHaveBeenCalledWith('/tenants/agence-1/patrimoine/net-worth/export?format=pdf', {
      responseType: 'blob'
    });
    expect(result).toEqual({ blob, filename: 'situation-patrimoniale-2026-09-29.pdf' });
  });

  it('retombe sur un nom par défaut sans en-tête', async () => {
    mockGet.mockResolvedValueOnce({ data: new Blob(['x']), headers: {} });
    const result = await downloadNetWorthExport('agence-1', 'xlsx');
    expect(result.filename).toBe('situation-patrimoniale.xlsx');
  });
});
