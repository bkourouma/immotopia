import type { Mock } from 'vitest';
import apiClient from '../../utils/api-client';
import { listMenuAccess, updateMenuAccess } from '../../services/role-menu-service';

/**
 * Coupures de menu par agence : `tenantId` voyage en paramètre de requête quand
 * il est fourni, et seulement alors (sans lui, le périmètre est la plateforme).
 */

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), put: vi.fn() }
}));

const mockApiClient = apiClient as unknown as { get: Mock; put: Mock };

describe('role-menu-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.get.mockResolvedValue({ data: { data: { TENANT_ADMIN: { 'a.b': false } } } });
    mockApiClient.put.mockResolvedValue({ data: { data: { 'a.b': false } } });
  });

  it('listMenuAccess passe tenantId en paramètre quand il est fourni', async () => {
    const result = await listMenuAccess('tenant-1');

    expect(mockApiClient.get).toHaveBeenCalledWith('/roles/menu-access', { params: { tenantId: 'tenant-1' } });
    expect(result).toEqual({ TENANT_ADMIN: { 'a.b': false } });
  });

  it("listMenuAccess n'envoie aucun paramètre sans agence", async () => {
    await listMenuAccess();
    await listMenuAccess(null);

    expect(mockApiClient.get).toHaveBeenNthCalledWith(1, '/roles/menu-access', { params: {} });
    expect(mockApiClient.get).toHaveBeenNthCalledWith(2, '/roles/menu-access', { params: {} });
  });

  it('updateMenuAccess passe tenantId en paramètre quand il est fourni', async () => {
    const result = await updateMenuAccess('TENANT_ADMIN', { 'a.b': false }, 'tenant-1');

    expect(mockApiClient.put).toHaveBeenCalledWith(
      '/roles/menu-access/TENANT_ADMIN',
      { menus: { 'a.b': false } },
      { params: { tenantId: 'tenant-1' } }
    );
    expect(result).toEqual({ 'a.b': false });
  });

  it("updateMenuAccess n'envoie aucun paramètre pour un rôle de plateforme", async () => {
    await updateMenuAccess('PLATFORM_SUPER_ADMIN', { 'a.b': true });

    expect(mockApiClient.put).toHaveBeenCalledWith(
      '/roles/menu-access/PLATFORM_SUPER_ADMIN',
      { menus: { 'a.b': true } },
      { params: {} }
    );
  });

  it("updateMenuAccess avec {} et tenantId efface la surcharge de l'agence", async () => {
    await updateMenuAccess('TENANT_ADMIN', {}, 'tenant-1');

    expect(mockApiClient.put).toHaveBeenCalledWith(
      '/roles/menu-access/TENANT_ADMIN',
      { menus: {} },
      { params: { tenantId: 'tenant-1' } }
    );
  });
});
