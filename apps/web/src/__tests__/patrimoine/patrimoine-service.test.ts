import type { Mock } from 'vitest';
import apiClient from '../../utils/api-client';
import {
  deleteExpense,
  deleteLoan,
  downloadPatrimoineExport,
  getPatrimoinePerformance,
  getPropertyYield,
  updateValuation,
  updateWorkProgram
} from '../../services/patrimoine-service';

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

const mockApiClient = apiClient as unknown as {
  get: Mock;
  post: Mock;
  patch: Mock;
  delete: Mock;
};

describe('patrimoine-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(mockApiClient.patch).toHaveBeenCalledWith('/tenants/tenant-2/properties/property-3/valuations/valuation-4', {
      notes: 'updated'
    });
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

  it('downloads the agency-wide patrimoine export as a blob', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    mockApiClient.get.mockResolvedValueOnce({
      data: blob,
      headers: { 'content-disposition': "attachment; filename*=UTF-8''Patrimoine.pdf" }
    } as never);

    const result = await downloadPatrimoineExport('tenant-1', 'pdf');

    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/patrimoine/export?format=pdf', {
      responseType: 'blob'
    });
    expect(result).toEqual({ blob, filename: 'Patrimoine.pdf' });
  });

  it('downloads a single property patrimoine export, propertyId encoded, with a fallback filename', async () => {
    const blob = new Blob(['xlsx']);
    mockApiClient.get.mockResolvedValueOnce({ data: blob, headers: {} } as never);

    const result = await downloadPatrimoineExport('tenant-1', 'xlsx', 'bien/7');

    expect(mockApiClient.get).toHaveBeenCalledWith(
      '/tenants/tenant-1/properties/bien%2F7/patrimoine/export?format=xlsx',
      { responseType: 'blob' }
    );
    expect(result).toEqual({ blob, filename: 'patrimoine.xlsx' });
  });
});
