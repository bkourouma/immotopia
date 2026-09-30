import apiClient from '../../utils/api-client';
import { listAllChargeCallsWithSummary, listLotOwnerAccountTransactionsWithTotal } from '../../services/syndic-service';

/**
 * BUG-2026-09-30-047 : la synthèse (cartes) vient de l'API ; la liste tourne
 * les pages jusqu'à épuisement, avec les mêmes filtres à chaque page.
 */

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const rows = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}` }));

describe('listAllChargeCallsWithSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rassemble plus de 100 appels et garde la synthèse serveur de la première page', async () => {
    const summary = { totalCount: 120, totalAmount: 12000000, pendingCount: 100, overdueCount: 20 };
    get
      .mockResolvedValueOnce({ data: { success: true, data: rows(100, 'a'), summary } })
      .mockResolvedValueOnce({ data: { success: true, data: rows(20, 'b'), summary } });

    const result = await listAllChargeCallsWithSummary('t1', 's1', { status: 'OVERDUE', period: '2026-T1' });

    expect(result.items).toHaveLength(120);
    expect(result.summary).toEqual(summary);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenNthCalledWith(1, '/tenants/t1/syndics/s1/charges', {
      params: { status: 'OVERDUE', period: '2026-T1', page: 1, limit: 100 }
    });
    expect(get).toHaveBeenNthCalledWith(2, '/tenants/t1/syndics/s1/charges', {
      params: { status: 'OVERDUE', period: '2026-T1', page: 2, limit: 100 }
    });
  });
});

describe('listLotOwnerAccountTransactionsWithTotal', () => {
  it('renvoie le nombre total compté par l’API, pas la taille de la page', async () => {
    get.mockResolvedValueOnce({ data: { success: true, data: rows(100, 'tx'), summary: { totalCount: 240 } } });
    const result = await listLotOwnerAccountTransactionsWithTotal('t1', 's1', 'l1', { page: 1, limit: 100 });
    expect(result.items).toHaveLength(100);
    expect(result.totalCount).toBe(240);
  });
});
