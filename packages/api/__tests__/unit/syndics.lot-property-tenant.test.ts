/**
 * Audit securite 2026-11-09, TEN-02 : le bien (propertyId) et le bail (leaseId)
 * rattaches a un lot ou a un locataire de lot appartiennent a l'agence, y compris
 * en mise a jour. Une reference etrangere leve la meme NotFoundError qu'un objet
 * inexistant et rien n'est ecrit.
 */

jest.mock('@prisma/client', () => {
  const prisma: any = {
    syndicateLot: {
      findFirst: jest.fn(),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, propertyId: null, ...data }))
    },
    property: { findFirst: jest.fn() },
    rentalLease: { findFirst: jest.fn() },
    crmContact: { findFirst: jest.fn() },
    syndicate: { findFirst: jest.fn() },
    lotTenantAssignment: {
      updateMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(async ({ data }: any) => ({ id: 'assign-1', ...data }))
    },
    lotTenantProfile: {
      findFirst: jest.fn(),
      create: jest.fn(async ({ data }: any) => ({ id: 'profile-1', ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data }))
    },
    $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma))
  };
  return { PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma };
});

jest.mock('../../src/services/lot-registry-service', () => ({
  syncLotActivationsTx: jest.fn(async () => ({ activated: [], deactivated: [], quota: null })),
  assertCapacityTx: jest.fn(async () => ({ decision: 'ALLOW' })),
  resolveLotScope: jest.fn(async (_tx: unknown, _tenantId: string, scope: unknown) => scope),
  ACTIVE_SYNDICATE_STATUSES: ['ACTIVE', 'IN_DISPUTE'],
  LOT_QUOTA_REACHED_REASON: 'Quota de lots atteint'
}));

jest.mock('../../src/lib/syndics/owner-account-tx', () => ({
  ensureCrmRoleForContact: jest.fn(async () => undefined),
  ensureOwnerAccountForLotTx: jest.fn(async () => undefined)
}));

import {
  addLotTenantBySyndicate,
  updateLotTenantProfileBySyndicate,
  updateSyndicateLotByTenant
} from '../../src/lib/syndics/queries';
import { NotFoundError } from '../../src/middleware/error-middleware';

const { __mockPrisma: db } = jest.requireMock('@prisma/client') as { __mockPrisma: any };

const TENANT = 'tenant-a';

/** Ne retrouve un enregistrement que s'il est de l'agence A (comme la vraie base). */
function ownedBy(rows: Record<string, { tenantKey: 'tenantId' | 'tenant_id'; tenant: string; extra?: object }>) {
  return jest.fn(async ({ where }: any) => {
    const row = rows[where.id];
    if (!row) return null;
    if (where[row.tenantKey] !== row.tenant) return null;
    return { id: where.id, ...(row.extra ?? {}) };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  db.syndicateLot.findFirst.mockResolvedValue({ id: 'lot-1', propertyId: null });
  db.crmContact.findFirst.mockResolvedValue({ id: 'contact-1' });
  db.lotTenantProfile.findFirst.mockResolvedValue({ id: 'profile-1' });
  db.syndicate.findFirst.mockResolvedValue({ id: 's1' });
  db.property.findFirst = ownedBy({
    'prop-a': { tenantKey: 'tenantId', tenant: 'tenant-a', extra: { propertyType: 'APPARTEMENT' } },
    'prop-b': { tenantKey: 'tenantId', tenant: 'tenant-b', extra: { propertyType: 'APPARTEMENT' } },
    'prop-immeuble': { tenantKey: 'tenantId', tenant: 'tenant-a', extra: { propertyType: 'IMMEUBLE' } }
  });
  db.rentalLease.findFirst = ownedBy({
    'lease-a': { tenantKey: 'tenant_id', tenant: 'tenant-a' },
    'lease-b': { tenantKey: 'tenant_id', tenant: 'tenant-b' }
  });
});

describe('TEN-02 : propertyId en mise a jour de lot', () => {
  it("refuse un bien d'une autre agence (NotFoundError) sans rien ecrire", async () => {
    await expect(updateSyndicateLotByTenant(TENANT, 's1', 'lot-1', { propertyId: 'prop-b' })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(db.syndicateLot.update).not.toHaveBeenCalled();
  });

  it('refuse un bien inexistant avec la meme erreur', async () => {
    await expect(updateSyndicateLotByTenant(TENANT, 's1', 'lot-1', { propertyId: 'nope' })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(db.syndicateLot.update).not.toHaveBeenCalled();
  });

  it('refuse un immeuble parent comme a la creation', async () => {
    await expect(
      updateSyndicateLotByTenant(TENANT, 's1', 'lot-1', { propertyId: 'prop-immeuble' })
    ).rejects.toMatchObject({ status: 422 });
    expect(db.syndicateLot.update).not.toHaveBeenCalled();
  });

  it("accepte un bien de l'agence", async () => {
    await updateSyndicateLotByTenant(TENANT, 's1', 'lot-1', { propertyId: 'prop-a' });
    expect(db.syndicateLot.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ propertyId: 'prop-a' }) })
    );
  });

  it('detacher le bien (null) reste possible', async () => {
    await updateSyndicateLotByTenant(TENANT, 's1', 'lot-1', { propertyId: null });
    expect(db.syndicateLot.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ propertyId: null }) })
    );
  });

  it("refuse un lot hors de l'agence (la requete filtre par tenantId)", async () => {
    db.syndicateLot.findFirst.mockResolvedValue(null);
    await expect(updateSyndicateLotByTenant(TENANT, 's1', 'lot-x', { propertyId: 'prop-a' })).rejects.toMatchObject({
      status: 404
    });
    expect(db.syndicateLot.findFirst.mock.calls[0][0].where.syndicate).toEqual({ tenantId: TENANT });
  });
});

describe("leaseId d'un locataire de lot", () => {
  const assignment = (leaseId?: string) =>
    addLotTenantBySyndicate(TENANT, 's1', 'lot-1', { tenantId: 'contact-1', startDate: new Date(), leaseId });

  it("addLotTenantBySyndicate refuse un bail d'une autre agence", async () => {
    await expect(assignment('lease-b')).rejects.toBeInstanceOf(NotFoundError);
    expect(db.lotTenantAssignment.create).not.toHaveBeenCalled();
  });

  it("addLotTenantBySyndicate accepte un bail de l'agence, ou aucun bail", async () => {
    await expect(assignment('lease-a')).resolves.toBeDefined();
    await expect(assignment(undefined)).resolves.toBeDefined();
    expect(db.lotTenantAssignment.create).toHaveBeenCalledTimes(2);
  });

  it("updateLotTenantProfileBySyndicate refuse un bail d'une autre agence", async () => {
    await expect(
      updateLotTenantProfileBySyndicate(TENANT, 's1', 'profile-1', { leaseId: 'lease-b' })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(db.lotTenantProfile.update).not.toHaveBeenCalled();
  });

  it("updateLotTenantProfileBySyndicate accepte un bail de l'agence et la remise a null", async () => {
    await expect(
      updateLotTenantProfileBySyndicate(TENANT, 's1', 'profile-1', { leaseId: 'lease-a' })
    ).resolves.toBeDefined();
    await expect(
      updateLotTenantProfileBySyndicate(TENANT, 's1', 'profile-1', { leaseId: null })
    ).resolves.toBeDefined();
    expect(db.lotTenantProfile.update).toHaveBeenCalledTimes(2);
  });
});
