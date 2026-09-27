import apiClient from '../../utils/api-client';
import * as service from '../../services/syndic-provider-invoice-service';

/**
 * Lot S6 — service dédié aux factures et paiements des prestataires.
 * Mock à la frontière réseau (`api-client`), comme le reste de la suite web.
 */

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

describe('syndic-provider-invoice-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('liste les factures avec les filtres en query params', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: { success: true, data: { items: [], total: 0, page: 1, limit: 20 } }
    });

    await service.listProviderInvoices('tenant-1', 'syndic-1', {
      providerId: 'p1',
      status: 'PAID',
      page: 2,
      limit: 10
    });

    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/factures-prestataires', {
      params: { providerId: 'p1', status: 'PAID', page: 2, limit: 10 }
    });
  });

  it('crée une facture en JSON quand aucun fichier n’est fourni', async () => {
    mockApiClient.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: { invoice: { id: 'inv-1' }, incidentImputation: { linked: false, reason: 'NO_INCIDENT' } }
      }
    });

    const result = await service.createProviderInvoice('tenant-1', 'syndic-1', {
      providerId: 'p1',
      number: 'F-001',
      label: 'Nettoyage',
      invoiceDate: '2026-01-01T00:00:00.000Z',
      amountHT: 1000
    });

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/tenants/tenant-1/syndics/syndic-1/factures-prestataires',
      expect.objectContaining({ providerId: 'p1', number: 'F-001', amountHT: 1000 })
    );
    expect(result.invoice.id).toBe('inv-1');
  });

  it('crée une facture en multipart quand une pièce jointe est fournie', async () => {
    mockApiClient.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: { invoice: { id: 'inv-2' }, incidentImputation: { linked: false, reason: 'NO_INCIDENT' } }
      }
    });
    const file = new File(['contenu'], 'facture.pdf', { type: 'application/pdf' });

    await service.createProviderInvoice('tenant-1', 'syndic-1', {
      providerId: 'p1',
      number: 'F-002',
      label: 'Ascenseur',
      invoiceDate: '2026-01-01T00:00:00.000Z',
      amountHT: 500,
      file
    });

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/tenants/tenant-1/syndics/syndic-1/factures-prestataires',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  });

  it('enregistre un paiement', async () => {
    mockApiClient.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          payment: { id: 'pay-1' },
          invoice: { id: 'inv-1', status: 'PARTIALLY_PAID' },
          fund: { id: 'fund-1', name: 'Compte courant', balance: -500, currency: 'XOF' },
          fundBalanceNegative: true
        }
      }
    });

    const result = await service.payProviderInvoice('tenant-1', 'syndic-1', 'inv-1', {
      amount: 500,
      paidAt: '2026-01-05T00:00:00.000Z',
      method: 'BANK_TRANSFER'
    });

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/tenants/tenant-1/syndics/syndic-1/factures-prestataires/inv-1/paiements',
      {
        amount: 500,
        paidAt: '2026-01-05T00:00:00.000Z',
        method: 'BANK_TRANSFER'
      }
    );
    expect(result.fundBalanceNegative).toBe(true);
  });

  it('annule une facture avec un motif', async () => {
    mockApiClient.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'inv-1', status: 'CANCELLED' } } });

    await service.cancelProviderInvoice('tenant-1', 'syndic-1', 'inv-1', { reason: 'Erreur de saisie' });

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/tenants/tenant-1/syndics/syndic-1/factures-prestataires/inv-1/annulation',
      { reason: 'Erreur de saisie' }
    );
  });

  it('liste les soldes par prestataire', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: [{ providerId: 'p1', totalDue: 100 }] } });

    const result = await service.listProviderBalances('tenant-1', 'syndic-1');

    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/prestataires/soldes');
    expect(result).toHaveLength(1);
  });

  it('liste les mouvements d’un fonds avec pagination', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          fund: { id: 'fund-1', name: 'Compte', balance: 0, currency: 'XOF' },
          items: [],
          total: 0,
          page: 1,
          limit: 50
        }
      }
    });

    await service.listFundMovements('tenant-1', 'syndic-1', 'fund-1', { page: 1, limit: 50 });

    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/fonds/fund-1/mouvements', {
      params: { page: 1, limit: 50 }
    });
  });

  it('télécharge la pièce jointe d’une facture en blob', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: new Blob(['pdf']),
      headers: { 'content-disposition': "attachment; filename*=UTF-8''Facture.pdf" }
    });

    const { filename } = await service.downloadProviderInvoiceFile('tenant-1', 'syndic-1', 'inv-1', 'fallback.pdf');

    expect(mockApiClient.get).toHaveBeenCalledWith(
      '/tenants/tenant-1/syndics/syndic-1/factures-prestataires/inv-1/fichier',
      {
        responseType: 'blob'
      }
    );
    expect(filename).toBe('Facture.pdf');
  });
});
