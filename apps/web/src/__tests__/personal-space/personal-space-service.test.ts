import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPersonalSpace,
  getAssetUsage,
  getTenantIdentity,
  readApiError,
  startPersonalUpgrade,
  updateTenantContactPhone
} from '../../services/personal-space-service';

const post = vi.fn();
const get = vi.fn();
const patch = vi.fn();

vi.mock('../../utils/api-client', () => ({
  default: {
    post: (...a: unknown[]) => post(...a),
    get: (...a: unknown[]) => get(...a),
    patch: (...a: unknown[]) => patch(...a)
  }
}));

beforeEach(() => vi.clearAllMocks());

describe('personal-space-service', () => {
  it('crée l’espace avec l’en-tête Idempotency-Key', async () => {
    post.mockResolvedValue({ data: { data: { tenantId: 't1', slug: 's', name: 'n' } } });
    const result = await createPersonalSpace({ displayName: 'Awa', country: 'CI' }, 'cle-1');
    expect(result.tenantId).toBe('t1');
    expect(post).toHaveBeenCalledWith(
      '/personal-space',
      { displayName: 'Awa', country: 'CI' },
      { headers: { 'Idempotency-Key': 'cle-1' } }
    );
  });

  it('lit l’usage, démarre la montée de palier et met à jour le téléphone', async () => {
    get.mockResolvedValue({ data: { data: { plan: 'FREE', limit: 10, used: 1, canAdd: true, upgrade: null } } });
    expect((await getAssetUsage('t1')).plan).toBe('FREE');
    expect(get).toHaveBeenCalledWith('/tenants/t1/patrimoine/usage');

    post.mockResolvedValue({ data: { data: { invoiceId: 'i', checkoutUrl: 'https://x', code: 'C' } } });
    expect((await startPersonalUpgrade('t1')).checkoutUrl).toBe('https://x');
    expect(post).toHaveBeenCalledWith('/tenants/t1/subscription/upgrade', { target: 'PARTICULIER_PLUS' });

    patch.mockResolvedValue({});
    await updateTenantContactPhone('t1', '+2250712345678');
    expect(patch).toHaveBeenCalledWith('/tenants/t1', { contactPhone: '+2250712345678' });
  });

  it('lit type et téléphone dans la fiche de l’espace', async () => {
    get.mockResolvedValue({ data: { data: { type: 'PARTICULIER', contactPhone: '+22507' } } });
    expect(await getTenantIdentity('t1')).toEqual({ type: 'PARTICULIER', contactPhone: '+22507' });
    get.mockResolvedValue({ data: {} });
    expect(await getTenantIdentity('t1')).toEqual({ type: null, contactPhone: null });
  });

  it('extrait statut, code et données d’une erreur d’API, et tolère une erreur réseau', () => {
    expect(
      readApiError({ response: { status: 409, data: { code: 'FREE_TIER_LIMIT', data: { limit: 10, used: 10 } } } })
    ).toMatchObject({ status: 409, code: 'FREE_TIER_LIMIT', data: { limit: 10, used: 10 } });
    expect(readApiError(new Error('Network Error'))).toEqual({
      status: undefined,
      code: undefined,
      message: undefined,
      data: undefined
    });
  });
});
