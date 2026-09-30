/**
 * `resoudreProprietaireParEmail` (via createProperty / updateProperty) :
 * e-mail normalisé en minuscules ; un compte d'une autre agence est adopté
 * mais son nom ne sort pas ; à la mise à jour, rien n'est créé si le bien est
 * introuvable.
 */
const userFindUnique = jest.fn();
const userCreate = jest.fn();
const tenantClientFindFirst = jest.fn();
const crmContactFindFirst = jest.fn();
const propertyFindFirst = jest.fn();
const propertyCreate = jest.fn();
const transactionMock = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    user: { findUnique: (...a: any[]) => userFindUnique(...a), create: (...a: any[]) => userCreate(...a) },
    tenantClient: { findFirst: (...a: any[]) => tenantClientFindFirst(...a) },
    crmContact: { findFirst: (...a: any[]) => crmContactFindFirst(...a), findMany: jest.fn().mockResolvedValue([]) },
    property: {
      findFirst: (...a: any[]) => propertyFindFirst(...a),
      findUnique: (...a: any[]) => propertyFindFirst(...a),
      create: (...a: any[]) => propertyCreate(...a)
    },
    membership: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: (...a: any[]) => transactionMock(...a)
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
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
jest.mock('../../src/services/own-assets-barrier-service', () => ({
  assertThirdPartyAllowedForTenant: jest.fn(),
  isThirdPartyOwnershipInput: jest.fn().mockReturnValue(false),
  isThirdPartyOwnerUserId: jest.fn().mockResolvedValue(false)
}));

import { createProperty, updateProperty } from '../../src/services/property-service';
import { NotFoundError } from '../../src/middleware/error-middleware';

const TENANT = 'ace199d3-0d8a-44f8-aa9e-15f795c7d3cf';

const corps = () =>
  ({
    propertyType: 'APPARTEMENT',
    ownershipType: 'CLIENT',
    ownerEmail: 'Proprio@Example.TEST',
    title: 'Villa',
    description: '',
    address: 'Cocody',
    transactionModes: ['RENTAL'],
    currency: 'CFA'
  }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  userFindUnique.mockResolvedValue(null);
  userCreate.mockImplementation(async ({ data }: any) => ({ id: 'u-new', ...data }));
  tenantClientFindFirst.mockResolvedValue(null);
  crmContactFindFirst.mockResolvedValue(null);
  propertyFindFirst.mockResolvedValue(null);
  propertyCreate.mockImplementation(async ({ data }: any) => ({
    id: 'bien-1',
    containerParentId: null,
    owner: { id: 'u-etranger', email: 'proprio@example.test', fullName: 'Nom Etranger' },
    ...data
  }));
  transactionMock.mockImplementation(async (cb: any) => cb({ property: { create: propertyCreate } }));
});

describe('ownerEmail — compte existant', () => {
  it('cherche le compte avec l’e-mail en minuscules', async () => {
    await createProperty(TENANT, null, corps(), 'acteur-1');
    expect(userFindUnique.mock.calls[0][0].where.email).toBe('proprio@example.test');
  });

  it('compte d’une autre agence (ni TenantClient ni contact ici) : adopté, nom masqué', async () => {
    userFindUnique.mockResolvedValue({ id: 'u-etranger' });
    const bien: any = await createProperty(TENANT, null, corps(), 'acteur-1');
    expect(userCreate).not.toHaveBeenCalled();
    expect(bien.owner.fullName).toBeNull();
  });

  it('compte déjà client de l’agence : nom conservé', async () => {
    userFindUnique.mockResolvedValue({ id: 'u-etranger' });
    tenantClientFindFirst.mockResolvedValue({ id: 'c1' });
    const bien: any = await createProperty(TENANT, null, corps(), 'acteur-1');
    expect(tenantClientFindFirst.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT, userId: 'u-etranger' });
    expect(bien.owner.fullName).toBe('Nom Etranger');
  });
});

describe('updateProperty — résolution après l’accès au bien', () => {
  it('bien introuvable : aucun compte cherché ni créé', async () => {
    await expect(
      updateProperty('p-inconnu', { ownerEmail: 'nouveau@example.test' } as any, TENANT, null, 'acteur-1')
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });
});
