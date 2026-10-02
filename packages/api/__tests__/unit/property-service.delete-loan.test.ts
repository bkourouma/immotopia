/**
 * Suppression d'un bien : un pret ACTIF refuse la suppression (409), car le
 * pret disparaitrait en cascade avec le bien et la dette avec lui (valeur
 * nette). Sans pret actif, la suppression suit son cours. Prisma est simule.
 */

const propertyLoanCount = jest.fn();
const txDelete = jest.fn(async () => undefined);
const txClient = {
  property: {
    findUnique: jest.fn(async () => ({ containerParentId: null, syndicateLots: [], siteLot: null })),
    delete: txDelete
  }
};

jest.mock('../../src/utils/database', () => ({
  prisma: {
    property: {
      findUnique: jest.fn(async () => ({
        id: 'bien-1',
        tenantId: 'tenant-A',
        ownerId: null,
        ownershipType: 'TENANT',
        internalReference: 'REF-1',
        title: 'Villa',
        mandates: [],
        syndicateLots: [],
        siteLot: null
      }))
    },
    crmDealProperty: { count: jest.fn(async () => 0) },
    // Blocages de suppression (BUG-2026-09-30-084) : aucun pour ce bien.
    rentalLease: { findMany: jest.fn(async () => []) },
    rentalInstallment: { count: jest.fn(async () => 0) },
    propertyMandate: { count: jest.fn(async () => 0) },
    propertyOwnershipShare: { count: jest.fn(async () => 0) },
    maintenanceTicket: { count: jest.fn(async () => 0) },
    saleMandate: { count: jest.fn(async () => 0) },
    saleAgreement: { count: jest.fn(async () => 0) },
    propertyVisit: { count: jest.fn(async () => 0) },
    propertyDocument: { count: jest.fn(async () => 0) },
    propertyLoan: { count: (...a: unknown[]) => propertyLoanCount(...a) },
    membership: { findFirst: jest.fn(async () => null) },
    $transaction: (callback: (tx: any) => any) => callback(txClient)
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/lot-registry-service', () => ({
  syncLotActivationsTx: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../src/services/property-template-service', () => ({
  validatePropertyData: jest.fn(),
  getTemplateByType: jest.fn(),
  getAllTemplates: jest.fn()
}));
jest.mock('../../src/services/own-assets-barrier-service', () => ({
  assertThirdPartyAllowedForTenant: jest.fn(),
  isThirdPartyOwnershipInput: jest.fn().mockReturnValue(false),
  isThirdPartyOwnerUserId: jest.fn().mockResolvedValue(false)
}));
jest.mock('../../src/services/personal-space/free-tier', () => ({
  getAssetCapacityLimit: jest.fn(),
  lockTenantAssets: jest.fn(),
  assertFreeTierCapacityTx: jest.fn()
}));

import { deleteProperty } from '../../src/services/property-service';
import { ConflictError } from '../../src/middleware/error-middleware';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deleteProperty — pret actif', () => {
  it('refuse (409) quand le bien porte un pret ACTIF, sans rien supprimer', async () => {
    propertyLoanCount.mockResolvedValue(1);
    await expect(deleteProperty('bien-1', 'tenant-A', 'user-1')).rejects.toBeInstanceOf(ConflictError);
    expect(propertyLoanCount).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-A', propertyId: 'bien-1', status: 'ACTIVE' }
    });
    expect(txDelete).not.toHaveBeenCalled();
  });

  it('supprime quand aucun pret actif ne porte sur le bien', async () => {
    propertyLoanCount.mockResolvedValue(0);
    await deleteProperty('bien-1', 'tenant-A', 'user-1');
    expect(txDelete).toHaveBeenCalledWith({ where: { id: 'bien-1' } });
  });
});
