/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Routes publiques du lien « Payer cet appel » (spec 042, contrat §3) : routeur,
 * limiteurs et errorHandler réels ; seul le service du lien est simulé.
 */
import express from 'express';
import request from 'supertest';
import { invalidSecureLinkError } from '../../src/lib/secure-links';

const getByToken = jest.fn();
const startByToken = jest.fn();
const getStatus = jest.fn();
jest.mock('../../src/lib/syndics/online-payment/charge-call-link', () => ({
  getChargeCallPaymentByToken: (...a: any[]) => getByToken(...a),
  startChargeCallPaymentByToken: (...a: any[]) => startByToken(...a),
  getChargeCallPaymentStatusByCode: (...a: any[]) => getStatus(...a)
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import secureLinkPublicRoutes from '../../src/routes/secure-link-public-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const BASE = '/api/public/secure-links/charge-call-payment';
const TOKEN = 'A'.repeat(43);
const CODE = 'IMS-a1B2c3D4e5F6g7H8i9J0';

function app() {
  const a = express();
  a.use('/api', secureLinkPublicRoutes);
  a.use(errorHandler);
  return a;
}
const noStore = (res: request.Response) => {
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  expect(res.headers['referrer-policy']).toBe('no-referrer');
};

beforeEach(() => jest.resetAllMocks());

describe('routes publiques charge-call-payment', () => {
  it('consultation : seul le jeton du corps est transmis, en-têtes no-store', async () => {
    getByToken.mockResolvedValue({ amountDue: 30000 });
    const res = await request(app()).post(BASE).send({ token: TOKEN, amount: 1, chargeCallId: 'x', tenantId: 'y' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { amountDue: 30000 } });
    expect(getByToken.mock.calls[0][0]).toBe(TOKEN);
    expect(JSON.stringify(getByToken.mock.calls[0])).not.toContain('chargeCallId');
    noStore(res);
  });

  it('start : renvoie seulement checkoutUrl', async () => {
    startByToken.mockResolvedValue({ checkoutUrl: 'https://pay.example.test/x', reused: true });
    const res = await request(app()).post(`${BASE}/start`).send({ token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { checkoutUrl: 'https://pay.example.test/x' } });
    noStore(res);
  });

  it('status : code IMS- transmis ; code mal formé = 404 sans appel du service', async () => {
    getStatus.mockResolvedValue({ status: 'PENDING' });
    expect((await request(app()).post(`${BASE}/status`).send({ codePaiement: CODE })).status).toBe(200);
    expect(getStatus).toHaveBeenCalledWith(CODE);
    getStatus.mockClear();
    const bad = await request(app()).post(`${BASE}/status`).send({ codePaiement: 'IMT-a1B2c3D4e5F6g7H8i9J0' });
    expect(bad.status).toBe(404);
    expect(getStatus).not.toHaveBeenCalled();
    noStore(bad);
  });

  it.each(['', '/start'])('refus uniforme 404 (service, corps invalide, trop gros, JSON cassé) %#', async suffix => {
    getByToken.mockRejectedValue(invalidSecureLinkError());
    startByToken.mockRejectedValue(invalidSecureLinkError());
    const path = `${BASE}${suffix}`;
    for (const body of [{ token: TOKEN }, {}, { token: 'x'.repeat(5000) }]) {
      const res = await request(app()).post(path).send(body);
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ success: false, message: 'Lien invalide ou expiré.' });
      noStore(res);
    }
    const broken = await request(app()).post(path).set('Content-Type', 'application/json').send('{"token":');
    expect(broken.status).toBe(404);
    expect(broken.body.message).toBe('Lien invalide ou expiré.');
  });

  it('409 du moteur passe tel quel (paiement en cours)', async () => {
    const { AppError } = jest.requireActual('../../src/middleware/error-middleware');
    startByToken.mockRejectedValue(
      new AppError('Un paiement en ligne est déjà en cours pour cet appel.', 409, 'ONLINE_PAYMENT_IN_PROGRESS')
    );
    const res = await request(app()).post(`${BASE}/start`).send({ token: TOKEN });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ONLINE_PAYMENT_IN_PROGRESS');
  });

  it('limiteur de démarrage à 10/min (429 no-store), seau de consultation distinct', async () => {
    startByToken.mockResolvedValue({ checkoutUrl: 'https://p.test/x' });
    const a = app();
    let last: request.Response | undefined;
    for (let i = 0; i < 11; i++) last = await request(a).post(`${BASE}/start`).send({ token: TOKEN });
    expect(last!.status).toBe(429);
    noStore(last!);
    getByToken.mockResolvedValue({});
    expect((await request(a).post(BASE).send({ token: TOKEN })).status).toBe(200);
  });
});
