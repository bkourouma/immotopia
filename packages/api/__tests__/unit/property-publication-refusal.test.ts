/**
 * BUG-2026-09-28-009 — publier un bien qui ne remplit pas les conditions
 * levait un `Error` nu : 500 INTERNAL, message anglais. C'est un refus
 * metier : 400 avec la liste des conditions manquantes, en francais.
 */

const findUniqueMock = jest.fn();
const getPropertyByIdMock = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: { property: { findUnique: (...a: any[]) => findUniqueMock(...a), update: jest.fn() } }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/property-service', () => ({
  getPropertyById: (...a: any[]) => getPropertyByIdMock(...a)
}));
jest.mock('../../src/services/whatsapp-group-automation-service', () => ({
  sendPropertyPublishedGroupBroadcast: jest.fn()
}));

import express from 'express';
import request from 'supertest';
import { publishProperty } from '../../src/services/property-publication-service';
import { asyncHandler, errorHandler } from '../../src/middleware/error-middleware';

const BIEN_INCOMPLET = {
  id: 'p1',
  tenantId: 't1',
  title: 'Palmiers A1',
  description: '',
  address: 'Cocody',
  latitude: null,
  longitude: null,
  price: 250000,
  status: 'AVAILABLE',
  media: [],
  documents: []
};

function app() {
  const a = express();
  a.post(
    '/publish',
    asyncHandler(async (_req, res) => {
      res.json({ success: true, data: await publishProperty('p1', 't1', 'u1', 'u1') });
    })
  );
  a.use(errorHandler);
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  findUniqueMock.mockResolvedValue(BIEN_INCOMPLET);
  getPropertyByIdMock.mockResolvedValue(BIEN_INCOMPLET);
});

describe('publishProperty — conditions non remplies', () => {
  it('repond 400 (jamais 500) avec la liste des conditions en francais', async () => {
    const res = await request(app()).post('/publish');

    expect(res.status).toBe(400);
    expect(res.body.code).not.toBe('INTERNAL');
    expect(res.body.message).toContain('Les conditions de publication ne sont pas remplies');
    expect(res.body.message).not.toMatch(/requirements/i);
    const messages = res.body.errors.map((e: { message: string }) => e.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        'La description est obligatoire',
        'Au moins une photo principale est obligatoire',
        'La géolocalisation (latitude/longitude) est obligatoire'
      ])
    );
  });

  it('repond 404 quand le bien est introuvable', async () => {
    getPropertyByIdMock.mockResolvedValue(null);
    const res = await request(app()).post('/publish');
    expect(res.status).toBe(404);
  });
});
