/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Décision H4 — bail terminé ou suspendu : portail locataire en LECTURE SEULE.
 *
 * - le middleware choisit le bail actif, sinon le bail terminé/suspendu le plus récent
 *   (`req.tenantPortal.readOnly`), sinon 403 ;
 * - garde d'écriture centrale, fail-closed (`PORTAL_READ_ONLY`), liste blanche messagerie ;
 * - périmètre de baux explicite (`listPortalLeaseIds(..., readOnly)`) ;
 * - documents finaux seuls.
 * Prisma est simulé (dépôt de baux en mémoire pour le middleware).
 */

type Row = Record<string, any>;

const leases: Row[] = [];
const clients: Row[] = [];

/** Évalue le sous-ensemble de `where` utilisé par le middleware et la liste des baux. */
function matchLease(row: Row, where: Row): boolean {
  if (where.tenant_id && row.tenant_id !== where.tenant_id) return false;
  if (where.status !== undefined) {
    const s = where.status;
    if (typeof s === 'string' ? row.status !== s : !s.in.includes(row.status)) return false;
  }
  if (where.OR) {
    const ok = where.OR.some((clause: Row) => {
      if (clause.primary_renter_client_id) return row.primary_renter_client_id === clause.primary_renter_client_id;
      if (clause.coRenters) return (row.co_renters ?? []).includes(clause.coRenters.some.renter_client_id);
      return false;
    });
    if (!ok) return false;
  }
  return true;
}

function sortLeases(rows: Row[], orderBy: Row[]): Row[] {
  const dir = orderBy[0].start_date === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => dir * (a.start_date - b.start_date) || (a.id < b.id ? -1 : 1));
}

const prismaMock: any = {
  user: { findUnique: jest.fn(async () => ({ isActive: true })) },
  tenantClient: { findMany: jest.fn(async () => clients) },
  rentalLease: {
    findFirst: jest.fn(
      async ({ where, orderBy }: Row) =>
        sortLeases(
          leases.filter(l => matchLease(l, where)),
          orderBy
        )[0] ?? null
    ),
    findMany: jest.fn(async ({ where, orderBy }: Row) =>
      sortLeases(
        leases.filter(l => matchLease(l, where)),
        orderBy
      )
    )
  },
  rentalDocument: { findMany: jest.fn(), findFirst: jest.fn() },
  rentalInstallment: { findFirst: jest.fn(), findMany: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/lib/payment-gateway/availability', () => ({
  assertRentalOnlinePaymentAllowed: jest.fn(async () => undefined)
}));
jest.mock('../../src/lib/maintenance/portal-visibility', () => ({
  findTenantPortalTicket: jest.fn(),
  resolveTenantPortalCrmContactId: jest.fn(),
  tenantPortalTicketFilter: jest.fn().mockResolvedValue({})
}));
const startCheckoutMock = jest.fn();
jest.mock('../../src/lib/payment-gateway/checkout', () => ({
  getCheckoutForPortal: jest.fn(),
  getOnlinePaymentAvailability: jest.fn(),
  startCheckout: (...a: any[]) => startCheckoutMock(...a),
  toOnlineCheckoutDto: jest.fn()
}));

import express from 'express';
import request from 'supertest';
import { isReadOnlyPortalRequestAllowed, requireTenantPortalAccess } from '../../src/middleware/tenant-portal-access';
import { listPortalLeaseIds } from '../../src/utils/tenant-portal-leases';
import { TenantPortalService } from '../../src/services/tenant-portal-service';
import { NotFoundError, errorHandler } from '../../src/middleware/error-middleware';
import { TenantPortalController } from '../../src/controllers/tenant-portal-controller';
import { startOnlinePaymentHandler } from '../../src/controllers/tenant-portal-online-payment-controller';

const AGENCE = 'agence-a';
const AUTRE_AGENCE = 'agence-b';
const day = (n: number) => new Date(2020, 0, 1 + n);

function lease(id: string, status: string, over: Row = {}): Row {
  return {
    id,
    status,
    tenant_id: AGENCE,
    primary_renter_client_id: 'client-1',
    co_renters: [],
    start_date: day(10),
    ...over
  };
}

/** Appli minimale : vraies gardes, handlers factices, montée comme en production. */
function buildApp(userId = 'user-1') {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId };
    next();
  });
  const router = express.Router();
  const ok = (req: any, res: any) =>
    res.json({ ok: true, readOnly: req.tenantPortal.readOnly, leaseId: req.tenantPortal.leaseId });
  router.use(requireTenantPortalAccess);
  router.get('/dashboard', ok);
  router.get('/finance/statement', ok);
  router.get('/documents', ok);
  router.post('/payments/declare', ok);
  router.post('/payments/declarations/:id/cancel', ok);
  router.post('/online-payments', ok);
  router.post('/maintenance', ok);
  router.post('/maintenance/:id/comment', ok);
  router.post('/une-future-route-decriture', ok);
  router.put('/profil', ok);
  router.delete('/messages/conversations/:id/participants/me', ok);
  router.post('/messages/conversations', ok);
  router.post('/messages/conversations/:id/messages', ok);
  router.post('/messages/conversations/:id/read', ok);
  router.post('/messages/conversations/:id/participants', ok);
  router.post('/notifications/read-all', ok);
  app.use('/api/portal/tenant', router);
  app.use(errorHandler as any);
  return app;
}

const PORTAL = '/api/portal/tenant';

beforeEach(() => {
  jest.clearAllMocks();
  leases.length = 0;
  clients.length = 0;
  clients.push({ id: 'client-1', tenantId: AGENCE, createdAt: day(0), tenant: { status: 'ACTIVE' } });
});

describe('middleware — choix du bail et mode lecture seule (H4)', () => {
  it.each(['ENDED', 'SUSPENDED'])('bail %s seul : accès en lecture seule', async status => {
    leases.push(lease('L-closed', status));
    const res = await request(buildApp()).get(`${PORTAL}/dashboard`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ readOnly: true, leaseId: 'L-closed' });
  });

  it('co-locataire d’un bail terminé : accès en lecture seule', async () => {
    leases.push(lease('L-co', 'ENDED', { primary_renter_client_id: 'autre', co_renters: ['client-1'] }));
    const res = await request(buildApp()).get(`${PORTAL}/dashboard`);
    expect(res.status).toBe(200);
    expect(res.body.readOnly).toBe(true);
  });

  it.each(['CANCELED', 'DRAFT'])('bail %s seul : 403 comme avant', async status => {
    leases.push(lease('L-x', status));
    const res = await request(buildApp()).get(`${PORTAL}/dashboard`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBeUndefined();
  });

  it('aucun bail : 403', async () => {
    const res = await request(buildApp()).get(`${PORTAL}/dashboard`);
    expect(res.status).toBe(403);
  });

  it('bail ACTIVE : comportement inchangé, readOnly faux, écritures non bloquées par la garde', async () => {
    leases.push(lease('L-active', 'ACTIVE'), lease('L-old', 'ENDED', { start_date: day(99) }));
    const app = buildApp();
    const get = await request(app).get(`${PORTAL}/dashboard`);
    expect(get.body).toMatchObject({ readOnly: false, leaseId: 'L-active' });
    const post = await request(app).post(`${PORTAL}/payments/declare`).send({});
    expect(post.status).toBe(200);
  });

  it('plusieurs baux terminés : le plus récent, id en second critère', async () => {
    leases.push(
      lease('L-b', 'ENDED', { start_date: day(5) }),
      lease('L-recent-z', 'SUSPENDED', { start_date: day(50) })
    );
    leases.push(lease('L-recent-a', 'ENDED', { start_date: day(50) }));
    const res = await request(buildApp()).get(`${PORTAL}/dashboard`);
    expect(res.body.leaseId).toBe('L-recent-a');
  });

  it('isolation : le bail terminé d’un autre client ou d’une autre agence est invisible (403)', async () => {
    leases.push(lease('L-autre-client', 'ENDED', { primary_renter_client_id: 'client-2' }));
    leases.push(lease('L-autre-agence', 'ENDED', { tenant_id: AUTRE_AGENCE }));
    const res = await request(buildApp()).get(`${PORTAL}/dashboard`);
    expect(res.status).toBe(403);
  });
});

describe('garde d’écriture centrale — fail-closed (H4)', () => {
  beforeEach(() => leases.push(lease('L-closed', 'ENDED')));

  it.each([
    ['POST', '/payments/declare'],
    ['POST', '/payments/declarations/abc/cancel'],
    ['POST', '/online-payments'],
    ['POST', '/maintenance'],
    ['POST', '/maintenance/abc/comment'],
    ['POST', '/une-future-route-decriture'],
    ['PUT', '/profil'],
    ['DELETE', '/messages/conversations/abc/participants/me'],
    ['POST', '/messages/conversations/abc/participants']
  ])('%s %s refusé avec PORTAL_READ_ONLY', async (method, path) => {
    const res = await (request(buildApp()) as any)[method.toLowerCase()](`${PORTAL}${path}`).send({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      code: 'PORTAL_READ_ONLY',
      message: 'Votre bail est terminé : le portail est en lecture seule.'
    });
  });

  it.each([
    ['POST', '/messages/conversations'],
    ['POST', '/messages/conversations/abc/messages'],
    ['POST', '/messages/conversations/abc/read'],
    ['POST', '/notifications/read-all']
  ])('%s %s (messagerie) reste autorisé', async (method, path) => {
    const res = await (request(buildApp()) as any)[method.toLowerCase()](`${PORTAL}${path}`).send({});
    expect(res.status).toBe(200);
  });

  it.each(['/dashboard', '/finance/statement', '/documents'])('lecture %s autorisée', async path => {
    const res = await request(buildApp()).get(`${PORTAL}${path}`);
    expect(res.status).toBe(200);
    expect(res.body.readOnly).toBe(true);
  });

  it('prédicat : liste blanche stricte', () => {
    expect(isReadOnlyPortalRequestAllowed('GET', '/nimporte/quoi')).toBe(true);
    expect(isReadOnlyPortalRequestAllowed('POST', '/messages/conversations/')).toBe(true);
    expect(isReadOnlyPortalRequestAllowed('POST', '/messages/conversations/a/b/messages')).toBe(false);
    expect(isReadOnlyPortalRequestAllowed('PATCH', '/messages/conversations/a/messages')).toBe(false);
    expect(isReadOnlyPortalRequestAllowed('POST', '/payments/declare')).toBe(false);
  });
});

describe('périmètre de baux explicite', () => {
  it('lecture seule : baux ENDED/SUSPENDED du client, jamais ACTIVE ni d’un autre client', async () => {
    leases.push(
      lease('L-ended', 'ENDED'),
      lease('L-susp', 'SUSPENDED', { start_date: day(20) }),
      lease('L-active', 'ACTIVE'),
      lease('L-autre', 'ENDED', { primary_renter_client_id: 'client-2' }),
      lease('L-autre-agence', 'ENDED', { tenant_id: AUTRE_AGENCE })
    );
    expect(await listPortalLeaseIds(AGENCE, 'client-1', true)).toEqual(['L-susp', 'L-ended']);
    expect(await listPortalLeaseIds(AGENCE, 'client-1')).toEqual(['L-active']);
    expect(prismaMock.rentalLease.findMany.mock.calls[0][0].where.tenant_id).toBe(AGENCE);
  });
});

describe('défense en profondeur des écritures', () => {
  const run = async (handler: any, req: Row) => {
    const next = jest.fn();
    await handler(req, {}, next);
    return next.mock.calls[0]?.[0];
  };
  const readOnlyReq = {
    tenantPortal: { readOnly: true, tenantId: AGENCE, tenantClientId: 'client-1', leaseId: 'L-closed' },
    query: {},
    body: { installmentIds: ['00000000-0000-4000-8000-000000000001'] }
  };

  it('paiement en ligne refusé en lecture seule', async () => {
    const err = await run(startOnlinePaymentHandler, readOnlyReq);
    expect(err).toMatchObject({ statusCode: 403, code: 'PORTAL_READ_ONLY' });
    expect(startCheckoutMock).not.toHaveBeenCalled();
  });

  it('déclaration et nouveau ticket refusés avant toute lecture en base', async () => {
    const controller = new TenantPortalController();
    for (const handler of [
      controller.declarePayment,
      controller.createMaintenanceTicket,
      controller.addTicketComment
    ]) {
      const err = await run(handler, readOnlyReq);
      expect(err).toMatchObject({ statusCode: 403, code: 'PORTAL_READ_ONLY' });
    }
    expect(prismaMock.rentalLease.findMany).not.toHaveBeenCalled();
  });

  it('service : nouveau ticket exige un bail ACTIVE', async () => {
    prismaMock.rentalLease.findFirst.mockResolvedValueOnce(null);
    await expect(
      new TenantPortalService().createMaintenanceTicket('client-1', 'L-closed', AGENCE, {
        title: 't',
        category: 'PLUMBING',
        priority: 'LOW',
        description: 'd'
      })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.rentalLease.findFirst.mock.calls[0][0].where.status).toBe('ACTIVE');
  });
});

describe('documents — pièces finales seules', () => {
  const service = new TenantPortalService();

  it('la liste ne demande que les documents FINAL de l’agence et des baux du périmètre', async () => {
    prismaMock.rentalDocument.findMany.mockResolvedValue([]);
    await service.getDocuments('client-1', 'L-closed', AGENCE, undefined, ['L-closed']);
    const where = prismaMock.rentalDocument.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenant_id: AGENCE, status: 'FINAL', lease_id: { in: ['L-closed'] } });
  });

  it.each(['DRAFT', 'SUPERSEDED', 'VOID'])('téléchargement d’un document %s : 404 comme un inexistant', async () => {
    // La requête porte `status: FINAL` : la base ne renvoie rien pour une pièce non finale.
    prismaMock.rentalDocument.findFirst.mockResolvedValue(null);
    await expect(
      service.downloadDocument('client-1', 'L-closed', AGENCE, '00000000-0000-4000-8000-0000000000aa', ['L-closed'])
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.rentalDocument.findFirst.mock.calls.at(-1)[0].where.status).toBe('FINAL');
  });
});
