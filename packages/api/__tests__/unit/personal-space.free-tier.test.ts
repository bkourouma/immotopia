/**
 * Lot 4B : garde du palier gratuit et compteur d'usage. Droits, comptage et
 * catalogue sont simulés ; la concurrence réelle est testée sur base dédiée.
 */

const mockGetEntitlements = jest.fn();
const mockCount = jest.fn();
const mockCatalog = jest.fn();
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: (...a: unknown[]) => mockGetEntitlements(...a),
  countActiveAssets: (...a: unknown[]) => mockCount(...a),
  loadExistingCatalogByCodes: (...a: unknown[]) => mockCatalog(...a)
}));
jest.mock('../../src/utils/database', () => ({ prisma: {} }));

import {
  assertFreeTierCapacityTx,
  FreeTierLimitError,
  getAssetCapacityLimit,
  getAssetUsage,
  isFreeTierLimitReached,
  lockTenantAssets
} from '../../src/services/personal-space/free-tier';

function entitlements(packs: string[], actifs: { included: number; limit: number; used: number }) {
  return { packs, capacities: { ACTIFS: actifs } };
}
const FREE = entitlements(['PARTICULIER_GRATUIT'], { included: 10, limit: 10, used: 4 });
const PLUS = entitlements(['PARTICULIER_PLUS'], { included: 100, limit: 100, used: 30 });
const AGENCY = entitlements(['AGENCE'], { included: 0, limit: 0, used: 250 });

beforeEach(() => {
  jest.clearAllMocks();
  mockCatalog.mockResolvedValue(
    new Map([['PARTICULIER_PLUS', { monthlyPrice: 2900, isSellable: true, capacities: { ACTIFS: 100 } }]])
  );
});

describe('getAssetCapacityLimit', () => {
  it('renvoie le plafond du pack Particulier', async () => {
    mockGetEntitlements.mockResolvedValue(FREE);
    await expect(getAssetCapacityLimit('t1')).resolves.toBe(10);
  });

  it('renvoie null pour un pack qui ne porte pas ACTIFS (agence) : aucune garde', async () => {
    mockGetEntitlements.mockResolvedValue(AGENCY);
    await expect(getAssetCapacityLimit('t1')).resolves.toBeNull();
  });

  it('transmet fresh pour qu’un changement de pack soit vu tout de suite', async () => {
    mockGetEntitlements.mockResolvedValue(FREE);
    await getAssetCapacityLimit('t1', { fresh: true });
    expect(mockGetEntitlements).toHaveBeenCalledWith('t1', { fresh: true });
  });
});

describe('assertFreeTierCapacityTx', () => {
  const tx = {} as never;

  it('accepte tant que used < limit', async () => {
    mockCount.mockResolvedValue(9);
    await expect(assertFreeTierCapacityTx(tx, 't1', 10)).resolves.toBeUndefined();
  });

  it('refuse à used >= limit : 409 FREE_TIER_LIMIT avec { limit, used }', async () => {
    mockGetEntitlements.mockResolvedValue(FREE);
    mockCount.mockResolvedValue(10);
    const error = await assertFreeTierCapacityTx(tx, 't1', 10).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FreeTierLimitError);
    expect(error).toMatchObject({ statusCode: 409, code: 'FREE_TIER_LIMIT', data: { limit: 10, used: 10 } });
    expect((error as Error).message).toMatch(/palier payant/);
  });

  it('un refus est confirmé à neuf : un plafond relevé par un autre processus (montée de palier) ne refuse pas à tort', async () => {
    mockGetEntitlements.mockResolvedValue(PLUS);
    mockCount.mockResolvedValue(10);
    await expect(assertFreeTierCapacityTx(tx, 't1', 10)).resolves.toBeUndefined();
    expect(mockGetEntitlements).toHaveBeenCalledWith('t1', { fresh: true });
  });

  it('sous le plafond, aucune lecture fraîche (chemin nominal sans surcoût)', async () => {
    mockCount.mockResolvedValue(3);
    await assertFreeTierCapacityTx(tx, 't1', 10);
    expect(mockGetEntitlements).not.toHaveBeenCalled();
  });

  it('compte dans la transaction fournie', async () => {
    mockCount.mockResolvedValue(0);
    await assertFreeTierCapacityTx(tx, 't1', 10);
    expect(mockCount).toHaveBeenCalledWith(tx, 't1');
  });
});

describe('lockTenantAssets', () => {
  it('prend le verrou consultatif du tenant via $executeRaw tagué', async () => {
    const executeRaw = jest.fn(async () => 1);
    await lockTenantAssets({ $executeRaw: executeRaw } as never, 'tenant-1');
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = executeRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
    expect(strings.join('?')).toContain('pg_advisory_xact_lock(hashtext(?))');
    expect(values).toEqual(['tenant-1']);
  });
});

describe('isFreeTierLimitReached', () => {
  it('vrai à la limite, faux dessous et pour une agence', async () => {
    mockGetEntitlements.mockResolvedValue(FREE);
    mockCount.mockResolvedValue(10);
    await expect(isFreeTierLimitReached('t1')).resolves.toBe(true);
    mockCount.mockResolvedValue(9);
    await expect(isFreeTierLimitReached('t1')).resolves.toBe(false);
    mockGetEntitlements.mockResolvedValue(AGENCY);
    mockCount.mockResolvedValue(9999);
    await expect(isFreeTierLimitReached('t1')).resolves.toBe(false);
  });
});

describe('isFreeTierLimitReached avec le client reçu', () => {
  it('sous un client de transaction : verrou du tenant PUIS comptage avec ce client', async () => {
    mockGetEntitlements.mockResolvedValue(FREE);
    const order: string[] = [];
    const executeRaw = jest.fn(async () => void order.push('lock'));
    mockCount.mockImplementation(async () => {
      order.push('count');
      return 4;
    });
    const tx = { $executeRaw: executeRaw };
    await expect(isFreeTierLimitReached('t1', tx as never)).resolves.toBe(false);
    expect(order).toEqual(['lock', 'count']);
    expect(mockCount).toHaveBeenCalledWith(tx, 't1');
  });

  it('avec le client global (a un $transaction) : pas de verrou, comptage avec ce client', async () => {
    mockGetEntitlements.mockResolvedValue(FREE);
    mockCount.mockResolvedValue(10);
    const executeRaw = jest.fn();
    const global = { $executeRaw: executeRaw, $transaction: jest.fn() };
    await expect(isFreeTierLimitReached('t1', global as never)).resolves.toBe(true);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('agence : ni verrou ni comptage', async () => {
    mockGetEntitlements.mockResolvedValue(AGENCY);
    const executeRaw = jest.fn();
    await expect(isFreeTierLimitReached('t1', { $executeRaw: executeRaw } as never)).resolves.toBe(false);
    expect(executeRaw).not.toHaveBeenCalled();
    expect(mockCount).not.toHaveBeenCalled();
  });
});

describe('getAssetUsage', () => {
  it('FREE : limite, usage, canAdd et offre de montée de palier lue dans le catalogue', async () => {
    mockGetEntitlements.mockResolvedValue(FREE);
    await expect(getAssetUsage('t1')).resolves.toEqual({
      plan: 'FREE',
      limit: 10,
      used: 4,
      canAdd: true,
      upgrade: { target: 'PARTICULIER_PLUS', priceMonthly: 2900, currency: 'XOF', limit: 100 }
    });
  });

  it('FREE plein : canAdd faux', async () => {
    mockGetEntitlements.mockResolvedValue(entitlements(['PARTICULIER_GRATUIT'], { included: 10, limit: 10, used: 10 }));
    await expect(getAssetUsage('t1')).resolves.toMatchObject({ used: 10, canAdd: false });
  });

  it('le prix et le plafond de l’offre suivent le catalogue (rien de codé en dur)', async () => {
    mockGetEntitlements.mockResolvedValue(FREE);
    mockCatalog.mockResolvedValue(
      new Map([['PARTICULIER_PLUS', { monthlyPrice: 3500, isSellable: true, capacities: { ACTIFS: 150 } }]])
    );
    await expect(getAssetUsage('t1')).resolves.toMatchObject({ upgrade: { priceMonthly: 3500, limit: 150 } });
  });

  it('PAID : pas d’offre de montée de palier', async () => {
    mockGetEntitlements.mockResolvedValue(PLUS);
    await expect(getAssetUsage('t1')).resolves.toEqual({
      plan: 'PAID',
      limit: 100,
      used: 30,
      canAdd: true,
      upgrade: null
    });
    expect(mockCatalog).not.toHaveBeenCalled();
  });

  it('AGENCY : limit null, canAdd vrai, pas d’offre', async () => {
    mockGetEntitlements.mockResolvedValue(AGENCY);
    await expect(getAssetUsage('t1')).resolves.toEqual({
      plan: 'AGENCY',
      limit: null,
      used: 250,
      canAdd: true,
      upgrade: null
    });
  });

  it('offre absente du catalogue ou non vendable : upgrade null', async () => {
    mockGetEntitlements.mockResolvedValue(FREE);
    mockCatalog.mockResolvedValue(new Map());
    await expect(getAssetUsage('t1')).resolves.toMatchObject({ upgrade: null });
    mockCatalog.mockResolvedValue(
      new Map([['PARTICULIER_PLUS', { monthlyPrice: 2900, isSellable: false, capacities: { ACTIFS: 100 } }]])
    );
    await expect(getAssetUsage('t1')).resolves.toMatchObject({ upgrade: null });
  });
});
