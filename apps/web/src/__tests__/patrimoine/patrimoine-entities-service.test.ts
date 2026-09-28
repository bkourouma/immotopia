import type { Mock } from 'vitest';
import apiClient from '../../utils/api-client';
import {
  addEntityHolding,
  createHoldingEntity,
  deleteHoldingEntity,
  getEntityConsolidation,
  getEntityTaxEstimate,
  getPropertyHoldings,
  getPropertyTaxEstimate,
  getPropertyTaxProfile,
  getTaxParameters,
  listHoldingEntities,
  removeEntityHolding,
  setPropertyHoldings,
  setPropertyTaxProfile,
  updateEntityHolding,
  updateHoldingEntity
} from '../../services/patrimoine-entities-service';

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

const mockApiClient = apiClient as unknown as {
  get: Mock;
  post: Mock;
  patch: Mock;
  put: Mock;
  delete: Mock;
};

describe('patrimoine-entities-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists holding entities with filters', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: [] } });
    await listHoldingEntities('tenant-1', { legalForm: 'SCI', country: 'CI', includeInactive: true });
    expect(mockApiClient.get).toHaveBeenCalledWith(
      '/tenants/tenant-1/patrimoine/entities?legalForm=SCI&country=CI&includeInactive=true'
    );
  });

  it('lists holding entities without filters', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: [] } });
    await listHoldingEntities('tenant-1');
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/patrimoine/entities');
  });

  it('creates a holding entity', async () => {
    mockApiClient.post.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await createHoldingEntity('tenant-1', { name: 'SCI Test', legalForm: 'SCI', country: 'CI' });
    expect(mockApiClient.post).toHaveBeenCalledWith('/tenants/tenant-1/patrimoine/entities', {
      name: 'SCI Test',
      legalForm: 'SCI',
      country: 'CI'
    });
  });

  it('updates a holding entity', async () => {
    mockApiClient.patch.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await updateHoldingEntity('tenant-1', 'entity-1', { name: 'Nouveau nom' });
    expect(mockApiClient.patch).toHaveBeenCalledWith('/tenants/tenant-1/patrimoine/entities/entity-1', {
      name: 'Nouveau nom'
    });
  });

  it('deletes a holding entity', async () => {
    mockApiClient.delete.mockResolvedValueOnce({});
    await deleteHoldingEntity('tenant-1', 'entity-1');
    expect(mockApiClient.delete).toHaveBeenCalledWith('/tenants/tenant-1/patrimoine/entities/entity-1');
  });

  it('adds an entity holding', async () => {
    mockApiClient.post.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await addEntityHolding('tenant-1', 'entity-1', { propertyId: 'property-1', sharePercent: 50 });
    expect(mockApiClient.post).toHaveBeenCalledWith('/tenants/tenant-1/patrimoine/entities/entity-1/holdings', {
      propertyId: 'property-1',
      sharePercent: 50
    });
  });

  it('updates an entity holding', async () => {
    mockApiClient.patch.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await updateEntityHolding('tenant-1', 'entity-1', 'holding-1', { sharePercent: 75 });
    expect(mockApiClient.patch).toHaveBeenCalledWith(
      '/tenants/tenant-1/patrimoine/entities/entity-1/holdings/holding-1',
      { sharePercent: 75 }
    );
  });

  it('removes an entity holding', async () => {
    mockApiClient.delete.mockResolvedValueOnce({});
    await removeEntityHolding('tenant-1', 'entity-1', 'holding-1');
    expect(mockApiClient.delete).toHaveBeenCalledWith(
      '/tenants/tenant-1/patrimoine/entities/entity-1/holdings/holding-1'
    );
  });

  it('gets entity consolidation', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await getEntityConsolidation('tenant-1', 'entity-1');
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/patrimoine/entities/entity-1/consolidation');
  });

  it('gets entity tax estimate with year', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await getEntityTaxEstimate('tenant-1', 'entity-1', 2027);
    expect(mockApiClient.get).toHaveBeenCalledWith(
      '/tenants/tenant-1/patrimoine/entities/entity-1/tax-estimate?year=2027'
    );
  });

  it('gets entity tax estimate without year', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await getEntityTaxEstimate('tenant-1', 'entity-1');
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/patrimoine/entities/entity-1/tax-estimate');
  });

  it('gets property holdings', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await getPropertyHoldings('tenant-1', 'property-1');
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/patrimoine/properties/property-1/holdings');
  });

  it('sets property holdings', async () => {
    mockApiClient.put.mockResolvedValueOnce({ data: { success: true, data: {} } });
    const holdings = [{ entityId: 'entity-1', sharePercent: 100 }];
    await setPropertyHoldings('tenant-1', 'property-1', { holdings });
    expect(mockApiClient.put).toHaveBeenCalledWith('/tenants/tenant-1/patrimoine/properties/property-1/holdings', {
      holdings
    });
  });

  it('gets property tax profile', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await getPropertyTaxProfile('tenant-1', 'property-1');
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/patrimoine/properties/property-1/tax-profile');
  });

  it('sets property tax profile', async () => {
    mockApiClient.put.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await setPropertyTaxProfile('tenant-1', 'property-1', { country: 'CI', builtStatus: 'BUILT' });
    expect(mockApiClient.put).toHaveBeenCalledWith('/tenants/tenant-1/patrimoine/properties/property-1/tax-profile', {
      country: 'CI',
      builtStatus: 'BUILT'
    });
  });

  it('gets property tax estimate with year and country', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await getPropertyTaxEstimate('tenant-1', 'property-1', { year: 2026, country: 'CI' });
    expect(mockApiClient.get).toHaveBeenCalledWith(
      '/tenants/tenant-1/patrimoine/properties/property-1/tax-estimate?year=2026&country=CI'
    );
  });

  it('gets tax parameters', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await getTaxParameters('tenant-1', { country: 'ML', year: 2026 });
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/patrimoine/tax-parameters?country=ML&year=2026');
  });
});
