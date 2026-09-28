/**
 * Barriere « detenu en propre » (pack Patrimoine, lot P1) :
 * `services/own-assets-barrier-service.ts`.
 *
 * `assertThirdPartyAllowedForTenant` est un simple relais entre
 * `getSubscriptionEnforcement`, `getEntitlements` et le garde pur deja
 * teste dans `subscription.entitlements.test.ts`
 * (`assertThirdPartyManagementAllowed`) : ce test verifie le relais lui-meme
 * (off court-circuite avant toute lecture, warn/enforce lisent les droits et
 * delegue au garde), pas la logique d'`ownAssetsOnly`.
 */

let mode: 'off' | 'warn' | 'enforce' = 'warn';
const getEntitlementsMock = jest.fn();

jest.mock('../../src/lib/subscription/enforcement', () => ({
  getSubscriptionEnforcement: () => mode
}));

jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: (...args: any[]) => getEntitlementsMock(...args)
}));

import {
  assertThirdPartyAllowedForTenant,
  isThirdPartyOwnershipInput
} from '../../src/services/own-assets-barrier-service';
import { OwnAssetsOnlyError } from '../../src/middleware/error-middleware';
import { logger } from '../../src/utils/logger';

const TENANT = 'tenant-patrimoine-1';

function entitlements(ownAssetsOnly: boolean): any {
  return { tenantId: TENANT, enforcement: mode, ownAssetsOnly };
}

beforeEach(() => {
  mode = 'warn';
  getEntitlementsMock.mockReset();
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('assertThirdPartyAllowedForTenant', () => {
  it('mode off : ne lit meme pas les droits, aucune erreur', async () => {
    mode = 'off';
    await expect(assertThirdPartyAllowedForTenant(TENANT, 'MANDATE')).resolves.toBeUndefined();
    expect(getEntitlementsMock).not.toHaveBeenCalled();
  });

  it('mode warn, ownAssetsOnly : journalise et laisse passer', async () => {
    mode = 'warn';
    getEntitlementsMock.mockResolvedValue(entitlements(true));
    await expect(assertThirdPartyAllowedForTenant(TENANT, 'THIRD_PARTY_OWNER')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('mode enforce, ownAssetsOnly : 403 OWN_ASSETS_ONLY, action portee dans data', async () => {
    mode = 'enforce';
    getEntitlementsMock.mockResolvedValue(entitlements(true));
    await expect(assertThirdPartyAllowedForTenant(TENANT, 'MANDATE')).rejects.toMatchObject({
      statusCode: 403,
      code: 'OWN_ASSETS_ONLY',
      data: { action: 'MANDATE' }
    });
  });

  it('mode enforce, ownAssetsOnly : action THIRD_PARTY_OWNER aussi refusee', async () => {
    mode = 'enforce';
    getEntitlementsMock.mockResolvedValue(entitlements(true));
    const error = await assertThirdPartyAllowedForTenant(TENANT, 'THIRD_PARTY_OWNER').catch(e => e);
    expect(error).toBeInstanceOf(OwnAssetsOnlyError);
    expect(error.data).toEqual({ action: 'THIRD_PARTY_OWNER' });
  });

  it('mode enforce, agence avec un autre module (pas ownAssetsOnly) : passe, ecriture permise', async () => {
    mode = 'enforce';
    getEntitlementsMock.mockResolvedValue(entitlements(false));
    await expect(assertThirdPartyAllowedForTenant(TENANT, 'MANDATE')).resolves.toBeUndefined();
  });

  it('transmet `db` a getEntitlements (appel dans une transaction)', async () => {
    mode = 'warn';
    getEntitlementsMock.mockResolvedValue(entitlements(false));
    const tx = { marker: 'fake-tx' } as any;
    await assertThirdPartyAllowedForTenant(TENANT, 'MANDATE', { db: tx });
    expect(getEntitlementsMock).toHaveBeenCalledWith(TENANT, { db: tx });
  });
});

describe('isThirdPartyOwnershipInput (pur)', () => {
  it('ownershipType TENANT, pas de ownerEmail : pas un tiers', () => {
    expect(isThirdPartyOwnershipInput({ ownershipType: 'TENANT' as any })).toBe(false);
  });

  it('ownershipType absent (mise a jour sans ce champ), pas de ownerEmail : pas un tiers', () => {
    expect(isThirdPartyOwnershipInput({})).toBe(false);
  });

  it('ownershipType CLIENT : un tiers', () => {
    expect(isThirdPartyOwnershipInput({ ownershipType: 'CLIENT' as any })).toBe(true);
  });

  it('ownershipType PUBLIC : un tiers', () => {
    expect(isThirdPartyOwnershipInput({ ownershipType: 'PUBLIC' as any })).toBe(true);
  });

  it('ownerEmail fourni, meme avec ownershipType TENANT : un tiers', () => {
    expect(isThirdPartyOwnershipInput({ ownershipType: 'TENANT' as any, ownerEmail: 'x@y.z' })).toBe(true);
  });

  it('ownerEmail vide ou absent : pas un tiers par ce seul critere', () => {
    expect(isThirdPartyOwnershipInput({ ownershipType: 'TENANT' as any, ownerEmail: '' })).toBe(false);
    expect(isThirdPartyOwnershipInput({ ownershipType: 'TENANT' as any, ownerEmail: null })).toBe(false);
  });
});
