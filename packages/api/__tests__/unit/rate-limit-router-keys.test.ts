/**
 * AUDIT B4 : les limiteurs propres aux routeurs coowner-portal, newsletter-public
 * et finance-stock-whatsapp regroupent l'IPv6 par /64 via `clientIpKey`
 * (au lieu de `req.ip` brut ou du générateur par défaut d'express-rate-limit).
 */
import express from 'express';
import request from 'supertest';
import { readFileSync } from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../src/routes');
const lire = (f: string) => readFileSync(path.join(SRC, f), 'utf8');

describe('newsletter-public-routes : limiteurs par /64', () => {
  beforeEach(() => jest.resetModules());

  function app() {
    jest.doMock('../../src/controllers/newsletter-controller', () => {
      const ok = (_req: unknown, res: { json: (b: unknown) => void }) => res.json({ ok: true });
      return {
        subscribeHandler: ok,
        confirmHandler: ok,
        unsubscribeHandler: ok,
        trackOpenHandler: ok
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const router = require('../../src/routes/newsletter-public-routes').default;
    const a = express();
    a.set('trust proxy', 1);
    a.use(router);
    return a;
  }

  const sub = (a: express.Express, ip: string) => request(a).get('/confirm').set('X-Forwarded-For', ip);

  it('deux adresses du même /64 partagent le compteur (429 à la 11e requête)', async () => {
    const a = app();
    for (let i = 0; i < 10; i++) expect((await sub(a, `2001:db8:5:6:${i}::1`)).status).toBe(200);
    expect((await sub(a, '2001:db8:5:6:ffff::9')).status).toBe(429);
    // un autre /64 reste libre
    expect((await sub(a, '2001:db8:5:7::1')).status).toBe(200);
  });
});

describe('coowner-portal-routes et finance-stock-whatsapp-routes', () => {
  it('le repli du limiteur de paiement en ligne utilise clientIpKey, pas req.ip brut', () => {
    const src = lire('coowner-portal-routes.ts');
    expect(src).toMatch(/clientIpKey/);
    expect(src).toMatch(/req\.user\?\.userId \?\? clientIpKey\(req\)/);
    expect(src).not.toMatch(/\?\? req\.ip/);
  });

  it('les limiteurs de finance-stock-whatsapp sont clés par agence et utilisateur, jamais par IP', () => {
    const src = lire('finance-stock-whatsapp-routes.ts');
    expect(src).not.toMatch(/req\.ip/);
  });
});
