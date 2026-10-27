/**
 * Le webhook LiveKit (spec 045) est exempté du plancher global `globalApiRateLimiter` : il a son
 * propre limiteur, et un serveur LiveKit envoie ses événements depuis une seule IP.
 */
import express from 'express';
import request from 'supertest';
import { globalApiRateLimiter, isLivekitWebhookPath } from '../../src/middleware/rate-limit-middleware';

describe('isLivekitWebhookPath', () => {
  it('reconnaît le webhook, pas les chemins voisins', () => {
    expect(isLivekitWebhookPath('/api/webhooks/livekit')).toBe(true);
    expect(isLivekitWebhookPath('/api/webhooks/livekit/')).toBe(true);
    expect(isLivekitWebhookPath('/api/webhooks/livekit-autre')).toBe(false);
    expect(isLivekitWebhookPath('/api/webhooks/whatsapp-cloud/events')).toBe(false);
    expect(isLivekitWebhookPath('/api/tenants/t/livekit')).toBe(false);
  });
});

describe('plancher global', () => {
  const app = express();
  app.set('trust proxy', true);
  app.use(globalApiRateLimiter);
  app.all('*', (_req, res) => res.status(200).end());

  it('le webhook LiveKit ne consomme pas le budget de l IP ; les autres routes /api le consomment', async () => {
    const ip = '203.0.113.9';
    for (let i = 0; i < 1005; i += 1) {
      const res = await request(app).post('/api/webhooks/livekit').set('X-Forwarded-For', ip);
      if (res.status !== 200) throw new Error(`webhook limité à la requête ${i + 1}`);
    }
    // Le budget de la même IP est intact : 1000 requêtes ordinaires passent, la suivante est limitée.
    let status = 200;
    for (let i = 0; i < 1001 && status === 200; i += 1) {
      status = (await request(app).get('/api/autre').set('X-Forwarded-For', ip)).status;
      if (status === 429) expect(i).toBe(1000);
    }
    expect(status).toBe(429);
  }, 120_000);
});
