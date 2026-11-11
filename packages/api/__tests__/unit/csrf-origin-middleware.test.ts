/**
 * Garde CSRF par contrôle d'origine (audit 2026-11-09, AUTH-05 / FRI-04).
 */
import fs from 'fs';
import path from 'path';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

let mockFrontendUrl = 'http://localhost:3002';
jest.mock('../../src/config/env', () => ({
  env: {
    get FRONTEND_URL() {
      return mockFrontendUrl;
    }
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

import {
  CSRF_MAX_PATH_LENGTH,
  csrfOriginGuard,
  isCsrfExemptPath,
  normalizeCsrfPath
} from '../../src/middleware/csrf-origin-middleware';

const app = express();
app.use(cookieParser());
app.use(csrfOriginGuard);
app.use((_req, res) => {
  res.status(200).json({ ok: true });
});

const COOKIE = 'accessToken=jwt';
const FRONT = 'http://localhost:3002';
const EVIL = 'https://evil.test';

beforeEach(() => {
  mockFrontendUrl = FRONT;
});

const post = (url = '/api/tenants/t1/contacts') => request(app).post(url).set('Cookie', COOKIE);

describe('csrfOriginGuard : requêtes autorisées', () => {
  it('Origin = FRONTEND_URL avec cookie', async () => {
    expect((await post().set('Origin', FRONT)).status).toBe(200);
  });
  it('Origin = FRONTEND_URL en Sec-Fetch-Site same-site (développement)', async () => {
    expect((await post().set('Origin', FRONT).set('Sec-Fetch-Site', 'same-site')).status).toBe(200);
  });
  it('Referer de la bonne origine', async () => {
    expect((await post().set('Referer', `${FRONT}/page?x=1`)).status).toBe(200);
  });
  it('Sec-Fetch-Site same-origin et none', async () => {
    expect((await post().set('Sec-Fetch-Site', 'same-origin')).status).toBe(200);
    expect((await post().set('Sec-Fetch-Site', 'none')).status).toBe(200);
  });
  it('client non navigateur (sans Origin, Referer ni Sec-Fetch-Site)', async () => {
    expect((await post()).status).toBe(200);
  });
  it('Origin étranger avec Authorization SANS cookie (client API, passerelle IA)', async () => {
    const res = await request(app)
      .post('/api/tenants/t1/contacts')
      .set('Origin', EVIL)
      .set('Authorization', 'Bearer x');
    expect(res.status).toBe(200);
  });
  it('Origin étranger sans cookie accessToken', async () => {
    expect((await request(app).post('/api/tenants/t1/contacts').set('Origin', EVIL)).status).toBe(200);
  });
  it('méthode GET', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', COOKIE).set('Origin', EVIL);
    expect(res.status).toBe(200);
  });
  it('slash final dans FRONTEND_URL (origine normalisée)', async () => {
    mockFrontendUrl = `${FRONT}/`;
    expect((await post().set('Origin', FRONT)).status).toBe(200);
  });
});

describe('csrfOriginGuard : requêtes refusées', () => {
  const expectRejected = (res: request.Response) => {
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, message: 'Requête refusée.', code: 'CSRF_REJECTED' });
  };

  it('Origin étranger avec cookie', async () => {
    expectRejected(await post().set('Origin', EVIL));
  });
  it('Sec-Fetch-Site cross-site, même avec la bonne Origin', async () => {
    expectRejected(await post().set('Sec-Fetch-Site', 'cross-site').set('Origin', FRONT));
  });
  it('same-site sans Origin ni Referer', async () => {
    expectRejected(await post().set('Sec-Fetch-Site', 'same-site'));
  });
  it('same-site avec Origin étrangère (voisin)', async () => {
    expectRejected(await post().set('Sec-Fetch-Site', 'same-site').set('Origin', 'http://localhost:9999'));
  });
  it('Origin: null', async () => {
    expectRejected(await post().set('Origin', 'null'));
  });
  it('Referer illisible', async () => {
    expectRejected(await post().set('Referer', 'pas une url'));
  });
  it('Referer étranger sans Origin', async () => {
    expectRejected(await post().set('Referer', `${EVIL}/x`));
  });
  it('méthodes PUT, PATCH et DELETE', async () => {
    for (const method of ['put', 'patch', 'delete'] as const) {
      expectRejected(await request(app)[method]('/api/x').set('Cookie', COOKIE).set('Origin', EVIL));
    }
  });
  it('même corps pour tous les motifs', async () => {
    const a = await post().set('Origin', EVIL);
    const b = await post().set('Sec-Fetch-Site', 'cross-site');
    expect(a.body).toEqual(b.body);
  });
  it('cookie ET Authorization : le garde reste armé (authenticate lit le cookie en premier)', async () => {
    expectRejected(await post().set('Origin', EVIL).set('Authorization', 'Bearer x'));
    expectRejected(await post().set('Sec-Fetch-Site', 'cross-site').set('Authorization', 'Bearer x'));
  });
  it('logout et me/language ne sont PAS exclus (connectés)', async () => {
    expectRejected(await post('/api/auth/logout').set('Origin', EVIL));
    expectRejected(await request(app).patch('/api/auth/me/language').set('Cookie', COOKIE).set('Origin', EVIL));
  });
  it("les routes newsletter d'agence ne sont PAS exclues", async () => {
    expectRejected(await post('/api/tenants/t1/newsletter/campaigns').set('Origin', EVIL));
  });
});

describe('csrfOriginGuard : exclusions', () => {
  const EXEMPT = [
    '/api/webhooks/whatsapp-cloud/events',
    '/api/webhooks/livekit',
    '/api/whatsapp/webhook',
    '/api/payment-gateway/paysecurehub/ipn',
    '/api/payment-gateway/paysecurehub/platform-ipn',
    '/api/payment-gateway/simulator/PAY1/success',
    '/api/public/signature-provider/webhook',
    '/api/public/signatures/TOKEN/sign',
    '/api/public/secure-links/read',
    '/api/public/external-access/open',
    '/api/public/assemblees/join',
    '/api/newsletter/subscribe',
    '/api/newsletter/confirm',
    '/api/newsletter/unsubscribe',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/resend-verification',
    '/api/auth/refresh'
  ];
  it.each(EXEMPT)('%s passe malgré cookie + Origin étranger', async url => {
    const res = await post(url).set('Origin', EVIL).set('Sec-Fetch-Site', 'cross-site');
    expect(res.status).toBe(200);
  });

  it('isCsrfExemptPath : préfixes précis', () => {
    expect(isCsrfExemptPath('/api/newsletter')).toBe(true);
    expect(isCsrfExemptPath('/api/newsletterx')).toBe(false);
    expect(isCsrfExemptPath('/api/public/signaturesx')).toBe(false);
    expect(isCsrfExemptPath('/api/auth/login/extra')).toBe(false);
    expect(isCsrfExemptPath('/API/AUTH/LOGIN')).toBe(true);
    expect(isCsrfExemptPath('/api/tenants/t1/newsletter/subscribers')).toBe(false);
  });

  it('inventaire : chaque préfixe public ou de webhook des routeurs est exclu', () => {
    const routesDir = path.join(__dirname, '../../src/routes');
    const found: string[] = [];
    for (const file of fs.readdirSync(routesDir)) {
      const source = fs.readFileSync(path.join(routesDir, file), 'utf8');
      const re = /export const (?:PUBLIC_\w+_PREFIX|\w+_WEBHOOK_PREFIX)\s*=\s*'([^']+)'/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(source))) found.push(m[1]);
    }
    expect(found.length).toBeGreaterThanOrEqual(7);
    for (const prefix of found) expect(isCsrfExemptPath(`${prefix}/x`)).toBe(true);
  });

  it('app.ts monte le garde après CORS et le limiteur global, avant les routeurs', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/app.ts'), 'utf8');
    const cors = source.indexOf('app.use(corsMiddleware)');
    const limiter = source.indexOf('app.use(globalApiRateLimiter)');
    const guard = source.indexOf('app.use(csrfOriginGuard)');
    const firstRouter = source.indexOf("app.use('/api'");
    expect(cors).toBeGreaterThan(0);
    expect(limiter).toBeGreaterThan(cors);
    expect(guard).toBeGreaterThan(limiter);
    expect(guard).toBeLessThan(firstRouter);
  });
});

describe('csrfOriginGuard : CSRF de connexion (login, register), cookie présent ou non', () => {
  const expectRejected = (res: request.Response) => {
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 'CSRF_REJECTED' });
  };
  it.each(['/api/auth/login', '/api/auth/register', '/API/Auth/Login/'])('%s : cross-site refusé', async url => {
    expectRejected(await request(app).post(url).set('Sec-Fetch-Site', 'cross-site'));
    expectRejected(await post(url).set('Sec-Fetch-Site', 'cross-site'));
  });
  it.each(['/api/auth/login', '/api/auth/register'])('%s : Origin étrangère ou null refusée', async url => {
    expectRejected(await request(app).post(url).set('Origin', EVIL));
    expectRejected(await request(app).post(url).set('Origin', 'null'));
    expectRejected(await request(app).post(url).set('Origin', EVIL).set('Sec-Fetch-Site', 'same-site'));
    expectRejected(await post(url).set('Origin', EVIL));
  });
  it.each(['/api/auth/login', '/api/auth/register'])(
    '%s : front, same-origin et clients sans en-tête passent',
    async url => {
      expect((await request(app).post(url).set('Origin', FRONT)).status).toBe(200);
      expect((await request(app).post(url).set('Origin', FRONT).set('Sec-Fetch-Site', 'same-site')).status).toBe(200);
      expect((await request(app).post(url).set('Sec-Fetch-Site', 'same-origin')).status).toBe(200);
      expect((await request(app).post(url)).status).toBe(200);
      expect((await post(url)).status).toBe(200);
    }
  );
  it('les autres routes auth exclues restent exclues sans cookie', async () => {
    const res = await request(app).post('/api/auth/forgot-password').set('Origin', EVIL);
    expect(res.status).toBe(200);
  });
});

describe('csrfOriginGuard : chemin et performance (ReDoS)', () => {
  it('normalizeCsrfPath : même résultat que l’ancienne expression', () => {
    const legacy = (p: string) => p.toLowerCase().replace(/\/+$/, '');
    for (const p of ['', '/', '//', '/api/Auth/Login', '/api/auth/login/', '/api/auth/login///', '/a//b/', 'x']) {
      expect(normalizeCsrfPath(p)).toBe(legacy(p));
    }
  });
  it('isCsrfExemptPath : 16 000 « / » puis « a » traités en moins de 5 ms', () => {
    const evil = `${'/'.repeat(16_000)}a`;
    isCsrfExemptPath(evil);
    const start = process.hrtime.bigint();
    expect(isCsrfExemptPath(evil)).toBe(false);
    expect(normalizeCsrfPath(evil)).toBe(evil);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    expect(elapsedMs).toBeLessThan(5);
  });
  it('normalizeCsrfPath : longue suite de « / » finaux en temps linéaire', () => {
    const evil = `/api/auth/login${'/'.repeat(100_000)}`;
    const start = process.hrtime.bigint();
    expect(normalizeCsrfPath(evil)).toBe('/api/auth/login');
    expect(Number(process.hrtime.bigint() - start) / 1e6).toBeLessThan(5);
  });
  it('chemin plus long que la limite : jamais exclu ; écriture avec cookie refusée, sans cookie laissée passer', async () => {
    const long = `/api/newsletter/${'a'.repeat(CSRF_MAX_PATH_LENGTH)}`;
    expect(isCsrfExemptPath(long)).toBe(false);
    const withCookie = await request(app).post(long).set('Cookie', COOKIE).set('Origin', FRONT);
    expect(withCookie.status).toBe(403);
    expect(withCookie.body).toMatchObject({ code: 'CSRF_REJECTED' });
    expect((await request(app).post(long)).status).toBe(200);
  });
});
