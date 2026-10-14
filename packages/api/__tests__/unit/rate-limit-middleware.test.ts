/**
 * Recette Syndic : après 5 connexions RÉUSSIES depuis la même IP en 15 min
 * (une agence dont les collaborateurs sortent par la même box, ou un
 * super-admin qui bascule entre deux comptes), toute connexion suivante était
 * refusée pendant 15 minutes avec « Trop de tentatives de connexion... »,
 * alors qu'aucune de ces requêtes n'était un échec. `loginRateLimiter`
 * comptait toutes les requêtes de connexion (succès compris) ; il ne doit
 * compter que les échecs (`skipSuccessfulRequests: true`), pour garder la
 * protection anti-force-brute intacte sans bloquer un usage légitime.
 */

import express, { Express, Request, Response } from 'express';
import request from 'supertest';

/**
 * `loginRateLimiter` garde son compteur en mémoire pour tout le cycle de vie
 * du module ; comme les requêtes de test viennent toutes de la même IP
 * (127.0.0.1), réutiliser un seul import ferait fuiter le compteur d'un test
 * à l'autre. Chaque test importe donc une instance fraîche du middleware.
 */
function appFactice(): Express {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { loginRateLimiter } = require('../../src/middleware/rate-limit-middleware');

  const app = express();
  app.use(express.json());
  // Mime le contrôleur reel (auth-controller.ts#login) : 200 sur succès,
  // 400 sur échec, selon le corps envoyé par le test.
  app.post('/login', loginRateLimiter, (req: Request, res: Response) => {
    if (req.body?.password === 'bon-mot-de-passe') {
      res.status(200).json({ success: true, message: 'Connexion réussie.' });
    } else {
      res.status(400).json({ success: false, message: 'Identifiants invalides.' });
    }
  });
  return app;
}

beforeEach(() => {
  jest.resetModules();
});

describe('loginRateLimiter', () => {
  it('laisse passer 6 connexions RÉUSSIES successives depuis la même IP (skipSuccessfulRequests)', async () => {
    const app = appFactice();

    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/login').send({ email: 'a@a.com', password: 'bon-mot-de-passe' });
      expect(res.status).toBe(200);
    }
  });

  it('bloque avec 429 à partir de la 6e connexion ÉCHOUÉE successive depuis la même IP', async () => {
    const app = appFactice();

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/login').send({ email: 'a@a.com', password: 'mauvais' });
      expect(res.status).toBe(400);
    }

    const sixieme = await request(app).post('/login').send({ email: 'a@a.com', password: 'mauvais' });
    expect(sixieme.status).toBe(429);
  });

  it('un mélange de succès puis d’échecs ne bloque pas tant que les échecs seuls restent sous le seuil', async () => {
    const app = appFactice();

    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/login').send({ email: 'a@a.com', password: 'bon-mot-de-passe' });
      expect(res.status).toBe(200);
    }

    for (let i = 0; i < 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/login').send({ email: 'a@a.com', password: 'mauvais' });
      expect(res.status).toBe(400);
    }

    // 5e échec seulement : encore sous le seuil de 5.
    const cinquiemeEchec = await request(app).post('/login').send({ email: 'a@a.com', password: 'mauvais' });
    expect(cinquiemeEchec.status).toBe(400);
  });
});

describe('limiteurs ImmoCopilot — message traduit', () => {
  /** La langue de la requête vient de l'en-tête `x-lang` (le vrai middleware lit Accept-Language). */
  function appIa(name: 'aiChatRateLimiter' | 'aiActionRateLimiter' | 'aiRejectRateLimiter') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const limiters = require('../../src/middleware/rate-limit-middleware');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runWithLanguage } = require('../../src/i18n');
    const app = express();
    app.post(
      '/ia',
      (req, res, next) =>
        runWithLanguage(req.header('x-lang') === 'en' ? 'en' : 'fr', () => limiters[name](req, res, next)),
      (_req, res) => res.json({ ok: true })
    );
    return app;
  }

  it.each([
    ['aiChatRateLimiter', 20, /assistant/],
    ['aiActionRateLimiter', 10, /confirmations/],
    ['aiRejectRateLimiter', 30, /refus/]
  ] as const)('%s : 429 RATE_LIMITED, message en français puis en anglais', async (name, max, fragment) => {
    const app = appIa(name);
    for (let i = 0; i < max; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await request(app).post('/ia');
      expect(ok.status).toBe(200);
    }
    const fr = await request(app).post('/ia');
    expect(fr.status).toBe(429);
    expect(fr.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
    expect(fr.body.message).toMatch(/Réessayez/);
    expect(fr.body.message).toMatch(fragment);

    const en = await request(app).post('/ia').set('x-lang', 'en');
    expect(en.status).toBe(429);
    expect(en.body.message).toMatch(/Try again/);
    expect(en.body.message).not.toMatch(/Réessayez/);
  });

  it('confirmations et refus ont des compteurs séparés : un lot de refus ne bloque pas une confirmation', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const limiters = require('../../src/middleware/rate-limit-middleware');
    const app = express();
    app.post('/execute', limiters.aiActionRateLimiter, (_req, res) => res.json({ ok: true }));
    app.post('/reject', limiters.aiRejectRateLimiter, (_req, res) => res.status(400).json({ ok: false }));
    // Refus (jetons invalides compris) : comptés dans LEUR compteur, jusqu'au plafond.
    for (let i = 0; i < 30; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect((await request(app).post('/reject')).status).toBe(400);
    }
    expect((await request(app).post('/reject')).status).toBe(429);
    // La confirmation passe toujours : quota intact.
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect((await request(app).post('/execute')).status).toBe(200);
    }
    expect((await request(app).post('/execute')).status).toBe(429);
  });
});
