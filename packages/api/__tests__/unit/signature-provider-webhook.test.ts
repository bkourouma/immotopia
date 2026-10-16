/**
 * Webhook du prestataire de signature (spec 044, lot S6) : signature vérifiée sur
 * le corps brut, 404 si le fournisseur actif n'est pas externe, état RELU chez
 * le prestataire (jamais le corps), réconciliation idempotente, réponses
 * uniformes. Base, prestataire et scellement sont simulés : aucun réseau.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

type Row = Record<string, any>;

jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/middleware/rate-limit-middleware', () => ({
  signatureProviderWebhookRateLimiter: (_req: Request, _res: Response, next: NextFunction) => next()
}));

const local: { req: Row | null; signers: Row[] } = { req: null, signers: [] };
const prismaMock: Row = {
  signatureRequest: {
    findFirst: jest.fn(async ({ where }: Row) => {
      if (!local.req) return null;
      if (where.providerRef && where.providerRef !== local.req.providerRef) return null;
      return { ...local.req, signers: local.signers };
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      if (!local.req) return { count: 0 };
      const statuses: string[] | undefined = where.status?.in ?? (where.status ? [where.status] : undefined);
      if (statuses && !statuses.includes(local.req.status)) return { count: 0 };
      Object.assign(local.req, data);
      return { count: 1 };
    })
  },
  signatureSigner: {
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const signer = local.signers.find(s => s.id === where.id);
      if (!signer || !where.status.in.includes(signer.status)) return { count: 0 };
      Object.assign(signer, data);
      return { count: 1 };
    }),
    count: jest.fn(async () => local.signers.filter(s => s.status !== 'SIGNED').length)
  },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/services/audit-service', () => ({
  AuditActionKey: jest.requireActual('../../src/types/audit-types').AuditActionKey,
  recordAuditEvent: jest.fn(async () => undefined)
}));
const events: Row[] = [];
jest.mock('../../src/lib/signature/events', () => ({
  appendSignatureEvent: jest.fn(async (_tx: unknown, input: Row) => {
    events.push(input);
  }),
  listChainedEvents: jest.fn(async () => [
    { type: 'CREATED', payload: { providerSignerRefs: ['sg-a', 'sg-b'] } },
    ...events
  ])
}));
jest.mock('../../src/lib/signature/notify', () => ({
  languageOf: () => 'fr',
  notifyIssuer: jest.fn(async () => undefined)
}));
const cancelRequestInternal = jest.fn(async (..._args: unknown[]) => true);
jest.mock('../../src/lib/signature/cancel', () => ({
  cancelRequestInternal: (...args: unknown[]) => cancelRequestInternal(...args)
}));
const sealRequest = jest.fn(async (..._args: unknown[]) => 'SEALED');
jest.mock('../../src/lib/signature/sealing', () => ({ sealRequest: (...args: unknown[]) => sealRequest(...args) }));

const client = {
  id: 'yousign',
  verifyWebhook: jest.fn(),
  parseWebhook: jest.fn(),
  getSnapshot: jest.fn()
};
const providerState: { current: Row | null } = { current: null };
jest.mock('../../src/lib/signature/provider', () => ({
  getSignatureProvider: () => {
    if (!providerState.current) throw new Error('config');
    return providerState.current;
  }
}));

import { errorHandler } from '../../src/middleware/error-middleware';
import { logger } from '../../src/utils/logger';
import router from '../../src/routes/signature-provider-webhook-routes';
import { PUBLIC_SIGNATURE_PROVIDER_PREFIX } from '../../src/routes/signature-provider-webhook-routes';

const app = express();
app.use(PUBLIC_SIGNATURE_PROVIDER_PREFIX, router);
app.use(errorHandler);
const URL = `${PUBLIC_SIGNATURE_PROVIDER_PREFIX}/yousign`;
const post = (body: string | Buffer = '{"event_name":"signer.done"}') =>
  request(app).post(URL).set('Content-Type', 'application/json').send(body);

const snapshot = (state: string, a: string, b: string) => ({
  ref: 'ys-1',
  state,
  signers: [
    { ref: 'sg-a', state: a, signedAt: new Date('2026-10-16T08:00:00Z') },
    { ref: 'sg-b', state: b, signedAt: b === 'SIGNED' ? new Date('2026-10-16T08:05:00Z') : null }
  ]
});

beforeEach(() => {
  jest.clearAllMocks();
  events.length = 0;
  providerState.current = { id: 'yousign', external: client };
  local.req = {
    id: 'r1',
    tenantId: 't1',
    status: 'SENT',
    title: 'Compromis',
    language: 'fr',
    createdByUserId: 'u1',
    providerId: 'yousign',
    providerRef: 'ys-1'
  };
  local.signers = [
    { id: 's0', position: 0, status: 'PENDING', role: 'VENDEUR' },
    { id: 's1', position: 1, status: 'PENDING', role: 'ACHETEUR' }
  ];
  client.verifyWebhook.mockReturnValue(true);
  client.parseWebhook.mockReturnValue({ eventId: 'e1', eventName: 'signer.done', ref: 'ys-1' });
  client.getSnapshot.mockResolvedValue(snapshot('ONGOING', 'SIGNED', 'PENDING'));
});

describe('authentification et routage', () => {
  it('401 corps vide si le fournisseur actif n’est pas externe', async () => {
    providerState.current = { id: 'internal' };
    const res = await post();
    expect(res.status).toBe(401);
    expect(res.text).toBe('');
    expect(client.verifyWebhook).not.toHaveBeenCalled();
  });

  it('401 si la configuration du prestataire est incomplète', async () => {
    providerState.current = null;
    expect((await post()).status).toBe(401);
  });

  it('signature invalide ou secret absent : 401 vide, rien relu, journal sans corps', async () => {
    client.verifyWebhook.mockReturnValue(false);
    const res = await post('{"secret":"ne-pas-journaliser"}');
    expect(res.status).toBe(401);
    expect(res.text).toBe('');
    expect(client.getSnapshot).not.toHaveBeenCalled();
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain('ne-pas-journaliser');
  });

  it('en-têtes et corps brut transmis à la vérification', async () => {
    await request(app)
      .post(URL)
      .set('Content-Type', 'application/json')
      .set('X-Yousign-Signature-256', 'sha256=abc')
      .send('{"a":1}');
    const [raw, headers] = client.verifyWebhook.mock.calls[0];
    expect(Buffer.isBuffer(raw)).toBe(true);
    expect(raw.toString()).toBe('{"a":1}');
    expect(headers['x-yousign-signature-256']).toBe('sha256=abc');
  });

  it('corps trop gros : 413 sans vérification', async () => {
    const res = await post(Buffer.alloc(300 * 1024, 'a'));
    expect(res.status).toBe(413);
    expect(client.verifyWebhook).not.toHaveBeenCalled();
  });

  it('signé mais illisible : 200 sans effet', async () => {
    client.parseWebhook.mockReturnValue(null);
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(client.getSnapshot).not.toHaveBeenCalled();
  });

  it('demande inconnue : 200 uniforme, aucun effet', async () => {
    local.req = null;
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(client.getSnapshot).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });
});

describe('réconciliation depuis l’état relu chez le prestataire', () => {
  it('relit l’état chez le prestataire, jamais le corps : un signataire signé passe SIGNED', async () => {
    const res = await post('{"event_name":"signer.done","signer":"sg-b","status":"done"}');
    expect(res.status).toBe(200);
    expect(client.getSnapshot).toHaveBeenCalledWith('ys-1');
    expect(local.signers[0]).toMatchObject({ status: 'SIGNED', signatureMode: 'PROVIDER' });
    expect(local.signers[1].status).toBe('PENDING');
    expect(local.req?.status).toBe('PARTIALLY_SIGNED');
    expect(events).toEqual([
      expect.objectContaining({ type: 'SIGNED', signerId: 's0', payload: { provider: 'yousign', mode: 'PROVIDER' } })
    ]);
    expect(sealRequest).not.toHaveBeenCalled();
  });

  it('rejeu du même événement : aucun doublon d’événement', async () => {
    await post();
    await post();
    expect(events.filter(e => e.type === 'SIGNED')).toHaveLength(1);
  });

  it('un corps qui prétend « terminé » ne suffit pas si le prestataire dit ONGOING', async () => {
    client.getSnapshot.mockResolvedValue(snapshot('ONGOING', 'PENDING', 'PENDING'));
    await post('{"event_name":"signature_request.done"}');
    expect(local.signers.every(s => s.status === 'PENDING')).toBe(true);
    expect(sealRequest).not.toHaveBeenCalled();
  });

  it('DONE et tous signés : scelle (fin de signature externe)', async () => {
    client.getSnapshot.mockResolvedValue(snapshot('DONE', 'SIGNED', 'SIGNED'));
    const res = await post();
    expect(res.status).toBe(200);
    expect(local.signers.every(s => s.status === 'SIGNED')).toBe(true);
    expect(events.filter(e => e.type === 'SIGNED')).toHaveLength(2);
    expect(sealRequest).toHaveBeenCalledWith('t1', 'r1');
  });

  it('DECLINED : signataire et demande refusés, événement DECLINED', async () => {
    client.getSnapshot.mockResolvedValue(snapshot('DECLINED', 'PENDING', 'DECLINED'));
    await post();
    expect(local.signers[1].status).toBe('DECLINED');
    expect(local.req?.status).toBe('DECLINED');
    expect(events).toEqual([expect.objectContaining({ type: 'DECLINED', signerId: 's1' })]);
    await post();
    expect(events.filter(e => e.type === 'DECLINED')).toHaveLength(1);
  });

  it('EXPIRED chez le prestataire : demande EXPIRED, un seul événement', async () => {
    client.getSnapshot.mockResolvedValue(snapshot('EXPIRED', 'PENDING', 'PENDING'));
    await post();
    await post();
    expect(local.req?.status).toBe('EXPIRED');
    expect(events.filter(e => e.type === 'EXPIRED')).toHaveLength(1);
  });

  it('CANCELED chez le prestataire : annulation locale', async () => {
    client.getSnapshot.mockResolvedValue(snapshot('CANCELED', 'PENDING', 'PENDING'));
    await post();
    expect(cancelRequestInternal).toHaveBeenCalledWith({ tenantId: 't1', userId: null }, 'r1', 'USER');
  });

  it('demande déjà terminée localement : aucun effet', async () => {
    local.req!.status = 'COMPLETED';
    client.getSnapshot.mockResolvedValue(snapshot('DONE', 'SIGNED', 'SIGNED'));
    const res = await post();
    expect(res.status).toBe(200);
    expect(events).toHaveLength(0);
    expect(sealRequest).not.toHaveBeenCalled();
  });

  it('erreur du prestataire à la relecture : 500 pour qu’il réessaie, sans détail', async () => {
    client.getSnapshot.mockRejectedValue(new Error('NETWORK secret-detail'));
    const res = await post();
    expect(res.status).toBe(500);
    expect(res.text).not.toContain('secret-detail');
  });
});
