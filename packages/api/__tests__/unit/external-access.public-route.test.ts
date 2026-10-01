/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/public/external-access/{patrimoine,documents/download} — routes
 * publiques des accès tiers de confiance (lot B3).
 *
 * Mini-app Express (routeur réel + limiteur réel + errorHandler réel) ; seuls
 * les modules de domaine `getExternalAccessViewByToken` et
 * `getExternalAccessDocumentByToken` sont simulés (rules/testing.md). Les
 * refus uniformes réels (jeton inconnu, expiré, révoqué, grant révoqué…) sont
 * éprouvés sur base réelle dans `integration/external-access.db.test.ts` et,
 * côté domaine, dans `external-access.view.test.ts`.
 */

import express from 'express';
import request from 'supertest';
import { NotFoundError } from '../../src/middleware/error-middleware';

const getView = jest.fn();
const getDocument = jest.fn();
jest.mock('../../src/lib/external-access', () => ({
  getExternalAccessViewByToken: (...a: any[]) => getView(...a),
  getExternalAccessDocumentByToken: (...a: any[]) => getDocument(...a)
}));

import externalAccessPublicRoutes, {
  PUBLIC_EXTERNAL_ACCESS_PREFIX
} from '../../src/routes/external-access-public-routes';
import { PUBLIC_SECURE_LINKS_PREFIX } from '../../src/routes/secure-link-public-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const VIEW = `${PUBLIC_EXTERNAL_ACCESS_PREFIX}/patrimoine`;
const DOWNLOAD = `${PUBLIC_EXTERNAL_ACCESS_PREFIX}/documents/download`;
const TOKEN = 'A'.repeat(43);
const DTO = { agencyName: 'Agence', grantType: 'BANKER', sections: ['VALUATIONS'], properties: [] };
const UNIFORM = 'Lien invalide ou expiré.';

let requestCounter = 0;

function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  // Une IP distincte par requête sauf si le test en impose une : le limiteur (30/min/IP) ne doit pas fausser les autres cas.
  app.use((req, _res, next) => {
    if (!req.headers['x-forwarded-for']) {
      requestCounter += 1;
      req.headers['x-forwarded-for'] = `10.1.${Math.floor(requestCounter / 250)}.${requestCounter % 250}`;
    }
    next();
  });
  // Comme `app.ts` : les parseurs globaux (10 Mo) ne retraitent pas les préfixes publics à jeton.
  const globalJson = express.json({ limit: '10mb' });
  const prefixes = [PUBLIC_SECURE_LINKS_PREFIX, PUBLIC_EXTERNAL_ACCESS_PREFIX];
  app.use((req, res, next) =>
    prefixes.some(prefix => req.path.startsWith(`${prefix}/`)) ? next() : globalJson(req, res, next)
  );
  app.use('/api', externalAccessPublicRoutes);
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
  getView.mockReset();
  getDocument.mockReset();
});

describe('vue publique', () => {
  it('200 avec le DTO, les en-têtes no-store/noindex/no-referrer et le contexte de consultation', async () => {
    getView.mockResolvedValueOnce(DTO);
    const res = await request(buildApp()).post(VIEW).set('User-Agent', 'UA/9').send({ token: TOKEN });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: DTO });
    expectNoStoreHeaders(res);
    expect(getView).toHaveBeenCalledWith(TOKEN, { ip: expect.any(String), userAgent: 'UA/9' });
  });

  it('seul `token` est lu : tout autre champ du corps (identifiants de bien, d’agence…) est ignoré', async () => {
    getView.mockResolvedValueOnce(DTO);
    await request(buildApp())
      .post(VIEW)
      .send({ token: TOKEN, propertyId: 'p-autre', tenantId: 'tenant-b', grantId: 'g', propertyIds: ['x'] });
    expect(getView).toHaveBeenCalledTimes(1);
    expect(getView.mock.calls[0]).toHaveLength(2);
    expect(JSON.stringify(getView.mock.calls)).not.toMatch(/p-autre|tenant-b/);
  });

  it('404 uniforme, mêmes en-têtes, quand le domaine refuse', async () => {
    getView.mockRejectedValueOnce(new NotFoundError(UNIFORM));
    const res = await request(buildApp()).post(VIEW).send({ token: TOKEN });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, message: UNIFORM });
    expectNoStoreHeaders(res);
  });

  it('un corps invalide donne le même 404 que le jeton inconnu, sans appeler le domaine', async () => {
    getView.mockRejectedValueOnce(new NotFoundError(UNIFORM));
    const unknown = await request(buildApp()).post(VIEW).send({ token: TOKEN });
    for (const body of [{}, { token: 12 }, { token: '' }, { token: 'x'.repeat(5000) }, { autre: 'a' }, []]) {
      const res = await request(buildApp())
        .post(VIEW)
        .send(body as object);
      expect(res.status).toBe(unknown.status);
      expect(res.body).toEqual(unknown.body);
      expectNoStoreHeaders(res);
    }
    expect(getView).toHaveBeenCalledTimes(1);
  });

  it('JSON brut invalide, corps de plus de 1 Ko ou encodage refusé : 404 uniforme avec en-têtes, parseur non journalisé', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const app = buildApp();
    const raw = await request(app).post(VIEW).set('Content-Type', 'application/json').send('{token');
    const big = await request(app)
      .post(VIEW)
      .send({ token: TOKEN, padding: 'x'.repeat(2048) });
    const encoded = await request(app)
      .post(VIEW)
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'br')
      .send('abc');
    const logged = JSON.stringify([...errorSpy.mock.calls, ...logSpy.mock.calls]);
    errorSpy.mockRestore();
    logSpy.mockRestore();

    for (const res of [raw, big, encoded]) {
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ success: false, message: UNIFORM });
      expectNoStoreHeaders(res);
    }
    expect(getView).not.toHaveBeenCalled();
    expect(logged).not.toContain('Unexpected token');
    expect(logged).not.toContain('{token');
  });

  it('le jeton n’est jamais accepté dans l’URL (GET non servi, POST sans corps refusé)', async () => {
    const app = buildApp();
    const get = await request(app).get(`${VIEW}?token=${TOKEN}`);
    expect(get.status).toBe(404);
    const none = await request(app).post(`${VIEW}?token=${TOKEN}`).send({});
    expect(none.status).toBe(404);
    const inPath = await request(app).post(`${VIEW}/${TOKEN}`).send({ token: TOKEN });
    expect(inPath.status).toBe(404);
    expect(getView).not.toHaveBeenCalled();
  });

  it('429 uniforme du limiteur par IP après 30 requêtes, avant toute vérification', async () => {
    getView.mockRejectedValue(new NotFoundError(UNIFORM));
    const app = buildApp();
    for (let i = 0; i < 30; i++) {
      const res = await request(app).post(VIEW).set('X-Forwarded-For', '198.51.100.77').send({ token: TOKEN });
      expect(res.status).toBe(404);
    }
    const callsBefore = getView.mock.calls.length;
    const limited = await request(app).post(VIEW).set('X-Forwarded-For', '198.51.100.77').send({ token: TOKEN });
    const limitedOther = await request(app)
      .post(VIEW)
      .set('X-Forwarded-For', '198.51.100.77')
      .send({ token: 'B'.repeat(43) });

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual(limitedOther.body);
    expect(limited.body.success).toBe(false);
    expectNoStoreHeaders(limited);
    expect(getView.mock.calls.length).toBe(callsBefore);

    // Le même budget protège aussi le téléchargement (limiteur partagé par IP).
    const limitedDownload = await request(app)
      .post(DOWNLOAD)
      .set('X-Forwarded-For', '198.51.100.77')
      .send({ token: TOKEN, documentRef: 'r' });
    expect(limitedDownload.status).toBe(429);
    expectNoStoreHeaders(limitedDownload);
    expect(getDocument).not.toHaveBeenCalled();

    // Une autre IP garde son propre budget.
    const other = await request(app).post(VIEW).set('X-Forwarded-For', '198.51.100.78').send({ token: TOKEN });
    expect(other.status).toBe(404);
  });
});

describe('téléchargement', () => {
  const file = { buffer: Buffer.from('%PDF-contenu'), fileName: 'Titre foncier.pdf', mimeType: 'application/pdf' };

  it('sert le fichier en pièce jointe, nosniff, no-store, sans chemin disque', async () => {
    getDocument.mockResolvedValueOnce(file);
    const res = await request(buildApp())
      .post(DOWNLOAD)
      .set('User-Agent', 'UA/2')
      .send({ token: TOKEN, documentRef: 'ref-1' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-length']).toBe(String(file.buffer.length));
    expectNoStoreHeaders(res);
    expect(Buffer.from(res.body).toString()).toBe('%PDF-contenu');
    expect(getDocument).toHaveBeenCalledWith(TOKEN, 'ref-1', { ip: expect.any(String), userAgent: 'UA/2' });
  });

  it("Content-Disposition : l'apostrophe, les parenthèses et l'astérisque sont encodés (RFC 5987)", async () => {
    getDocument.mockResolvedValueOnce({ ...file, fileName: "Acte d'achat (v1)*.pdf" });
    const res = await request(buildApp()).post(DOWNLOAD).send({ token: TOKEN, documentRef: 'ref-1' });
    const header = res.headers['content-disposition'] as string;
    expect(header).toBe("attachment; filename*=UTF-8''Acte%20d%27achat%20%28v1%29%2A.pdf");
    expect(header.slice("attachment; filename*=UTF-8''".length)).not.toMatch(/['()*]/);
  });

  it('seuls `token` et `documentRef` sont lus (aucun identifiant de bien ou de document de l’appelant)', async () => {
    getDocument.mockResolvedValueOnce(file);
    await request(buildApp())
      .post(DOWNLOAD)
      .send({ token: TOKEN, documentRef: 'ref-1', documentId: 'doc-x', propertyId: 'p-x', path: '/etc/passwd' });
    expect(getDocument.mock.calls[0].slice(0, 2)).toEqual([TOKEN, 'ref-1']);
    expect(JSON.stringify(getDocument.mock.calls)).not.toMatch(/doc-x|p-x|passwd/);
  });

  it('refus du domaine : 404 uniforme avec les mêmes en-têtes no-store', async () => {
    getDocument.mockRejectedValueOnce(new NotFoundError(UNIFORM));
    const res = await request(buildApp()).post(DOWNLOAD).send({ token: TOKEN, documentRef: 'ref-1' });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, message: UNIFORM });
    expectNoStoreHeaders(res);
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  it.each([
    ['sans documentRef', { token: TOKEN }],
    ['documentRef vide', { token: TOKEN, documentRef: '' }],
    ['documentRef de plus de 64 caractères', { token: TOKEN, documentRef: 'r'.repeat(65) }],
    ['documentRef non texte', { token: TOKEN, documentRef: { $ne: 1 } }],
    ['sans jeton', { documentRef: 'ref-1' }]
  ])('corps invalide (%s) : même 404 uniforme, domaine non appelé', async (_label, body) => {
    const res = await request(buildApp())
      .post(DOWNLOAD)
      .send(body as object);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, message: UNIFORM });
    expectNoStoreHeaders(res);
    expect(getDocument).not.toHaveBeenCalled();
  });

  it('JSON invalide ou corps trop gros : 404 uniforme avec en-têtes', async () => {
    const app = buildApp();
    const raw = await request(app).post(DOWNLOAD).set('Content-Type', 'application/json').send('{"token"');
    const big = await request(app)
      .post(DOWNLOAD)
      .send({ token: TOKEN, documentRef: 'r', pad: 'x'.repeat(2048) });
    for (const res of [raw, big]) {
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ message: UNIFORM });
      expectNoStoreHeaders(res);
    }
    expect(getDocument).not.toHaveBeenCalled();
  });

  it('GET refusé, jeton en URL ignoré', async () => {
    const app = buildApp();
    expect((await request(app).get(`${DOWNLOAD}?token=${TOKEN}&documentRef=r`)).status).toBe(404);
    expect((await request(app).post(`${DOWNLOAD}?token=${TOKEN}&documentRef=r`).send({})).status).toBe(404);
    expect(getDocument).not.toHaveBeenCalled();
  });
});
