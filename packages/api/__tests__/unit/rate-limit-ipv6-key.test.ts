/**
 * AUTH-01 : les limiteurs regroupent les adresses IPv6 par /64 (un abonné IPv6
 * change d'adresse dans son préfixe), laissent l'IPv4 inchangée, et la limite
 * du login (5 échecs, succès non comptés) reste intacte.
 */
import express, { Express, Request, Response } from 'express';
import request from 'supertest';

function charger() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/middleware/rate-limit-middleware');
}

function appLogin(): Express {
  const { loginRateLimiter } = charger();
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.post('/login', loginRateLimiter, (req: Request, res: Response) => {
    if (req.body?.password === 'bon') res.status(200).json({ success: true });
    else res.status(400).json({ success: false });
  });
  return app;
}

const echec = (app: Express, ip: string) =>
  request(app).post('/login').set('X-Forwarded-For', ip).send({ password: 'x' });

beforeEach(() => jest.resetModules());

describe('clientIpKey', () => {
  it('IPv4 inchangée, IPv4-mappée ramenée, IPv6 en /64, sans IP => inconnue', () => {
    const { clientIpKey } = charger();
    expect(clientIpKey({ ip: '203.0.113.7' })).toBe('203.0.113.7');
    expect(clientIpKey({ ip: '::ffff:203.0.113.7' })).toBe('203.0.113.7');
    expect(clientIpKey({ ip: '2001:db8:1:2:aaaa::1' })).toBe(clientIpKey({ ip: '2001:db8:1:2:bbbb::9' }));
    expect(clientIpKey({ ip: '2001:db8:1:2::1' })).not.toBe(clientIpKey({ ip: '2001:db8:1:3::1' }));
    expect(clientIpKey({})).toBe('inconnue');
  });
});

describe('authBruteForceIpKey (connexion, mot de passe oublié, réinitialisation) : IPv6 en /56', () => {
  it('IPv4 et IPv4 mappée comme clientIpKey ; deux /64 du même /56 partagent la clé ; un autre /56 non', () => {
    const { authBruteForceIpKey } = charger();
    expect(authBruteForceIpKey({ ip: '203.0.113.7' })).toBe('203.0.113.7');
    expect(authBruteForceIpKey({ ip: '::ffff:203.0.113.7' })).toBe('203.0.113.7');
    expect(authBruteForceIpKey({})).toBe('inconnue');
    expect(authBruteForceIpKey({ ip: '2001:db8:1:2::1' })).toBe('2001:db8:1:0::/56');
    expect(authBruteForceIpKey({ ip: '2001:db8:1:ff::1' })).toBe(authBruteForceIpKey({ ip: '2001:db8:1:3::1' }));
    expect(authBruteForceIpKey({ ip: '2001:db8:1:1ff::1' })).toBe('2001:db8:1:100::/56');
    expect(authBruteForceIpKey({ ip: '2001:db8:1:100::1' })).not.toBe(authBruteForceIpKey({ ip: '2001:db8:1:ff::1' }));
  });
});

describe('loginRateLimiter : regroupement IPv6', () => {
  it('deux adresses du même /64 partagent un seul seau (429 au 6e échec)', async () => {
    const app = appLogin();
    for (let i = 0; i < 5; i++) {
      const r = await echec(app, `2001:db8:1:2:${i}::1`);
      expect(r.status).toBe(400);
    }
    expect((await echec(app, '2001:db8:1:2:ffff::42')).status).toBe(429);
  });

  it('un autre /64 du même /56 partage le seau (contre-audit PR #205)', async () => {
    const app = appLogin();
    for (let i = 0; i < 5; i++) await echec(app, `2001:db8:1:${i}::1`);
    expect((await echec(app, '2001:db8:1:ff::1')).status).toBe(429);
  });

  it('un autre /56 a son propre seau', async () => {
    const app = appLogin();
    for (let i = 0; i < 5; i++) await echec(app, `2001:db8:1:2:${i}::1`);
    expect((await echec(app, '2001:db8:1:2::1')).status).toBe(429);
    expect((await echec(app, '2001:db8:1:100::1')).status).toBe(400);
  });

  it('IPv4 : seau par adresse, 5 échecs puis 429, une autre adresse passe', async () => {
    const app = appLogin();
    for (let i = 0; i < 5; i++) expect((await echec(app, '198.51.100.1')).status).toBe(400);
    expect((await echec(app, '198.51.100.1')).status).toBe(429);
    expect((await echec(app, '198.51.100.2')).status).toBe(400);
  });

  it('les connexions réussies ne consomment pas le quota', async () => {
    const app = appLogin();
    for (let i = 0; i < 8; i++) {
      const r = await request(app).post('/login').set('X-Forwarded-For', '2001:db8:9:9::1').send({ password: 'bon' });
      expect(r.status).toBe(200);
    }
  });

  it("n'émet aucun avertissement de validation d'express-rate-limit", async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const app = appLogin();
    await echec(app, '2001:db8:1:2::1');
    const sortie = [...err.mock.calls, ...warn.mock.calls, ...log.mock.calls].flat().join(' ');
    expect(sortie).not.toMatch(/ERR_ERL/);
    jest.restoreAllMocks();
  });
});
