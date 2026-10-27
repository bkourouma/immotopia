/**
 * Webhook LiveKit (spec 045, R4) sur l'app Express RÉELLE : le préfixe est exclu des parseurs
 * globaux (corps brut), la signature réelle du SDK est vérifiée sur les octets reçus.
 * Aucune base : seuls des événements sans effet sont envoyés.
 */
jest.mock('dotenv/config', () => ({}));

const SECRET = 'webhook-test-secret-0123456789-abcdef';
process.env.LIVEKIT_URL = 'ws://localhost:7880';
process.env.LIVEKIT_API_KEY = 'APIwebhook';
process.env.LIVEKIT_API_SECRET = SECRET;

import '../helpers/app-shims';
import { createHash } from 'crypto';
import request from 'supertest';
import { AccessToken } from 'livekit-server-sdk';
import app from '../../src/app';

async function sign(body: string, secret = SECRET) {
  const token = new AccessToken('APIwebhook', secret, { ttl: 300 });
  token.sha256 = createHash('sha256').update(body).digest('base64');
  return token.toJwt();
}

const send = (body: string, auth?: string) => {
  const req = request(app).post('/api/webhooks/livekit').set('Content-Type', 'application/webhook+json');
  if (auth) req.set('Authorization', auth);
  return req.send(body);
};

describe('POST /api/webhooks/livekit (app réelle)', () => {
  const body = JSON.stringify({ event: 'room_finished', id: 'EV_1', room: { name: 'r' } });

  it("signature valide sur le corps brut : 200 (le parseur JSON global ne l'a pas consommé)", async () => {
    const res = await send(body, await sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it("signature absente, forgée, d'un autre secret ou corps altéré : 401 sans détail", async () => {
    for (const res of [
      await send(body),
      await send(body, 'forged'),
      await send(body, await sign(body, 'x'.repeat(40))),
      await send(`${body} `, await sign(body))
    ]) {
      expect(res.status).toBe(401);
      expect(res.text).toBe('');
    }
  });
});
