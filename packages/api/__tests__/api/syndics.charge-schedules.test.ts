/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot S4 — routes des programmations d'appels de charges et des avis d'appel
 * PDF (`routes/syndic-charge-schedules-routes.ts`, et la route
 * `/appels/:chargeId/avis` du portail copropriétaire), sur HTTP. Session,
 * agence et permissions sont des passe-plats ; seuls les modules de domaine
 * sont simulés (leur logique est testée dans
 * `unit/syndics.charge-schedules.test.ts`).
 */

import express from 'express';
import request from 'supertest';
import { findDiskPathLeaks } from '../helpers/disk-path-leaks';

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
const mockScope = { tenantId: 'tenant-1', contactIds: ['c1'], lots: [], lotIds: [], syndicateIds: [] };
jest.mock('../../src/middleware/coowner-portal-access', () => ({
  requireCoOwnerPortalAccess: (req: any, _res: any, next: any) => {
    req.coOwnerPortal = { scope: mockScope };
    next();
  }
}));

const mockService = {
  listChargeSchedules: jest.fn(),
  getChargeSchedule: jest.fn(),
  createChargeSchedule: jest.fn(),
  updateChargeSchedule: jest.fn(),
  deleteChargeSchedule: jest.fn(),
  pauseChargeSchedule: jest.fn(),
  resumeChargeSchedule: jest.fn(),
  executeChargeScheduleNow: jest.fn(),
  listChargeScheduleRuns: jest.fn(),
  previewChargeSchedule: jest.fn()
};
jest.mock('../../src/lib/syndics/charge-schedules', () => ({
  listChargeSchedules: (...args: any[]) => mockService.listChargeSchedules(...args),
  getChargeSchedule: (...args: any[]) => mockService.getChargeSchedule(...args),
  createChargeSchedule: (...args: any[]) => mockService.createChargeSchedule(...args),
  updateChargeSchedule: (...args: any[]) => mockService.updateChargeSchedule(...args),
  deleteChargeSchedule: (...args: any[]) => mockService.deleteChargeSchedule(...args),
  pauseChargeSchedule: (...args: any[]) => mockService.pauseChargeSchedule(...args),
  resumeChargeSchedule: (...args: any[]) => mockService.resumeChargeSchedule(...args),
  executeChargeScheduleNow: (...args: any[]) => mockService.executeChargeScheduleNow(...args),
  listChargeScheduleRuns: (...args: any[]) => mockService.listChargeScheduleRuns(...args),
  previewChargeSchedule: (...args: any[]) => mockService.previewChargeSchedule(...args)
}));
const mockNoticeForTenant = jest.fn();
const mockNoticeForCoOwner = jest.fn();
jest.mock('../../src/lib/syndics/charge-call-notice', () => ({
  getChargeCallNoticeForTenant: (...args: any[]) => mockNoticeForTenant(...args),
  getChargeCallNoticeForCoOwner: (...args: any[]) => mockNoticeForCoOwner(...args)
}));

import schedulesRoutes from '../../src/routes/syndic-charge-schedules-routes';
import coOwnerPortalRoutes from '../../src/routes/coowner-portal-routes';
import { errorHandler, NotFoundError } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.use('/api/portal/copropriete', coOwnerPortalRoutes);
app.use('/api', schedulesRoutes);
app.use(errorHandler);

const TENANT = 'tenant-1';
const SYNDIC = '11111111-1111-4111-8111-111111111111';
const SCHEDULE = '22222222-2222-4222-8222-222222222222';
const BUDGET = '33333333-3333-4333-8333-333333333333';
const CHARGE = '44444444-4444-4444-8444-444444444444';
const BASE = `/api/tenants/${TENANT}/syndics/${SYNDIC}/programmations`;

const view = {
  id: SCHEDULE,
  syndicateId: SYNDIC,
  label: 'Charges courantes',
  frequency: 'QUARTERLY',
  issueDay: 1,
  dueOffsetDays: 30,
  amountSource: 'BUDGET',
  budgetId: BUDGET,
  budget: { id: BUDGET, label: 'Budget 2026', fiscalYear: 2026, status: 'APPROVED' },
  fixedAmount: null,
  currency: 'XOF',
  startDate: '2026-10-01',
  endDate: null,
  active: true,
  nextRunAt: '2026-10-01T00:00:00.000Z',
  nextPeriod: {
    label: 'T4 2026',
    periodStart: '2026-10-01',
    periodEnd: '2026-12-31',
    issueDate: '2026-10-01',
    dueDate: '2026-10-31'
  },
  lastRunAt: null,
  lastRun: null,
  hasIssuedPeriods: false
};
const pdf = {
  buffer: Buffer.from('%PDF-1.7 avis'),
  fileName: "Avis d'appel A-01 T4 2026.pdf",
  mimeType: 'application/pdf'
};

beforeEach(() => jest.clearAllMocks());

describe('programmations', () => {
  it('GET liste', async () => {
    mockService.listChargeSchedules.mockResolvedValue([view]);
    const response = await request(app).get(BASE);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [view] });
    expect(findDiskPathLeaks(response.body)).toEqual([]);
    expect(mockService.listChargeSchedules).toHaveBeenCalledWith(TENANT, SYNDIC);
  });

  it('POST creation : 201, dates converties, auteur transmis', async () => {
    mockService.createChargeSchedule.mockResolvedValue(view);
    const body = {
      label: 'Charges courantes',
      frequency: 'QUARTERLY',
      issueDay: 1,
      dueOffsetDays: 30,
      amountSource: 'BUDGET',
      budgetId: BUDGET,
      startDate: '2026-10-01'
    };
    const response = await request(app).post(BASE).send(body);
    expect(response.status).toBe(201);
    expect(mockService.createChargeSchedule).toHaveBeenCalledWith(
      TENANT,
      SYNDIC,
      { ...body, startDate: new Date('2026-10-01T00:00:00.000Z') },
      'user-1'
    );
  });

  it('POST creation : 400 sur un corps invalide', async () => {
    const valid = {
      label: 'X',
      frequency: 'MONTHLY',
      issueDay: 1,
      dueOffsetDays: 0,
      amountSource: 'FIXED',
      fixedAmount: 1000,
      startDate: '2026-10-01'
    };
    for (const patch of [
      { issueDay: 29 },
      { issueDay: 0 },
      { dueOffsetDays: -1 },
      { frequency: 'WEEKLY' },
      { fixedAmount: undefined },
      { budgetId: BUDGET },
      { startDate: '2026-02-30' },
      { endDate: '2026-09-01' },
      { currency: 'xof' },
      { inconnu: true }
    ]) {
      const response = await request(app)
        .post(BASE)
        .send({ ...valid, ...patch });
      expect(response.status).toBe(400);
    }
    expect(mockService.createChargeSchedule).not.toHaveBeenCalled();
  });

  it('PATCH, DELETE, pause, reprise, executer, executions, apercu', async () => {
    mockService.updateChargeSchedule.mockResolvedValue(view);
    expect((await request(app).patch(`${BASE}/${SCHEDULE}`).send({ issueDay: 5 })).status).toBe(200);
    expect(mockService.updateChargeSchedule).toHaveBeenCalledWith(TENANT, SYNDIC, SCHEDULE, { issueDay: 5 });
    expect((await request(app).patch(`${BASE}/${SCHEDULE}`).send({})).status).toBe(400);

    mockService.deleteChargeSchedule.mockResolvedValue({ deleted: true, deactivated: false, schedule: null });
    const deleted = await request(app).delete(`${BASE}/${SCHEDULE}`);
    expect(deleted.body.data).toEqual({ deleted: true, deactivated: false, schedule: null });

    mockService.pauseChargeSchedule.mockResolvedValue({ ...view, active: false });
    expect((await request(app).post(`${BASE}/${SCHEDULE}/pause`)).body.data.active).toBe(false);
    mockService.resumeChargeSchedule.mockResolvedValue(view);
    expect((await request(app).post(`${BASE}/${SCHEDULE}/reprise`)).status).toBe(200);

    const run = { status: 'SUCCESS', alreadyProcessed: false, periodLabel: 'T4 2026', callsCreated: 2 };
    mockService.executeChargeScheduleNow.mockResolvedValue({ run, schedule: view });
    const executed = await request(app).post(`${BASE}/${SCHEDULE}/executer`);
    expect(executed.body.data.run).toEqual(run);

    mockService.listChargeScheduleRuns.mockResolvedValue([]);
    expect((await request(app).get(`${BASE}/${SCHEDULE}/executions?limit=10`)).status).toBe(200);
    expect(mockService.listChargeScheduleRuns).toHaveBeenCalledWith(TENANT, SYNDIC, SCHEDULE, { limit: 10 });
    expect((await request(app).get(`${BASE}/${SCHEDULE}/executions?limit=500`)).status).toBe(400);

    mockService.previewChargeSchedule.mockResolvedValue({ scheduleId: SCHEDULE, active: true, periods: [] });
    expect((await request(app).get(`${BASE}/${SCHEDULE}/apercu`)).body.data.periods).toEqual([]);
  });

  it('404 sur un identifiant malforme ou hors agence', async () => {
    expect((await request(app).get(`${BASE}/pas-un-uuid`)).status).toBe(404);
    expect(mockService.getChargeSchedule).not.toHaveBeenCalled();
    mockService.getChargeSchedule.mockRejectedValue(new NotFoundError('Programmation introuvable.'));
    const response = await request(app).get(`${BASE}/${SCHEDULE}`);
    expect(response.status).toBe(404);
  });
});

describe('avis d appel PDF', () => {
  it('gestion : PDF en piece jointe, 404 hors agence', async () => {
    mockNoticeForTenant.mockResolvedValue(pdf);
    const response = await request(app).get(`/api/tenants/${TENANT}/syndics/${SYNDIC}/charges/${CHARGE}/avis`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toContain("attachment; filename*=UTF-8''Avis");
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(mockNoticeForTenant).toHaveBeenCalledWith(TENANT, SYNDIC, CHARGE);

    mockNoticeForTenant.mockRejectedValue(new NotFoundError('Appel de charges introuvable.'));
    expect((await request(app).get(`/api/tenants/${TENANT}/syndics/${SYNDIC}/charges/${CHARGE}/avis`)).status).toBe(
      404
    );
  });

  it('portail : perimetre de la session, 404 hors perimetre, 400 sur un identifiant invalide', async () => {
    mockNoticeForCoOwner.mockResolvedValue(pdf);
    const response = await request(app).get(`/api/portal/copropriete/appels/${CHARGE}/avis`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(mockNoticeForCoOwner).toHaveBeenCalledWith(mockScope, CHARGE);

    mockNoticeForCoOwner.mockRejectedValue(new NotFoundError('Appel de charges introuvable.'));
    const outside = await request(app).get(`/api/portal/copropriete/appels/${CHARGE}/avis`);
    expect(outside.status).toBe(404);
    expect(findDiskPathLeaks(outside.body)).toEqual([]);
    expect((await request(app).get('/api/portal/copropriete/appels/pas-un-uuid/avis')).status).toBe(400);
  });

  it('portail : limiteur dedie, 20 avis par minute et par compte', async () => {
    mockNoticeForCoOwner.mockResolvedValue(pdf);
    const statuses: number[] = [];
    for (let index = 0; index < 22; index += 1) {
      statuses.push((await request(app).get(`/api/portal/copropriete/appels/${CHARGE}/avis`)).status);
    }
    expect(statuses).toContain(429);
    expect(statuses.filter(status => status === 200).length).toBeLessThanOrEqual(20);
  });
});

describe('limiteur de la route executer', () => {
  it('gestion : limiteur dedie, 10 executions par minute et par agence', async () => {
    const run = { status: 'SUCCESS', alreadyProcessed: false, periodLabel: 'T4 2026', callsCreated: 2 };
    mockService.executeChargeScheduleNow.mockResolvedValue({ run, schedule: view });
    const statuses: number[] = [];
    for (let index = 0; index < 12; index += 1) {
      statuses.push((await request(app).post(`${BASE}/${SCHEDULE}/executer`)).status);
    }
    expect(statuses).toContain(429);
    expect(statuses.filter(status => status === 200).length).toBeLessThanOrEqual(10);
  });
});
