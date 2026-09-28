/**
 * BUG-2026-09-28-008 — un bien de l'agence n'a pas de proprietaire prive : le
 * createur ne doit pas etre ecrit comme `ownerUserId` (la fiche affichait
 * « Propriete de <createur> », le formulaire un identifiant brut).
 */

const createProperty = jest.fn();
const getPropertyById = jest.fn();

jest.mock('../../src/services/property-service', () => ({
  createProperty: (...a: any[]) => createProperty(...a),
  getPropertyById: (...a: any[]) => getPropertyById(...a),
  updateProperty: jest.fn(),
  listProperties: jest.fn(),
  publishPropertyWrapper: jest.fn(),
  unpublishPropertyWrapper: jest.fn(),
  deleteProperty: jest.fn(),
  getChildProperties: jest.fn()
}));
jest.mock('../../src/services/property-quality-service', () => ({
  getLatestQualityScore: jest.fn(),
  calculateQualityScore: jest.fn()
}));
jest.mock('../../src/services/property-template-service', () => ({
  getTemplateByType: jest.fn(),
  getAllTemplates: jest.fn()
}));
jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  getTenantIdFromRequest: (req: any) => req.tenantContext?.tenantId
}));

import {
  createPropertyHandler,
  createSubPropertyHandler,
  defaultOwnerUserId
} from '../../src/controllers/property-controller';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const requete = (body: Record<string, unknown>, extraParams: Record<string, string> = {}): any => ({
  params: { tenantId: 'tenant-A', ...extraParams },
  tenantContext: { tenantId: 'tenant-A' },
  user: { userId: 'createur-1' },
  body
});

beforeEach(() => {
  jest.clearAllMocks();
  createProperty.mockResolvedValue({ id: 'p1' });
});

describe('defaultOwnerUserId', () => {
  it('bien de l agence : aucun proprietaire par defaut', () => {
    expect(defaultOwnerUserId('TENANT', undefined, 'createur-1')).toBeUndefined();
  });
  it('bien prive : le createur reste le proprietaire', () => {
    expect(defaultOwnerUserId('PUBLIC', undefined, 'createur-1')).toBe('createur-1');
  });
  it('un e-mail de proprietaire prime', () => {
    expect(defaultOwnerUserId('PUBLIC', 'a@b.c', 'createur-1')).toBeUndefined();
  });
});

describe('createPropertyHandler — proprietaire', () => {
  it('bien de l agence sans proprietaire : ownerUserId reste vide', async () => {
    await createPropertyHandler(
      requete({ propertyType: 'IMMEUBLE', ownershipType: 'TENANT', title: 'Residence' }),
      mockRes(),
      jest.fn()
    );
    const [, ownerArg, dataArg] = createProperty.mock.calls[0];
    expect(ownerArg).toBeNull();
    expect(dataArg.ownerUserId).toBeUndefined();
  });

  it('un proprietaire CLIENT designe est conserve', async () => {
    await createPropertyHandler(
      requete({ propertyType: 'VILLA', ownershipType: 'CLIENT', ownerUserId: 'client-9', title: 'Villa' }),
      mockRes(),
      jest.fn()
    );
    const [, ownerArg, dataArg] = createProperty.mock.calls[0];
    expect(dataArg.ownerUserId).toBe('client-9');
    expect(ownerArg).toBe('client-9');
  });
});

describe('createSubPropertyHandler — proprietaire', () => {
  const parent = (ownerUserId: string | null) => ({
    id: 'parent-1',
    propertyType: 'IMMEUBLE',
    ownershipType: 'TENANT',
    tenantId: 'tenant-A',
    ownerUserId,
    address: '1 rue A',
    typeSpecificData: {}
  });

  it('sous-bien d un immeuble d agence sans proprietaire : pas de createur ecrit', async () => {
    getPropertyById.mockResolvedValue(parent(null));
    await createSubPropertyHandler(requete({ title: 'A1' }, { id: 'parent-1' }), mockRes(), jest.fn());
    const [, ownerArg, dataArg] = createProperty.mock.calls[0];
    expect(dataArg.ownerUserId).toBeUndefined();
    expect(ownerArg).toBeNull();
  });

  it('sous-bien : herite du proprietaire du parent quand il en a un', async () => {
    getPropertyById.mockResolvedValue(parent('client-9'));
    await createSubPropertyHandler(requete({ title: 'A1' }, { id: 'parent-1' }), mockRes(), jest.fn());
    const [, ownerArg, dataArg] = createProperty.mock.calls[0];
    expect(dataArg.ownerUserId).toBe('client-9');
    expect(ownerArg).toBe('client-9');
  });
});
