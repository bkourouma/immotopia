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
    api.get.mockResolvedValueOnce({ data: { data: [{ propertyId: 'p1' }, { propertyId: null }] } });
    api.get.mockResolvedValueOnce({ data: { data: [{ propertyId: 'p2' }, { propertyId: 'p1' }] } });
    expect(await listLinkedPropertyIds('t1')).toEqual(['p1', 'p2']);
    expect(api.get).toHaveBeenCalledWith(`${base}/assets?assetClass=REAL_ESTATE`);
    expect(api.get).toHaveBeenCalledWith(`${base}/assets?assetClass=REAL_ESTATE&status=ARCHIVED`);
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
