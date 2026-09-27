import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Lot S3 (besoin 1) : service `syndic-receipt-service`. Mock à la frontière
 * réseau (`api-client`) — chaque fonction n'est qu'un appel HTTP formaté, pas
 * de logique propre à vérifier autrement que par le chemin et les paramètres
 * envoyés.
 */

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

import apiClient from '../../utils/api-client';
import {
  backfillMissingReceipts,
  downloadReceiptFile,
  listLotReceipts,
  listSyndicateReceipts,
  printReceipts,
  resendReceiptEmail
} from '../../services/syndic-receipt-service';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

describe('syndic-receipt-service (lot S3, besoin 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('liste les reçus et quittances de la copropriété avec ses filtres', async () => {
    get.mockResolvedValue({
      data: { success: true, data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } } }
    });

    await listSyndicateReceipts('tenant-1', 'syndic-1', { kind: 'QUITTANCE', lotId: 'lot-1', page: 2, limit: 10 });

    expect(get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/quittances', {
      params: {
        lotId: 'lot-1',
        contactId: undefined,
        kind: 'QUITTANCE',
        from: undefined,
        to: undefined,
        page: 2,
        limit: 10
      }
    });
  });

  it('liste les reçus d’un lot sans exiger lotId dans les filtres', async () => {
    get.mockResolvedValue({
      data: { success: true, data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } } }
    });

    await listLotReceipts('tenant-1', 'syndic-1', 'lot-9');

    expect(get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/lots/lot-9/quittances', {
      params: {
        lotId: undefined,
        contactId: undefined,
        kind: undefined,
        from: undefined,
        to: undefined,
        page: undefined,
        limit: undefined
      }
    });
  });

  it('télécharge le fichier d’un document et lit son nom dans Content-Disposition', async () => {
    const blob = new Blob(['%PDF-1.4']);
    get.mockResolvedValue({
      data: blob,
      headers: { 'content-disposition': 'attachment; filename="Quittance Q-2026-000001.pdf"' }
    });

    const result = await downloadReceiptFile('tenant-1', 'syndic-1', 'receipt-1', 'fallback.pdf');

    expect(get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/quittances/receipt-1/fichier', {
      responseType: 'blob'
    });
    expect(result.filename).toBe('Quittance Q-2026-000001.pdf');
    expect(result.blob).toBe(blob);
  });

  it('renvoie un document par e-mail', async () => {
    post.mockResolvedValue({
      data: {
        success: true,
        data: { id: 'receipt-1', number: 'Q-2026-000001', sent: true, emailedAt: '2026-09-27T10:00:00.000Z' }
      }
    });

    const result = await resendReceiptEmail('tenant-1', 'syndic-1', 'receipt-1');

    expect(post).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/quittances/receipt-1/envoi');
    expect(result.sent).toBe(true);
  });

  it('demande l’impression groupée avec la période et la grille A4', async () => {
    const blob = new Blob(['%PDF-1.4']);
    get.mockResolvedValue({
      data: blob,
      headers: { 'content-disposition': "attachment; filename*=UTF-8''Quittances%202026-09-01%20au%202026-09-30.pdf" }
    });

    const result = await printReceipts('tenant-1', 'syndic-1', {
      from: '2026-09-01',
      to: '2026-09-30',
      kind: 'ALL',
      cols: 3,
      rows: 4
    });

    expect(get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/quittances/impression', {
      params: {
        from: '2026-09-01',
        to: '2026-09-30',
        kind: 'ALL',
        lotId: undefined,
        contactId: undefined,
        cols: 3,
        rows: 4
      },
      responseType: 'blob'
    });
    expect(result.filename).toBe('Quittances 2026-09-01 au 2026-09-30.pdf');
  });

  it('génère les quittances manquantes, avec le nombre restant à traiter', async () => {
    post.mockResolvedValue({ data: { success: true, data: { created: 4, skipped: 12, remaining: 0 } } });

    const result = await backfillMissingReceipts('tenant-1', 'syndic-1');

    expect(post).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/quittances/generer-manquantes');
    expect(result).toEqual({ created: 4, skipped: 12, remaining: 0 });
  });
});
