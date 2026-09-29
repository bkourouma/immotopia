/**
 * Le limiteur par agence de l'assistant est indexé par le contexte d'agence
 * validé (`req.tenantContext`), jamais par le paramètre d'URL, que le client
 * choisit : changer `:tenantId` ne doit pas ouvrir un nouveau compteur.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../src/config/env', () => ({
  env: { AI_TENANT_MINUTE_LIMIT: 2, AI_TENANT_DAILY_LIMIT: 1000, NODE_ENV: 'test' }
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { aiTenantChatRateLimiter } = require('../../src/middleware/rate-limit-middleware');

const app = express();
app.post(
  '/:tenantId/chat',
  (req, _res, next) => {
    (req as any).tenantContext = { tenantId: String(req.headers['x-ctx']) };
    next();
  },
  aiTenantChatRateLimiter,
  (_req, res) => void res.json({ ok: true })
);

describe('aiTenantChatRateLimiter', () => {
  it("compte par tenantContext, pas par :tenantId de l'URL", async () => {
    await request(app).post('/urlA/chat').set('x-ctx', 'agence-1').expect(200);
    await request(app).post('/urlB/chat').set('x-ctx', 'agence-1').expect(200);
    // Même agence validée, autre valeur d'URL : le compteur est partagé.
    await request(app).post('/urlC/chat').set('x-ctx', 'agence-1').expect(429);
    // Autre agence validée, même valeur d'URL : compteur distinct.
    await request(app).post('/urlA/chat').set('x-ctx', 'agence-2').expect(200);
  });
});
