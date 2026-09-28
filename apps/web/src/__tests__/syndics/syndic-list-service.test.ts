import { listSyndicates } from '../../services/syndic-service';
import apiClient from '../../utils/api-client';

/**
 * `listSyndicates(tenantId)` garde sa signature `Promise<Syndicate[]>` mais
 * tourne désormais toutes les pages de `GET .../syndics` (20 par défaut côté
 * API, 100 au maximum) : une agence avec plus de 20 copropriétés ne voyait
 * que les premières dans la liste et le sélecteur « Changer de
 * copropriété ». Frontière de mock : `api-client` (voir `.claude/rules/testing.md`).
 */

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

const mockApiClient = apiClient as any;

function syndicate(id: string) {
  return { id, tenantId: 't1', name: `Résidence ${id}`, address: 'Abidjan', status: 'ACTIVE' as const };
}

describe('listSyndicates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renvoie la seule page quand tout tient dedans', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [syndicate('1'), syndicate('2')],
        pagination: { page: 1, limit: 100, total: 2, totalPages: 1 }
      }
    });

    const result = await listSyndicates('t1');

    expect(result.map(s => s.id)).toEqual(['1', '2']);
    expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/t1/syndics', { params: { page: 1, limit: 100 } });
  });

  it('tourne les pages suivantes tant que page < totalPages', async () => {
    mockApiClient.get
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: [syndicate('1'), syndicate('2')],
          pagination: { page: 1, limit: 100, total: 3, totalPages: 3 }
        }
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: [syndicate('3')],
          pagination: { page: 2, limit: 100, total: 3, totalPages: 3 }
        }
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: [syndicate('4')],
          pagination: { page: 3, limit: 100, total: 3, totalPages: 3 }
        }
      });

    const result = await listSyndicates('t1');

    expect(result.map(s => s.id)).toEqual(['1', '2', '3', '4']);
    expect(mockApiClient.get).toHaveBeenCalledTimes(3);
    expect(mockApiClient.get).toHaveBeenNthCalledWith(1, '/tenants/t1/syndics', { params: { page: 1, limit: 100 } });
    expect(mockApiClient.get).toHaveBeenNthCalledWith(2, '/tenants/t1/syndics', { params: { page: 2, limit: 100 } });
    expect(mockApiClient.get).toHaveBeenNthCalledWith(3, '/tenants/t1/syndics', { params: { page: 3, limit: 100 } });
  });

  it("s'arrête après la première page quand l'API ne renvoie pas `pagination` (compat API plus ancienne)", async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: { success: true, data: [syndicate('1'), syndicate('2')] }
    });

    const result = await listSyndicates('t1');

    expect(result.map(s => s.id)).toEqual(['1', '2']);
    expect(mockApiClient.get).toHaveBeenCalledTimes(1);
  });

  it('s’arrête dès qu’une page revient vide, même si `pagination` annonce encore des pages', async () => {
    mockApiClient.get
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: [syndicate('1')],
          pagination: { page: 1, limit: 100, total: 2, totalPages: 2 }
        }
      })
      .mockResolvedValueOnce({
        data: { success: true, data: [], pagination: { page: 2, limit: 100, total: 2, totalPages: 2 } }
      });

    const result = await listSyndicates('t1');

    expect(result.map(s => s.id)).toEqual(['1']);
    expect(mockApiClient.get).toHaveBeenCalledTimes(2);
  });
});
