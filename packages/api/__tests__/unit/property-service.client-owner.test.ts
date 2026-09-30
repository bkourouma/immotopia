/**
 * BUG-2026-09-30-030 / 039 : un bien CLIENT créé par l'assistant porte
 * l'agence qui l'a saisi (sinon il est introuvable tant qu'aucun mandat
 * n'existe), et le compte propriétaire créé depuis l'e-mail d'un contact
 * reçoit le nom de ce contact (raison sociale pour une entreprise).
 */

const transactionMock = jest.fn();
const userFindUnique = jest.fn();
const userCreate = jest.fn();
const crmContactFindFirst = jest.fn();
const propertyCreate = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (...args: any[]) => transactionMock(...args),
    membership: { findFirst: jest.fn().mockResolvedValue(null) },
    user: {
      findUnique: (...a: any[]) => userFindUnique(...a),
      create: (...a: any[]) => userCreate(...a)
    },
    crmContact: { findFirst: (...a: any[]) => crmContactFindFirst(...a), findMany: jest.fn().mockResolvedValue([]) }
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
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
jest.mock('../../src/services/own-assets-barrier-service', () => ({
  assertThirdPartyAllowedForTenant: jest.fn(),
  isThirdPartyOwnershipInput: jest.fn().mockReturnValue(false)
}));

import { createProperty } from '../../src/services/property-service';

const TENANT_ID = 'ace199d3-0d8a-44f8-aa9e-15f795c7d3cf';

const corps = (ownershipType: string) =>
  ({
    propertyType: 'APPARTEMENT',
    ownershipType,
    ownerEmail: 'boutique@example.test',
    title: 'Local commercial',
    description: '',
    address: 'Cocody',
    transactionModes: ['RENTAL'],
    currency: 'CFA'
  }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  userFindUnique.mockResolvedValue(null);
  userCreate.mockImplementation(async ({ data }: any) => ({ id: 'u-new', ...data }));
  crmContactFindFirst.mockResolvedValue({
    contactType: 'COMPANY',
    legalName: 'Boutique Ivoire SARL',
    firstName: 'Mamadou',
    lastName: 'Bamba'
  });
  propertyCreate.mockImplementation(async ({ data }: any) => ({
    id: 'bien-1',
    containerParentId: null,
    owner: { id: 'u-new', email: data.ownerUserId ? 'boutique@example.test' : '', fullName: 'Boutique Ivoire SARL' },
    ...data
  }));
  transactionMock.mockImplementation(async (callback: any) => callback({ property: { create: propertyCreate } }));
});

describe('createProperty — bien CLIENT et nom du propriétaire', () => {
  it('un bien CLIENT porte l’agence qui l’a saisi', async () => {
    await createProperty(TENANT_ID, null, corps('CLIENT'), 'acteur-1');
    expect(propertyCreate.mock.calls[0][0].data.tenantId).toBe(TENANT_ID);
    expect(propertyCreate.mock.calls[0][0].data.ownershipType).toBe('CLIENT');
  });

  it('un bien PUBLIC reste sans agence', async () => {
    await createProperty(TENANT_ID, null, corps('PUBLIC'), 'acteur-1');
    expect(propertyCreate.mock.calls[0][0].data.tenantId).toBeNull();
  });

  it('le compte créé depuis l’e-mail du contact reçoit sa raison sociale', async () => {
    await createProperty(TENANT_ID, null, corps('CLIENT'), 'acteur-1');
    expect(crmContactFindFirst.mock.calls[0][0].where.tenantId).toBe(TENANT_ID);
    expect(userCreate.mock.calls[0][0].data.fullName).toBe('Boutique Ivoire SARL');
  });

  it('sans contact correspondant, le compte est créé sans nom (comportement inchangé)', async () => {
    crmContactFindFirst.mockResolvedValue(null);
    await createProperty(TENANT_ID, null, corps('CLIENT'), 'acteur-1');
    expect(userCreate.mock.calls[0][0].data.fullName).toBeNull();
  });
});
