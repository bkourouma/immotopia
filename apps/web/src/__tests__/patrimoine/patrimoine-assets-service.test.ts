import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '../../utils/api-client';
import {
  archiveAsset,
  createAsset,
  deleteAssetHolding,
  deleteAssetValuation,
  disposeAsset,
  getNetWorth,
  getNetWorthHistory,
  listAssets,
  listDebts,
  listLinkedPropertyIds,
  suggestAssetValuation,
  upsertAssetHolding
} from '../../services/patrimoine-assets-service';

vi.mock('../../utils/api-client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

const api = apiClient as unknown as Record<'get' | 'post' | 'put' | 'patch' | 'delete', ReturnType<typeof vi.fn>>;
const base = '/tenants/t1/patrimoine';

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { data: [] } });
  api.post.mockResolvedValue({ data: { data: { id: 'x' } } });
  api.put.mockResolvedValue({ data: { data: { id: 'x' } } });
  api.delete.mockResolvedValue({});
});

describe('patrimoine-assets-service — chemins du contrat', () => {
  it('liste les actifs avec leurs filtres', async () => {
    await listAssets('t1', { assetClass: 'CASH', status: 'ACTIVE', search: 'wave' });
    expect(api.get).toHaveBeenCalledWith(`${base}/assets?assetClass=CASH&status=ACTIVE&search=wave`);
    await listAssets('t1');
    expect(api.get).toHaveBeenLastCalledWith(`${base}/assets`);
  });

  it('charge les biens déjà liés, archivés compris, sans autre filtre', async () => {
    api.get.mockResolvedValueOnce({
      data: { data: { items: [{ propertyId: 'p1' }, { propertyId: null }], total: 2, page: 1, limit: 100 } }
    });
    api.get.mockResolvedValueOnce({
      data: { data: { items: [{ propertyId: 'p2' }, { propertyId: 'p1' }], total: 2, page: 1, limit: 100 } }
    });
    expect(await listLinkedPropertyIds('t1')).toEqual(['p1', 'p2']);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get).toHaveBeenCalledWith(`${base}/assets?assetClass=REAL_ESTATE&page=1&limit=100`);
    expect(api.get).toHaveBeenCalledWith(`${base}/assets?assetClass=REAL_ESTATE&status=ARCHIVED&page=1&limit=100`);
  });

  it('parcourt les pages de biens liés au-delà de cent actifs', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ propertyId: `p${index + 1}` }));
    api.get.mockImplementation((url: string) => {
      if (url === `${base}/assets?assetClass=REAL_ESTATE&page=1&limit=100`) {
        return Promise.resolve({ data: { data: { items: firstPage, total: 101, page: 1, limit: 100 } } });
      }
      if (url === `${base}/assets?assetClass=REAL_ESTATE&page=2&limit=100`) {
        return Promise.resolve({
          data: { data: { items: [{ propertyId: 'p101' }], total: 101, page: 2, limit: 100 } }
        });
      }
      if (url === `${base}/assets?assetClass=REAL_ESTATE&status=ARCHIVED&page=1&limit=100`) {
        return Promise.resolve({
          data: { data: { items: [{ propertyId: 'archived' }], total: 1, page: 1, limit: 100 } }
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const ids = await listLinkedPropertyIds('t1');
    expect(ids).toHaveLength(102);
    expect(ids).toContain('p101');
    expect(ids).toContain('archived');
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it('demande une suggestion de valeur par POST, sans rien créer côté client', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { ok: false, missing: ['usefulLifeYears'] } } });
    expect(await suggestAssetValuation('t1', 'a1')).toEqual({ ok: false, missing: ['usefulLifeYears'] });
    expect(api.post).toHaveBeenCalledWith(`${base}/assets/a1/valuations/suggest`, {});
    await suggestAssetValuation('t1', 'a1', '2026-09-29');
    expect(api.post).toHaveBeenLastCalledWith(`${base}/assets/a1/valuations/suggest`, { asOf: '2026-09-29' });
  });

  it('crée, cède et archive un actif', async () => {
    await createAsset('t1', { name: 'X', assetClass: 'OTHER', details: { label: 'X' } });
    expect(api.post).toHaveBeenCalledWith(`${base}/assets`, expect.objectContaining({ name: 'X' }));
    await disposeAsset('t1', 'a1', '2026-09-01');
    expect(api.post).toHaveBeenCalledWith(`${base}/assets/a1/dispose`, { disposedAt: '2026-09-01' });
    await archiveAsset('t1', 'a1');
    expect(api.post).toHaveBeenCalledWith(`${base}/assets/a1/archive`);
  });

  it('gère valorisations, dettes et parts détenues', async () => {
    await deleteAssetValuation('t1', 'a1', 'v1');
    expect(api.delete).toHaveBeenCalledWith(`${base}/assets/a1/valuations/v1`);
    await listDebts('t1', { unattached: true });
    expect(api.get).toHaveBeenCalledWith(`${base}/debts?unattached=true`);
    await listDebts('t1', { assetId: 'a1' });
    expect(api.get).toHaveBeenCalledWith(`${base}/debts?assetId=a1`);
    await upsertAssetHolding('t1', 'a1', 'e1', { sharePercent: 50 });
    expect(api.put).toHaveBeenCalledWith(`${base}/assets/a1/holdings/e1`, { sharePercent: 50 });
    await deleteAssetHolding('t1', 'a1', 'e1');
    expect(api.delete).toHaveBeenCalledWith(`${base}/assets/a1/holdings/e1`);
  });

  it('lit la valeur nette et son historique', async () => {
    api.get.mockResolvedValueOnce({ data: { data: { netWorth: 1 } } });
    expect(await getNetWorth('t1', '2026-09-29')).toEqual({ netWorth: 1 });
    expect(api.get).toHaveBeenCalledWith(`${base}/net-worth?asOf=2026-09-29`);
    await getNetWorthHistory('t1', { from: '2025-10-01', step: 'month' });
    expect(api.get).toHaveBeenLastCalledWith(`${base}/net-worth/history?from=2025-10-01&step=month`);
  });
});
