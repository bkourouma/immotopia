/**
 * B5 — `data.tenantId = req.body.tenantId` supprime de `createPropertyHandler`
 * et `createSubPropertyHandler` : le tenantId d'un bien vient uniquement de
 * `req.tenantContext` / `req.params`, jamais du corps de la requete. Sans ce
 * retrait, une agence pouvait forger `tenantId` dans le corps pour creer un
 * bien au nom d'une autre agence (ou, pour un sous-bien, l'y rattacher).
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

import { createPropertyHandler, createSubPropertyHandler } from '../../src/controllers/property-controller';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

describe('createPropertyHandler — le tenantId du corps est ignore', () => {
  it("cree le bien pour l'agence du contexte, pas pour celle forgee dans le corps", async () => {
    createProperty.mockResolvedValue({ id: 'p1', tenantId: 'tenant-A' });

    const req: any = {
      params: { tenantId: 'tenant-A' },
      tenantContext: { tenantId: 'tenant-A' },
      user: { userId: 'user-1' },
      body: {
        propertyType: 'APPARTEMENT',
        ownershipType: 'TENANT',
        tenantId: 'tenant-B', // usurpation tentee
        title: 'Bel appartement'
      }
    };
    const res = mockRes();

    await createPropertyHandler(req, res);

    expect(createProperty).toHaveBeenCalledTimes(1);
    const [tenantIdArg, , dataArg] = createProperty.mock.calls[0];
    expect(tenantIdArg).toBe('tenant-A');
    expect(dataArg.tenantId).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('createSubPropertyHandler — le tenantId du corps est ignore', () => {
  it("rattache le sous-bien a l'agence du parent, pas a celle forgee dans le corps", async () => {
    getPropertyById.mockResolvedValue({
      id: 'parent-1',
      propertyType: 'IMMEUBLE',
      ownershipType: 'TENANT',
      tenantId: 'tenant-A',
      ownerUserId: 'owner-1',
      address: '1 rue A',
      typeSpecificData: {}
    });
    createProperty.mockResolvedValue({ id: 'child-1', tenantId: 'tenant-A' });

    const req: any = {
      params: { tenantId: 'tenant-A', id: 'parent-1' },
      tenantContext: { tenantId: 'tenant-A' },
      user: { userId: 'user-1' },
      body: {
        title: 'Appartement 3B',
        tenantId: 'tenant-B' // usurpation tentee
      }
    };
    const res = mockRes();

    await createSubPropertyHandler(req, res);

    expect(createProperty).toHaveBeenCalledTimes(1);
    const [tenantIdArg, , dataArg] = createProperty.mock.calls[0];
    expect(tenantIdArg).toBe('tenant-A');
    expect(dataArg.tenantId).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
