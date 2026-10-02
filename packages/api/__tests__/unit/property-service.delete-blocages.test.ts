/**
 * BUG-2026-09-30-084 : supprimer un bien qui a des dépendances renvoyait un 500.
 * Chaque dépendance donne maintenant un 409 typé qui la nomme, et une violation
 * de clé étrangère résiduelle (P2003) donne le même 409.
 */

const p = {
  property: { findUnique: jest.fn(), delete: jest.fn() },
  rentalLease: { findMany: jest.fn() },
  rentalInstallment: { count: jest.fn() },
  propertyMandate: { count: jest.fn() },
  propertyOwnershipShare: { count: jest.fn() },
  maintenanceTicket: { count: jest.fn() },
  saleMandate: { count: jest.fn() },
  saleAgreement: { count: jest.fn() },
  propertyVisit: { count: jest.fn() },
  propertyDocument: { count: jest.fn() },
  crmDealProperty: { count: jest.fn() },
  $transaction: jest.fn()
};

jest.mock('../../src/utils/database', () => ({ prisma: p }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/property-template-service', () => ({
  validatePropertyData: jest.fn(),
  getTemplateByType: jest.fn(),
  getAllTemplates: jest.fn()
}));
jest.mock('../../src/services/lot-registry-service', () => ({ syncLotActivationsTx: jest.fn() }));
jest.mock('../../src/services/own-assets-barrier-service', () => ({
  assertThirdPartyAllowedForTenant: jest.fn(),
  isThirdPartyOwnershipInput: jest.fn().mockReturnValue(false)
}));

import { deleteProperty } from '../../src/services/property-service';
import { logAuditEvent, recordAuditEvent } from '../../src/services/audit-service';
import { ConflictError } from '../../src/middleware/error-middleware';

const TENANT = 'tenant-1';

const txClient = { property: p.property };

beforeEach(() => {
  jest.clearAllMocks();
  // getPropertyById : le bien appartient à l'agence, sans mandat.
  p.property.findUnique.mockResolvedValue({
    id: 'b1',
    ownershipType: 'TENANT',
    tenantId: TENANT,
    ownerUserId: null,
    isPublished: false,
    internalReference: 'REF-1',
    title: 'Bien',
    mandates: [],
    syndicateLots: [],
    siteLot: null,
    containerParentId: null
  });
  p.crmDealProperty.count.mockResolvedValue(0);
  p.rentalLease.findMany.mockResolvedValue([]);
  p.rentalInstallment.count.mockResolvedValue(0);
  p.propertyMandate.count.mockResolvedValue(0);
  p.propertyOwnershipShare.count.mockResolvedValue(0);
  p.maintenanceTicket.count.mockResolvedValue(0);
  p.saleMandate.count.mockResolvedValue(0);
  p.saleAgreement.count.mockResolvedValue(0);
  p.propertyVisit.count.mockResolvedValue(0);
  p.propertyDocument.count.mockResolvedValue(0);
  p.$transaction.mockImplementation(async (cb: any) => cb(txClient));
  p.property.delete.mockResolvedValue({});
});

async function refus(): Promise<ConflictError> {
  try {
    await deleteProperty('b1', TENANT, 'u1', 'u1');
  } catch (e) {
    return e as ConflictError;
  }
  throw new Error('la suppression aurait dû être refusée');
}

describe('deleteProperty — blocages', () => {
  it('sans dépendance, supprime', async () => {
    await deleteProperty('b1', TENANT, 'u1', 'u1');
    expect(p.property.delete).toHaveBeenCalled();
    // Action critique : tracee dans la transaction de suppression (tx), pas en file asynchrone.
    expect(recordAuditEvent).toHaveBeenCalledWith(
      txClient,
      expect.objectContaining({ actionKey: 'PROPERTY_DELETED', entityId: 'b1', actorUserId: 'u1', tenantId: TENANT })
    );
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('bail actif : 409 avec la référence du bail', async () => {
    p.rentalLease.findMany.mockResolvedValue([{ id: 'l1', lease_number: 'BAIL-2026-0004', status: 'ACTIVE' }]);
    const e = await refus();
    expect(e).toBeInstanceOf(ConflictError);
    expect(e.statusCode).toBe(409);
    expect(e.message).toContain('BAIL-2026-0004');
    expect(e.errors?.[0].field).toBe('lease');
    expect(p.property.delete).not.toHaveBeenCalled();
  });

  it('bail terminé : historique conservé', async () => {
    p.rentalLease.findMany.mockResolvedValue([{ id: 'l1', lease_number: 'BAIL-1', status: 'ENDED' }]);
    expect((await refus()).errors?.[0].field).toBe('leaseHistory');
  });

  it('échéances impayées', async () => {
    p.rentalLease.findMany.mockResolvedValue([{ id: 'l1', lease_number: 'BAIL-1', status: 'ENDED' }]);
    p.rentalInstallment.count.mockResolvedValue(2);
    expect((await refus()).errors?.map(x => x.field)).toContain('installments');
  });

  const cas: Array<[string, () => void]> = [
    ['mandate', () => p.propertyMandate.count.mockResolvedValue(1)],
    ['ownership', () => p.propertyOwnershipShare.count.mockResolvedValue(2)],
    ['maintenance', () => p.maintenanceTicket.count.mockResolvedValue(1)],
    ['sale', () => p.saleMandate.count.mockResolvedValue(1)],
    ['visits', () => p.propertyVisit.count.mockResolvedValue(1)],
    ['documents', () => p.propertyDocument.count.mockResolvedValue(3)],
    [
      'lot',
      () =>
        p.property.findUnique.mockResolvedValue({
          id: 'b1',
          ownershipType: 'TENANT',
          tenantId: TENANT,
          ownerUserId: null,
          isPublished: false,
          mandates: [],
          syndicateLots: [{ id: 's1' }],
          siteLot: null
        })
    ]
  ];
  it.each(cas)('blocage « %s »', async (field, preparer) => {
    preparer();
    const e = await refus();
    expect(e.statusCode).toBe(409);
    expect(e.errors?.map(x => x.field)).toContain(field);
    expect(e.message).toContain('Archivez-le');
  });

  it('une violation de clé étrangère résiduelle (P2003) donne un 409, pas un 500', async () => {
    p.$transaction.mockRejectedValue(Object.assign(new Error('fk'), { code: 'P2003' }));
    const e = await refus();
    expect(e).toBeInstanceOf(ConflictError);
    expect(e.statusCode).toBe(409);
  });
});
