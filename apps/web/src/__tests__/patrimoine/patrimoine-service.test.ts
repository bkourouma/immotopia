import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import apiClient from '../../utils/api-client';
import {
  deleteExpense,
  deleteLoan,
  getPatrimoinePerformance,
  getPropertyYield,
  updateValuation,
  updateWorkProgram
} from '../../services/patrimoine-service';

jest.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: require('@jest/globals').jest.fn(),
    post: require('@jest/globals').jest.fn(),
    patch: require('@jest/globals').jest.fn(),
    delete: require('@jest/globals').jest.fn()
  }
}));

const mockApiClient = apiClient as unknown as {
  get: jest.Mock;
  post: jest.Mock;
  patch: jest.Mock;
  delete: jest.Mock;
};

describe('patrimoine-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds yield endpoint without assumptions', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: {} } } as never);
    await getPropertyYield('tenant-1', 'property-1');
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/properties/property-1/yield');
  });

  it('builds yield endpoint with assumptions query params', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: {} } } as never);
    await getPropertyYield('tenant-1', 'property-1', {
      years: 12,
      valueGrowthRate: 0.03,
      rentGrowthRate: 0.02,
      expenseGrowthRate: 0.025,
      vacancyRate: 0.05
    });
    expect(mockApiClient.get).toHaveBeenCalledWith(
      '/tenants/tenant-1/properties/property-1/yield?years=12&valueGrowthRate=0.03&rentGrowthRate=0.02&expenseGrowthRate=0.025&vacancyRate=0.05'
    );
  });

  it('builds performance endpoint with property and assumptions', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: {} } } as never);
    await getPatrimoinePerformance('tenant-9', 'property-7', {
      years: 8,
      valueGrowthRate: 0.04,
      rentGrowthRate: 0.015
    });
    expect(mockApiClient.get).toHaveBeenCalledWith(
      '/tenants/tenant-9/patrimoine/performance?propertyId=property-7&years=8&valueGrowthRate=0.04&rentGrowthRate=0.015'
    );
  });

  it('calls patch valuation endpoint', async () => {
    mockApiClient.patch.mockResolvedValueOnce({ data: { success: true, data: {} } } as never);
    await updateValuation('tenant-2', 'property-3', 'valuation-4', { notes: 'updated' });
    expect(mockApiClient.patch).toHaveBeenCalledWith(
      '/tenants/tenant-2/properties/property-3/valuations/valuation-4',
      { notes: 'updated' }
    );
  });

  it('calls patch work-program endpoint', async () => {
    mockApiClient.patch.mockResolvedValueOnce({ data: { success: true, data: {} } } as never);
    await updateWorkProgram('tenant-2', 'property-3', 'program-11', { status: 'COMPLETED' });
    expect(mockApiClient.patch).toHaveBeenCalledWith(
      '/tenants/tenant-2/properties/property-3/work-programs/program-11',
      { status: 'COMPLETED' }
    );
  });

  it('calls delete expense endpoint', async () => {
    mockApiClient.delete.mockResolvedValueOnce({} as never);
    await deleteExpense('tenant-2', 'property-3', 'expense-5');
    expect(mockApiClient.delete).toHaveBeenCalledWith('/tenants/tenant-2/properties/property-3/expenses/expense-5');
  });

  it('calls delete loan endpoint', async () => {
    mockApiClient.delete.mockResolvedValueOnce({} as never);
    await deleteLoan('tenant-2', 'property-3', 'loan-9');
    expect(mockApiClient.delete).toHaveBeenCalledWith('/tenants/tenant-2/properties/property-3/loans/loan-9');
  });
});

