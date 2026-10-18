import express from 'express';
import request from 'supertest';

/**
 * Routes de la signature électronique (spec 044, lot S1) : contrat HTTP agence
 * et public. Les gardes (authenticate, requireTenantAccess, RBAC, abonnement)
 * sont des passe-plats qui posent le contexte ; les services sont simulés.
 * On vérifie que les contrôleurs tirent l'agence du CONTEXTE (jamais du corps),
 * valident strictement les entrées, et que la couche publique répond
 * uniformément en 404 pour un jeton sans effet.
 */

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));
jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: String(req.query.tenantId ?? 'tenant-1'), isCollaborator: true };
    next();
  }
}));
// Permission et abonnement selon le TYPE de document : testés dans signature-access.test.ts.
const permittedSignatureKinds = jest.fn(async () => ['LEASE_CONTRACT']);
jest.mock('../../src/middleware/signature-access-middleware', () => ({
  requireSignatureKindAccess: () => (_req: any, _res: any, next: any) => next(),
  permittedSignatureKinds: (...a: unknown[]) => (permittedSignatureKinds as any)(...a)
}));
jest.mock('../../src/middleware/signature-tenant-middleware', () => ({
  resolveSignatureTenant: (_req: any, _res: any, next: any) => next()
}));

const createSignatureRequest = jest.fn();
const listSignatureRequests = jest.fn();
const getSignatureSummary = jest.fn();
const getSignatureRequest = jest.fn();
const cancelSignatureRequest = jest.fn();
const remindSignatureRequest = jest.fn();
const reissueInPersonToken = jest.fn();
const sendSignatureFile = jest.fn();
const getSignatureTargetContext = jest.fn();
jest.mock('../../src/services/signature-service', () => ({
  createSignatureRequest: (...a: unknown[]) => createSignatureRequest(...a),
  listSignatureRequests: (...a: unknown[]) => listSignatureRequests(...a),
  getSignatureSummary: (...a: unknown[]) => getSignatureSummary(...a),
  getSignatureRequest: (...a: unknown[]) => getSignatureRequest(...a),
  cancelSignatureRequest: (...a: unknown[]) => cancelSignatureRequest(...a),
  remindSignatureRequest: (...a: unknown[]) => remindSignatureRequest(...a),
  reissueInPersonToken: (...a: unknown[]) => reissueInPersonToken(...a),
  sendSignatureFile: (...a: unknown[]) => sendSignatureFile(...a),
  getSignatureTargetContext: (...a: unknown[]) => getSignatureTargetContext(...a)
}));

const getPublicSignature = jest.fn();
const getPublicSourceFile = jest.fn();
const sendPublicOtp = jest.fn();
const signPublic = jest.fn();
const declinePublic = jest.fn();
jest.mock('../../src/services/signature-public-service', () => ({
  getPublicSignature: (...a: unknown[]) => getPublicSignature(...a),
  getPublicSourceFile: (...a: unknown[]) => getPublicSourceFile(...a),
  sendPublicOtp: (...a: unknown[]) => sendPublicOtp(...a),
  signPublic: (...a: unknown[]) => signPublic(...a),
  declinePublic: (...a: unknown[]) => declinePublic(...a)
}));

import signatureRoutes from '../../src/routes/signature-routes';
import signaturePublicRoutes from '../../src/routes/signature-public-routes';
import { AppError, errorHandler, NotFoundError } from '../../src/middleware/error-middleware';
import { generateToken } from '../../src/lib/signature/token';

const app = express();
// Comme app.ts : le préfixe public a son propre parseur borné.
const globalJson = express.json();
app.use((req, res, next) => (req.path.startsWith('/api/public/') ? next() : globalJson(req, res, next)));
app.use('/api', signaturePublicRoutes);
app.use('/api/signatures', signatureRoutes);
app.use(errorHandler);

const R1 = '11111111-1111-4111-8111-111111111111';
const S1 = '22222222-2222-4222-8222-222222222222';

const validBody = {
  kind: 'LEASE_CONTRACT',
  targetId: 'lease-1',
  signers: [{ role: 'LOCATAIRE', fullName: 'Awa Koné', channel: 'EMAIL', contact: 'awa@exemple.ci' }]
};

beforeEach(() => jest.clearAllMocks());

describe('agence : /api/signatures', () => {
  it('POST crée la demande (201) avec l’agence et l’utilisateur du contexte, jamais du corps', async () => {
    createSignatureRequest.mockResolvedValue({ id: 'r1', status: 'SENT', signers: [] });
    const response = await request(app)
      .post('/api/signatures?tenantId=tenant-9')
      .send({ ...validBody, tenantId: 'tenant-evil' });
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ success: true, data: { id: 'r1', status: 'SENT', signers: [] } });
    expect(createSignatureRequest).toHaveBeenCalledWith(
      { tenantId: 'tenant-9', userId: 'user-1' },
      expect.objectContaining({ kind: 'LEASE_CONTRACT', targetId: 'lease-1' })
    );
  });

  it('POST refuse un type inconnu, des signataires absents ou un champ non prévu (400)', async () => {
    for (const body of [
      { ...validBody, kind: 'PIGEON' },
      { ...validBody, signers: [] },
      { ...validBody, unexpected: true },
      { ...validBody, signers: [{ ...validBody.signers[0], channel: 'PIGEON' }] },
      { ...validBody, expiresInDays: 90 }
    ]) {
      const response = await request(app).post('/api/signatures').send(body);
      expect(response.status).toBe(400);
    }
    expect(createSignatureRequest).not.toHaveBeenCalled();
  });

  it('GET liste filtre par statut et cible, sans laisser passer tenantId au service', async () => {
    listSignatureRequests.mockResolvedValue({ items: [], total: 0 });
    const response = await request(app).get(
      '/api/signatures?status=SENT&targetType=RentalLease&targetId=l1&tenantId=tenant-2'
    );
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ items: [], total: 0 });
    expect(listSignatureRequests).toHaveBeenCalledWith(
      'tenant-2',
      expect.objectContaining({
        status: 'SENT',
        targetType: 'RentalLease',
        targetId: 'l1',
        page: 1,
        pageSize: 25,
        sortBy: 'createdAt',
        sortDir: 'desc'
      }),
      ['LEASE_CONTRACT']
    );
    expect(listSignatureRequests.mock.calls[0][1]).not.toHaveProperty('tenantId');
    expect((await request(app).get('/api/signatures?status=NOPE')).status).toBe(400);
  });

  it('GET liste : pagination, tri, recherche et dates validés', async () => {
    listSignatureRequests.mockResolvedValue({ items: [], total: 0 });
    const ok = await request(app).get(
      '/api/signatures?page=2&pageSize=50&kind=LEASE_CONTRACT&q=Kone&from=2026-01-01&to=2026-01-31&sortBy=title&sortDir=asc'
    );
    expect(ok.status).toBe(200);
    expect(listSignatureRequests).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        page: 2,
        pageSize: 50,
        kind: 'LEASE_CONTRACT',
        q: 'Kone',
        from: '2026-01-01',
        to: '2026-01-31',
        sortBy: 'title',
        sortDir: 'asc'
      }),
      ['LEASE_CONTRACT']
    );
    for (const qs of [
      'page=0',
      'pageSize=101',
      'kind=PIGEON',
      'q=',
      'from=pas-une-date',
      'sortBy=x',
      'sortDir=up',
      'foo=1'
    ]) {
      expect((await request(app).get(`/api/signatures?${qs}`)).status).toBe(400);
    }
  });

  it('GET summary : compteurs par statut, déclaré avant /:id, filtres limités', async () => {
    const data = {
      total: 3,
      byStatus: { DRAFT: 0, SENT: 2, PARTIALLY_SIGNED: 0, COMPLETED: 1, DECLINED: 0, EXPIRED: 0, CANCELED: 0 }
    };
    getSignatureSummary.mockResolvedValue(data);
    const response = await request(app).get(
      '/api/signatures/summary?kind=LEASE_CONTRACT&from=2026-01-01&tenantId=tenant-5'
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data });
    expect(getSignatureSummary).toHaveBeenCalledWith('tenant-5', { kind: 'LEASE_CONTRACT', from: '2026-01-01' }, [
      'LEASE_CONTRACT'
    ]);
    expect(getSignatureRequest).not.toHaveBeenCalled();
    expect((await request(app).get('/api/signatures/summary?q=abc')).status).toBe(400);
  });

  it('GET détail, annulation, relance et réémission du jeton sur place', async () => {
    getSignatureRequest.mockResolvedValue({ id: 'r1' });
    cancelSignatureRequest.mockResolvedValue({ id: 'r1', status: 'CANCELED' });
    remindSignatureRequest.mockResolvedValue({ reminded: 1, failed: 0 });
    reissueInPersonToken.mockResolvedValue({ inPersonUrlToken: 'jeton-sur-place' });
    expect((await request(app).get(`/api/signatures/${R1}`)).body.data).toEqual({ id: 'r1' });
    expect((await request(app).post(`/api/signatures/${R1}/cancel`)).body.data.status).toBe('CANCELED');
    expect((await request(app).post(`/api/signatures/${R1}/remind`)).body.data).toEqual({ reminded: 1, failed: 0 });
    const reissued = await request(app).post(`/api/signatures/${R1}/signers/${S1}/in-person-token`);
    expect(reissued.status).toBe(200);
    expect(reissued.body.data).toEqual({ inPersonUrlToken: 'jeton-sur-place' });
    expect(reissued.headers['cache-control']).toBe('no-store');
    expect(reissueInPersonToken).toHaveBeenCalledWith({ tenantId: 'tenant-1', userId: 'user-1' }, R1, S1);
  });

  it('GET contexte d’une cible : signataires proposés, type validé', async () => {
    getSignatureTargetContext.mockResolvedValue({
      kind: 'LEASE_CONTRACT',
      targetType: 'RentalLease',
      providerRequired: false,
      signers: []
    });
    const ok = await request(app).get('/api/signatures/targets/LEASE_CONTRACT/lease-1/context');
    expect(ok.status).toBe(200);
    expect(getSignatureTargetContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', userId: 'user-1' },
      'LEASE_CONTRACT',
      'lease-1'
    );
    expect((await request(app).get('/api/signatures/targets/PIGEON/lease-1/context')).status).toBe(400);
  });

  it('refuse un identifiant qui n’est pas un UUID (400) sans appeler le service', async () => {
    expect((await request(app).get('/api/signatures/pas-un-uuid')).status).toBe(400);
    expect((await request(app).post(`/api/signatures/${R1}/signers/x/in-person-token`)).status).toBe(400);
    expect(getSignatureRequest).not.toHaveBeenCalled();
    expect(reissueInPersonToken).not.toHaveBeenCalled();
  });

  it('GET file valide la variante et délègue le flux au service', async () => {
    sendSignatureFile.mockImplementation(async (_t: string, _id: string, _v: string, res: any) => {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(Buffer.from('%PDF'));
    });
    const ok = await request(app).get(`/api/signatures/${R1}/file?variant=signed`);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toContain('application/pdf');
    expect(ok.headers['cache-control']).toContain('no-store');
    expect(sendSignatureFile).toHaveBeenCalledWith('tenant-1', R1, 'signed', expect.anything(), 'user-1');
    expect((await request(app).get(`/api/signatures/${R1}/file?variant=../etc`)).status).toBe(400);
  });

  it("un service qui lève NotFoundError donne 404 (aucune confirmation d'existence inter-agences)", async () => {
    getSignatureRequest.mockRejectedValue(new NotFoundError('Demande de signature introuvable.'));
    expect((await request(app).get('/api/signatures/33333333-3333-4333-8333-333333333333')).status).toBe(404);
  });
});

describe('public : /api/public/signatures/:token', () => {
  const token = generateToken();

  it('toutes les réponses portent les en-têtes anti-cache et anti-indexation', async () => {
    getPublicSignature.mockResolvedValue({ request: {}, signer: {}, consentText: 'x' });
    const response = await request(app).get(`/api/public/signatures/${token}`);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-robots-tag']).toContain('noindex');
    expect(getPublicSignature).toHaveBeenCalledWith(token);
  });

  it('jeton sans effet : 404 uniforme, mêmes en-têtes, même corps', async () => {
    getPublicSignature.mockRejectedValue(new NotFoundError('Lien invalide ou expiré.'));
    sendPublicOtp.mockRejectedValue(new NotFoundError('Lien invalide ou expiré.'));
    const a = await request(app).get(`/api/public/signatures/${generateToken()}`);
    const b = await request(app).post(`/api/public/signatures/${generateToken()}/otp`).send({});
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(a.body.message).toBe(b.body.message);
    expect(a.headers['cache-control']).toBe('no-store');
    expect(b.headers['cache-control']).toBe('no-store');
  });

  it('PDF source en ligne, encadrable par le site seulement', async () => {
    getPublicSourceFile.mockResolvedValue({ buffer: Buffer.from('%PDF-1.7'), title: 'Bail' });
    const response = await request(app).get(`/api/public/signatures/${token}/file`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('inline');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain('frame-ancestors');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('POST /otp transmet le jeton du chemin et rend le contact masqué', async () => {
    sendPublicOtp.mockResolvedValue({ sentTo: 'a•••@e•••.ci', retryAfterSeconds: 30 });
    const response = await request(app).post(`/api/public/signatures/${token}/otp`).send({});
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ sentTo: 'a•••@e•••.ci', retryAfterSeconds: 30 });
  });

  it('POST /sign exige le consentement explicite et rejette les champs inconnus', async () => {
    signPublic.mockResolvedValue({ status: 'SIGNED' });
    const signature = { mode: 'TYPED', value: 'Awa Koné' };
    expect(
      (await request(app).post(`/api/public/signatures/${token}/sign`).send({ code: '123456', signature })).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/public/signatures/${token}/sign`)
          .send({ code: '123456', consent: false, signature })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/public/signatures/${token}/sign`)
          .send({ code: '123456', consent: true, signature, extra: 1 })
      ).status
    ).toBe(400);
    expect(signPublic).not.toHaveBeenCalled();

    const ok = await request(app)
      .post(`/api/public/signatures/${token}/sign`)
      .send({ code: '123456', consent: true, signature });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({ status: 'SIGNED' });
    expect(signPublic).toHaveBeenCalledWith(
      token,
      { code: '123456', consent: true, signature },
      expect.any(Object),
      undefined
    );
  });

  it('POST /sign sans code est transmis (mode sur place), le service tranche', async () => {
    signPublic.mockResolvedValue({ status: 'SIGNED' });
    const response = await request(app)
      .post(`/api/public/signatures/${token}/sign`)
      .send({ consent: true, signature: { mode: 'TYPED', value: 'Awa Koné' } });
    expect(response.status).toBe(200);
  });

  it('POST /decline accepte un motif facultatif', async () => {
    declinePublic.mockResolvedValue({ status: 'DECLINED' });
    expect(
      (await request(app).post(`/api/public/signatures/${token}/decline`).send({ reason: 'Clause 4' })).status
    ).toBe(200);
    expect(declinePublic).toHaveBeenCalledWith(token, 'Clause 4', undefined);
    expect((await request(app).post(`/api/public/signatures/${token}/decline`).send({})).status).toBe(200);
  });

  it('POST /decline transmet le jeton de consultation de l’en-tête (types « code avant consultation »)', async () => {
    declinePublic.mockResolvedValue({ status: 'DECLINED' });
    const viewToken = 'v'.repeat(43);
    await request(app)
      .post(`/api/public/signatures/${token}/decline`)
      .set('X-Signature-View-Token', viewToken)
      .send({});
    expect(declinePublic).toHaveBeenLastCalledWith(token, undefined, viewToken);
  });

  it('les erreurs publiques portent code et details (essais restants, délai de renvoi)', async () => {
    signPublic.mockRejectedValueOnce(
      new AppError('Code invalide ou expiré.', 400, 'SIGNATURE_OTP_INVALID', undefined, { remainingAttempts: 3 })
    );
    const wrong = await request(app)
      .post(`/api/public/signatures/${token}/sign`)
      .send({ code: '123456', consent: true, signature: { mode: 'TYPED', value: 'Awa Koné' } });
    expect(wrong.status).toBe(400);
    expect(wrong.body).toMatchObject({ code: 'SIGNATURE_OTP_INVALID', details: { remainingAttempts: 3 } });
    sendPublicOtp.mockRejectedValueOnce(
      new AppError('Un code vient d’être envoyé.', 429, 'RATE_LIMITED', undefined, { retryAfterSeconds: 30 })
    );
    const limited = await request(app).post(`/api/public/signatures/${token}/otp`).send({});
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ code: 'RATE_LIMITED', details: { retryAfterSeconds: 30 } });
    expect(limited.headers['cache-control']).toBe('no-store');
  });

  it('un corps illisible ou trop gros répond le 404 uniforme', async () => {
    const malformed = await request(app)
      .post(`/api/public/signatures/${token}/decline`)
      .set('Content-Type', 'application/json')
      .send('{"reason":');
    expect(malformed.status).toBe(404);
    expect(malformed.body.message).toBe('Lien invalide ou expiré.');
  });
});
