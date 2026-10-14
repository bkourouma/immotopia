/**
 * Lot 041 — webhook Meta WhatsApp Cloud (spec W6, W7-R1).
 * Critères W6-1 à 4, W6-8, W7-1 à 3 ; vérification `GET`, masquage du jeton
 * au journal, dédoublonnage, statuts, ligne Meta étrangère, limiteur avant la
 * signature.
 *
 * Le routeur est monté seul (avec le journal des requêtes) dans une app
 * Express de test ; la base est simulée en mémoire, le moteur (W3) et le
 * transport sont simulés : aucun appel réseau.
 */
import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { Prisma } from '@prisma/client';

const mockEnv: Record<string, unknown> = {
  NODE_ENV: 'development',
  WHATSAPP_INVENTORY_TRANSPORT: 'meta',
  META_WA_APP_SECRET: 'cle-secrete-application-meta-de-test-0123456789',
  META_WA_VERIFY_TOKEN: 'jeton-verification-abonnement-meta-de-test-0123456789',
  META_WA_ACCESS_TOKEN: 'jeton-acces',
  META_WA_PHONE_NUMBER_ID: '1234567890'
};
jest.mock('../../src/config/env', () => ({ env: mockEnv, isProduction: false, isTest: true }));

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

const mockLimiterState = { block: false, calls: 0 };
jest.mock('../../src/middleware/rate-limit-middleware', () => ({
  whatsappCloudWebhookRateLimiter: (_req: Request, res: Response, next: NextFunction) => {
    mockLimiterState.calls += 1;
    if (mockLimiterState.block) {
      res.status(429).end();
      return;
    }
    next();
  }
}));

const mockHandleInboundMessage = jest.fn();
jest.mock('../../src/lib/stock-whatsapp/engine', () => ({
  handleInboundMessage: (...args: unknown[]) => mockHandleInboundMessage(...args)
}));

jest.mock('../../src/lib/stock-whatsapp/bot-messages', () => ({
  botMessages: { unknownNumber: () => ({ kind: 'TEXT', text: 'M01' }) }
}));

const mockTransport = {
  id: 'meta' as const,
  send: jest.fn(async () => ({ metaMessageId: 'wamid.out', error: null })),
  markRead: jest.fn(async () => undefined),
  fetchMedia: jest.fn()
};
jest.mock('../../src/lib/stock-whatsapp/transport', () => ({ getWhatsappTransport: () => mockTransport }));

// ---------------------------------------------------------------------------
// Base simulée : whatsapp_cloud_events (unicité partielle de metaMessageId
// sur MESSAGE) et inscriptions.
// ---------------------------------------------------------------------------

type EventRow = {
  id: string;
  kind: 'MESSAGE' | 'STATUS' | 'OTHER';
  status: string;
  metaMessageId: string | null;
  senderHash: string | null;
  messageType: string | null;
  deliveryStatus: string | null;
  payload: unknown;
  via: string;
  receivedAt: Date;
  claimedAt: Date | null;
  processedAt: Date | null;
  attempts: number;
  unknownReplySentAt: Date | null;
  error: string | null;
};

const mockDb = {
  events: [] as EventRow[],
  registrations: [] as Array<{ id: string; phoneE164: string; status: string }>,
  failInsert: false
};

type Where = Record<string, unknown>;

function matchesValue(actual: unknown, condition: unknown): boolean {
  if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
    const ops = condition as Record<string, unknown>;
    if ('lt' in ops) return actual !== null && (actual as Date | number) < (ops.lt as Date | number);
    if ('gt' in ops) return actual !== null && (actual as Date | number) > (ops.gt as Date | number);
    if ('gte' in ops) return actual !== null && (actual as Date | number) >= (ops.gte as Date | number);
    if ('not' in ops) return actual !== ops.not;
  }
  if (condition instanceof Date) return actual instanceof Date && actual.getTime() === condition.getTime();
  return actual === condition;
}

function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Where[]).some(branch => matches(row, branch));
    return matchesValue(row[key], condition);
  });
}

function applyData(row: EventRow, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (value === Prisma.DbNull) (row as Record<string, unknown>)[key] = null;
    else if (value && typeof value === 'object' && 'increment' in (value as object)) {
      (row as Record<string, unknown>)[key] = ((row as Record<string, unknown>)[key] as number) + 1;
    } else (row as Record<string, unknown>)[key] = value;
  }
}

function newEvent(data: Record<string, unknown>): EventRow {
  return {
    id: crypto.randomUUID(),
    kind: 'MESSAGE',
    status: 'RECEIVED',
    metaMessageId: null,
    senderHash: null,
    messageType: null,
    deliveryStatus: null,
    payload: null,
    via: 'META',
    receivedAt: new Date(),
    claimedAt: null,
    processedAt: null,
    attempts: 0,
    unknownReplySentAt: null,
    error: null,
    ...(data as Partial<EventRow>)
  };
}

const mockEventDelegate = {
  create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    if (mockDb.failInsert) throw new Error('base indisponible');
    if (
      data.kind === 'MESSAGE' &&
      mockDb.events.some(row => row.kind === 'MESSAGE' && row.metaMessageId === data.metaMessageId)
    ) {
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test'
      });
    }
    const row = newEvent(data);
    mockDb.events.push(row);
    return { id: row.id };
  }),
  createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
    for (const item of data) mockDb.events.push(newEvent(item));
    return { count: data.length };
  }),
  updateMany: jest.fn(async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
    const rows = mockDb.events.filter(row => matches(row as unknown as Record<string, unknown>, where));
    rows.forEach(row => applyData(row, data));
    return { count: rows.length };
  }),
  update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = mockDb.events.find(item => item.id === where.id);
    if (!row) throw new Error('introuvable');
    applyData(row, data);
    return row;
  }),
  findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
    const row = mockDb.events.find(item => item.id === where.id);
    return row ? { payload: row.payload, senderHash: row.senderHash } : null;
  }),
  findFirst: jest.fn(async ({ where }: { where: Where }) => {
    const row = mockDb.events.find(item => matches(item as unknown as Record<string, unknown>, where));
    return row ? { id: row.id } : null;
  })
};

const mockExecuteRaw = jest.fn(async () => 1);

jest.mock('../../src/utils/database', () => {
  const client = {
    whatsappCloudEvent: mockEventDelegate,
    stockWhatsappRegistration: {
      findFirst: jest.fn(async ({ where }: { where: Where }) => {
        const row = mockDb.registrations.find(item => matches(item as unknown as Record<string, unknown>, where));
        return row ? { id: row.id } : null;
      })
    },
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...(args as []))
  };
  return {
    prisma: {
      ...client,
      $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => fn(client)
    }
  };
});

import { logger } from '../../src/utils/logger';
import { requestLogger } from '../../src/middleware/logging-middleware';
import whatsappCloudWebhookRoutes, {
  WHATSAPP_CLOUD_WEBHOOK_PREFIX
} from '../../src/routes/whatsapp-cloud-webhook-routes';
import { processWebhookEvent } from '../../src/lib/stock-whatsapp/webhook/process-event';
import { MAX_MESSAGE_AGE_MS, parseMetaWebhookPayload } from '../../src/lib/stock-whatsapp/webhook/parse-payload';
import { hashSender } from '../../src/lib/stock-whatsapp/sender-hash';

/** Horodatage Meta (secondes) d'un message récent : une minute avant le chargement du fichier. */
const RECENT_SECONDS = Math.floor(Date.now() / 1000) - 60;
const RECENT_TS = String(RECENT_SECONDS);

const CHEF_WA_ID = '2250712345678';
const CHEF_E164 = '+2250712345678';
const UNKNOWN_WA_ID = '2250100000999';
const SECRET = mockEnv.META_WA_APP_SECRET as string;
const VERIFY_TOKEN = mockEnv.META_WA_VERIFY_TOKEN as string;

function buildApp() {
  const app = express();
  app.use(requestLogger);
  app.use(WHATSAPP_CLOUD_WEBHOOK_PREFIX, whatsappCloudWebhookRoutes);
  return app;
}

function sign(raw: string | Buffer): string {
  return `sha256=${crypto.createHmac('sha256', SECRET).update(raw).digest('hex')}`;
}

function messagePayload(
  messages: Array<Record<string, unknown>>,
  options: { phoneNumberId?: string; statuses?: Array<Record<string, unknown>> } = {}
) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '2250700000000',
                phone_number_id: options.phoneNumberId ?? '1234567890'
              },
              contacts: [{ profile: { name: 'Awa Koné' }, wa_id: CHEF_WA_ID }],
              ...(messages.length > 0 ? { messages } : {}),
              ...(options.statuses ? { statuses: options.statuses } : {})
            }
          }
        ]
      }
    ]
  };
}

function textMessage(id: string, from = CHEF_WA_ID, body = 'AIDE') {
  return { from, id, timestamp: RECENT_TS, type: 'text', text: { body } };
}

function imageMessage(id: string, from = CHEF_WA_ID) {
  return {
    from,
    id,
    timestamp: RECENT_TS,
    type: 'image',
    image: { id: 'media-1', mime_type: 'image/jpeg', sha256: 'abc', caption: 'fake:dark' }
  };
}

async function post(body: unknown, signature?: string | null) {
  const raw = JSON.stringify(body);
  const req = request(buildApp())
    .post(`${WHATSAPP_CLOUD_WEBHOOK_PREFIX}/events`)
    .set('Content-Type', 'application/json');
  if (signature !== null) req.set('X-Hub-Signature-256', signature ?? sign(raw));
  return req.send(raw);
}

/** Laisse passer le `setImmediate` du routeur et les promesses du traitement. */
async function flushProcessing() {
  for (let i = 0; i < 10; i += 1) await new Promise(resolve => setImmediate(resolve));
}

function loggedText(): string {
  return JSON.stringify([
    ...(logger.info as jest.Mock).mock.calls,
    ...(logger.warn as jest.Mock).mock.calls,
    ...(logger.error as jest.Mock).mock.calls
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.events = [];
  mockDb.registrations = [{ id: 'reg-1', phoneE164: CHEF_E164, status: 'ACTIVE' }];
  mockDb.failInsert = false;
  mockLimiterState.block = false;
  mockLimiterState.calls = 0;
  mockEnv.NODE_ENV = 'development';
  mockEnv.WHATSAPP_INVENTORY_TRANSPORT = 'meta';
  mockHandleInboundMessage.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// GET — vérification d'abonnement (W6-R3)
// ---------------------------------------------------------------------------

describe('GET /events — vérification d’abonnement', () => {
  it('W6-2 : bon jeton → 200 et le challenge en text/plain ; le journal ne contient ni le jeton ni le challenge', async () => {
    const res = await request(buildApp())
      .get(`${WHATSAPP_CLOUD_WEBHOOK_PREFIX}/events`)
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '1158201444' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.text).toBe('1158201444');
    expect(loggedText()).not.toContain(VERIFY_TOKEN);
    expect(loggedText()).not.toContain('1158201444');
    expect(loggedText()).toContain('[masqué]');
  });

  it('W6-2 : mauvais jeton → 403, corps vide, jeton absent du journal', async () => {
    const res = await request(buildApp())
      .get(`${WHATSAPP_CLOUD_WEBHOOK_PREFIX}/events`)
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'mauvais-jeton-de-verification', 'hub.challenge': '42' });
    expect(res.status).toBe(403);
    expect(res.text).toBe('');
    expect(loggedText()).not.toContain('mauvais-jeton-de-verification');
  });

  it('mode inattendu, challenge absent ou jeton en tableau → 403', async () => {
    const app = buildApp();
    const base = `${WHATSAPP_CLOUD_WEBHOOK_PREFIX}/events`;
    expect(
      (
        await request(app)
          .get(base)
          .query({ 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '1' })
      ).status
    ).toBe(403);
    expect(
      (await request(app).get(base).query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN })).status
    ).toBe(403);
    expect(
      (
        await request(app).get(
          `${base}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1`
        )
      ).status
    ).toBe(403);
  });

  it('W6-R1 : transport autre que meta → 404 pour GET et POST', async () => {
    for (const transport of ['log', 'disabled']) {
      mockEnv.WHATSAPP_INVENTORY_TRANSPORT = transport;
      const get = await request(buildApp())
        .get(`${WHATSAPP_CLOUD_WEBHOOK_PREFIX}/events`)
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '1' });
      expect(get.status).toBe(404);
      const res = await post(messagePayload([textMessage('wamid.404')]));
      expect(res.status).toBe(404);
    }
    expect(mockEventDelegate.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST — signature (W6-R4), limiteur (W6-R5)
// ---------------------------------------------------------------------------

describe('POST /events — signature', () => {
  it('W6-1 : sans X-Hub-Signature-256, en NODE_ENV=development → 401, aucune ligne', async () => {
    mockEnv.NODE_ENV = 'development';
    const res = await post(messagePayload([textMessage('wamid.A')]), null);
    expect(res.status).toBe(401);
    expect(mockEventDelegate.create).not.toHaveBeenCalled();
    expect(mockDb.events).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('W6-1 : signature fausse → 401, aucune ligne, corps absent du journal', async () => {
    const res = await post(
      messagePayload([textMessage('wamid.B', CHEF_WA_ID, 'secret du chef')]),
      `sha256=${'0'.repeat(64)}`
    );
    expect(res.status).toBe(401);
    expect(mockDb.events).toHaveLength(0);
    expect(loggedText()).not.toContain('secret du chef');
    expect(loggedText()).not.toContain(CHEF_WA_ID);
  });

  it('signature d’un autre secret, ou mal formée → 401', async () => {
    const body = JSON.stringify(messagePayload([textMessage('wamid.C')]));
    const other = `sha256=${crypto.createHmac('sha256', 'autre-secret').update(body).digest('hex')}`;
    expect((await post(JSON.parse(body), other)).status).toBe(401);
    expect((await post(JSON.parse(body), 'sha1=abcdef')).status).toBe(401);
    expect(mockDb.events).toHaveLength(0);
  });

  it('HMAC sur les octets bruts : une signature calculée sur un corps re-sérialisé autrement est refusée', async () => {
    const pretty = JSON.stringify(messagePayload([textMessage('wamid.D')]), null, 2);
    const compactSignature = sign(JSON.stringify(JSON.parse(pretty)));
    const res = await request(buildApp())
      .post(`${WHATSAPP_CLOUD_WEBHOOK_PREFIX}/events`)
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', compactSignature)
      .send(pretty);
    expect(res.status).toBe(401);
    expect(mockDb.events).toHaveLength(0);
  });

  it('W6-R5 : le limiteur passe AVANT la signature', async () => {
    mockLimiterState.block = true;
    const res = await post(messagePayload([textMessage('wamid.E')]), null);
    expect(res.status).toBe(429);
    expect(mockLimiterState.calls).toBe(1);
    expect(mockDb.events).toHaveLength(0);
  });

  it('limiteur propre au webhook WhatsApp (clé wa-cloud:, 600/min), distinct de celui de PaySecureHub', async () => {
    const actual = jest.requireActual<typeof import('../../src/middleware/rate-limit-middleware')>(
      '../../src/middleware/rate-limit-middleware'
    );
    const app = express();
    app.use(actual.webhookRateLimiter, (_req, res) => res.status(204).end());
    const waApp = express();
    waApp.use(actual.whatsappCloudWebhookRateLimiter, (_req, res) => res.status(204).end());
    const server = waApp.listen(0);
    try {
      // 130 requêtes : au-delà des 120/min du limiteur partagé, toutes passent.
      for (let i = 0; i < 130; i += 1) expect((await request(server).post('/')).status).toBe(204);
      // Le limiteur partagé garde son propre compteur : il n'a rien vu.
      expect((await request(app).post('/')).status).toBe(204);
      for (let i = 130; i < 600; i += 1) expect((await request(server).post('/')).status).toBe(204);
      expect((await request(server).post('/')).status).toBe(429);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }, 30_000);

  it('corps de plus de 1 Mo → 413, rien n’est écrit', async () => {
    const huge = messagePayload([textMessage('wamid.F', CHEF_WA_ID, 'x'.repeat(1_100_000))]);
    const res = await post(huge);
    expect(res.status).toBe(413);
    expect(mockDb.events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// POST — insertion, accusé, traitement (W6-R6 à R8)
// ---------------------------------------------------------------------------

describe('POST /events — insertion et traitement', () => {
  it('signature juste : événement inséré AVANT la réponse, 200 { received: true }, puis traitement par le moteur', async () => {
    const res = await post(messagePayload([textMessage('wamid.OK', CHEF_WA_ID, 'AIDE')]));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    expect(mockDb.events).toHaveLength(1);
    const inserted = mockEventDelegate.create.mock.calls[0][0].data;
    expect(inserted).toMatchObject({
      kind: 'MESSAGE',
      status: 'RECEIVED',
      metaMessageId: 'wamid.OK',
      messageType: 'text',
      via: 'META',
      senderHash: hashSender(CHEF_E164)
    });
    expect(inserted.senderHash).toMatch(/^[0-9a-f]{64}$/);
    // Minimisation : le nom de profil WhatsApp n'est jamais conservé.
    expect(JSON.stringify(inserted)).not.toContain('Awa Koné');

    await flushProcessing();
    expect(mockHandleInboundMessage).toHaveBeenCalledTimes(1);
    expect(mockHandleInboundMessage.mock.calls[0][0]).toMatchObject({
      metaMessageId: 'wamid.OK',
      fromE164: CHEF_E164,
      via: 'META',
      kind: 'TEXT',
      text: 'AIDE'
    });
    expect(mockHandleInboundMessage.mock.calls[0][0].sentAt).toEqual(new Date(RECENT_SECONDS * 1000));
    expect(mockTransport.markRead).toHaveBeenCalledWith('wamid.OK');

    // W6-R8 : la copie transitoire (numéro compris) est effacée dès le traitement.
    const row = mockDb.events[0];
    expect(row.status).toBe('PROCESSED');
    expect(row.payload).toBeNull();
    expect(row.processedAt).toBeInstanceOf(Date);
    expect(loggedText()).not.toContain(CHEF_WA_ID);
  });

  it('W6-3 : le même message livré deux fois → un seul événement, un seul traitement', async () => {
    const payload = messagePayload([imageMessage('wamid.DUP')]);
    expect((await post(payload)).status).toBe(200);
    expect((await post(payload)).status).toBe(200);
    await flushProcessing();
    expect(mockDb.events.filter(row => row.kind === 'MESSAGE')).toHaveLength(1);
    expect(mockHandleInboundMessage).toHaveBeenCalledTimes(1);
    expect(mockHandleInboundMessage.mock.calls[0][0]).toMatchObject({
      kind: 'IMAGE',
      media: { mediaId: 'media-1', mimeType: 'image/jpeg', providerSha256: 'abc', caption: 'fake:dark' }
    });
  });

  it('W6-4 : un événement statuses → ligne STATUS, aucun message envoyé, aucun traitement', async () => {
    const res = await post(
      messagePayload([], {
        statuses: [{ id: 'wamid.SENT', status: 'delivered', recipient_id: CHEF_WA_ID, timestamp: '1' }]
      })
    );
    expect(res.status).toBe(200);
    await flushProcessing();
    expect(mockDb.events).toHaveLength(1);
    expect(mockDb.events[0]).toMatchObject({
      kind: 'STATUS',
      status: 'IGNORED',
      metaMessageId: 'wamid.SENT',
      deliveryStatus: 'delivered',
      senderHash: null,
      payload: null
    });
    expect(mockTransport.send).not.toHaveBeenCalled();
    expect(mockHandleInboundMessage).not.toHaveBeenCalled();
  });

  it('numéro d’une autre ligne Meta (phone_number_id) → ignoré, 200, rien n’est écrit', async () => {
    const res = await post(messagePayload([textMessage('wamid.OTHER')], { phoneNumberId: '999999' }));
    expect(res.status).toBe(200);
    await flushProcessing();
    expect(mockDb.events).toHaveLength(0);
    expect(mockHandleInboundMessage).not.toHaveBeenCalled();
  });

  it('erreur de base à l’insertion → 500 (Meta renverra), aucun traitement', async () => {
    mockDb.failInsert = true;
    const app = buildApp();
    app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      res.status(500).end();
    });
    const raw = JSON.stringify(messagePayload([textMessage('wamid.DB')]));
    const res = await request(app)
      .post(`${WHATSAPP_CLOUD_WEBHOOK_PREFIX}/events`)
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(raw))
      .send(raw);
    expect(res.status).toBe(500);
    await flushProcessing();
    expect(mockHandleInboundMessage).not.toHaveBeenCalled();
  });

  it('rejeu : message dont l’horodatage Meta a plus de 7 jours → 200, ignoré, rien n’est écrit, journal sans numéro', async () => {
    const old = String(Math.floor((Date.now() - MAX_MESSAGE_AGE_MS) / 1000) - 3600);
    const res = await post(messagePayload([{ ...textMessage('wamid.OLD'), timestamp: old }]));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    await flushProcessing();
    expect(mockDb.events).toHaveLength(0);
    expect(mockHandleInboundMessage).not.toHaveBeenCalled();
    expect(mockTransport.markRead).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('trop anciens'), { staleMessages: 1 });
    expect(loggedText()).not.toContain(CHEF_WA_ID);
    expect(loggedText()).not.toContain(CHEF_E164);
  });

  it('plusieurs messages d’un même corps : traités un par un, dans l’ordre', async () => {
    const order: string[] = [];
    mockHandleInboundMessage.mockImplementation(async (message: { metaMessageId: string }) => {
      order.push(`début ${message.metaMessageId}`);
      await new Promise(resolve => setImmediate(resolve));
      order.push(`fin ${message.metaMessageId}`);
    });
    await post(messagePayload([textMessage('wamid.1'), textMessage('wamid.2')]));
    await flushProcessing();
    await flushProcessing();
    expect(order).toEqual(['début wamid.1', 'fin wamid.1', 'début wamid.2', 'fin wamid.2']);
  });
});

// ---------------------------------------------------------------------------
// Reprise (W6-R7) — appelée par la tâche (W3)
// ---------------------------------------------------------------------------

describe('processWebhookEvent — reprise', () => {
  async function insertWithoutProcessing(id: string) {
    const parsed = parseMetaWebhookPayload(messagePayload([textMessage(id)]), {
      phoneNumberId: '1234567890',
      receivedAt: new Date()
    });
    const { recordWebhookEvents } = await import('../../src/lib/stock-whatsapp/webhook/record-event');
    const recorded = await recordWebhookEvents(parsed, new Date());
    return recorded.eventIds[0];
  }

  it('W6-8 : arrêt simulé après l’insertion → la tâche le traite au passage suivant, une seule fois', async () => {
    const eventId = await insertWithoutProcessing('wamid.CRASH');
    expect(mockDb.events[0].status).toBe('RECEIVED');

    await processWebhookEvent(eventId);
    await processWebhookEvent(eventId);

    expect(mockHandleInboundMessage).toHaveBeenCalledTimes(1);
    expect(mockDb.events[0]).toMatchObject({ status: 'PROCESSED', attempts: 1, payload: null });
  });

  it('PROCESSING abandonné depuis plus de 5 minutes : repris ; depuis moins : laissé', async () => {
    const eventId = await insertWithoutProcessing('wamid.STALE');
    const row = mockDb.events[0];
    row.status = 'PROCESSING';
    row.attempts = 1;
    row.claimedAt = new Date(Date.now() - 60 * 1000);
    await processWebhookEvent(eventId);
    expect(mockHandleInboundMessage).not.toHaveBeenCalled();

    row.claimedAt = new Date(Date.now() - 6 * 60 * 1000);
    await processWebhookEvent(eventId);
    expect(mockHandleInboundMessage).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ status: 'PROCESSED', attempts: 2 });
  });

  it('trois tentatives épuisées → FAILED, copie effacée, moteur non appelé', async () => {
    const eventId = await insertWithoutProcessing('wamid.EXHAUSTED');
    const row = mockDb.events[0];
    row.status = 'PROCESSING';
    row.attempts = 3;
    row.claimedAt = new Date(Date.now() - 10 * 60 * 1000);
    await processWebhookEvent(eventId);
    expect(mockHandleInboundMessage).not.toHaveBeenCalled();
    expect(row).toMatchObject({ status: 'FAILED', payload: null });
  });

  it('le moteur lève (ce qu’il ne doit pas faire) : l’événement reste PROCESSING pour la reprise, sans lever', async () => {
    mockHandleInboundMessage.mockRejectedValueOnce(new Error('panne'));
    const eventId = await insertWithoutProcessing('wamid.THROW');
    await expect(processWebhookEvent(eventId)).resolves.toBeUndefined();
    expect(mockDb.events[0].status).toBe('PROCESSING');
    expect(mockDb.events[0].error).toContain('moteur');
  });
});

// ---------------------------------------------------------------------------
// Numéro inconnu (W7-R1)
// ---------------------------------------------------------------------------

describe('numéro inconnu (W7-R1)', () => {
  beforeEach(() => {
    mockDb.registrations = [];
  });

  it('W7-1 et W7-2 : trois messages en une heure → une seule réponse M01 ; 25 heures plus tard → une nouvelle', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    const start = new Date('2026-10-04T08:00:00Z');
    jest.setSystemTime(start);

    for (const [index, minutes] of [0, 20, 50].entries()) {
      jest.setSystemTime(new Date(start.getTime() + minutes * 60 * 1000));
      expect((await post(messagePayload([textMessage(`wamid.U${index}`, UNKNOWN_WA_ID, 'Bonjour')]))).status).toBe(200);
      await flushProcessing();
    }
    expect(mockTransport.send).toHaveBeenCalledTimes(1);
    expect(mockTransport.send).toHaveBeenCalledWith({
      toE164: '+2250100000999',
      message: { kind: 'TEXT', text: 'M01' },
      log: null
    });

    jest.setSystemTime(new Date(start.getTime() + 25 * 60 * 60 * 1000));
    await post(messagePayload([textMessage('wamid.U-LATER', UNKNOWN_WA_ID, 'Bonjour')]));
    await flushProcessing();
    expect(mockTransport.send).toHaveBeenCalledTimes(2);

    // Aucun traitement par le moteur, aucune session ; copies effacées ; empreinte seulement.
    expect(mockHandleInboundMessage).not.toHaveBeenCalled();
    for (const row of mockDb.events) {
      expect(row.status).toBe('PROCESSED');
      expect(row.payload).toBeNull();
      expect(row.senderHash).toBe(hashSender('+2250100000999'));
    }
    expect(mockDb.events.filter(row => row.unknownReplySentAt !== null)).toHaveLength(2);
    // La décision se prend sous un verrou consultatif de l'empreinte.
    expect(mockExecuteRaw).toHaveBeenCalled();
    expect(loggedText()).not.toContain(UNKNOWN_WA_ID);
  });

  it('W7-3 : une photo d’un inconnu → aucun appel à fetchMedia, aucun traitement', async () => {
    await post(messagePayload([imageMessage('wamid.UIMG', UNKNOWN_WA_ID)]));
    await flushProcessing();
    expect(mockTransport.fetchMedia).not.toHaveBeenCalled();
    expect(mockHandleInboundMessage).not.toHaveBeenCalled();
    expect(mockTransport.send).toHaveBeenCalledTimes(1);
  });

  it('inscription révoquée ou en attente → moteur (M06 ou M05 côté W3), jamais M01', async () => {
    mockDb.registrations = [{ id: 'reg-revoked', phoneE164: CHEF_E164, status: 'REVOKED' }];
    await post(messagePayload([textMessage('wamid.R1')]));
    await flushProcessing();
    expect(mockHandleInboundMessage).toHaveBeenCalledTimes(1);

    mockDb.registrations = [{ id: 'reg-pending', phoneE164: CHEF_E164, status: 'PENDING_ACTIVATION' }];
    await post(messagePayload([textMessage('wamid.R2')]));
    await flushProcessing();
    expect(mockHandleInboundMessage).toHaveBeenCalledTimes(2);
    expect(mockTransport.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Lecture du corps (W6-R6)
// ---------------------------------------------------------------------------

describe('parseMetaWebhookPayload (W6-R6)', () => {
  const receivedAt = new Date();
  const parse = (messages: Array<Record<string, unknown>>) =>
    parseMetaWebhookPayload(messagePayload(messages), { phoneNumberId: '1234567890', receivedAt }).messages.map(
      event => event.message
    );

  it('réponses de bouton et de liste → REPLY avec le contexte', () => {
    const [button, list] = parse([
      {
        from: CHEF_WA_ID,
        id: 'wamid.BTN',
        timestamp: RECENT_TS,
        type: 'interactive',
        context: { from: '2250700000000', id: 'wamid.PROPOSITION' },
        interactive: { type: 'button_reply', button_reply: { id: 'confirm:c1', title: 'Valider' } }
      },
      {
        from: CHEF_WA_ID,
        id: 'wamid.LIST',
        timestamp: RECENT_TS,
        type: 'interactive',
        interactive: { type: 'list_reply', list_reply: { id: 'site:s1', title: 'Résidence', description: 'x' } }
      }
    ]);
    expect(button).toMatchObject({
      kind: 'REPLY',
      replyId: 'confirm:c1',
      replyTitle: 'Valider',
      contextMessageId: 'wamid.PROPOSITION'
    });
    expect(list).toMatchObject({ kind: 'REPLY', replyId: 'site:s1', contextMessageId: null });
  });

  it('W4-R8 : document image → IMAGE ; document PDF, audio, autocollant → UNSUPPORTED', () => {
    const [docImage, docPdf, audio, sticker] = parse([
      {
        from: CHEF_WA_ID,
        id: 'w1',
        timestamp: RECENT_TS,
        type: 'document',
        document: { id: 'm1', mime_type: 'image/png', filename: 'a.png' }
      },
      {
        from: CHEF_WA_ID,
        id: 'w2',
        timestamp: RECENT_TS,
        type: 'document',
        document: { id: 'm2', mime_type: 'application/pdf' }
      },
      { from: CHEF_WA_ID, id: 'w3', timestamp: RECENT_TS, type: 'audio', audio: { id: 'm3', mime_type: 'audio/ogg' } },
      { from: CHEF_WA_ID, id: 'w4', timestamp: RECENT_TS, type: 'sticker', sticker: { id: 'm4' } }
    ]);
    expect(docImage).toMatchObject({ kind: 'IMAGE', media: { mediaId: 'm1', mimeType: 'image/png', caption: null } });
    expect(docPdf).toMatchObject({ kind: 'UNSUPPORTED', originalType: 'document' });
    expect(audio).toMatchObject({ kind: 'UNSUPPORTED', originalType: 'audio' });
    expect(sticker).toMatchObject({ kind: 'UNSUPPORTED', originalType: 'sticker' });
  });

  it('message sans identifiant ou expéditeur illisible : sauté et compté ; horodatage illisible : heure de réception', () => {
    const parsed = parseMetaWebhookPayload(
      messagePayload([
        { from: CHEF_WA_ID, type: 'text', text: { body: 'x' } },
        { from: '+225 07', id: 'w5', type: 'text', text: { body: 'x' } },
        { from: CHEF_WA_ID, id: 'w6', timestamp: 'pas-un-nombre', type: 'text', text: { body: 'x' } }
      ]),
      { phoneNumberId: '1234567890', receivedAt }
    );
    expect(parsed.invalidMessages).toBe(2);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].message.sentAt).toEqual(receivedAt);
  });

  it('rejeu : horodatage de plus de 7 jours → ignoré et compté ; juste sous 7 jours ou dans le futur → gardé', () => {
    const seconds = (offsetMs: number) => String(Math.floor((receivedAt.getTime() + offsetMs) / 1000));
    const parsed = parseMetaWebhookPayload(
      messagePayload([
        { ...textMessage('w-old'), timestamp: seconds(-MAX_MESSAGE_AGE_MS - 1000) },
        { ...textMessage('w-limit'), timestamp: seconds(-MAX_MESSAGE_AGE_MS + 1000) },
        { ...textMessage('w-future'), timestamp: seconds(60_000) }
      ]),
      { phoneNumberId: '1234567890', receivedAt }
    );
    expect(MAX_MESSAGE_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parsed.staleMessages).toBe(1);
    expect(parsed.invalidMessages).toBe(0);
    expect(parsed.messages.map(event => event.message.metaMessageId)).toEqual(['w-limit', 'w-future']);
  });

  it('objet ou champ inattendu : rien', () => {
    expect(
      parseMetaWebhookPayload({ object: 'page', entry: [] }, { phoneNumberId: '1', receivedAt }).messages
    ).toHaveLength(0);
    const otherField = {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'account_update', value: {} }] }]
    };
    const parsed = parseMetaWebhookPayload(otherField, { phoneNumberId: '1234567890', receivedAt });
    expect(parsed.messages).toHaveLength(0);
    expect(parsed.ignoredChanges).toBe(1);
  });
});
