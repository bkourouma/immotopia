import express from 'express';
import request from 'supertest';

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  enforcePropertyTenantIsolation: (_req: any, _res: any, next: any) => next()
}));

jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requireAnyPropertyPermission: () => (_req: any, _res: any, next: any) => next(),
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));

const TENANT_ID = 'tenant-1';
const TENANT_OTHER_ID = 'tenant-2';
const SYNDIC_ID = '11111111-1111-4111-8111-111111111111';
const SYNDIC_OTHER_ID = '99999999-9999-4999-8999-999999999999';
const MEETING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RESOLUTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type Resolution = {
  id: string;
  title: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  sharesFor: number;
  result: 'PENDING' | 'APPROVED' | 'REJECTED';
};

type Meeting = {
  id: string;
  tenantId: string;
  syndicateId: string;
  type: 'ORDINARY' | 'EXTRAORDINARY';
  scheduledAt: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  quorum: number;
  resolutions: Resolution[];
  syndicate: { lots: Array<{ id: string; lotNumber: string; generalShares: number }> };
};

const PROXY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const store = {
  meetings: new Map<string, Meeting>(),
  proxies: [] as Array<Record<string, unknown>>
};

jest.mock('../../src/lib/syndics/queries', () => ({
  listSyndicatesByTenant: jest.fn(),
  getSyndicateWithLotsAndStats: jest.fn(),
  createSyndicateWithDefaults: jest.fn(),
  createSyndicateLot: jest.fn(),
  updateSyndicateLotByTenant: jest.fn(),
  updateSyndicateByTenant: jest.fn(),
  deleteEmptySyndicateByTenant: jest.fn(),
  listChargeCallsBySyndicate: jest.fn(),
  getChargeCallByTenant: jest.fn(),
  createChargeCallAndUpdateStatus: jest.fn(),
  recordChargePaymentWithStatusUpdate: jest.fn(),
  listServiceProvidersBySyndicate: jest.fn(),
  listMaintenanceContractsBySyndicate: jest.fn(),
  createMaintenanceContract: jest.fn(),
  getMaintenanceContractByTenant: jest.fn(),
  updateMaintenanceContractByTenant: jest.fn(),
  deleteMaintenanceContractByTenant: jest.fn(),
  listDocumentsBySyndicate: jest.fn(),
  getFinanceSummaryBySyndicate: jest.fn(),
  listCommonAssetsBySyndicate: jest.fn(),
  listMeetingsBySyndicate: jest.fn(async (tenantId: string, syndicateId: string) =>
    Array.from(store.meetings.values()).filter(
      meeting => meeting.tenantId === tenantId && meeting.syndicateId === syndicateId
    )
  ),
  getMeetingByTenant: jest.fn(async (tenantId: string, syndicateId: string, meetingId: string) => {
    const meeting = store.meetings.get(meetingId);
    if (!meeting) return null;
    if (meeting.tenantId !== tenantId || meeting.syndicateId !== syndicateId) return null;
    return meeting;
  }),
  addResolutionToMeeting: jest.fn(async (tenantId: string, syndicateId: string, data: any) => {
    const meeting = Array.from(store.meetings.values()).find(
      m => m.id === data.meetingId && m.tenantId === tenantId && m.syndicateId === syndicateId
    );
    if (!meeting) {
      const err: any = new Error('Assemblee generale introuvable ou inaccessible');
      err.status = 404;
      throw err;
    }
    const resolution: Resolution = {
      id: RESOLUTION_ID,
      title: data.title,
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      sharesFor: 0,
      result: 'PENDING'
    };
    meeting.resolutions.push(resolution);
    return resolution;
  }),
  deleteResolutionFromMeeting: jest.fn(
    async (_tenantId: string, _syndicateId: string, _meetingId: string, resolutionId: string) => ({ id: resolutionId })
  ),
  castVoteAndRecomputeResolutionCounters: jest.fn(
    async (tenantId: string, syndicateId: string, resolutionId: string, lotId: string, vote: string) => {
      const meeting = Array.from(store.meetings.values()).find(
        m => m.tenantId === tenantId && m.syndicateId === syndicateId
      );
      if (!meeting) {
        const err: any = new Error('Assemblee generale introuvable ou inaccessible');
        err.status = 404;
        throw err;
      }
      const resolution = meeting.resolutions.find(item => item.id === resolutionId);
      if (!resolution) {
        const err: any = new Error('Resolution introuvable ou inaccessible');
        err.status = 404;
        throw err;
      }
      if (lotId !== LOT_ID) {
        const err: any = new Error('Lot introuvable ou inaccessible');
        err.status = 404;
        throw err;
      }
      if (vote === 'FOR') resolution.votesFor += 1;
      if (vote === 'AGAINST') resolution.votesAgainst += 1;
      if (vote === 'ABSTAIN') resolution.votesAbstain += 1;
      resolution.sharesFor = resolution.votesFor * 100;
      meeting.quorum = 100;
      resolution.result = resolution.votesFor > resolution.votesAgainst ? 'APPROVED' : 'PENDING';
      return meeting;
    }
  ),
  updateMeetingByTenant: jest.fn(async (tenantId: string, syndicateId: string, meetingId: string, data: any) => {
    const meeting = store.meetings.get(meetingId);
    if (!meeting || meeting.tenantId !== tenantId || meeting.syndicateId !== syndicateId) {
      const err: any = new Error('Assemblee generale introuvable ou inaccessible');
      err.status = 404;
      throw err;
    }
    if (data.status === 'COMPLETED' && meeting.status !== 'IN_PROGRESS') {
      const err: any = new Error("La seance doit etre ouverte avant d'etre cloturee");
      err.status = 409;
      throw err;
    }
    if (data.status) meeting.status = data.status;
    return meeting;
  }),
  listMeetingProxiesByTenant: jest.fn(async () => store.proxies),
  createMeetingProxyByTenant: jest.fn(async (_tenantId: string, _syndicateId: string, data: any) => {
    if (data.grantorContactId === data.representativeContactId) {
      const err: any = new Error('Le mandataire ne peut pas etre le mandant');
      err.status = 422;
      throw err;
    }
    const proxy = { id: PROXY_ID, ...data };
    store.proxies.push(proxy);
    return proxy;
  }),
  deleteMeetingProxyByTenant: jest.fn(
    async (_tenantId: string, _syndicateId: string, _meetingId: string, proxyId: string) => {
      const index = store.proxies.findIndex(proxy => proxy.id === proxyId);
      if (index === -1) {
        const err: any = new Error('Pouvoir introuvable ou inaccessible');
        err.status = 404;
        throw err;
      }
      return store.proxies.splice(index, 1)[0];
    }
  )
}));

jest.mock('../../src/lib/syndics/meeting-writes', () => ({
  ...jest.requireActual('../../src/lib/syndics/meeting-writes'),
  createMeetingForTenant: jest.fn(async (tenantId: string, data: any) => {
    const created: Meeting = {
      id: MEETING_ID,
      tenantId,
      syndicateId: data.syndicateId,
      type: data.type,
      scheduledAt: data.scheduledAt.toISOString(),
      status: 'PLANNED',
      quorum: 0,
      resolutions: [],
      syndicate: { lots: [{ id: LOT_ID, lotNumber: 'A-01', generalShares: 100 }] }
    };
    store.meetings.set(created.id, created);
    return created;
  })
}));

const mockConvocationSent = jest.fn(async (..._args: unknown[]) => false);
jest.mock('../../src/lib/syndics/meeting-convocation-status', () => ({
  hasMeetingConvocationBeenSent: (...args: unknown[]) => mockConvocationSent(...args)
}));

jest.mock('../../src/lib/syndics/notifications', () => ({
  notifyChargeCall: jest.fn(),
  notifyMeetingConvocation: jest.fn().mockResolvedValue({ emailSent: 1, whatsappSent: 0 })
}));

import { notifyMeetingConvocation } from '../../src/lib/syndics/notifications';
import { createMeetingForTenant } from '../../src/lib/syndics/meeting-writes';
import { meetingCreationIdempotencyStore, meetingResolutionIdempotencyStore } from '../../src/utils/idempotency';
import { addResolutionToMeeting } from '../../src/lib/syndics/queries';
import syndicRoutes from '../../src/routes/syndic-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const flushBackground = () => new Promise<void>(resolve => setImmediate(() => setImmediate(resolve)));

describe('Syndics meetings routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', syndicRoutes);
  // Sans ce middleware, une erreur typee (throw + asyncHandler) tombe sur le
  // gestionnaire par defaut d'Express : corps JSON vide, statut potentiellement
  // errone. Voir __tests__/api/syndics.accounting.characterization.test.ts.
  app.use(errorHandler);

  beforeEach(() => {
    (notifyMeetingConvocation as jest.Mock).mockClear();
    (createMeetingForTenant as jest.Mock).mockClear();
    meetingCreationIdempotencyStore.clear();
    meetingResolutionIdempotencyStore.clear();
    (addResolutionToMeeting as jest.Mock).mockClear();
    mockConvocationSent.mockClear();
    mockConvocationSent.mockResolvedValue(false);
    store.meetings.clear();
    store.proxies = [];
    store.meetings.set('other-tenant-meeting', {
      id: 'other-tenant-meeting',
      tenantId: TENANT_OTHER_ID,
      syndicateId: SYNDIC_OTHER_ID,
      type: 'ORDINARY',
      scheduledAt: new Date('2026-06-20T09:00:00.000Z').toISOString(),
      status: 'PLANNED',
      quorum: 0,
      resolutions: [],
      syndicate: { lots: [{ id: LOT_ID, lotNumber: 'A-01', generalShares: 100 }] }
    });
  });

  it('creates a meeting and returns PLANNED status', async () => {
    const response = await request(app).post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees`).send({
      type: 'ORDINARY',
      scheduledAt: '2026-06-20T09:00:00.000Z',
      location: 'Salle commune'
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('PLANNED');
    expect(response.body.data.id).toBe(MEETING_ID);
    // Decision metier QA2 : sans `sendConvocation`, aucune convocation ne part a la creation.
    expect(response.body.convocation).toEqual({ status: 'NOT_SENT' });
    await flushBackground();
    expect(notifyMeetingConvocation).not.toHaveBeenCalled();
    // Le drapeau n'est jamais transmis a la creation en base.
    expect((createMeetingForTenant as jest.Mock).mock.calls[0][1]).not.toHaveProperty('sendConvocation');
  });

  it('plans the convocation after the response only when sendConvocation is true', async () => {
    const response = await request(app).post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees`).send({
      type: 'ORDINARY',
      scheduledAt: '2026-06-20T09:00:00.000Z',
      sendConvocation: true
    });

    expect(response.status).toBe(201);
    // La reponse porte l'AG creee ; la convocation part APRES la reponse (anomalie 3 : 503 + doublon).
    expect(response.body.data.id).toBe(MEETING_ID);
    expect(response.body.convocation).toEqual({ status: 'SENDING' });
    await flushBackground();
    expect(notifyMeetingConvocation).toHaveBeenCalledWith(MEETING_ID);
    expect((createMeetingForTenant as jest.Mock).mock.calls[0][1]).not.toHaveProperty('sendConvocation');
  });

  it('rejects a non boolean sendConvocation with 400', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees`)
      .send({ type: 'ORDINARY', scheduledAt: '2026-06-20T09:00:00.000Z', sendConvocation: 'oui' });
    expect(response.status).toBe(400);
    expect(createMeetingForTenant).not.toHaveBeenCalled();
  });

  it('exposes convocationSent on the meeting detail (false then true)', async () => {
    await request(app).post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees`).send({
      type: 'ORDINARY',
      scheduledAt: '2026-06-20T09:00:00.000Z'
    });
    const detailUrl = `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees/${MEETING_ID}`;
    const before = await request(app).get(detailUrl);
    expect(before.status).toBe(200);
    expect(before.body.data.convocationSent).toBe(false);
    expect(mockConvocationSent).toHaveBeenCalledWith(TENANT_ID, MEETING_ID);

    mockConvocationSent.mockResolvedValue(true);
    const after = await request(app).get(detailUrl);
    expect(after.body.data.convocationSent).toBe(true);
  });

  it('answers immediately even when the convocation is slow, and never fails because of it', async () => {
    let release!: () => void;
    (notifyMeetingConvocation as jest.Mock).mockImplementationOnce(
      () => new Promise(resolve => (release = () => resolve({ emailSent: 30 })))
    );
    const response = await request(app).post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees`).send({
      type: 'ORDINARY',
      scheduledAt: '2026-06-20T09:00:00.000Z',
      sendConvocation: true
    });
    expect(response.status).toBe(201);
    await flushBackground();
    expect(notifyMeetingConvocation).toHaveBeenCalledTimes(1);
    release();
  });

  it('keeps the meeting (201) when the convocation fails in background', async () => {
    (notifyMeetingConvocation as jest.Mock).mockRejectedValueOnce(new Error('SMTP down'));
    const response = await request(app).post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees`).send({
      type: 'ORDINARY',
      scheduledAt: '2026-06-20T09:00:00.000Z',
      sendConvocation: true
    });
    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(MEETING_ID);
    await flushBackground();
    expect(notifyMeetingConvocation).toHaveBeenCalledTimes(1);
  });

  it('replays the same meeting for the same Idempotency-Key instead of creating a duplicate', async () => {
    const url = `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees`;
    const body = { type: 'ORDINARY', scheduledAt: '2026-06-20T09:00:00.000Z', sendConvocation: true };
    const first = await request(app).post(url).set('Idempotency-Key', 'key-1').send(body);
    const retry = await request(app).post(url).set('Idempotency-Key', 'key-1').send(body);
    const other = await request(app).post(url).set('Idempotency-Key', 'key-2').send(body);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.replay).toBe(true);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(other.status).toBe(201);
    await flushBackground();
    // une creation par cle distincte, une seule convocation par creation
    expect(createMeetingForTenant).toHaveBeenCalledTimes(2);
    expect(notifyMeetingConvocation).toHaveBeenCalledTimes(2);
  });

  it('lets a retry recreate after a failed creation with the same key', async () => {
    const url = `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees`;
    const body = { type: 'ORDINARY', scheduledAt: '2026-06-20T09:00:00.000Z' };
    (createMeetingForTenant as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const failed = await request(app).post(url).set('Idempotency-Key', 'key-fail').send(body);
    expect(failed.status).toBeGreaterThanOrEqual(400);
    const retry = await request(app).post(url).set('Idempotency-Key', 'key-fail').send(body);
    expect(retry.status).toBe(201);
  });

  it('rejects an Idempotency-Key that is too long', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees`)
      .set('Idempotency-Key', 'x'.repeat(101))
      .send({ type: 'ORDINARY', scheduledAt: '2026-06-20T09:00:00.000Z' });
    expect(response.status).toBe(400);
  });

  it('resends the convocation of a planned meeting only', async () => {
    await request(app).post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees`).send({
      type: 'ORDINARY',
      scheduledAt: '2026-06-20T09:00:00.000Z'
    });
    const url = `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees/${MEETING_ID}/convocation`;
    const ok = await request(app).post(url);
    expect(ok.status).toBe(200);
    expect(ok.body.convocation.emailSent).toBe(1);

    store.meetings.get(MEETING_ID)!.status = 'COMPLETED';
    const frozen = await request(app).post(url);
    expect(frozen.status).toBe(409);
  });

  it('adds a resolution then casts vote and recomputes quorum/results', async () => {
    await request(app).post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees`).send({
      type: 'ORDINARY',
      scheduledAt: '2026-06-20T09:00:00.000Z',
      location: 'Salle commune'
    });

    const addResolution = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees/${MEETING_ID}/resolutions`)
      .send({ title: 'Validation budget' });
    expect(addResolution.status).toBe(201);
    expect(addResolution.body.data.id).toBe(RESOLUTION_ID);

    const vote = await request(app)
      .post(
        `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees/${MEETING_ID}/resolutions/${RESOLUTION_ID}/votes`
      )
      .send({ lotId: LOT_ID, vote: 'FOR' });
    expect(vote.status).toBe(200);
    expect(vote.body.data.quorum).toBe(100);
    expect(vote.body.data.resolutions[0].votesFor).toBe(1);
  });

  it('replays the same resolution for the same Idempotency-Key instead of creating a duplicate', async () => {
    store.meetings.set(MEETING_ID, {
      id: MEETING_ID,
      tenantId: TENANT_ID,
      syndicateId: SYNDIC_ID,
      type: 'ORDINARY',
      scheduledAt: new Date('2026-06-20T09:00:00.000Z').toISOString(),
      status: 'PLANNED',
      quorum: 0,
      resolutions: [],
      syndicate: { lots: [] }
    });
    const url = `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees/${MEETING_ID}/resolutions`;
    const body = { title: 'Validation budget' };
    const first = await request(app).post(url).set('Idempotency-Key', 'res-1').send(body);
    const retry = await request(app).post(url).set('Idempotency-Key', 'res-1').send(body);
    const other = await request(app).post(url).set('Idempotency-Key', 'res-2').send(body);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.replay).toBe(true);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(other.status).toBe(201);
    // une creation par cle distincte (le service garde son propre anti-doublon sans cle)
    expect(addResolutionToMeeting).toHaveBeenCalledTimes(2);
  });

  it('lets a retry re-add a resolution after a failed creation with the same key', async () => {
    store.meetings.set(MEETING_ID, {
      id: MEETING_ID,
      tenantId: TENANT_ID,
      syndicateId: SYNDIC_ID,
      type: 'ORDINARY',
      scheduledAt: new Date('2026-06-20T09:00:00.000Z').toISOString(),
      status: 'PLANNED',
      quorum: 0,
      resolutions: [],
      syndicate: { lots: [] }
    });
    const url = `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees/${MEETING_ID}/resolutions`;
    (addResolutionToMeeting as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const failed = await request(app).post(url).set('Idempotency-Key', 'res-fail').send({ title: 'Budget' });
    expect(failed.status).toBeGreaterThanOrEqual(400);
    const retry = await request(app).post(url).set('Idempotency-Key', 'res-fail').send({ title: 'Budget' });
    expect(retry.status).toBe(201);
  });

  it('rejects a resolution Idempotency-Key that is too long', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees/${MEETING_ID}/resolutions`)
      .set('Idempotency-Key', 'x'.repeat(101))
      .send({ title: 'Budget' });
    expect(response.status).toBe(400);
  });

  it('deletes a resolution and answers { id }', async () => {
    const response = await request(app).delete(
      `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees/${MEETING_ID}/resolutions/${RESOLUTION_ID}`
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { id: RESOLUTION_ID } });
  });

  it('opens then closes a meeting through PATCH status', async () => {
    await request(app).post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees`).send({
      type: 'ORDINARY',
      scheduledAt: '2026-06-20T09:00:00.000Z'
    });
    const base = `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees/${MEETING_ID}`;

    const tooEarly = await request(app).patch(base).send({ status: 'COMPLETED' });
    expect(tooEarly.status).toBe(409);

    const opened = await request(app).patch(base).send({ status: 'IN_PROGRESS' });
    expect(opened.status).toBe(200);
    expect(opened.body.data.status).toBe('IN_PROGRESS');

    const closed = await request(app).patch(base).send({ status: 'COMPLETED' });
    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe('COMPLETED');
  });

  it('rejects an unknown meeting status with 400', async () => {
    const response = await request(app)
      .patch(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees/${MEETING_ID}`)
      .send({ status: 'OPEN' });
    expect(response.status).toBe(400);
  });

  it('creates, lists and removes a proxy (pouvoir)', async () => {
    const base = `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees/${MEETING_ID}/pouvoirs`;

    const missing = await request(app).post(base).send({ grantorContactId: 'contact-1' });
    expect(missing.status).toBe(400);

    const same = await request(app)
      .post(base)
      .send({ grantorContactId: 'contact-1', representativeContactId: 'contact-1' });
    expect(same.status).toBe(422);

    const created = await request(app)
      .post(base)
      .send({ grantorContactId: 'contact-1', representativeContactId: 'contact-2' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ id: PROXY_ID, meetingId: MEETING_ID });

    const listed = await request(app).get(base);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);

    const removed = await request(app).delete(`${base}/${PROXY_ID}`);
    expect(removed.status).toBe(200);

    const removedAgain = await request(app).delete(`${base}/${PROXY_ID}`);
    expect(removedAgain.status).toBe(404);
  });

  it('enforces tenant isolation on meeting detail', async () => {
    const response = await request(app).get(
      `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/assemblees/other-tenant-meeting`
    );
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
