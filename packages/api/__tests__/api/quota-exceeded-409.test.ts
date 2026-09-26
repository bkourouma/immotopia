/**
 * BUG A1 (docs/recette/SCENARIO_SYNDIC_ABONNEMENT.md §9) — en politique de
 * quota BLOCK, un dépassement de capacité doit répondre 409
 * `{ code: 'QUOTA_EXCEEDED', data: { capacityKey, used, limit, requested } }`.
 *
 * `syndic-controller.ts` (`res.status(error.status || 400)`) et
 * `property-controller.ts` (400 en dur) avalaient ce 409 — voir
 * `middleware/error-middleware.ts` (AppError.statusCode) et le modèle
 * `controllers/property-media-controller.ts` (asyncHandler + erreurs typées).
 *
 * Un test par route citée : POST .../syndics, POST .../syndics/:id/lots,
 * POST .../properties. Chaque route est montée seule, avec le vrai
 * `errorHandler`, et le service sous-jacent est simulé pour lever soit
 * `QuotaExceededError` (409 attendu), soit une erreur de validation
 * (400 attendu, comportement à préserver).
 */

import express from 'express';
import request from 'supertest';

const createSyndicateWithDefaults = jest.fn();
const createSyndicateLot = jest.fn();

jest.mock('../../src/lib/syndics/queries', () => ({
  createSyndicateWithDefaults: (...a: any[]) => createSyndicateWithDefaults(...a),
  createSyndicateLot: (...a: any[]) => createSyndicateLot(...a)
}));

const createProperty = jest.fn();

jest.mock('../../src/services/property-service', () => ({
  createProperty: (...a: any[]) => createProperty(...a),
  getPropertyById: jest.fn(),
  updateProperty: jest.fn(),
  listProperties: jest.fn(),
  publishPropertyWrapper: jest.fn(),
  unpublishPropertyWrapper: jest.fn(),
  deleteProperty: jest.fn(),
  getChildProperties: jest.fn()
}));

// property-controller.ts importe aussi ces deux services (non utilises par
// createPropertyHandler) : simules pour ne pas charger property-template-service.ts,
// qui porte une des ~73 erreurs TypeScript preexistantes du paquet (AGENTS.md) —
// sans lien avec ce bug, mais qui ferait echouer la compilation du test.
jest.mock('../../src/services/property-quality-service', () => ({
  getLatestQualityScore: jest.fn(),
  calculateQualityScore: jest.fn()
}));

jest.mock('../../src/services/property-template-service', () => ({
  getTemplateByType: jest.fn(),
  getAllTemplates: jest.fn()
}));

import { createSyndicHandler, createSyndicLotHandler } from '../../src/controllers/syndic-controller';
import { createPropertyHandler } from '../../src/controllers/property-controller';
import { errorHandler, QuotaExceededError, BadRequestError } from '../../src/middleware/error-middleware';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const SYNDIC_ID = '22222222-2222-2222-2222-222222222222';
const PROPERTY_ID = '33333333-3333-3333-3333-333333333333';

const QUOTA_DETAIL = { capacityKey: 'LOTS', used: 50, limit: 50, requested: 1 };

function appFor(path: string, handler: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.post(path, handler);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BUG A1 — POST /api/tenants/:tenantId/syndics', () => {
  const app = appFor('/api/tenants/:tenantId/syndics', createSyndicHandler);

  it('BLOCK : 409 QUOTA_EXCEEDED avec le detail de capacite, pas 400', async () => {
    createSyndicateWithDefaults.mockRejectedValueOnce(new QuotaExceededError(QUOTA_DETAIL));

    const res = await request(app).post(`/api/tenants/${TENANT_ID}/syndics`).send({ name: 'Résidence Test' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('QUOTA_EXCEEDED');
    expect(res.body.data).toMatchObject(QUOTA_DETAIL);
  });

  it('une creation invalide reste 400 (validation)', async () => {
    const res = await request(app).post(`/api/tenants/${TENANT_ID}/syndics`).send({});

    expect(res.status).toBe(400);
    expect(createSyndicateWithDefaults).not.toHaveBeenCalled();
  });
});

describe('BUG A1 — POST /api/tenants/:tenantId/syndics/:syndicId/lots', () => {
  const app = appFor('/api/tenants/:tenantId/syndics/:syndicId/lots', createSyndicLotHandler);

  const validLotBody = {
    propertyId: PROPERTY_ID,
    lotNumber: 'A1',
    lotType: 'APARTMENT',
    tantiemes: 10
  };

  it('BLOCK : 409 QUOTA_EXCEEDED avec le detail de capacite, pas 400', async () => {
    createSyndicateLot.mockRejectedValueOnce(new QuotaExceededError(QUOTA_DETAIL));

    const res = await request(app).post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/lots`).send(validLotBody);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('QUOTA_EXCEEDED');
    expect(res.body.data).toMatchObject(QUOTA_DETAIL);
  });

  it('une creation de lot invalide reste 400 (validation)', async () => {
    const res = await request(app).post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/lots`).send({ lotNumber: '' });

    expect(res.status).toBe(400);
    expect(createSyndicateLot).not.toHaveBeenCalled();
  });
});

describe('BUG A1 — POST /api/tenants/:tenantId/properties', () => {
  const app = appFor('/api/tenants/:tenantId/properties', createPropertyHandler);

  it('BLOCK : 409 QUOTA_EXCEEDED avec le detail de capacite, pas 400', async () => {
    createProperty.mockRejectedValueOnce(new QuotaExceededError(QUOTA_DETAIL));

    const res = await request(app)
      .post(`/api/tenants/${TENANT_ID}/properties`)
      .send({ propertyType: 'APPARTEMENT', ownershipType: 'TENANT', title: 'Bel appartement' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('QUOTA_EXCEEDED');
    expect(res.body.data).toMatchObject(QUOTA_DETAIL);
  });

  it('un echec de validation du service reste 400, pas ecrase par le controleur', async () => {
    createProperty.mockRejectedValueOnce(new BadRequestError('Property validation failed: title requis'));

    const res = await request(app)
      .post(`/api/tenants/${TENANT_ID}/properties`)
      .send({ propertyType: 'APPARTEMENT', ownershipType: 'TENANT' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Property validation failed');
  });
});
