/**
 * Audit securite 2026-11-09 — TEN-01 (containerParentId d'une autre agence) et
 * TEN-07 (ownerUserId sans controle d'appartenance) sur la creation et la mise
 * a jour d'un bien.
 */

const transactionMock = jest.fn();
const propertyFindUnique = jest.fn();
const propertyFindMany = jest.fn();
const membershipFindFirst = jest.fn();
const tenantClientFindFirst = jest.fn();
const propertyCreate = jest.fn();
const propertyUpdate = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (...args: any[]) => transactionMock(...args),
    property: {
      findUnique: (...a: any[]) => propertyFindUnique(...a),
      findMany: (...a: any[]) => propertyFindMany(...a)
    },
    membership: { findFirst: (...a: any[]) => membershipFindFirst(...a) },
    tenantClient: { findFirst: (...a: any[]) => tenantClientFindFirst(...a) },
    crmContact: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() }
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/utils/property-reference-generator', () => ({
  generatePropertyReference: jest.fn().mockResolvedValue('PROP-1')
}));
jest.mock('../../src/services/property-template-service', () => ({
  validatePropertyData: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
  getTemplateByType: jest.fn(),
  getAllTemplates: jest.fn()
}));
jest.mock('../../src/services/property-quality-service', () => ({
  getLatestQualityScore: jest.fn(),
  calculateQualityScore: jest.fn(),
  calculateAndStoreQualityScore: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../src/services/lot-registry-service', () => ({ syncLotActivationsTx: jest.fn() }));
jest.mock('../../src/services/personal-space/free-tier', () => ({
  getAssetCapacityLimit: jest.fn().mockResolvedValue(null),
  lockTenantAssets: jest.fn(),
  assertFreeTierCapacityTx: jest.fn()
}));
jest.mock('../../src/services/own-assets-barrier-service', () => ({
  assertThirdPartyAllowedForTenant: jest.fn(),
  isThirdPartyOwnershipInput: jest.fn().mockReturnValue(false)
}));

import {
  createProperty,
  updateProperty,
  getChildProperties,
  getPropertyById
} from '../../src/services/property-service';
import { NotFoundError, BadRequestError } from '../../src/middleware/error-middleware';

const TENANT_A = 'ace199d3-0d8a-44f8-aa9e-15f795c7d3cf';
const TENANT_B = 'bce199d3-0d8a-44f8-aa9e-15f795c7d3cf';
const ACTOR = 'a0e199d3-0d8a-44f8-aa9e-15f795c7d3cf';
const OWNER_OTHER = 'c0e199d3-0d8a-44f8-aa9e-15f795c7d3cf';
const PARENT_ID = 'd1e199d3-0d8a-44f8-aa9e-15f795c7d3cf';
const PROPERTY_ID = 'e1e199d3-0d8a-44f8-aa9e-15f795c7d3cf';

const corps = (extra: Record<string, unknown> = {}) =>
  ({
    propertyType: 'APPARTEMENT',
    ownershipType: 'TENANT',
    title: 'Appartement',
    description: '',
    address: 'Cocody',
    transactionModes: ['RENTAL'],
    currency: 'XOF',
    ...extra
  }) as any;

const parentRow = (over: Record<string, unknown> = {}) => ({
  propertyType: 'IMMEUBLE',
  ownershipType: 'TENANT',
  tenantId: TENANT_A,
  ownerUserId: null,
  isPublished: false,
  mandates: [],
  ...over
});

beforeEach(() => {
  jest.clearAllMocks();
  propertyFindUnique.mockReset();
  membershipFindFirst.mockResolvedValue(null);
  tenantClientFindFirst.mockResolvedValue(null);
  propertyFindMany.mockResolvedValue([]);
  propertyCreate.mockImplementation(async ({ data }: any) => ({ id: 'bien-1', owner: null, ...data }));
  propertyUpdate.mockImplementation(async ({ data }: any) => ({ id: PROPERTY_ID, ...data }));
  transactionMock.mockImplementation(async (cb: any) =>
    cb({ property: { create: propertyCreate, update: propertyUpdate }, propertyMandate: { create: jest.fn() } })
  );
});

describe('TEN-01 - createProperty et containerParentId', () => {
  it("parent d'une autre agence -> NotFoundError, rien n'est ecrit", async () => {
    propertyFindUnique.mockResolvedValue(parentRow({ tenantId: TENANT_B }));
    await expect(
      createProperty(TENANT_A, ACTOR, corps({ containerParentId: PARENT_ID }), ACTOR)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(propertyCreate).not.toHaveBeenCalled();
  });

  it('parent inexistant -> la meme NotFoundError', async () => {
    propertyFindUnique.mockResolvedValue(null);
    await expect(
      createProperty(TENANT_A, ACTOR, corps({ containerParentId: PARENT_ID }), ACTOR)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('parent non IMMEUBLE -> BadRequestError', async () => {
    propertyFindUnique.mockResolvedValue(parentRow({ propertyType: 'VILLA' }));
    await expect(
      createProperty(TENANT_A, ACTOR, corps({ containerParentId: PARENT_ID }), ACTOR)
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(propertyCreate).not.toHaveBeenCalled();
  });

  it('parent IMMEUBLE de la meme agence -> accepte', async () => {
    propertyFindUnique.mockResolvedValue(parentRow());
    await createProperty(TENANT_A, ACTOR, corps({ containerParentId: PARENT_ID }), ACTOR);
    expect(propertyCreate.mock.calls[0][0].data.containerParentId).toBe(PARENT_ID);
  });

  it("parent d'une autre agence sous mandat actif de l'agence -> accepte", async () => {
    propertyFindUnique.mockResolvedValue(
      parentRow({ tenantId: TENANT_B, ownershipType: 'CLIENT', mandates: [{ tenantId: TENANT_A }] })
    );
    await createProperty(TENANT_A, ACTOR, corps({ containerParentId: PARENT_ID }), ACTOR);
    expect(propertyCreate).toHaveBeenCalledTimes(1);
  });
});

describe('TEN-01 - lecture des enfants filtree par agence', () => {
  it('getChildProperties filtre les enfants par tenantId (ou mandat actif)', async () => {
    propertyFindUnique.mockResolvedValue({ ...parentRow(), id: PARENT_ID });
    await getChildProperties(PARENT_ID, TENANT_A);
    const where = propertyFindMany.mock.calls[0][0].where;
    expect(where.containerParentId).toBe(PARENT_ID);
    expect(where.OR).toEqual([{ tenantId: TENANT_A }, { mandates: { some: { tenantId: TENANT_A, isActive: true } } }]);
  });

  it('getPropertyById filtre containerChildren et restreint containerParent', async () => {
    propertyFindUnique.mockResolvedValue({ ...parentRow(), id: PARENT_ID });
    await getPropertyById(PARENT_ID, TENANT_A, ACTOR);
    const include = propertyFindUnique.mock.calls[0][0].include;
    expect(include.containerChildren.where.OR[0]).toEqual({ tenantId: TENANT_A });
    expect(include.containerParent).not.toBe(true);
    expect(include.containerParent.select.id).toBe(true);
  });
});

describe('TEN-07 - ownerUserId a la creation (bien non CLIENT)', () => {
  it("proprietaire d'une autre agence -> NotFoundError, rien n'est ecrit", async () => {
    await expect(
      createProperty(TENANT_A, OWNER_OTHER, corps({ ownerUserId: OWNER_OTHER }), ACTOR)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(propertyCreate).not.toHaveBeenCalled();
  });

  it("membre ACTIF de l'agence -> accepte", async () => {
    membershipFindFirst.mockResolvedValue({ id: 'm1' });
    await createProperty(TENANT_A, OWNER_OTHER, corps({ ownerUserId: OWNER_OTHER }), ACTOR);
    expect(propertyCreate.mock.calls[0][0].data.ownerUserId).toBe(OWNER_OTHER);
  });

  it("client (TenantClient) de l'agence -> accepte", async () => {
    tenantClientFindFirst.mockResolvedValue({ id: 'c1' });
    await createProperty(TENANT_A, OWNER_OTHER, corps({ ownerUserId: OWNER_OTHER }), ACTOR);
    expect(tenantClientFindFirst.mock.calls[0][0].where).toEqual({ tenantId: TENANT_A, userId: OWNER_OTHER });
    expect(propertyCreate).toHaveBeenCalledTimes(1);
  });

  it('proprietaire = createur -> accepte sans controle', async () => {
    await createProperty(TENANT_A, ACTOR, corps({ ownerUserId: ACTOR }), ACTOR);
    expect(propertyCreate.mock.calls[0][0].data.ownerUserId).toBe(ACTOR);
  });
});

describe('TEN-07 - ownerUserId a la mise a jour', () => {
  const existant = () => ({
    id: PROPERTY_ID,
    propertyType: 'APPARTEMENT',
    ownershipType: 'TENANT',
    tenantId: TENANT_A,
    ownerUserId: null,
    isPublished: false,
    status: 'AVAILABLE',
    version: 1,
    mandates: []
  });

  it("proprietaire etranger -> NotFoundError, rien n'est ecrit", async () => {
    propertyFindUnique.mockResolvedValue(existant());
    await expect(
      updateProperty(PROPERTY_ID, { ownerUserId: OWNER_OTHER } as any, TENANT_A, ACTOR, ACTOR)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(propertyUpdate).not.toHaveBeenCalled();
  });

  it('membre ACTIF -> accepte', async () => {
    propertyFindUnique.mockResolvedValue(existant());
    membershipFindFirst.mockResolvedValue({ id: 'm1' });
    await updateProperty(PROPERTY_ID, { ownerUserId: OWNER_OTHER } as any, TENANT_A, ACTOR, ACTOR);
    expect(propertyUpdate.mock.calls[0][0].data.ownerUserId).toBe(OWNER_OTHER);
  });

  it('proprietaire INCHANGE et hors agence -> accepte, sans controle', async () => {
    propertyFindUnique.mockResolvedValue({ ...existant(), ownerUserId: OWNER_OTHER });
    await updateProperty(PROPERTY_ID, { ownerUserId: OWNER_OTHER } as any, TENANT_A, ACTOR, ACTOR);
    expect(propertyUpdate).toHaveBeenCalledTimes(1);
    expect(tenantClientFindFirst).not.toHaveBeenCalled();
  });

  it('proprietaire MODIFIE vers un etranger (ancien proprietaire different) -> refuse', async () => {
    propertyFindUnique.mockResolvedValue({ ...existant(), ownerUserId: 'f0e199d3-0d8a-44f8-aa9e-15f795c7d3cf' });
    await expect(
      updateProperty(PROPERTY_ID, { ownerUserId: OWNER_OTHER } as any, TENANT_A, ACTOR, ACTOR)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(propertyUpdate).not.toHaveBeenCalled();
  });
});

describe('TEN-07 - sous-bien : proprietaire herite du parent', () => {
  it('proprietaire = celui du parent, hors agence -> accepte sans controle', async () => {
    propertyFindUnique.mockResolvedValue(parentRow({ ownerUserId: OWNER_OTHER }));
    await createProperty(
      TENANT_A,
      OWNER_OTHER,
      corps({ ownerUserId: OWNER_OTHER, containerParentId: PARENT_ID }),
      ACTOR,
      { inheritedOwnerUserId: OWNER_OTHER }
    );
    expect(propertyCreate).toHaveBeenCalledTimes(1);
    expect(tenantClientFindFirst).not.toHaveBeenCalled();
  });

  it('proprietaire fourni different de celui du parent et hors agence -> refuse', async () => {
    propertyFindUnique.mockResolvedValue(parentRow({ ownerUserId: ACTOR }));
    await expect(
      createProperty(TENANT_A, OWNER_OTHER, corps({ ownerUserId: OWNER_OTHER, containerParentId: PARENT_ID }), ACTOR, {
        inheritedOwnerUserId: ACTOR
      })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(propertyCreate).not.toHaveBeenCalled();
  });
});
