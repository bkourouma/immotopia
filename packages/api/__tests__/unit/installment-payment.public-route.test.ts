/**
 * Routes publiques du lien de paiement d'un loyer (spec 039) :
 *   POST /api/public/secure-links/installment-payment
 *   POST /api/public/secure-links/installment-payment/start
 *   POST /api/public/secure-links/installment-payment/status
 *
 * Mini-app Express (routeur réel + limiteurs réels + errorHandler réel) ; seul
 * le service `installment-payment-link` est simulé (rules/testing.md).
 */

import express from 'express';
import request from 'supertest';
import { invalidSecureLinkError } from '../../src/lib/secure-links';

const getByToken = jest.fn();
const startByToken = jest.fn();
const getStatus = jest.fn();
jest.mock('../../src/lib/payment-gateway/installment-payment-link', () => ({
  getInstallmentPaymentByToken: (...a: any[]) => getByToken(...a),
  startInstallmentPaymentByToken: (...a: any[]) => startByToken(...a),
  getInstallmentPaymentStatusByCode: (...a: any[]) => getStatus(...a)
}));

const logMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: (...a: any[]) => logMock.info(...a),
    warn: (...a: any[]) => logMock.warn(...a),
    error: (...a: any[]) => logMock.error(...a),
    debug: (...a: any[]) => logMock.debug(...a)
  }
}));

import secureLinkPublicRoutes, { PUBLIC_SECURE_LINKS_PREFIX } from '../../src/routes/secure-link-public-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const BASE = '/api/public/secure-links/installment-payment';
const TOKEN = 'A'.repeat(43);
const CODE = 'IMT-a1B2c3D4e5F6g7H8i9J0';
const DTO = { agencyName: 'Agence', amountDue: 150000, currency: 'XOF', paymentInProgress: false };
const START = { checkoutUrl: 'https://pay.example.test/checkout/abc', reused: false };
const STATUS = {
  status: 'PENDING',
  amount: 150000,
  currency: 'XOF',
  agencyName: 'Agence',
  periodYear: 2026,
  periodMonth: 9
};

type Route = { name: string; path: string; mock: jest.Mock; body: object; ok: unknown; expected: unknown };
const ROUTES: Route[] = [
  { name: 'consultation', path: BASE, mock: getByToken, body: { token: TOKEN }, ok: DTO, expected: DTO },
  {
    name: 'start',
    path: `${BASE}/start`,
    mock: startByToken,
    body: { token: TOKEN },
    ok: START,
    expected: { checkoutUrl: START.checkoutUrl }
  },
  {
    name: 'status',
    path: `${BASE}/status`,
    mock: getStatus,
    body: { codePaiement: CODE },
    ok: STATUS,
    expected: STATUS
  }
];

let ipCounter = 0;
const freshIp = () => `203.0.113.${++ipCounter}`;

function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  const globalJson = express.json({ limit: '10mb' });
  app.use((req, res, next) =>
    req.path.startsWith(`${PUBLIC_SECURE_LINKS_PREFIX}/`) ? next() : globalJson(req, res, next)
  );
  app.use('/api', secureLinkPublicRoutes);
  app.use(errorHandler);
  return app;
}

function post(app: express.Express, path: string, body?: unknown, ip = freshIp()) {
  return request(app)
    .post(path)
    .set('X-Forwarded-For', ip)
    .send(body as object);
}

function expectNoStoreHeaders(res: request.Response) {
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers['pragma']).toBe('no-cache');
  expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  expect(res.headers['referrer-policy']).toBe('no-referrer');
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe.each(ROUTES)('route publique de paiement de loyer : $name', ({ path, mock, body, ok, expected }) => {
  it('200 avec les données du service et les en-têtes no-store', async () => {
    mock.mockResolvedValueOnce(ok);
    const res = await post(buildApp(), path, body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: expected });
    expectNoStoreHeaders(res);
  });

  it('refus uniforme identique (statut, corps, en-têtes) pour service refusant et corps invalide', async () => {
    mock.mockRejectedValue(invalidSecureLinkError());
    const app = buildApp();
    const refused = await post(app, path, body);
    expect(refused.status).toBe(404);
    expect(refused.body).toMatchObject({ success: false, message: 'Lien invalide ou expiré.' });
    expectNoStoreHeaders(refused);
    const callsBefore = mock.mock.calls.length;

    const bad: unknown[] = [
      {},
      [],
      { token: 12 },
      { token: '' },
      { token: 'x'.repeat(5000) },
      { codePaiement: 'IMT-court' },
      { autre: 1 }
    ];
    for (const b of bad) {
      const res = await post(app, path, b);
      expect(res.status).toBe(refused.status);
      expect(res.body).toEqual(refused.body);
      expectNoStoreHeaders(res);
    }
    // aucun corps invalide n'a atteint le service
    expect(mock.mock.calls.length).toBe(callsBefore);
  });

  it('JSON malformé, corps > 1 Ko, encodage refusé : même 404 avec en-têtes, service non appelé', async () => {
    const app = buildApp();
    const malformed = await request(app)
      .post(path)
      .set('X-Forwarded-For', freshIp())
      .set('Content-Type', 'application/json')
      .send('{token');
    const big = await post(app, path, { ...body, padding: 'x'.repeat(2048) });
    const enc = await request(app)
      .post(path)
      .set('X-Forwarded-For', freshIp())
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'br')
      .send('abc');
    for (const res of [malformed, big, enc]) {
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ success: false, message: 'Lien invalide ou expiré.' });
      expectNoStoreHeaders(res);
    }
    expect(mock).not.toHaveBeenCalled();
  });

  it("n'accepte ni jeton ni code dans le chemin ou la query (GET non servi, aucune route)", async () => {
    const app = buildApp();
    const value = 'token' in body ? TOKEN : CODE;
    expect((await request(app).get(`${path}?token=${value}`)).status).toBe(404);
    expect((await post(app, `${path}?token=${value}`, {})).status).toBe(404);
    expect((await post(app, `${path}/${value}`, body)).status).toBe(404);
    expect(mock).not.toHaveBeenCalled();
  });

  it('429 : en-têtes no-store, service non appelé (limiteur avant vérification)', async () => {
    mock.mockResolvedValue(ok);
    const app = buildApp();
    const ip = freshIp();
    let limited: request.Response | undefined;
    for (let i = 0; i < 100 && !limited; i++) {
      const res = await post(app, path, body, ip);
      if (res.status === 429) limited = res;
    }
    expect(limited).toBeDefined();
    expect(limited!.body.success).toBe(false);
    expectNoStoreHeaders(limited!);
    const callsBefore = mock.mock.calls.length;
    const again = await post(app, path, { token: 'B'.repeat(43), codePaiement: CODE }, ip);
    expect(again.status).toBe(429);
    expect(again.body).toEqual(limited!.body);
    expect(mock.mock.calls.length).toBe(callsBefore);
  });
});

describe('valeurs lues et transmises', () => {
  it('consultation/start : seul le jeton atteint le service (montant, échéance, agence, URL de retour ignorés)', async () => {
    getByToken.mockResolvedValue(DTO);
    startByToken.mockResolvedValue(START);
    const extra = { token: TOKEN, amount: 1, installmentId: 'i1', tenantId: 't1', returnUrl: 'https://evil.test' };
    const app = buildApp();
    await request(app).post(BASE).set('User-Agent', 'UA/9').set('X-Forwarded-For', freshIp()).send(extra);
    await post(app, `${BASE}/start`, extra);
    expect(getByToken).toHaveBeenCalledWith(TOKEN, { ip: expect.any(String), userAgent: 'UA/9' });
    expect(startByToken).toHaveBeenCalledWith(TOKEN, expect.any(Object));
    expect(getByToken.mock.calls[0]).toHaveLength(2);
    expect(startByToken.mock.calls[0]).toHaveLength(2);
    const seen = JSON.stringify([...getByToken.mock.calls, ...startByToken.mock.calls]);
    expect(seen).not.toMatch(/evil|installmentId|tenantId|"amount"/);
  });

  it('status : seul codePaiement atteint le service', async () => {
    getStatus.mockResolvedValue(STATUS);
    await post(buildApp(), `${BASE}/status`, { codePaiement: CODE, amount: 1, tenantId: 't1', token: TOKEN });
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(getStatus.mock.calls[0]).toEqual([CODE]);
  });

  it('status : un code mal formé (jeton, préfixe, longueur, caractères) est refusé sans appel', async () => {
    const app = buildApp();
    const codes = [
      TOKEN,
      'IMT-' + 'a'.repeat(19),
      'IMT-' + 'a'.repeat(21),
      'imt-' + 'a'.repeat(20),
      'IMT-' + '-'.repeat(20)
    ];
    for (const c of codes) {
      expect((await post(app, `${BASE}/status`, { codePaiement: c })).status).toBe(404);
    }
    expect(getStatus).not.toHaveBeenCalled();
  });

  it('start : checkoutUrl renvoyée telle que fournie par le service', async () => {
    const url = 'https://pay.example.test/c/xyz?a=1&b=2';
    startByToken.mockResolvedValueOnce({ checkoutUrl: url, reused: true });
    const res = await post(buildApp(), `${BASE}/start`, { token: TOKEN });
    expect(res.body.data).toEqual({ checkoutUrl: url });
  });

  it('start : plus strict que la consultation (429 à la 11e requête, la consultation garde son budget)', async () => {
    startByToken.mockResolvedValue(START);
    getByToken.mockResolvedValue(DTO);
    const app = buildApp();
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await post(app, `${BASE}/start`, { token: TOKEN }, ip)).status);
    expect(statuses.slice(0, 10).every(s => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    const limited = await post(app, `${BASE}/start`, { token: TOKEN }, ip);
    expect(limited.headers['ratelimit-limit']).toBe('10');
    expect((await post(app, BASE, { token: TOKEN }, ip)).status).toBe(200);
  });
});

describe('limiteur dédié du statut', () => {
  it('90 requêtes passent, la 91e est en 429 avec les 4 en-têtes, service non appelé', async () => {
    getStatus.mockResolvedValue(STATUS);
    const app = buildApp();
    const ip = freshIp();
    for (let i = 0; i < 90; i++) {
      expect((await post(app, `${BASE}/status`, { codePaiement: CODE }, ip)).status).toBe(200);
    }
    const calls = getStatus.mock.calls.length;
    const limited = await post(app, `${BASE}/status`, { codePaiement: CODE }, ip);
    expect(limited.status).toBe(429);
    expect(limited.body.success).toBe(false);
    expect(limited.headers['ratelimit-limit']).toBe('90');
    expectNoStoreHeaders(limited);
    expect(getStatus.mock.calls.length).toBe(calls);
  }, 60000);

  it('bucket indépendant : saturer le statut ne touche ni la consultation ni le start, et inversement', async () => {
    getStatus.mockResolvedValue(STATUS);
    getByToken.mockResolvedValue(DTO);
    startByToken.mockResolvedValue(START);
    const app = buildApp();
    const ip = freshIp();
    for (let i = 0; i < 91; i++) await post(app, `${BASE}/status`, { codePaiement: CODE }, ip);
    expect((await post(app, `${BASE}/status`, { codePaiement: CODE }, ip)).status).toBe(429);
    expect((await post(app, BASE, { token: TOKEN }, ip)).status).toBe(200);
    expect((await post(app, `${BASE}/start`, { token: TOKEN }, ip)).status).toBe(200);

    // consultation saturée (30/min) : le statut de la même IP répond toujours
    const ip2 = freshIp();
    for (let i = 0; i < 31; i++) await post(app, BASE, { token: TOKEN }, ip2);
    expect((await post(app, BASE, { token: TOKEN }, ip2)).status).toBe(429);
    expect((await post(app, `${BASE}/status`, { codePaiement: CODE }, ip2)).status).toBe(200);
  }, 60000);
});

describe('journalisation', () => {
  it('aucun appel logger ne contient le jeton ou le code', async () => {
    startByToken.mockRejectedValueOnce(invalidSecureLinkError());
    getStatus.mockRejectedValueOnce(new Error('boom'));
    const app = buildApp();
    await post(app, `${BASE}/start`, { token: TOKEN });
    await post(app, `${BASE}/status`, { codePaiement: CODE });
    await request(app)
      .post(BASE)
      .set('X-Forwarded-For', freshIp())
      .set('Content-Type', 'application/json')
      .send(`{"token":"${TOKEN}`);
    const logged = JSON.stringify(Object.values(logMock).flatMap(m => m.mock.calls));
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(CODE);
  });
});
