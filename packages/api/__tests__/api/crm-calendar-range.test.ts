/**
 * BUG-2026-09-30-009 : GET /crm/calendar sans `from`/`to` ne repondait jamais.
 * Le contrat : reponse immediate, 400 precis, intervalle borne.
 */
jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  getTenantIdFromRequest: () => 'tenant-1'
}));
const getCalendarEventsMock = jest.fn().mockResolvedValue([]);
jest.mock('../../src/services/crm-calendar-service', () => ({
  getCalendarEvents: (...args: unknown[]) => getCalendarEventsMock(...args)
}));
jest.mock('../../src/services/crm-activity-service', () => ({
  rescheduleFollowUp: jest.fn(),
  markFollowUpDone: jest.fn()
}));

import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/middleware/error-middleware';
import { getCalendarHandler } from '../../src/controllers/crm-calendar-controller';

const app = express();
app.get('/api/tenants/:tenantId/crm/calendar', getCalendarHandler);
app.use(errorHandler);

const URL = '/api/tenants/tenant-1/crm/calendar';

beforeEach(() => getCalendarEventsMock.mockClear());

describe('GET /crm/calendar — intervalle', () => {
  it('sans from/to : 400 immediat, service non appele', async () => {
    const res = await request(app).get(URL);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/from/);
    expect(getCalendarEventsMock).not.toHaveBeenCalled();
  });

  it('to manquant ou date invalide : 400', async () => {
    expect((await request(app).get(`${URL}?from=2026-09-01`)).status).toBe(400);
    expect((await request(app).get(`${URL}?from=abc&to=2026-10-01`)).status).toBe(400);
  });

  it('intervalle inverse ou trop long : 400', async () => {
    expect((await request(app).get(`${URL}?from=2026-10-01&to=2026-09-01`)).status).toBe(400);
    expect((await request(app).get(`${URL}?from=2020-01-01&to=2026-10-01`)).status).toBe(400);
    expect(getCalendarEventsMock).not.toHaveBeenCalled();
  });

  it('from/to valides : 200', async () => {
    const res = await request(app).get(`${URL}?from=2026-09-01&to=2026-10-31`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, events: [] });
  });
});
