/**
 * Audit lot B : l'ancienne clé composée unique (propertyId, tenantId, isActive)
 * n'existe plus. Révoquer deux mandats successifs d'un même bien ne doit plus
 * s'appuyer sur elle : écriture par id, jamais de where composé.
 */
const findFirst = jest.fn();
const update = jest.fn();
const transaction = jest.fn();

const tx: any = { propertyMandate: { update: (...a: any[]) => update(...a) } };

jest.mock('../../src/utils/database', () => ({
  prisma: {
    propertyMandate: { findFirst: (...a: any[]) => findFirst(...a) },
    $transaction: (fn: any) => transaction(fn)
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/lot-registry-service', () => ({ syncLotActivationsTx: jest.fn() }));
jest.mock('../../src/services/own-assets-barrier-service', () => ({
  assertThirdPartyAllowedForTenant: jest.fn()
}));
jest.mock('../../src/lib/signature/cancel', () => ({
  cancelOpenRequestsForTarget: jest.fn().mockResolvedValue(undefined)
}));

import { revokeMandate } from '../../src/services/property-mandate-service';

beforeEach(() => {
  jest.clearAllMocks();
  transaction.mockImplementation((fn: any) => fn(tx));
  update.mockImplementation(async (args: any) => ({ id: args.where.id, revokedAt: new Date() }));
});

describe('revokeMandate sans clé composée', () => {
  it('révoque deux mandats successifs du même bien, par id', async () => {
    findFirst
      .mockResolvedValueOnce({ id: 'm1', propertyId: 'p1', isActive: true, property: {} })
      .mockResolvedValueOnce({ id: 'm2', propertyId: 'p1', isActive: true, property: {} });

    await expect(revokeMandate('m1', 'tenant-A', 'u1')).resolves.toBeDefined();
    await expect(revokeMandate('m2', 'tenant-A', 'u1')).resolves.toBeDefined();

    expect(update).toHaveBeenCalledTimes(2);
    for (const [args] of update.mock.calls) {
      expect(Object.keys(args.where).sort()).toEqual(['id', 'tenantId']);
      expect(args.where).not.toHaveProperty('propertyId_tenantId_isActive');
    }
  });
});
