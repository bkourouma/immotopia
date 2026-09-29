/**
 * BUG-2026-09-28-019 — bien en mandat de gestion (CLIENT) : le propriétaire
 * est un TenantClient de l'agence ; celui d'une autre agence est refusé
 * (NotFoundError), et le mandat est créé avec le bien.
 */

type Row = Record<string, any>;

const clients: Row[] = [];
const mandatesCreated: Row[] = [];
const propertiesCreated: Row[] = [];

const tx: Row = {
  property: {
    update: jest.fn(async ({ data }: Row) => ({ id: 'p1', status: 'AVAILABLE', tenantId: 'tenant-a', ...data })),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: 'p1', containerParentId: null, ...data };
      propertiesCreated.push(created);
      return created;
    })
  },
  propertyMandate: {
    create: jest.fn(async ({ data }: Row) => {
      mandatesCreated.push(data);
      return data;
    })
  }
};

const mockPrisma: Row = {
  user: { findUnique: jest.fn(async () => null), create: jest.fn() },
  tenantClient: {
    findUnique: jest.fn(
      async ({ where }: Row) =>
        clients.find(c => c.userId === where.userId_tenantId.userId && c.tenantId === where.userId_tenantId.tenantId) ??
        null
    )
  },
  property: {
    findUnique: jest.fn(async () => ({
      id: 'p1',
      ownershipType: 'CLIENT',
      tenantId: 'tenant-a',
      ownerUserId: 'user-x',
      mandates: []
    }))
  },
  propertyMandate: { create: jest.fn() },
  $transaction: jest.fn(async (fn: any) => fn(tx))
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/property-quality-service', () => ({
  calculateAndStoreQualityScore: jest.fn(async () => undefined)
}));
jest.mock('../../src/services/lot-registry-service', () => ({ syncLotActivationsTx: jest.fn() }));
jest.mock('../../src/utils/property-reference-generator', () => ({
  generatePropertyReference: jest.fn(async () => 'PROP-1')
}));
jest.mock('../../src/services/property-template-service', () => ({
  validatePropertyData: jest.fn(async () => ({ valid: true, errors: [] }))
}));
jest.mock('../../src/lib/properties/schemas', () => ({
  createPropertySchema: { parse: jest.fn() },
  updatePropertySchema: { parse: jest.fn() }
}));

import { createProperty, updateProperty } from '../../src/services/property-service';
import { NotFoundError } from '../../src/middleware/error-middleware';

const base: any = {
  propertyType: 'TERRAIN',
  ownershipType: 'CLIENT',
  title: 'Terrain',
  transactionModes: ['SALE']
};

beforeEach(() => {
  clients.length = 0;
  mandatesCreated.length = 0;
  propertiesCreated.length = 0;
  jest.clearAllMocks();
});

describe('createProperty — mandat de gestion', () => {
  it("refuse un propriétaire qui n'est pas client de l'agence (NotFoundError)", async () => {
    clients.push({ userId: 'user-b', tenantId: 'tenant-b', clientType: 'OWNER' });
    await expect(createProperty('tenant-a', null, { ...base, ownerUserId: 'user-b' })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(propertiesCreated).toHaveLength(0);
  });

  it("crée le bien et son mandat actif pour un propriétaire client de l'agence", async () => {
    clients.push({ userId: 'user-a', tenantId: 'tenant-a', clientType: 'OWNER' });
    await createProperty('tenant-a', null, { ...base, ownerUserId: 'user-a' });
    expect(propertiesCreated[0]).toMatchObject({
      ownershipType: 'CLIENT',
      tenantId: 'tenant-a',
      ownerUserId: 'user-a'
    });
    expect(mandatesCreated).toEqual([
      expect.objectContaining({ propertyId: 'p1', tenantId: 'tenant-a', ownerUserId: 'user-a', isActive: true })
    ]);
  });

  it("un bien de l'agence (TENANT) ne crée aucun mandat", async () => {
    await createProperty('tenant-a', null, { ...base, ownershipType: 'TENANT' });
    expect(mandatesCreated).toHaveLength(0);
    expect(propertiesCreated[0].tenantId).toBe('tenant-a');
  });
});

describe('createMandate — propriétaire', () => {
  it("refuse un propriétaire qui n'est pas client de l'agence", async () => {
    const { createMandate } = await import('../../src/services/property-mandate-service');
    await expect(
      createMandate('tenant-a', { propertyId: 'p1', tenantId: 'tenant-a', startDate: new Date() } as any)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockPrisma.propertyMandate.create).not.toHaveBeenCalled();
  });
});

describe('updateProperty — mandat de gestion', () => {
  it("refuse un nouveau propriétaire qui n'est pas client de l'agence (NotFoundError)", async () => {
    clients.push({ userId: 'user-b', tenantId: 'tenant-b', clientType: 'OWNER' });
    await expect(updateProperty('p1', { ownerUserId: 'user-b' } as any, 'tenant-a')).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(tx.property.update).not.toHaveBeenCalled();
  });

  it('accepte un client propriétaire de la même agence', async () => {
    clients.push({ userId: 'user-a', tenantId: 'tenant-a', clientType: 'OWNER' });
    await updateProperty('p1', { ownerUserId: 'user-a' } as any, 'tenant-a');
    expect(tx.property.update.mock.calls[0][0].data.ownerUserId).toBe('user-a');
  });
});
