import type { Mock } from 'vitest';
import apiClient from '../../utils/api-client';
import { listMembers } from '../../services/membership-service';

/**
 * Filtres de la liste des collaborateurs : l'API `GET /tenants/:id/users` lit
 * `search`, `status` (CSV) et `roleId`. Un `role` envoyé sous son ancien nom
 * serait ignoré en silence par l'API : le service le traduit.
 */

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn() }
}));

const mockApiClient = apiClient as unknown as { get: Mock };

describe('listMembers — paramètres envoyés à l’API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.get.mockResolvedValue({ data: { success: true, data: { members: [], pagination: {} } } });
  });

  it('envoie roleId tel quel', async () => {
    await listMembers('t1', { search: 'kou', status: 'ACTIVE,DISABLED', roleId: 'r1', page: 1, limit: 20 });
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/t1/users', {
      params: { search: 'kou', status: 'ACTIVE,DISABLED', roleId: 'r1', page: 1, limit: 20 }
    });
  });

  it('traduit l’ancien nom role en roleId', async () => {
    await listMembers('t1', { role: 'r2' });
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/t1/users', { params: { roleId: 'r2' } });
  });

  it('roleId prime sur role', async () => {
    await listMembers('t1', { role: 'r2', roleId: 'r1' });
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/t1/users', { params: { roleId: 'r1' } });
  });

  it('sans filtre, aucun paramètre', async () => {
    await listMembers('t1');
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/t1/users', { params: undefined });
  });
});
