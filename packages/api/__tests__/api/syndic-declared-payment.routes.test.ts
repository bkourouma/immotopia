/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import request from 'supertest';

/**
 * Spec 047, T030 et T040 : routes gestionnaire du paiement mobile money déclaré
 * (`routes/syndic-declared-payment-routes.ts`, contrats §1).
 *
 * Auth, agence et isolation sont des passe-plats ; le droit (`SYNDIC_VIEW` /
 * `SYNDIC_EDIT`) passe par les vraies gardes de `property-rbac-middleware` et un
 * `hasPermission` simulé, pour vérifier la matrice de permissions route par route.
 * Le moteur est simulé : on vérifie ici le câblage (identifiants, corps stricts,
 * ordre des effets après validation), pas les règles métier (testées dans
 * `declared-payment-*.test.ts`).
 */

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));
jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));
jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  enforcePropertyTenantIsolation: (_req: any, _res: any, next: any) => next()
}));

const permissions = new Set<string>();
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: async (_userId: string, key: string) => permissions.has(key),
  hasAnyPermission: async (_userId: string, keys: string[]) => keys.some(key => permissions.has(key))
}));

jest.mock('../../src/middleware/rate-limit-middleware', () => ({
  syndicDeclaredWriteRateLimiter: (_req: any, _res: any, next: any) => next()
}));

const listReceivingNumbers = jest.fn();
const createReceivingNumber = jest.fn();
const updateReceivingNumber = jest.fn();
const deleteReceivingNumber = jest.fn();
jest.mock('../../src/lib/syndics/declared-payment/receiving-numbers', () => ({
  listReceivingNumbers: (...a: any[]) => listReceivingNumbers(...a),
  createReceivingNumber: (...a: any[]) => createReceivingNumber(...a),
  updateReceivingNumber: (...a: any[]) => updateReceivingNumber(...a),
  deleteReceivingNumber: (...a: any[]) => deleteReceivingNumber(...a)
}));

const getSettings = jest.fn();
const updateSettings = jest.fn();
jest.mock('../../src/lib/syndics/declared-payment/settings', () => ({
  getDeclaredPaymentSettings: (...a: any[]) => getSettings(...a),
  updateDeclaredPaymentSettings: (...a: any[]) => updateSettings(...a)
}));

const listDeclarations = jest.fn();
const getDeclarationDetail = jest.fn();
jest.mock('../../src/lib/syndics/declared-payment/declaration-queries', () => ({
  listDeclarations: (...a: any[]) => listDeclarations(...a),
  getDeclarationDetail: (...a: any[]) => getDeclarationDetail(...a)
}));

const getProof = jest.fn();
jest.mock('../../src/lib/syndics/declared-payment/proof-files', () => ({
  PROOF_MAX_BYTES: 5 * 1024 * 1024,
  getDeclarationProofForTenant: (...a: any[]) => getProof(...a)
}));

const createDeclaration = jest.fn();
jest.mock('../../src/lib/syndics/declared-payment/declaration-create', () => ({
  createDeclaration: (...a: any[]) => createDeclaration(...a)
}));

const events: string[] = [];
const approveDeclaration = jest.fn();
const rejectDeclaration = jest.fn();
jest.mock('../../src/lib/syndics/declared-payment/declaration-review', () => ({
  approveDeclaration: (...a: any[]) => approveDeclaration(...a),
  rejectDeclaration: (...a: any[]) => rejectDeclaration(...a)
}));
jest.mock('../../src/lib/syndics/declared-payment/notifications', () => ({
  notifyDeclarationApproved: (...a: any[]) => events.push(`notify-approved:${a[1]}:${a[2].length}`),
  notifyDeclarationRejected: (...a: any[]) => events.push(`notify-rejected:${a[1]}`)
}));
jest.mock('../../src/lib/syndics/charge-receipt-delivery', () => ({
  scheduleChargeDocumentDelivery: (...a: any[]) => events.push(`deliver:${a[1].length}`)
}));

import { errorHandler, AppError, ErrorCode, NotFoundError } from '../../src/middleware/error-middleware';
import router from '../../src/routes/syndic-declared-payment-routes';

const app = express();
app.use(express.json());
app.use('/api', router);
app.use(errorHandler);

const T = 'tenant-A';
const S = '11111111-1111-4111-8111-111111111111';
const D = '22222222-2222-4222-8222-222222222222';
const N = '33333333-3333-4333-8333-333333333333';
const LOT = '44444444-4444-4444-8444-444444444444';
const LINE = '55555555-5555-4555-8555-555555555555';
const BASE = `/api/tenants/${T}/syndics/${S}`;

const row = { id: D, status: 'PENDING' };

beforeEach(() => {
  jest.clearAllMocks();
  events.length = 0;
  permissions.clear();
  permissions.add('SYNDIC_VIEW');
  permissions.add('SYNDIC_EDIT');
});

describe('permissions SYNDIC_VIEW / SYNDIC_EDIT (D8)', () => {
  type Case = {
    method: 'get' | 'post' | 'patch' | 'put' | 'delete';
    path: string;
    needs: 'SYNDIC_VIEW' | 'SYNDIC_EDIT';
  };
  const cases: Case[] = [
    { method: 'get', path: `${BASE}/numeros-reception`, needs: 'SYNDIC_VIEW' },
    { method: 'post', path: `${BASE}/numeros-reception`, needs: 'SYNDIC_EDIT' },
    { method: 'patch', path: `${BASE}/numeros-reception/${N}`, needs: 'SYNDIC_EDIT' },
    { method: 'delete', path: `${BASE}/numeros-reception/${N}`, needs: 'SYNDIC_EDIT' },
    { method: 'get', path: `${BASE}/paiements-declares/reglages`, needs: 'SYNDIC_VIEW' },
    { method: 'put', path: `${BASE}/paiements-declares/reglages`, needs: 'SYNDIC_EDIT' },
    { method: 'get', path: `${BASE}/paiements-declares`, needs: 'SYNDIC_VIEW' },
    { method: 'get', path: `${BASE}/paiements-declares/${D}`, needs: 'SYNDIC_VIEW' },
    { method: 'get', path: `${BASE}/paiements-declares/${D}/preuve`, needs: 'SYNDIC_VIEW' },
    { method: 'post', path: `${BASE}/paiements-declares/${D}/validation`, needs: 'SYNDIC_EDIT' },
    { method: 'post', path: `${BASE}/paiements-declares/${D}/rejet`, needs: 'SYNDIC_EDIT' },
    { method: 'post', path: `${BASE}/paiements-declares`, needs: 'SYNDIC_EDIT' }
  ];

  it.each(cases)('$method $path exige $needs', async ({ method, path, needs }) => {
    permissions.clear();
    const denied = await (request(app) as any)[method](path).send({});
    expect(denied.status).toBe(403);

    // Le droit de lecture seul ne suffit jamais à une écriture ; le droit d'écriture seul ne lit pas.
    permissions.add(needs === 'SYNDIC_VIEW' ? 'SYNDIC_EDIT' : 'SYNDIC_VIEW');
    const wrong = await (request(app) as any)[method](path).send({});
    expect(wrong.status).toBe(403);
    expect(listReceivingNumbers).not.toHaveBeenCalled();
    expect(createDeclaration).not.toHaveBeenCalled();
    expect(approveDeclaration).not.toHaveBeenCalled();
  });
});

describe('1.1 à 1.4 numéros de réception', () => {
  it('liste, avec l’agence du contexte et la copropriété de l’URL', async () => {
    listReceivingNumbers.mockResolvedValue([{ id: N }]);
    const res = await request(app).get(`${BASE}/numeros-reception`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ id: N }] });
    expect(listReceivingNumbers).toHaveBeenCalledWith(T, S);
  });

  it('crée (201) pour l’utilisateur connecté, sans lire d’identifiant d’agence du corps', async () => {
    createReceivingNumber.mockResolvedValue({ id: N });
    const body = { operator: 'ORANGE', phoneNumber: '0707070707', holderName: 'Syndic Test', tenantId: 'tenant-B' };
    const res = await request(app).post(`${BASE}/numeros-reception`).send(body);
    expect(res.status).toBe(201);
    expect(createReceivingNumber).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: T, syndicateId: S, actorUserId: 'user-1' })
    );
  });

  it('répond 404 pour une copropriété ou un numéro dont l’identifiant n’est pas un UUID', async () => {
    const badSyndic = await request(app).get(`/api/tenants/${T}/syndics/nope/numeros-reception`);
    expect(badSyndic.status).toBe(404);
    const badNumber = await request(app).delete(`${BASE}/numeros-reception/nope`);
    expect(badNumber.status).toBe(404);
    expect(listReceivingNumbers).not.toHaveBeenCalled();
    expect(deleteReceivingNumber).not.toHaveBeenCalled();
  });

  it('modifie par PATCH et supprime en 204', async () => {
    updateReceivingNumber.mockResolvedValue({ id: N });
    const patched = await request(app).patch(`${BASE}/numeros-reception/${N}`).send({ isActive: false });
    expect(patched.status).toBe(200);
    expect(updateReceivingNumber).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: T, syndicateId: S, numberId: N, body: { isActive: false } })
    );
    deleteReceivingNumber.mockResolvedValue(undefined);
    const removed = await request(app).delete(`${BASE}/numeros-reception/${N}`);
    expect(removed.status).toBe(204);
  });

  it('transmet le 409 RECEIVING_NUMBER_IN_USE du moteur', async () => {
    deleteReceivingNumber.mockRejectedValue(new AppError('utilisé', 409, ErrorCode.RECEIVING_NUMBER_IN_USE));
    const res = await request(app).delete(`${BASE}/numeros-reception/${N}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RECEIVING_NUMBER_IN_USE');
  });
});

describe('1.5 réglages', () => {
  it('lit et met à jour', async () => {
    getSettings.mockResolvedValue({ enabled: false });
    expect((await request(app).get(`${BASE}/paiements-declares/reglages`)).body.data).toEqual({ enabled: false });
    updateSettings.mockResolvedValue({ enabled: true });
    const res = await request(app).put(`${BASE}/paiements-declares/reglages`).send({ enabled: true });
    expect(res.status).toBe(200);
    expect(updateSettings).toHaveBeenCalledWith({
      tenantId: T,
      syndicateId: S,
      actorUserId: 'user-1',
      body: { enabled: true }
    });
  });

  it('« reglages » n’est pas pris pour un :declarationId', async () => {
    getSettings.mockResolvedValue({});
    await request(app).get(`${BASE}/paiements-declares/reglages`);
    expect(getDeclarationDetail).not.toHaveBeenCalled();
  });
});

describe('1.6 à 1.8 file, détail, capture', () => {
  it('liste avec filtres validés', async () => {
    listDeclarations.mockResolvedValue({ items: [], pagination: {}, counts: {} });
    const res = await request(app).get(
      `${BASE}/paiements-declares?status=ALL&overdue=true&page=2&limit=50&from=2026-10-01&lotId=${LOT}`
    );
    expect(res.status).toBe(200);
    expect(listDeclarations).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: T,
        syndicateId: S,
        status: 'ALL',
        overdue: true,
        page: 2,
        limit: 50,
        from: '2026-10-01',
        lotId: LOT
      })
    );
  });

  it('refuse un statut, une page ou une limite invalides (400)', async () => {
    expect((await request(app).get(`${BASE}/paiements-declares?status=FOO`)).status).toBe(400);
    expect((await request(app).get(`${BASE}/paiements-declares?limit=500`)).status).toBe(400);
    expect((await request(app).get(`${BASE}/paiements-declares?from=hier`)).status).toBe(400);
    expect(listDeclarations).not.toHaveBeenCalled();
  });

  it('renvoie le détail et un 404 pour un identifiant inconnu ou d’une autre agence', async () => {
    getDeclarationDetail.mockResolvedValueOnce(row);
    const ok = await request(app).get(`${BASE}/paiements-declares/${D}`);
    expect(ok.body.data).toEqual(row);
    expect(getDeclarationDetail).toHaveBeenCalledWith(T, S, D);
    getDeclarationDetail.mockRejectedValueOnce(new NotFoundError('Déclaration introuvable.'));
    expect((await request(app).get(`${BASE}/paiements-declares/${D}`)).status).toBe(404);
    expect((await request(app).get(`${BASE}/paiements-declares/nope`)).status).toBe(404);
  });

  it('sert la capture en flux privé (inline, no-store, nosniff)', async () => {
    getProof.mockResolvedValue({ buffer: Buffer.from('png'), fileName: 'preuve.png', mimeType: 'image/png' });
    const res = await request(app).get(`${BASE}/paiements-declares/${D}/preuve`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['content-disposition']).toMatch(/^inline;/);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(getProof).toHaveBeenCalledWith({ tenantId: T, syndicateId: S, declarationId: D });
  });

  it('répond 404 sans capture ou hors agence', async () => {
    getProof.mockRejectedValue(new NotFoundError('Capture introuvable.'));
    expect((await request(app).get(`${BASE}/paiements-declares/${D}/preuve`)).status).toBe(404);
  });
});

describe('1.9 validation', () => {
  it('valide, envoie les documents puis notifie, après le commit, et rend la déclaration APPROVED', async () => {
    approveDeclaration.mockImplementation(async () => {
      events.push('approve');
      return {
        declarationId: D,
        documents: [{ id: 'doc-1' }],
        documentRefs: [{ id: 'doc-1', kind: 'RECEIPT', number: 'R-1' }]
      };
    });
    getDeclarationDetail.mockResolvedValue({ ...row, status: 'APPROVED' });
    const res = await request(app).post(`${BASE}/paiements-declares/${D}/validation`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.declaration.status).toBe('APPROVED');
    expect(res.body.data.documents).toEqual([{ id: 'doc-1', kind: 'RECEIPT', number: 'R-1' }]);
    expect(events).toEqual(['approve', 'deliver:1', `notify-approved:${D}:1`]);
    expect(approveDeclaration).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: T,
        syndicateId: S,
        declarationId: D,
        actorUserId: 'user-1',
        correction: null
      })
    );
  });

  it('transmet une correction et sa note', async () => {
    approveDeclaration.mockResolvedValue({ declarationId: D, documents: [], documentRefs: [] });
    getDeclarationDetail.mockResolvedValue(row);
    const correction = { paidAt: '2026-10-01T10:00:00+00:00', lines: [{ lineId: LINE, acceptedAmount: 0 }] };
    const res = await request(app)
      .post(`${BASE}/paiements-declares/${D}/validation`)
      .send({ correction, note: 'Montant corrigé après relevé.' });
    expect(res.status).toBe(200);
    expect(approveDeclaration).toHaveBeenCalledWith(
      expect.objectContaining({ correction, note: 'Montant corrigé après relevé.' })
    );
  });

  it('refuse un champ inconnu (400) et ne notifie rien si la validation échoue (409)', async () => {
    const strict = await request(app).post(`${BASE}/paiements-declares/${D}/validation`).send({ amount: 5 });
    expect(strict.status).toBe(400);
    expect(approveDeclaration).not.toHaveBeenCalled();

    approveDeclaration.mockRejectedValue(new AppError('déjà traitée', 409, ErrorCode.DECLARATION_NOT_PENDING));
    const res = await request(app).post(`${BASE}/paiements-declares/${D}/validation`).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DECLARATION_NOT_PENDING');
    expect(events).toEqual([]);
  });
});

describe('1.10 rejet', () => {
  it('rejette puis notifie et rend la déclaration REJECTED', async () => {
    rejectDeclaration.mockResolvedValue({ declarationId: D });
    getDeclarationDetail.mockResolvedValue({ ...row, status: 'REJECTED' });
    const res = await request(app)
      .post(`${BASE}/paiements-declares/${D}/rejet`)
      .send({ reason: 'NOT_FOUND', note: 'Paiement absent du relevé.' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');
    expect(rejectDeclaration).toHaveBeenCalledWith(
      expect.objectContaining({ declarationId: D, reason: 'NOT_FOUND', note: 'Paiement absent du relevé.' })
    );
    expect(events).toEqual([`notify-rejected:${D}`]);
  });

  it('exige un motif de la liste et une note de 10 à 500 caractères (400)', async () => {
    const url = `${BASE}/paiements-declares/${D}/rejet`;
    expect((await request(app).post(url).send({ reason: 'AUTRE', note: 'Une note assez longue.' })).status).toBe(400);
    expect((await request(app).post(url).send({ reason: 'OTHER', note: 'courte' })).status).toBe(400);
    expect((await request(app).post(url).send({ reason: 'OTHER' })).status).toBe(400);
    expect(rejectDeclaration).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });
});

describe('1.11 déclaration saisie par le gestionnaire (P4)', () => {
  const payload = {
    receivingNumberId: N,
    payerPhone: '0707070707',
    amount: 30000,
    paidAt: '2026-10-17T14:32:00+00:00',
    transactionReference: 'MP261017.1432.A12345',
    lines: [{ lotId: LOT, amount: 30000, chargeCallIds: [] }],
    declaredForContactId: '66666666-6666-4666-8666-666666666666'
  };

  it('crée une déclaration PENDING pour un copropriétaire, avec la capture transmise au moteur', async () => {
    createDeclaration.mockResolvedValue({ declarationId: D });
    getDeclarationDetail.mockResolvedValue(row);
    const res = await request(app)
      .post(`${BASE}/paiements-declares`)
      .field('payload', JSON.stringify(payload))
      .attach('proof', Buffer.from('fichier'), { filename: 'capture.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual(row);
    const call = createDeclaration.mock.calls[0][0];
    expect(call).toMatchObject({
      tenantId: T,
      syndicateId: S,
      actor: { type: 'MANAGER', userId: 'user-1', declaredForContactId: payload.declaredForContactId }
    });
    expect(call.input.declaredForContactId).toBeUndefined();
    expect(call.proof.buffer.toString()).toBe('fichier');
  });

  it('accepte une déclaration sans capture', async () => {
    createDeclaration.mockResolvedValue({ declarationId: D });
    getDeclarationDetail.mockResolvedValue(row);
    const res = await request(app).post(`${BASE}/paiements-declares`).field('payload', JSON.stringify(payload));
    expect(res.status).toBe(201);
    expect(createDeclaration.mock.calls[0][0].proof).toBeNull();
  });

  it('refuse un payload absent, illisible, ou portant un champ inconnu (400)', async () => {
    const none = await request(app).post(`${BASE}/paiements-declares`).field('autre', 'x');
    expect(none.status).toBe(400);
    const broken = await request(app).post(`${BASE}/paiements-declares`).field('payload', '{pas du json');
    expect(broken.status).toBe(400);
    const extra = await request(app)
      .post(`${BASE}/paiements-declares`)
      .field('payload', JSON.stringify({ ...payload, tenantId: 'tenant-B' }));
    expect(extra.status).toBe(400);
    expect(extra.body.code).toBe('VALIDATION_ERROR');
    expect(createDeclaration).not.toHaveBeenCalled();
  });

  it('traduit un fichier de plus de 5 Mo en 413 DECLARATION_PROOF_TOO_LARGE', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 10, 1);
    const res = await request(app)
      .post(`${BASE}/paiements-declares`)
      .field('payload', JSON.stringify(payload))
      .attach('proof', big, { filename: 'enorme.png', contentType: 'image/png' });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('DECLARATION_PROOF_TOO_LARGE');
    expect(createDeclaration).not.toHaveBeenCalled();
  });

  it('transmet les erreurs typées du moteur (référence déjà utilisée)', async () => {
    createDeclaration.mockRejectedValue(new AppError('déjà', 409, ErrorCode.DECLARATION_REFERENCE_USED));
    const res = await request(app).post(`${BASE}/paiements-declares`).field('payload', JSON.stringify(payload));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DECLARATION_REFERENCE_USED');
  });
});
