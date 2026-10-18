/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import request from 'supertest';

/**
 * Spec 047, T033 et T034 : routes portail du paiement mobile money déclaré
 * (`routes/coowner-portal-routes.ts`, contrats §2.1, 2.4, 2.5, 2.6).
 *
 * Session et périmètre sont posés par des passe-plats (`authenticate`,
 * `requireCoOwnerPortalAccess`) ; les autres contrôleurs du portail sont
 * neutralisés ; le moteur de `declared-payment/portal.ts` est simulé. Le
 * limiteur de création est le VRAI : il doit répondre 429 avant tout traitement.
 */

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));

const SCOPE = { tenantId: 'tenant-A', contactIds: ['c1'], lots: [], lotIds: [], syndicateIds: [] };
jest.mock('../../src/middleware/coowner-portal-access', () => ({
  requireCoOwnerPortalAccess: (req: any, _res: any, next: any) => {
    req.coOwnerPortal = { scope: SCOPE, tenantClientId: 'tc-1' };
    next();
  }
}));

const passthrough = () => new Proxy({}, { get: () => (_req: any, _res: any, next: any) => next() });
jest.mock('../../src/controllers/coowner-portal-controller', () => passthrough());
jest.mock('../../src/controllers/coowner-portal-finance-controller', () => passthrough());
jest.mock('../../src/controllers/coowner-charge-notice-controller', () => passthrough());
jest.mock('../../src/controllers/coowner-online-payment-controller', () => passthrough());

const getAvailability = jest.fn();
const createDeclaration = jest.fn();
const listDeclarations = jest.fn();
const cancelDeclaration = jest.fn();
jest.mock('../../src/lib/syndics/declared-payment/portal', () => ({
  getCoOwnerDeclaredAvailability: (...a: any[]) => getAvailability(...a),
  createCoOwnerDeclaration: (...a: any[]) => createDeclaration(...a),
  listCoOwnerDeclarations: (...a: any[]) => listDeclarations(...a),
  cancelCoOwnerDeclaration: (...a: any[]) => cancelDeclaration(...a)
}));

import { errorHandler, AppError, ErrorCode, NotFoundError } from '../../src/middleware/error-middleware';
import router from '../../src/routes/coowner-portal-routes';

const app = express();
app.set('trust proxy', false);
app.use(express.json());
app.use('/api/portal/copropriete', router);
app.use(errorHandler);

const BASE = '/api/portal/copropriete/paiements-declares';
const SYNDIC = '11111111-1111-4111-8111-111111111111';
const NUMBER = '33333333-3333-4333-8333-333333333333';
const LOT = '44444444-4444-4444-8444-444444444444';
const DECL = '22222222-2222-4222-8222-222222222222';

const payload = {
  syndicId: SYNDIC,
  receivingNumberId: NUMBER,
  payerPhone: '0707070707',
  amount: 30000,
  paidAt: '2026-10-17T14:32:00+00:00',
  transactionReference: 'MP261017.1432.A12345',
  lines: [{ lotId: LOT, amount: 30000, chargeCallIds: [] }]
};

beforeEach(() => jest.clearAllMocks());

describe('2.1 disponibilité', () => {
  it('lit la copropriété demandée avec le périmètre de la session', async () => {
    getAvailability.mockResolvedValue({ available: true });
    const res = await request(app).get(`${BASE}/disponibilite?syndicId=${SYNDIC}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ available: true });
    expect(getAvailability).toHaveBeenCalledWith(SCOPE, SYNDIC);
  });

  it('exige un syndicId valide (400) et transmet le 404 d’une copropriété hors périmètre', async () => {
    expect((await request(app).get(`${BASE}/disponibilite`)).status).toBe(400);
    expect((await request(app).get(`${BASE}/disponibilite?syndicId=nope`)).status).toBe(400);
    getAvailability.mockRejectedValue(new NotFoundError('Copropriété introuvable.'));
    expect((await request(app).get(`${BASE}/disponibilite?syndicId=${SYNDIC}`)).status).toBe(404);
  });
});

describe('2.4 création', () => {
  it('crée (201) avec payload JSON et capture, sans jamais lire d’agence du corps', async () => {
    createDeclaration.mockResolvedValue({ id: DECL, status: 'PENDING' });
    const res = await request(app)
      .post(BASE)
      .field('payload', JSON.stringify(payload))
      .attach('proof', Buffer.from('fichier'), { filename: 'capture.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: DECL, status: 'PENDING' });
    const [scope, body, file] = createDeclaration.mock.calls[0];
    expect(scope).toBe(SCOPE);
    expect(body).toMatchObject({ syndicId: SYNDIC, amount: 30000, transactionReference: 'MP261017.1432.A12345' });
    expect(file.buffer.toString()).toBe('fichier');
  });

  it('accepte une lecture IA liée (proofReadId) et le moteur tranche', async () => {
    createDeclaration.mockRejectedValue(new AppError('indisponible', 409, ErrorCode.PROOF_READ_UNAVAILABLE));
    const res = await request(app)
      .post(BASE)
      .field('payload', JSON.stringify({ ...payload, proofReadId: DECL }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PROOF_READ_UNAVAILABLE');
  });

  it('refuse un champ inconnu ou un tenantId (400 VALIDATION_ERROR)', async () => {
    const res = await request(app)
      .post(BASE)
      .field('payload', JSON.stringify({ ...payload, tenantId: 'tenant-B' }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(createDeclaration).not.toHaveBeenCalled();
  });

  it('refuse un payload absent ou qui n’est pas du JSON (400)', async () => {
    expect((await request(app).post(BASE).field('x', 'y')).status).toBe(400);
    expect((await request(app).post(BASE).field('payload', '{oups')).status).toBe(400);
    expect(createDeclaration).not.toHaveBeenCalled();
  });

  it('refuse plus de 10 lots ou un lot non UUID (400)', async () => {
    const lines = Array.from({ length: 11 }, () => ({ lotId: LOT, amount: 1, chargeCallIds: [] }));
    expect(
      (
        await request(app)
          .post(BASE)
          .field('payload', JSON.stringify({ ...payload, lines }))
      ).status
    ).toBe(400);
    const bad = { ...payload, lines: [{ lotId: 'lot-1', amount: 30000, chargeCallIds: [] }] };
    expect((await request(app).post(BASE).field('payload', JSON.stringify(bad))).status).toBe(400);
    expect(createDeclaration).not.toHaveBeenCalled();
  });

  it('traduit une capture de plus de 5 Mo en 413 DECLARATION_PROOF_TOO_LARGE', async () => {
    const res = await request(app)
      .post(BASE)
      .field('payload', JSON.stringify(payload))
      .attach('proof', Buffer.alloc(5 * 1024 * 1024 + 10, 1), { filename: 'enorme.png', contentType: 'image/png' });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('DECLARATION_PROOF_TOO_LARGE');
    expect(createDeclaration).not.toHaveBeenCalled();
  });

  it('transmet le 403 SYNDIC_FEATURE_DENIED et le 409 DECLARATION_REFERENCE_USED du moteur', async () => {
    createDeclaration.mockRejectedValueOnce(new AppError('refusé', 403, ErrorCode.SYNDIC_FEATURE_DENIED));
    const denied = await request(app).post(BASE).field('payload', JSON.stringify(payload));
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('SYNDIC_FEATURE_DENIED');
    createDeclaration.mockRejectedValueOnce(new AppError('déjà', 409, ErrorCode.DECLARATION_REFERENCE_USED));
    const used = await request(app).post(BASE).field('payload', JSON.stringify(payload));
    expect(used.status).toBe(409);
    expect(used.body.code).toBe('DECLARATION_REFERENCE_USED');
  });

  it('limite la création à 10 par minute et par compte, avant tout traitement', async () => {
    createDeclaration.mockResolvedValue({ id: DECL });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      statuses.push((await request(app).post(BASE).field('payload', JSON.stringify(payload))).status);
    }
    expect(statuses.filter(status => status === 429).length).toBeGreaterThanOrEqual(1);
    expect(statuses[statuses.length - 1]).toBe(429);
    expect(createDeclaration.mock.calls.length).toBeLessThanOrEqual(10);
  });
});

describe('2.5 liste et 2.6 annulation', () => {
  it('liste avec statut ALL, page et limite validés', async () => {
    listDeclarations.mockResolvedValue({ items: [], pagination: {} });
    const res = await request(app).get(`${BASE}?status=ALL&page=2&limit=50`);
    expect(res.status).toBe(200);
    expect(listDeclarations).toHaveBeenCalledWith(SCOPE, { status: 'ALL', page: 2, limit: 50 });
    expect((await request(app).get(`${BASE}?limit=51`)).status).toBe(400);
    expect((await request(app).get(`${BASE}?status=FOO`)).status).toBe(400);
  });

  it('annule sans corps et rend la déclaration CANCELED', async () => {
    cancelDeclaration.mockResolvedValue({ id: DECL, status: 'CANCELED' });
    const res = await request(app).post(`${BASE}/${DECL}/annulation`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELED');
    expect(cancelDeclaration).toHaveBeenCalledWith(SCOPE, DECL);
  });

  it('répond 404 pour un identifiant non UUID ou hors périmètre, 409 si plus en attente', async () => {
    expect((await request(app).post(`${BASE}/nope/annulation`)).status).toBe(404);
    cancelDeclaration.mockRejectedValueOnce(new NotFoundError('Déclaration introuvable.'));
    expect((await request(app).post(`${BASE}/${DECL}/annulation`)).status).toBe(404);
    cancelDeclaration.mockRejectedValueOnce(new AppError('traitée', 409, ErrorCode.DECLARATION_NOT_PENDING));
    const res = await request(app).post(`${BASE}/${DECL}/annulation`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DECLARATION_NOT_PENDING');
  });

  it('ne sert aucune capture au portail', async () => {
    expect((await request(app).get(`${BASE}/${DECL}/preuve`)).status).toBe(404);
  });
});
