import apiClient from '../../utils/api-client';
import {
  getLotAdvance,
  getMonthlyTracking,
  listOpenLotCharges,
  previewLotPayment,
  recordLotPayment
} from '../../services/syndic-lot-payment-service';

// Frontière réseau (AGENTS.md) : seul `api-client` est mocké, le service réel
// tourne par-dessus.
vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

const mockApiClient = apiClient as any;

describe('syndic-lot-payment-service (lot S2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recordLotPayment envoie POST .../lots/:lotId/paiements avec le corps attendu', async () => {
    mockApiClient.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          payment: { id: 'payment-1', lotId: 'lot-1', chargeCallId: 'charge-1', amount: 50000, unallocatedAmount: 0 },
          allocations: [],
          advance: 0,
          lotAdvanceBalance: 0,
          currency: 'XOF'
        }
      }
    });

    const result = await recordLotPayment('tenant-1', 'syndic-1', 'lot-1', {
      amount: 50000,
      paidAt: '2026-06-05T00:00:00.000Z',
      method: 'VIREMENT',
      reference: 'REF-1',
      chargeCallIds: ['charge-1']
    });

    expect(mockApiClient.post).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/lots/lot-1/paiements', {
      amount: 50000,
      paidAt: '2026-06-05T00:00:00.000Z',
      method: 'VIREMENT',
      reference: 'REF-1',
      chargeCallIds: ['charge-1']
    });
    expect(result.payment.id).toBe('payment-1');
  });

  it('previewLotPayment envoie POST .../paiements/apercu (aucune écriture)', async () => {
    mockApiClient.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          payment: { id: null, lotId: 'lot-1', chargeCallId: 'charge-1', amount: 50000, unallocatedAmount: 10000 },
          allocations: [],
          advance: 10000,
          lotAdvanceBalance: 10000,
          currency: 'XOF'
        }
      }
    });

    const result = await previewLotPayment('tenant-1', 'syndic-1', 'lot-1', {
      amount: 50000,
      paidAt: '2026-06-05T00:00:00.000Z',
      method: 'VIREMENT'
    });

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/tenants/tenant-1/syndics/syndic-1/lots/lot-1/paiements/apercu',
      expect.objectContaining({ amount: 50000 })
    );
    expect(result.payment.id).toBeNull();
    expect(result.advance).toBe(10000);
  });

  it('getLotAdvance envoie GET .../lots/:lotId/avance', async () => {
    mockApiClient.get.mockResolvedValue({ data: { success: true, data: { advance: 15000, currency: 'XOF' } } });

    const result = await getLotAdvance('tenant-1', 'syndic-1', 'lot-1');

    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/lots/lot-1/avance');
    expect(result).toEqual({ advance: 15000, currency: 'XOF' });
  });

  it('listOpenLotCharges envoie GET .../lots/:lotId/appels-ouverts', async () => {
    mockApiClient.get.mockResolvedValue({ data: { success: true, data: [] } });

    await listOpenLotCharges('tenant-1', 'syndic-1', 'lot-1');

    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/lots/lot-1/appels-ouverts');
  });

  it('getMonthlyTracking envoie GET .../suivi-mensuel avec l’année en paramètre', async () => {
    mockApiClient.get.mockResolvedValue({
      data: { success: true, data: { year: 2026, currency: 'XOF', months: [], lots: [] } }
    });

    await getMonthlyTracking('tenant-1', 'syndic-1', 2026);

    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/suivi-mensuel', {
      params: { year: 2026 }
    });
  });
});
