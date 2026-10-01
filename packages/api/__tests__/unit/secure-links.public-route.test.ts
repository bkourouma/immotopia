/**
 * POST /api/public/secure-links/owner-monthly-report — route publique.
 *
 * Mini-app Express (routeur réel + limiteur réel + errorHandler réel) ; seul
 * le module de domaine `getOwnerMonthlyReportByToken` est simulé, comme dans
 * `__tests__/api/*` (rules/testing.md).
 */

import express from 'express';
import request from 'supertest';
import { NotFoundError } from '../../src/middleware/error-middleware';

const getReport = jest.fn();
jest.mock('../../src/lib/patrimoine/owner-monthly-report', () => ({
  getOwnerMonthlyReportByToken: (...a: any[]) => getReport(...a)
}));

import secureLinkPublicRoutes, { PUBLIC_SECURE_LINKS_PREFIX } from '../../src/routes/secure-link-public-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const PATH = '/api/public/secure-links/owner-monthly-report';
const TOKEN = 'A'.repeat(43);
const DTO = {
  agencyName: 'Agence',
  ownerName: 'Awa',
  period: '2026-09',
  currency: 'XOF',
  expiresAt: 'x',
  totals: {},
  properties: []
};

function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  // Comme `app.ts` : le parseur global (ici 10 Mo) ne retraite pas le préfixe public.
  const globalJson = express.json({ limit: '10mb' });
  app.use((req, res, next) =>
    req.path.startsWith(`${PUBLIC_SECURE_LINKS_PREFIX}/`) ? next() : globalJson(req, res, next)
  );
  app.use('/api', secureLinkPublicRoutes);
  app.use(errorHandler);
  return app;
}

function expectNoStoreHeaders(res: request.Response) {
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers['pragma']).toBe('no-cache');
  expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  expect(res.headers['referrer-policy']).toBe('no-referrer');
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('route publique du rapport mensuel', () => {
  it('200 avec le DTO et les en-têtes no-store/noindex', async () => {
    getReport.mockResolvedValueOnce(DTO);
    const res = await request(buildApp()).post(PATH).set('User-Agent', 'UA/9').send({ token: TOKEN });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: DTO });
    expectNoStoreHeaders(res);
    expect(getReport).toHaveBeenCalledWith(TOKEN, { ip: expect.any(String), userAgent: 'UA/9' });
  });

  it('404 uniforme avec les mêmes en-têtes quand le jeton est refusé', async () => {
    getReport.mockRejectedValueOnce(new NotFoundError('Lien invalide ou expiré.'));
    const res = await request(buildApp()).post(PATH).send({ token: TOKEN });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, message: 'Lien invalide ou expiré.' });
    expectNoStoreHeaders(res);
  });

  it('un corps invalide donne le même 404 que le jeton inconnu, sans appeler le domaine', async () => {
    getReport.mockRejectedValueOnce(new NotFoundError('Lien invalide ou expiré.'));
    const unknown = await request(buildApp()).post(PATH).send({ token: TOKEN });

    const invalidBodies: unknown[] = [
      {},
      { token: 12 },
      { token: '' },
      { token: 'x'.repeat(5000) },
      { autre: 'a' },
      []
    ];
    for (const body of invalidBodies) {
      const res = await request(buildApp())
        .post(PATH)
        .send(body as object);
      expect(res.status).toBe(unknown.status);
      expect(res.body).toEqual(unknown.body);
      expectNoStoreHeaders(res);
    }
    // seul l'appel avec un jeton bien formé a atteint le domaine
    expect(getReport).toHaveBeenCalledTimes(1);
  });

  it('corps JSON brut invalide : 404 uniforme avec en-têtes, sans appeler le domaine ni journaliser le parseur', async () => {
    getReport.mockRejectedValueOnce(new NotFoundError('Lien invalide ou expiré.'));
    const unknown = await request(buildApp()).post(PATH).send({ token: TOKEN });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const res = await request(buildApp()).post(PATH).set('Content-Type', 'application/json').send(`{token`);

    const logged = JSON.stringify([...errorSpy.mock.calls, ...logSpy.mock.calls]);
    errorSpy.mockRestore();
    logSpy.mockRestore();
    expect(res.status).toBe(404);
    expect(res.body).toEqual(unknown.body);
    expectNoStoreHeaders(res);
    expect(getReport).toHaveBeenCalledTimes(1);
    expect(logged).not.toContain('Unexpected token');
    expect(logged).not.toContain('{token');
  });

  it('corps de plus de 1 Ko : 404 uniforme avec en-têtes (pas de 413), sans appeler le domaine', async () => {
    getReport.mockRejectedValueOnce(new NotFoundError('Lien invalide ou expiré.'));
    const unknown = await request(buildApp()).post(PATH).send({ token: TOKEN });

    const res = await request(buildApp())
      .post(PATH)
      .send({ token: TOKEN, padding: 'x'.repeat(2048) });

    expect(res.status).toBe(404);
    expect(res.body).toEqual(unknown.body);
    expectNoStoreHeaders(res);
    expect(getReport).toHaveBeenCalledTimes(1);
  });

  it('encodage de corps refusé : 404 uniforme avec en-têtes', async () => {
    const res = await request(buildApp())
      .post(PATH)
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'br')
      .send('abc');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, message: 'Lien invalide ou expiré.' });
    expectNoStoreHeaders(res);
    expect(getReport).not.toHaveBeenCalled();
  });

  it('corps valide de petite taille inchangé : 200 avec le DTO', async () => {
    getReport.mockResolvedValueOnce(DTO);
    const res = await request(buildApp()).post(PATH).send({ token: TOKEN });
    expect(res.status).toBe(200);
    expect(getReport).toHaveBeenCalledWith(TOKEN, expect.any(Object));
  });

  it("n'accepte pas le jeton dans l'URL (GET non servi, requête sans corps refusée)", async () => {
    const app = buildApp();
    const get = await request(app).get(`${PATH}?token=${TOKEN}`);
    expect(get.status).toBe(404);
    const none = await request(app).post(`${PATH}?token=${TOKEN}`).send({});
    expect(none.status).toBe(404);
    expect(getReport).not.toHaveBeenCalled();
  });

  it('429 uniforme du limiteur par IP après 30 requêtes, avant toute vérification', async () => {
    getReport.mockRejectedValue(new NotFoundError('Lien invalide ou expiré.'));
    const app = buildApp();
    let last: request.Response | undefined;
    for (let i = 0; i < 30; i++) {
      last = await request(app).post(PATH).set('X-Forwarded-For', '198.51.100.77').send({ token: TOKEN });
      expect(last.status).toBe(404);
    }
    const callsBefore = getReport.mock.calls.length;

    const limited = await request(app).post(PATH).set('X-Forwarded-For', '198.51.100.77').send({ token: TOKEN });
    const limitedOther = await request(app)
      .post(PATH)
      .set('X-Forwarded-For', '198.51.100.77')
      .send({ token: 'B'.repeat(43) });

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual(limitedOther.body);
    expect(limited.body.success).toBe(false);
    expectNoStoreHeaders(limited);
    expect(limited.headers['ratelimit-limit']).toBe('30');
    expect(getReport.mock.calls.length).toBe(callsBefore);

    // une autre IP garde son propre budget
    const other = await request(app).post(PATH).set('X-Forwarded-For', '198.51.100.78').send({ token: TOKEN });
    expect(other.status).toBe(404);
  });
});
