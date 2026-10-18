/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Webhook LiveKit `participant_joined` (spec 045, V16f) : un copropriétaire qui (re)entre avec un jeton émis
 * avant l'interdiction est ramené au droit décidé en base, sans attendre la console du gestionnaire.
 * Signature réelle du SDK, base en mémoire, appels LiveKit simulés.
 */
jest.mock('dotenv/config', () => ({}));

const SECRET = 'webhook-test-secret-0123456789-abcdef';
process.env.LIVEKIT_URL = 'ws://localhost:7880';
process.env.LIVEKIT_API_KEY = 'APIwebhook';
process.env.LIVEKIT_API_SECRET = SECRET;

import { createHash } from 'crypto';
import express from 'express';
import request from 'supertest';
import { AccessToken } from 'livekit-server-sdk';
import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const mockSetCanSpeak = jest.fn();
jest.mock('../../src/services/livekit-service', () => ({
  ...jest.requireActual('../../src/services/livekit-service'),
  setCanSpeak: (...args: unknown[]) => mockSetCanSpeak(...args)
}));
jest.mock('../../src/lib/syndics/meeting-recording', () => ({ handleEgressEnded: jest.fn() }));
jest.mock('../../src/middleware/rate-limit-middleware', () => ({
  livekitWebhookRateLimiter: (_req: any, _res: any, next: any) => next()
}));
const mockWarn = jest.fn();
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: (...a: unknown[]) => mockWarn(...a), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import webhookRoutes from '../../src/routes/livekit-webhook-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use('/api/webhooks/livekit', webhookRoutes);
app.use(errorHandler);

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const M1 = '33333333-3333-4333-8333-333333333333';
const M2 = '44444444-4444-4444-8444-444444444444';
const P1 = '55555555-5555-4555-8555-555555555555';
const ROOM = `t_${TENANT_A}__ag_${M1}`;

async function post(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const token = new AccessToken('APIwebhook', SECRET, { ttl: 300 });
  token.sha256 = createHash('sha256').update(body).digest('base64');
  return request(app)
    .post('/api/webhooks/livekit')
    .set('Content-Type', 'application/webhook+json')
    .set('Authorization', await token.toJwt())
    .send(body);
}

const joined = (identity: string, room = ROOM, canPublish: boolean | undefined = true) => ({
  event: 'participant_joined',
  id: 'EV_J',
  room: { name: room },
  participant: { identity, permission: canPublish === undefined ? undefined : { canPublish } }
});

function seed(policy: string, locked: boolean) {
  mockPrisma.reset();
  mockPrisma.generalMeeting.rows.push(
    { id: M1, status: 'IN_PROGRESS', mediaLockedAt: locked ? new Date() : null, syndicate: { tenantId: TENANT_A } },
    { id: M2, status: 'IN_PROGRESS', mediaLockedAt: null, syndicate: { tenantId: TENANT_B } }
  );
  mockPrisma.gMParticipant.rows.push({ id: P1, tenantId: TENANT_A, meetingId: M1, mediaPolicy: policy });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSetCanSpeak.mockResolvedValue(true);
});

describe('webhook participant_joined : rattrapage du droit de publier', () => {
  it('verrou global : le copropriétaire qui entre avec un jeton publiant perd le droit de publier', async () => {
    seed('DEFAULT', true);
    const res = await post(joined(P1));
    expect(res.status).toBe(200);
    expect(mockSetCanSpeak).toHaveBeenCalledWith(ROOM, P1, false, { lowerHand: false });
  });

  it('BLOCKED : retire le droit même sans verrou global', async () => {
    seed('BLOCKED', false);
    await post(joined(P1));
    expect(mockSetCanSpeak).toHaveBeenCalledWith(ROOM, P1, false, { lowerHand: false });
  });

  it('autorisé (DEFAULT sans verrou, ou ALLOWED sous verrou) : rien à faire, jamais de réouverture', async () => {
    seed('DEFAULT', false);
    await post(joined(P1));
    seed('ALLOWED', true);
    await post(joined(P1));
    expect(mockSetCanSpeak).not.toHaveBeenCalled();
  });

  it('jeton déjà sans droit de publier : aucun appel inutile (idempotent)', async () => {
    seed('BLOCKED', true);
    await post(joined(P1, ROOM, false));
    expect(mockSetCanSpeak).not.toHaveBeenCalled();
  });

  it('identité non UUID (gestionnaire, enregistreur), salle inconnue ou participant d une autre AG/agence : ignoré', async () => {
    seed('BLOCKED', true);
    await post(joined('gestionnaire-user-1'));
    await post(joined('EG_enregistreur'));
    await post(joined(P1, 'une-salle-quelconque'));
    // Même salle mais autre agence : le participant n existe pas pour cette agence.
    await post(joined(P1, `t_${TENANT_B}__ag_${M1}`));
    await post(joined(P1, `t_${TENANT_A}__ag_${M2}`));
    expect(mockSetCanSpeak).not.toHaveBeenCalled();
  });

  it('LiveKit en échec : journalisé, le webhook répond quand même 200', async () => {
    seed('BLOCKED', false);
    mockSetCanSpeak.mockRejectedValue(new Error('livekit down'));
    const res = await post(joined(P1));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockWarn).toHaveBeenCalled();
  });

  it('signature invalide : 401 et aucun effet', async () => {
    seed('BLOCKED', true);
    const res = await request(app)
      .post('/api/webhooks/livekit')
      .set('Content-Type', 'application/webhook+json')
      .set('Authorization', 'forged')
      .send(JSON.stringify(joined(P1)));
    expect(res.status).toBe(401);
    expect(mockSetCanSpeak).not.toHaveBeenCalled();
  });
});
