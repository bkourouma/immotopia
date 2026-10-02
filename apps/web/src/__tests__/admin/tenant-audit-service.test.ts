import type { Mock } from 'vitest';
import apiClient from '../../utils/api-client';
import { getTenantAuditLogs } from '../../services/tenant-audit-service';

/**
 * Journal d'activité d'une agence (spec 023, phase 2) : chemin et paramètres de
 * `tenant-audit-service.ts`. L'API rejette en 400 tout paramètre inconnu, donc
 * le service n'envoie que les clés définies et non vides.
 */

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: vi.fn()
  }
}));

const mockApiClient = apiClient as unknown as { get: Mock };

const PAGE = { success: true, data: { logs: [], nextCursor: null } };

describe('getTenantAuditLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.get.mockResolvedValue({ data: PAGE });
  });

  it("interroge la route d'audit de l'agence et rend le corps de la réponse", async () => {
    const result = await getTenantAuditLogs('tenant-1');

    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/audit', { params: {} });
    expect(result).toEqual(PAGE);
  });

  it("n'envoie que les filtres définis", async () => {
    await getTenantAuditLogs('tenant-1', {
      category: 'AUTH',
      outcome: undefined,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      cursor: 'abc'
    });

    const { params } = mockApiClient.get.mock.calls[0][1] as { params: Record<string, unknown> };
    expect(params).toEqual({ category: 'AUTH', startDate: '2026-09-01', endDate: '2026-09-30', cursor: 'abc' });
    expect(Object.keys(params)).not.toContain('outcome');
  });

  it("écarte les chaînes vides et n'ajoute jamais `tenantId` en query", async () => {
    await getTenantAuditLogs('tenant-1', { actionKey: '', entityType: 'PROPERTY', entityId: '', limit: 20 });

    const { params } = mockApiClient.get.mock.calls[0][1] as { params: Record<string, unknown> };
    expect(params).toEqual({ entityType: 'PROPERTY', limit: 20 });
    expect(params).not.toHaveProperty('tenantId');
  });
});
