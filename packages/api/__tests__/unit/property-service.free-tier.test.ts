/**
 * Palier gratuit (lot 4) : la creation d'un BIEN passe par le plafond d'ACTIFS
 * des packs Particulier (un bien sans actif lie compte), sous le verrou
 * consultatif du tenant et DANS la transaction de creation. Les agences
 * (plafond `null`) ne sont pas touchees. Prisma et les droits sont simules ;
 * l'etancheite reelle et la concurrence sont testees sur base dediee.
 */

import { PropertyOwnershipType, PropertyTransactionMode, PropertyType } from '@prisma/client';

const order: string[] = [];
const propertyCreate = jest.fn(async ({ data }: any) => {
  order.push('create');
  return { id: 'bien-cree', owner: null, ...data };
});
const txClient = { property: { create: propertyCreate } };

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: (tx: any) => any) => callback(txClient),
    membership: { findFirst: jest.fn(async () => null) }
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
jest.mock('../../src/services/own-assets-barrier-service', () => ({
  assertThirdPartyAllowedForTenant: jest.fn(),
  isThirdPartyOwnershipInput: jest.fn().mockReturnValue(false),
  isThirdPartyOwnerUserId: jest.fn().mockResolvedValue(false)
}));

const getAssetCapacityLimit = jest.fn();
const lockTenantAssets = jest.fn(async () => void order.push('lock'));
const assertFreeTierCapacityTx = jest.fn(async () => void order.push('assert'));
jest.mock('../../src/services/personal-space/free-tier', () => ({
  getAssetCapacityLimit: (...a: unknown[]) => getAssetCapacityLimit(...a),
  lockTenantAssets: (...a: unknown[]) => (lockTenantAssets as any)(...a),
  assertFreeTierCapacityTx: (...a: unknown[]) => (assertFreeTierCapacityTx as any)(...a)
}));

import { createProperty } from '../../src/services/property-service';
import { AppError } from '../../src/middleware/error-middleware';

const TENANT = 'tenant-particulier';

function data(overrides: Record<string, unknown> = {}): any {
  return {
    propertyType: PropertyType.APPARTEMENT,
    ownershipType: PropertyOwnershipType.TENANT,
    title: 'Studio',
    transactionModes: [PropertyTransactionMode.RENTAL],
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
});

describe('createProperty — palier gratuit', () => {
  it('pack avec ACTIFS : verrou puis controle DANS la transaction, avant l ecriture', async () => {
    getAssetCapacityLimit.mockResolvedValue(10);
    await createProperty(TENANT, 'user-1', data(), 'user-1');
    expect(order).toEqual(['lock', 'assert', 'create']);
    expect(lockTenantAssets).toHaveBeenCalledWith(txClient, TENANT);
    expect(assertFreeTierCapacityTx).toHaveBeenCalledWith(txClient, TENANT, 10);
  });

  it('plafond atteint : FREE_TIER_LIMIT remonte et aucun bien n est cree', async () => {
    getAssetCapacityLimit.mockResolvedValue(10);
    assertFreeTierCapacityTx.mockRejectedValueOnce(
      new AppError('Limite atteinte.', 409, 'FREE_TIER_LIMIT', undefined, { limit: 10, used: 10 })
    );
    await expect(createProperty(TENANT, 'user-1', data(), 'user-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'FREE_TIER_LIMIT',
      data: { limit: 10, used: 10 }
    });
    expect(propertyCreate).not.toHaveBeenCalled();
  });

  it('agence (plafond null) : ni verrou ni controle, comportement inchange', async () => {
    getAssetCapacityLimit.mockResolvedValue(null);
    await createProperty(TENANT, 'user-1', data(), 'user-1');
    expect(lockTenantAssets).not.toHaveBeenCalled();
    expect(assertFreeTierCapacityTx).not.toHaveBeenCalled();
    expect(propertyCreate).toHaveBeenCalledTimes(1);
  });

  it('le plafond est lu par le cache des droits (pas de lecture fraiche pour une agence)', async () => {
    getAssetCapacityLimit.mockResolvedValue(null);
    await createProperty(TENANT, 'user-1', data(), 'user-1');
    expect(getAssetCapacityLimit).toHaveBeenCalledWith(TENANT);
  });
});
