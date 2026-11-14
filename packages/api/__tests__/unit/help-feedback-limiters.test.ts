/**
 * Limiteurs des avis sur les fiches d'aide (`POST /api/help/feedback`) :
 * 10 par minute et 100 par jour, par utilisateur (par adresse en dernier recours).
 */
import express from 'express';
import request from 'supertest';
import { helpFeedbackRateLimiter, helpFeedbackDailyLimiter } from '../../src/middleware/rate-limit-middleware';

const MESSAGE = "Trop d'avis envoyés en peu de temps. Veuillez réessayer plus tard.";

type Limiter = typeof helpFeedbackRateLimiter;

function appWith(limiter: Limiter) {
  const app = express();
  app.set('trust proxy', 1);
  app.use((req, _res, next) => {
    const userId = req.header('x-test-user');
    if (userId) (req as unknown as { user: { userId: string } }).user = { userId };
    next();
  });
  app.post('/feedback', limiter, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

const post = (app: express.Express, user?: string, ip = '203.0.113.1') => {
  const r = request(app).post('/feedback').set('X-Forwarded-For', ip);
  return user ? r.set('x-test-user', user) : r;
};

describe('helpFeedbackRateLimiter (10 par minute)', () => {
  it('laisse passer 10 avis puis refuse le 11e avec le message attendu', async () => {
    const app = appWith(helpFeedbackRateLimiter);
    for (let i = 0; i < 10; i++) expect((await post(app, 'minute-u1')).status).toBe(200);
    const res = await post(app, 'minute-u1');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ success: false, code: 'RATE_LIMITED', message: MESSAGE });
  });

  it('compte par utilisateur : un autre utilisateur de la même adresse reste libre', async () => {
    const app = appWith(helpFeedbackRateLimiter);
    for (let i = 0; i < 10; i++) await post(app, 'minute-u2');
    expect((await post(app, 'minute-u2')).status).toBe(429);
    expect((await post(app, 'minute-u3')).status).toBe(200);
  });

  it("sans utilisateur, retombe sur l'adresse : deux adresses ont deux compteurs", async () => {
    const app = appWith(helpFeedbackRateLimiter);
    for (let i = 0; i < 10; i++) expect((await post(app, undefined, '198.51.100.7')).status).toBe(200);
    expect((await post(app, undefined, '198.51.100.7')).status).toBe(429);
    expect((await post(app, undefined, '198.51.100.8')).status).toBe(200);
  });
});

describe('helpFeedbackDailyLimiter (100 par jour)', () => {
  it('laisse passer 100 avis puis refuse le 101e avec le message attendu', async () => {
    const app = appWith(helpFeedbackDailyLimiter);
    for (let i = 0; i < 100; i++) expect((await post(app, 'jour-u1')).status).toBe(200);
    const res = await post(app, 'jour-u1');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ success: false, code: 'RATE_LIMITED', message: MESSAGE });
  });

  it('compte par utilisateur : un autre utilisateur garde son quota', async () => {
    const app = appWith(helpFeedbackDailyLimiter);
    for (let i = 0; i < 101; i++) await post(app, 'jour-u2');
    expect((await post(app, 'jour-u2')).status).toBe(429);
    expect((await post(app, 'jour-u3')).status).toBe(200);
  });
});
