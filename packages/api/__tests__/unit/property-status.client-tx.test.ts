/**
 * Audit 2026-10-19 (lot B) : `updatePropertyStatus` avec un client de
 * transaction lit le bien via ce client (pas le prisma global) et ecrit l'audit
 * dans la transaction (`recordAuditEvent`), pas en file asynchrone.
 */
const globalPrisma = {
  $transaction: jest.fn(),
  propertyStatusHistory: { create: jest.fn() },
  property: { findUnique: jest.fn(), update: jest.fn() }
};
const getPropertyById = jest.fn();
const logAuditEvent = jest.fn();
const recordAuditEvent = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: globalPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/property-service', () => ({
  getPropertyById: (...a: any[]) => getPropertyById(...a)
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: any[]) => logAuditEvent(...a),
  recordAuditEvent: (...a: any[]) => recordAuditEvent(...a)
}));
jest.mock('../../src/services/lot-registry-service', () => ({
  syncLotActivationsTx: jest.fn().mockResolvedValue(undefined)
}));

import { updatePropertyStatus } from '../../src/services/property-status-service';

const TENANT = 'tenant-1';

function makeTx() {
  return {
    property: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'bien-1',
        tenantId: TENANT,
        status: 'AVAILABLE',
        ownershipType: 'TENANT',
        ownerUserId: null,
        isPublished: false,
        mandates: []
      }),
      update: jest.fn().mockResolvedValue({ id: 'bien-1', status: 'RENTED' })
    },
    propertyStatusHistory: { create: jest.fn().mockResolvedValue({ id: 'h1' }) },
    auditLog: { create: jest.fn() }
  };
}

beforeEach(() => jest.clearAllMocks());

describe('updatePropertyStatus avec client de transaction', () => {
  it("lit le bien via le client et ecrit l'audit dans la transaction", async () => {
    const tx = makeTx();

    await updatePropertyStatus('bien-1', 'RENTED' as any, TENANT, undefined, 'actor-1', 'note', tx as any);

    expect(tx.property.findUnique).toHaveBeenCalledTimes(1);
    expect(getPropertyById).not.toHaveBeenCalled();
    expect(globalPrisma.$transaction).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent.mock.calls[0][0]).toBe(tx);
    expect(recordAuditEvent.mock.calls[0][1]).toEqual(
      expect.objectContaining({ actorUserId: 'actor-1', entityId: 'bien-1' })
    );
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("refuse un bien d'une autre agence lu via le client", async () => {
    const tx = makeTx();
    tx.property.findUnique.mockResolvedValue({
      id: 'bien-1',
      tenantId: 'autre-agence',
      status: 'AVAILABLE',
      ownershipType: 'TENANT',
      ownerUserId: null,
      isPublished: false,
      mandates: []
    });

    await expect(
      updatePropertyStatus('bien-1', 'RENTED' as any, TENANT, undefined, 'actor-1', undefined, tx as any)
    ).rejects.toThrow();
    expect(tx.property.update).not.toHaveBeenCalled();
  });

  it('sans client : lecture par getPropertyById et audit en file asynchrone', async () => {
    getPropertyById.mockResolvedValue({ id: 'bien-1', tenantId: TENANT, status: 'AVAILABLE', ownershipType: 'TENANT' });
    const tx = makeTx();
    globalPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await updatePropertyStatus('bien-1', 'RENTED' as any, TENANT, undefined, 'actor-1');

    expect(getPropertyById).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});
