/**
 * BUG-2026-09-30-027 : un statut de visite inconnu renvoyait l'erreur Prisma brute.
 * BUG-2026-09-30-026 : deux visites actives du meme bien au meme creneau etaient acceptees.
 */
type Visit = {
  id: string;
  propertyId: string;
  tenantId: string | null;
  status: string;
  scheduledAt: Date;
  duration: number | null;
  notes: string | null;
};

const visits: Visit[] = [];
let seq = 0;
const propertyFindFirst = jest.fn();
const visitUpdate = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    property: { findFirst: (...a: any[]) => propertyFindFirst(...a) },
    propertyMandate: { findFirst: jest.fn().mockResolvedValue(null) },
    crmContact: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
    propertyVisit: {
      findMany: jest.fn(async ({ where }: any) =>
        visits.filter(
          v =>
            v.propertyId === where.propertyId &&
            v.tenantId === where.tenantId &&
            where.status.in.includes(v.status) &&
            (!where.id?.not || v.id !== where.id.not) &&
            v.scheduledAt > where.scheduledAt.gt &&
            v.scheduledAt < where.scheduledAt.lt
        )
      ),
      findFirst: jest.fn(async ({ where }: any) => {
        const v = visits.find(x => x.id === where.id);
        return v ? { ...v, property: { ownershipType: 'TENANT', tenantId: v.tenantId } } : null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const v: Visit = {
          id: `v${++seq}`,
          propertyId: data.propertyId,
          tenantId: data.tenantId,
          status: data.status,
          scheduledAt: data.scheduledAt,
          duration: data.duration,
          notes: null
        };
        visits.push(v);
        return v;
      }),
      update: (...a: any[]) => visitUpdate(...a)
    }
  }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/crm-activity-service', () => ({ createActivity: jest.fn() }));

import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/middleware/error-middleware';
import {
  scheduleVisitHandler,
  updateVisitStatusHandler,
  getCalendarVisitsHandler
} from '../../src/controllers/property-visit-controller';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { userId: 'u1' };
  next();
});
app.post('/api/tenants/:tenantId/properties/:id/visits', scheduleVisitHandler);
app.patch('/api/tenants/:tenantId/properties/:id/visits/:visitId/status', updateVisitStatusHandler);
app.get('/api/tenants/:tenantId/properties/visits/calendar', getCalendarVisitsHandler);
app.use(errorHandler);

const future = (h: number, m = 0) => new Date(Date.UTC(2099, 0, 12, h, m)).toISOString();
const post = (tenant: string, property: string, body: object) =>
  request(app).post(`/api/tenants/${tenant}/properties/${property}/visits`).send(body);

beforeEach(() => {
  visits.length = 0;
  seq = 0;
  jest.clearAllMocks();
  propertyFindFirst.mockResolvedValue({ id: 'p1', address: 'Rue 1', title: 'Villa' });
  visitUpdate.mockImplementation(async ({ data }: any) => ({ id: 'v1', ...data }));
});

describe('validation des entrees du module visites', () => {
  it('statut inconnu : 400 VALIDATION_ERROR sans texte technique', async () => {
    visits.push({
      id: 'v1',
      propertyId: 'p1',
      tenantId: 't1',
      status: 'SCHEDULED',
      scheduledAt: new Date(),
      duration: 60,
      notes: null
    });
    const res = await request(app)
      .patch('/api/tenants/t1/properties/p1/visits/v1/status')
      .send({ status: 'CANCELLED' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors[0].field).toBe('status');
    expect(res.body.errors[0].message).toBe('Statut de visite invalide');
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|invocation|\.ts|D:/i);
    expect(visitUpdate).not.toHaveBeenCalled();
  });

  it('statut absent : 400 VALIDATION_ERROR', async () => {
    const res = await request(app).patch('/api/tenants/t1/properties/p1/visits/v1/status').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('creation : date illisible, type et duree invalides refuses en 400', async () => {
    for (const body of [
      { scheduledAt: 'pas-une-date' },
      {},
      { scheduledAt: future(10), visitType: 'AUTRE' },
      { scheduledAt: future(10), duration: -5 },
      { scheduledAt: future(10), duration: 'abc' }
    ]) {
      const res = await post('t1', 'p1', body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(visits).toHaveLength(0);
  });

  it('calendrier : periode illisible ou inversee refusee en 400', async () => {
    const base = '/api/tenants/t1/properties/visits/calendar';
    expect((await request(app).get(`${base}?startDate=abc`)).status).toBe(400);
    expect((await request(app).get(`${base}?startDate=2099-02-01&endDate=2099-01-01`)).status).toBe(400);
  });
});

describe('chevauchement de visites', () => {
  const ok = { visitType: 'VISIT', duration: 60 };

  it('meme bien, meme creneau : la seconde est refusee en 409 avec le creneau en conflit', async () => {
    expect((await post('t1', 'p1', { ...ok, scheduledAt: future(10, 30) })).status).toBe(200);
    const res = await post('t1', 'p1', { ...ok, scheduledAt: future(10, 30) });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
    expect(res.body.data.conflict.startsAt).toBe(future(10, 30));
    expect(res.body.data.conflict.endsAt).toBe(future(11, 30));
    expect(visits).toHaveLength(1);
  });

  it('chevauchement partiel refuse, y compris sans duree saisie (60 min par defaut)', async () => {
    await post('t1', 'p1', { scheduledAt: future(10) });
    expect((await post('t1', 'p1', { scheduledAt: future(10, 45) })).status).toBe(409);
    expect((await post('t1', 'p1', { scheduledAt: future(9, 15), duration: 60 })).status).toBe(409);
  });

  it('creneaux contigus acceptes', async () => {
    await post('t1', 'p1', { ...ok, scheduledAt: future(10) });
    expect((await post('t1', 'p1', { ...ok, scheduledAt: future(11) })).status).toBe(200);
    expect((await post('t1', 'p1', { ...ok, scheduledAt: future(9) })).status).toBe(200);
  });

  it('une visite annulee ou terminee ne bloque pas le creneau', async () => {
    await post('t1', 'p1', { ...ok, scheduledAt: future(10) });
    visits[0].status = 'CANCELED';
    expect((await post('t1', 'p1', { ...ok, scheduledAt: future(10) })).status).toBe(200);
    visits[1].status = 'DONE';
    expect((await post('t1', 'p1', { ...ok, scheduledAt: future(10, 15) })).status).toBe(200);
  });

  it('un autre bien au meme creneau est accepte', async () => {
    await post('t1', 'p1', { ...ok, scheduledAt: future(10) });
    expect((await post('t1', 'p2', { ...ok, scheduledAt: future(10) })).status).toBe(200);
  });

  it("la visite d'une autre agence ne bloque pas (isolation)", async () => {
    visits.push({
      id: 'vx',
      propertyId: 'p1',
      tenantId: 'autre-agence',
      status: 'SCHEDULED',
      scheduledAt: new Date(future(10)),
      duration: 60,
      notes: null
    });
    expect((await post('t1', 'p1', { ...ok, scheduledAt: future(10) })).status).toBe(200);
  });

  it('reactiver une visite annulee sur un creneau repris est refuse en 409', async () => {
    await post('t1', 'p1', { ...ok, scheduledAt: future(10) });
    visits[0].status = 'CANCELED';
    await post('t1', 'p1', { ...ok, scheduledAt: future(10) });
    const res = await request(app)
      .patch('/api/tenants/t1/properties/p1/visits/v1/status')
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(409);
    expect(visitUpdate).not.toHaveBeenCalled();
  });
});
