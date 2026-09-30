/**
 * GET calendrier des visites : intervalle borné à 366 jours (comme le calendrier
 * CRM), et messages d'erreur de `from`/`to` du calendrier CRM traduisibles.
 */
const getCalendarVisitsMock = jest.fn().mockResolvedValue({});
jest.mock('../../src/services/property-visit-service', () => ({
  scheduleVisit: jest.fn(),
  updateVisitStatus: jest.fn(),
  getPropertyVisits: jest.fn(),
  getCalendarVisits: (...args: unknown[]) => getCalendarVisitsMock(...args),
  completeVisit: jest.fn(),
  MAX_VISIT_DURATION_MINUTES: 480
}));
jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  getTenantIdFromRequest: () => 'tenant-1'
}));
jest.mock('../../src/services/crm-calendar-service', () => ({ getCalendarEvents: jest.fn() }));
jest.mock('../../src/services/crm-activity-service', () => ({
  rescheduleFollowUp: jest.fn(),
  markFollowUpDone: jest.fn()
}));

import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/middleware/error-middleware';
import { getCalendarVisitsHandler } from '../../src/controllers/property-visit-controller';
import { getCalendarHandler } from '../../src/controllers/crm-calendar-controller';

const app = express();
app.get('/api/tenants/:tenantId/visits/calendar', getCalendarVisitsHandler);
app.get('/api/tenants/:tenantId/crm/calendar', getCalendarHandler);
app.use(errorHandler);

beforeEach(() => getCalendarVisitsMock.mockClear());

describe('calendrier des visites : période bornée', () => {
  it('plus de 366 jours : 400, service non appelé', async () => {
    const res = await request(app).get('/api/tenants/tenant-1/visits/calendar?startDate=2020-01-01&endDate=2026-10-01');
    expect(res.status).toBe(400);
    expect(getCalendarVisitsMock).not.toHaveBeenCalled();
  });

  it('période raisonnable : 200', async () => {
    const res = await request(app).get('/api/tenants/tenant-1/visits/calendar?startDate=2026-09-01&endDate=2026-10-31');
    expect(res.status).toBe(200);
    expect(getCalendarVisitsMock).toHaveBeenCalledTimes(1);
  });

  it('calendrier CRM : le nom du paramètre est interpolé dans le message', async () => {
    const res = await request(app).get('/api/tenants/tenant-1/crm/calendar');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('« from »');
  });
});
