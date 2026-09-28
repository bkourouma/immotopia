/**
 * `PUT /api/tenants/:tenantId/properties/:id` souffre du meme defaut que la
 * creation (voir `property-service.create.test.ts`) : `updateProperty`
 * passait `req.body` tel quel a `tx.property.update()`, sans jamais verifier
 * le type d'un champ. Un `price: "abc"` ou un `ownerUserId` qui n'est pas un
 * uuid y levait une `PrismaClientValidationError`, classee 500 par
 * `errorHandler` — au lieu d'un 400 `VALIDATION_ERROR` clair.
 *
 * `updatePropertySchema` (lib/properties/schemas.ts) ferme ce trou : ce
 * fichier verifie qu'un corps de mise a jour mal type est refuse en 400 avant
 * toute ecriture, et qu'un corps legitime passe toujours.
 */

import express from 'express';
import request from 'supertest';

const transactionMock = jest.fn();
const findUniqueMock = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    property: { findUnique: (...args: any[]) => findUniqueMock(...args) },
    $transaction: (...args: any[]) => transactionMock(...args)
  }
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn()
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

const syncLotActivationsTx = jest.fn();
jest.mock('../../src/services/lot-registry-service', () => ({
  syncLotActivationsTx: (...args: any[]) => syncLotActivationsTx(...args)
}));

import { updatePropertyHandler } from '../../src/controllers/property-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

const TENANT_ID = 'ace199d3-0d8a-44f8-aa9e-15f795c7d3cf';
const PROPERTY_ID = 'a1e199d3-0d8a-44f8-aa9e-15f795c7d3cf';

/** Le bien existant que `getPropertyById` lit avant toute mise a jour. */
const proprieteExistante = () => ({
  id: PROPERTY_ID,
  propertyType: 'APPARTEMENT',
  ownershipType: 'TENANT',
  tenantId: TENANT_ID,
  ownerUserId: null,
  isPublished: false,
  status: 'AVAILABLE',
  version: 1,
  mandates: []
});

const propertyUpdate = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
  ...proprieteExistante(),
  ...data
}));

function transactionReelle() {
  transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({ property: { update: propertyUpdate } })
  );
}

function appMiseAJour() {
  const app = express();
  app.use(express.json());
  app.put('/api/tenants/:tenantId/properties/:id', updatePropertyHandler);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  transactionMock.mockReset();
  syncLotActivationsTx.mockReset();
  findUniqueMock.mockResolvedValue(proprieteExistante());
  transactionReelle();
});

describe('PUT /api/tenants/:tenantId/properties/:id — corps invalide : 400 VALIDATION_ERROR, jamais 500', () => {
  it.each([
    ['prix mal type (chaine non numerique)', { price: 'abc' }, 'price'],
    ['proprietaire qui n’est pas un uuid', { ownerUserId: 'pas-un-uuid' }, 'ownerUserId'],
    ['devise mal typee (nombre au lieu de texte)', { currency: 123 }, 'currency'],
    ['titre vide', { title: '   ' }, 'title']
  ])('%s -> 400 VALIDATION_ERROR', async (_cas, corps, field) => {
    const res = await request(appMiseAJour()).put(`/api/tenants/${TENANT_ID}/properties/${PROPERTY_ID}`).send(corps);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe('PUT /api/tenants/:tenantId/properties/:id — corps legitime', () => {
  it('un corps de mise a jour bien type est accepte (200)', async () => {
    const res = await request(appMiseAJour())
      .put(`/api/tenants/${TENANT_ID}/properties/${PROPERTY_ID}`)
      .send({ title: 'Bel appartement renove', price: 125000, surfaceArea: 62.5, ownerUserId: undefined });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: 'Bel appartement renove', price: 125000 });
  });
});

describe('PUT /api/tenants/:tenantId/properties/:id — meuble non renseigne (BUG-2026-09-28-013)', () => {
  // Un sous-bien cree par l'onglet Lots sans « Meuble » est stocke avec
  // `furnishingStatus: null` (colonne facultative) ; le formulaire renvoie cette
  // valeur telle quelle a l'enregistrement suivant.
  it('accepte furnishingStatus null (bien cree sans meuble) et l’ecrit en base', async () => {
    const res = await request(appMiseAJour())
      .put(`/api/tenants/${TENANT_ID}/properties/${PROPERTY_ID}`)
      .send({ description: 'Nouvelle description', furnishingStatus: null });

    expect(res.status).toBe(200);
    expect(propertyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: 'Nouvelle description', furnishingStatus: null })
      })
    );
  });

  it('refuse toujours une valeur de meuble inconnue, en 400 avec le champ', async () => {
    const res = await request(appMiseAJour())
      .put(`/api/tenants/${TENANT_ID}/properties/${PROPERTY_ID}`)
      .send({ furnishingStatus: 'BOF' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'furnishingStatus' })]));
  });
});

describe('PUT /api/tenants/:tenantId/properties/:id — retrait du proprietaire (BUG-2026-09-28-008)', () => {
  it('un bien de l agence peut perdre son proprietaire (ownerUserId null)', async () => {
    const res = await request(appMiseAJour())
      .put(`/api/tenants/${TENANT_ID}/properties/${PROPERTY_ID}`)
      .send({ ownerUserId: null });

    expect(res.status).toBe(200);
    expect(propertyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ownerUserId: null }) })
    );
  });

  it('un bien sous mandat ne peut pas perdre son proprietaire (400)', async () => {
    findUniqueMock.mockResolvedValue({ ...proprieteExistante(), ownershipType: 'CLIENT', ownerUserId: 'client-9' });
    const res = await request(appMiseAJour())
      .put(`/api/tenants/${TENANT_ID}/properties/${PROPERTY_ID}`)
      .send({ ownerUserId: null });

    expect(res.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
