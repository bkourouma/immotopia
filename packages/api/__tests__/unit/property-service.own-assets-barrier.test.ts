/**
 * Barriere « detenu en propre » (pack Patrimoine, lot P1) —
 * `services/property-service.ts` (`createProperty`) : point d'appel reel,
 * `own-assets-barrier-service.ts` NON mocke (voir `own-assets-barrier.test.ts`
 * pour la logique du relais lui-meme). Seuls `getSubscriptionEnforcement` et
 * `getEntitlements` sont simules, comme `subscription.feature-guard.test.ts`.
 */

import { PropertyOwnershipType, PropertyTransactionMode, PropertyType } from '@prisma/client';

let mode: 'off' | 'warn' | 'enforce' = 'enforce';
const getEntitlementsMock = jest.fn();

jest.mock('../../src/lib/subscription/enforcement', () => ({
  getSubscriptionEnforcement: () => mode
}));

jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: (...args: any[]) => getEntitlementsMock(...args)
}));

const propertyCreate = jest.fn(async ({ data }: any) => ({ id: 'bien-cree', owner: null, ...data }));
const userFindUnique = jest.fn(async (..._args: any[]): Promise<any> => null);
const userCreate = jest.fn(async ({ data }: any) => ({ id: 'user-cree', ...data }));
const membershipFindFirst = jest.fn(async (..._args: any[]): Promise<any> => null);

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: (tx: any) => any) => callback({ property: { create: propertyCreate } }),
    user: {
      findUnique: userFindUnique,
      create: userCreate
    },
    membership: { findFirst: membershipFindFirst }
  }
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

jest.mock('../../src/utils/property-reference-generator', () => ({
  generatePropertyReference: jest.fn().mockResolvedValue('REF-1')
}));

jest.mock('../../src/services/property-template-service', () => ({
  validatePropertyData: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
  getTemplateByType: jest.fn(),
  getAllTemplates: jest.fn()
}));

jest.mock('../../src/services/property-quality-service', () => ({
  calculateAndStoreQualityScore: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../src/services/lot-registry-service', () => ({
  syncLotActivationsTx: jest.fn().mockResolvedValue(undefined)
}));

import { createProperty } from '../../src/services/property-service';
import { OwnAssetsOnlyError } from '../../src/middleware/error-middleware';

const TENANT = 'tenant-patrimoine';
const ACTOR = 'user-actor';

function entitlements(ownAssetsOnly: boolean): any {
  return { tenantId: TENANT, enforcement: mode, ownAssetsOnly };
}

function baseData(overrides: Record<string, unknown> = {}) {
  return {
    propertyType: PropertyType.APPARTEMENT,
    ownershipType: PropertyOwnershipType.TENANT,
    transactionModes: [PropertyTransactionMode.RENTAL],
    title: 'Bel appartement',
    ...overrides
  } as any;
}

beforeEach(() => {
  mode = 'enforce';
  getEntitlementsMock.mockReset();
  propertyCreate.mockClear();
  userFindUnique.mockReset().mockResolvedValue(null);
  userCreate.mockClear();
  membershipFindFirst.mockReset().mockResolvedValue(null);
});

describe('createProperty — agence Patrimoine seule (enforce)', () => {
  it('bien TENANT cree par son acteur (ownerUserId = acteur) : passe sans meme lire les droits (rien a decider)', async () => {
    const result = await createProperty(TENANT, ACTOR, baseData(), ACTOR);
    expect(result).toBeDefined();
    expect(propertyCreate).toHaveBeenCalledTimes(1);
    expect(getEntitlementsMock).not.toHaveBeenCalled();
  });

  it('ownershipType CLIENT : refuse AVANT toute ecriture (403 OWN_ASSETS_ONLY)', async () => {
    getEntitlementsMock.mockResolvedValue(entitlements(true));
    await expect(
      createProperty(TENANT, null, baseData({ ownershipType: PropertyOwnershipType.CLIENT }), ACTOR)
    ).rejects.toBeInstanceOf(OwnAssetsOnlyError);
    expect(propertyCreate).not.toHaveBeenCalled();
  });

  it('ownerEmail fourni : refuse AVANT la creation du User depuis cet e-mail', async () => {
    getEntitlementsMock.mockResolvedValue(entitlements(true));
    await expect(
      createProperty(TENANT, null, baseData({ ownerEmail: 'tiers@example.com' }), ACTOR)
    ).rejects.toBeInstanceOf(OwnAssetsOnlyError);
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
    expect(propertyCreate).not.toHaveBeenCalled();
  });

  it("ownerUserId different de l'acteur ET pas membre ACTIF : refuse avant ecriture", async () => {
    getEntitlementsMock.mockResolvedValue(entitlements(true));
    membershipFindFirst.mockResolvedValue(null);
    await expect(
      createProperty(TENANT, null, baseData({ ownerUserId: '11111111-1111-4111-8111-111111111111' }), ACTOR)
    ).rejects.toBeInstanceOf(OwnAssetsOnlyError);
    expect(propertyCreate).not.toHaveBeenCalled();
  });

  it("ownerUserId different de l'acteur MAIS membre ACTIF de l'agence : pas un tiers, passe", async () => {
    getEntitlementsMock.mockResolvedValue(entitlements(true));
    membershipFindFirst.mockResolvedValue({ id: 'membership-1' });
    const result = await createProperty(
      TENANT,
      null,
      baseData({ ownerUserId: '22222222-2222-4222-9222-222222222222' }),
      ACTOR
    );
    expect(result).toBeDefined();
    expect(propertyCreate).toHaveBeenCalledTimes(1);
  });
});

describe('createProperty — agence avec un autre module (pas ownAssetsOnly)', () => {
  it('CLIENT et ownerEmail passent normalement : la barriere ne bloque jamais une agence Agence/Syndic/Promoteur', async () => {
    getEntitlementsMock.mockResolvedValue(entitlements(false));
    const result = await createProperty(TENANT, null, baseData({ ownershipType: PropertyOwnershipType.CLIENT }), ACTOR);
    expect(result).toBeDefined();
  });
});

describe('createProperty — SUBSCRIPTION_ENFORCEMENT=off', () => {
  it('ne lit jamais les droits, meme pour un rattachement tiers', async () => {
    mode = 'off';
    await createProperty(TENANT, null, baseData({ ownershipType: PropertyOwnershipType.CLIENT }), ACTOR);
    expect(getEntitlementsMock).not.toHaveBeenCalled();
  });
});
