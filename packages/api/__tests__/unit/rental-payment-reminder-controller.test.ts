/**
 * `controllers/rental-payment-reminder-controller.ts` : relances de loyer (spec 049,
 * contrat section 3). App Express minimale : handlers réels, vrai `errorHandler`,
 * services mockés à la frontière. Les gardes du routeur réel sont vérifiées en fin de fichier.
 */

import express from 'express';
import request from 'supertest';

const buildReminderPreview = jest.fn();
jest.mock('../../src/lib/rental/payment-reminders/plan', () => ({
  buildReminderPreview: (...a: any[]) => buildReminderPreview(...a)
}));

const sendInstallmentReminder = jest.fn();
const sendReminderBatch = jest.fn();
jest.mock('../../src/lib/rental/payment-reminders/send', () => ({
  SEND_BATCH_MAX: 100,
  sendInstallmentReminder: (...a: any[]) => sendInstallmentReminder(...a),
  sendReminderBatch: (...a: any[]) => sendReminderBatch(...a)
}));

const listReminders = jest.fn();
const listInstallmentReminders = jest.fn();
jest.mock('../../src/lib/rental/payment-reminders/history', () => ({
  listReminders: (...a: any[]) => listReminders(...a),
  listInstallmentReminders: (...a: any[]) => listInstallmentReminders(...a)
}));

import {
  listInstallmentRemindersHandler,
  listRemindersHandler,
  previewRemindersHandler,
  sendInstallmentReminderHandler,
  sendReminderBatchHandler
} from '../../src/controllers/rental-payment-reminder-controller';
import { AppError, NotFoundError, errorHandler } from '../../src/middleware/error-middleware';

const TENANT = 'ctx-tenant';
const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const LEASE = '33333333-3333-4333-8333-333333333333';
const URL_BASE = '/tenants/URL-TENANT/rental';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).tenantContext = { tenantId: TENANT };
    (req as any).user = { userId: 'user-1' };
    next();
  });
  app.get('/tenants/:tenantId/rental/payment-reminders/preview', previewRemindersHandler);
  app.post('/tenants/:tenantId/rental/payment-reminders/batch', sendReminderBatchHandler);
  app.get('/tenants/:tenantId/rental/payment-reminders', listRemindersHandler);
  app.post('/tenants/:tenantId/rental/installments/:installmentId/reminder', sendInstallmentReminderHandler);
  app.get('/tenants/:tenantId/rental/installments/:installmentId/reminders', listInstallmentRemindersHandler);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /payment-reminders/preview', () => {
  it('200 : enveloppe, défauts appliqués, tenantId du contexte', async () => {
    const dto = { generatedAt: 'x', groups: [], totals: { eligible: 0, excluded: 0, amountDue: 0 } };
    buildReminderPreview.mockResolvedValue(dto);

    const res = await request(buildApp()).get(`${URL_BASE}/payment-reminders/preview`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: dto });
    expect(buildReminderPreview).toHaveBeenCalledWith(TENANT, { daysBefore: 0, minDaysLate: 1, eligibleOnly: false });
  });

  it('convertit les chaînes de query', async () => {
    buildReminderPreview.mockResolvedValue({});

    const res = await request(buildApp()).get(`${URL_BASE}/payment-reminders/preview`).query({
      daysBefore: '5',
      minDaysLate: '3',
      leaseId: LEASE,
      propertyId: 'p1',
      search: '  dupont ',
      eligibleOnly: 'true'
    });

    expect(res.status).toBe(200);
    expect(buildReminderPreview).toHaveBeenCalledWith(TENANT, {
      daysBefore: 5,
      minDaysLate: 3,
      leaseId: LEASE,
      propertyId: 'p1',
      search: 'dupont',
      eligibleOnly: true
    });
  });

  it.each([
    ['daysBefore 31', { daysBefore: '31' }],
    ['daysBefore négatif', { daysBefore: '-1' }],
    ['leaseId invalide', { leaseId: 'nope' }],
    ['installmentId invalide', { installmentId: 'nope' }],
    ['eligibleOnly invalide', { eligibleOnly: 'oui' }],
    ['clé inconnue', { tenantId: 'autre' }]
  ])('400 VALIDATION_ERROR : %s', async (_n, query) => {
    const res = await request(buildApp()).get(`${URL_BASE}/payment-reminders/preview`).query(query);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(buildReminderPreview).not.toHaveBeenCalled();
  });

  it('transmet installmentId (uuid) à l’aperçu', async () => {
    buildReminderPreview.mockResolvedValue({});
    const res = await request(buildApp()).get(`${URL_BASE}/payment-reminders/preview`).query({ installmentId: LEASE });
    expect(res.status).toBe(200);
    expect(buildReminderPreview).toHaveBeenCalledWith(TENANT, expect.objectContaining({ installmentId: LEASE }));
  });

  it('404 propagé (bail d’une autre agence)', async () => {
    buildReminderPreview.mockRejectedValue(new NotFoundError('Bail introuvable.'));

    const res = await request(buildApp()).get(`${URL_BASE}/payment-reminders/preview`).query({ leaseId: LEASE });

    expect(res.status).toBe(404);
  });
});

describe('POST /installments/:installmentId/reminder', () => {
  const result = {
    installmentId: ID1,
    status: 'FAILED',
    level: 1,
    reason: null,
    failureCode: 'SEND_ERROR',
    channels: [],
    paymentLinkId: null
  };

  it('200 même pour un envoi FAILED ; tenantId du contexte, acteur transmis', async () => {
    sendInstallmentReminder.mockResolvedValue(result);

    const res = await request(buildApp())
      .post(`${URL_BASE}/installments/${ID1}/reminder`)
      .send({ channels: ['EMAIL', 'WHATSAPP'], level: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: result });
    expect(sendInstallmentReminder).toHaveBeenCalledWith(TENANT, 'user-1', ID1, {
      channels: ['EMAIL', 'WHATSAPP'],
      level: 2
    });
  });

  it('corps absent accepté', async () => {
    sendInstallmentReminder.mockResolvedValue(result);

    const res = await request(buildApp()).post(`${URL_BASE}/installments/${ID1}/reminder`);

    expect(res.status).toBe(200);
    expect(sendInstallmentReminder).toHaveBeenCalledWith(TENANT, 'user-1', ID1, {});
  });

  it.each([
    ['canal SMS', { channels: ['SMS'] }],
    ['canal PUSH', { channels: ['PUSH'] }],
    ['canaux vides', { channels: [] }],
    ['canaux en double', { channels: ['EMAIL', 'EMAIL'] }],
    ['niveau 0', { level: 0 }],
    ['niveau 4', { level: 4 }],
    ['clé inconnue', { tenantId: 'autre' }]
  ])('400 VALIDATION_ERROR : %s', async (_n, body) => {
    const res = await request(buildApp()).post(`${URL_BASE}/installments/${ID1}/reminder`).send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(sendInstallmentReminder).not.toHaveBeenCalled();
  });

  it('400 : installmentId non uuid', async () => {
    const res = await request(buildApp()).post(`${URL_BASE}/installments/pas-un-uuid/reminder`).send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('409 : code et data du service transmis tels quels', async () => {
    const data = { installmentId: ID1, reason: 'TOO_SOON', exclusions: ['TOO_SOON'] };
    sendInstallmentReminder.mockRejectedValue(
      new AppError('Trop tôt.', 409, 'RENTAL_REMINDER_TOO_SOON', undefined, data)
    );

    const res = await request(buildApp()).post(`${URL_BASE}/installments/${ID1}/reminder`).send({});

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RENTAL_REMINDER_TOO_SOON');
    expect(res.body.data).toEqual(data);
  });

  it('404 propagé', async () => {
    sendInstallmentReminder.mockRejectedValue(new NotFoundError('Échéance introuvable.'));

    const res = await request(buildApp()).post(`${URL_BASE}/installments/${ID1}/reminder`).send({});

    expect(res.status).toBe(404);
  });
});

describe('POST /payment-reminders/batch', () => {
  const result = { results: [], totals: { sent: 0, skipped: 0, failed: 0 } };

  it('200 : enveloppe, tenantId du contexte, acteur transmis', async () => {
    sendReminderBatch.mockResolvedValue(result);

    const res = await request(buildApp())
      .post(`${URL_BASE}/payment-reminders/batch`)
      .send({ installmentIds: [ID1, ID2], channels: ['EMAIL'] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: result });
    expect(sendReminderBatch).toHaveBeenCalledWith(TENANT, 'user-1', {
      installmentIds: [ID1, ID2],
      channels: ['EMAIL']
    });
  });

  const many = Array.from({ length: 101 }, (_v, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  it.each([
    ['liste vide', { installmentIds: [] }],
    ['101 identifiants', { installmentIds: many }],
    ['doublons', { installmentIds: [ID1, ID1] }],
    ['uuid invalide', { installmentIds: ['x'] }],
    ['niveau refusé', { installmentIds: [ID1], level: 2 }],
    ['canal SMS', { installmentIds: [ID1], channels: ['SMS'] }],
    ['corps sans liste', {}]
  ])('400 VALIDATION_ERROR : %s', async (_n, body) => {
    const res = await request(buildApp()).post(`${URL_BASE}/payment-reminders/batch`).send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(sendReminderBatch).not.toHaveBeenCalled();
  });

  it('100 identifiants acceptés', async () => {
    sendReminderBatch.mockResolvedValue(result);

    const res = await request(buildApp())
      .post(`${URL_BASE}/payment-reminders/batch`)
      .send({ installmentIds: many.slice(0, 100) });

    expect(res.status).toBe(200);
  });

  it('404 propagé (un id d’une autre agence)', async () => {
    sendReminderBatch.mockRejectedValue(new NotFoundError('Échéance introuvable.'));

    const res = await request(buildApp())
      .post(`${URL_BASE}/payment-reminders/batch`)
      .send({ installmentIds: [ID1] });

    expect(res.status).toBe(404);
  });
});

describe('GET /payment-reminders', () => {
  it('200 : défauts de pagination, tenantId du contexte', async () => {
    const page = { items: [], total: 0, page: 1, pageSize: 20 };
    listReminders.mockResolvedValue(page);

    const res = await request(buildApp()).get(`${URL_BASE}/payment-reminders`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: page });
    expect(listReminders).toHaveBeenCalledWith(TENANT, { page: 1, pageSize: 20 });
  });

  it('transmet les filtres convertis', async () => {
    listReminders.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 50 });

    const res = await request(buildApp()).get(`${URL_BASE}/payment-reminders`).query({
      installmentId: ID1,
      leaseId: LEASE,
      channel: 'WHATSAPP',
      status: 'FAILED',
      level: '2',
      from: '2026-01-01',
      to: '2026-01-31',
      page: '2',
      pageSize: '50'
    });

    expect(res.status).toBe(200);
    expect(listReminders).toHaveBeenCalledWith(TENANT, {
      installmentId: ID1,
      leaseId: LEASE,
      channel: 'WHATSAPP',
      status: 'FAILED',
      level: 2,
      from: '2026-01-01',
      to: '2026-01-31',
      page: 2,
      pageSize: 50
    });
  });

  it.each([
    ['from > to', { from: '2026-02-01', to: '2026-01-01' }],
    ['date impossible', { from: '2026-02-31' }],
    ['format de date', { from: '01/02/2026' }],
    ['canal SMS', { channel: 'SMS' }],
    ['statut inconnu', { status: 'SKIPPED' }],
    ['niveau 4', { level: '4' }],
    ['page 0', { page: '0' }],
    ['pageSize 101', { pageSize: '101' }],
    ['uuid invalide', { installmentId: 'x' }],
    ['clé inconnue', { foo: 'bar' }]
  ])('400 VALIDATION_ERROR : %s', async (_n, query) => {
    const res = await request(buildApp()).get(`${URL_BASE}/payment-reminders`).query(query);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(listReminders).not.toHaveBeenCalled();
  });
});

describe('GET /installments/:installmentId/reminders', () => {
  it('200 : liste, tenantId du contexte', async () => {
    listInstallmentReminders.mockResolvedValue([{ id: 'r1' }]);

    const res = await request(buildApp()).get(`${URL_BASE}/installments/${ID1}/reminders`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ id: 'r1' }] });
    expect(listInstallmentReminders).toHaveBeenCalledWith(TENANT, ID1);
  });

  it('400 : uuid invalide', async () => {
    const res = await request(buildApp()).get(`${URL_BASE}/installments/x/reminders`);

    expect(res.status).toBe(400);
  });

  it('404 propagé', async () => {
    listInstallmentReminders.mockRejectedValue(new NotFoundError('Échéance introuvable.'));

    const res = await request(buildApp()).get(`${URL_BASE}/installments/${ID1}/reminders`);

    expect(res.status).toBe(404);
  });
});

describe('routes/rental-payment-reminder-routes.ts : gardes', () => {
  it('chaque route porte sa permission, ses gardes de tenant et son limiteur', () => {
    jest.isolateModules(() => {
      const named = (name: string) => Object.defineProperty(function guard() {}, 'name', { value: name });
      jest.doMock('../../src/middleware/auth-middleware', () => ({ authenticate: function authenticate() {} }));
      jest.doMock('../../src/middleware/tenant-middleware', () => ({
        requireTenantAccess: function requireTenantAccess() {}
      }));
      jest.doMock('../../src/middleware/tenant-isolation-middleware', () => ({
        enforceTenantIsolation: function enforceTenantIsolation() {}
      }));
      jest.doMock('../../src/middleware/rbac-middleware', () => ({
        requirePermission: (key: string) => named(`perm:${key}`)
      }));
      jest.doMock('../../src/lib/rental/payment-reminders/rate-limit', () => ({
        rentalReminderSendRateLimiter: named('limiter:send'),
        rentalReminderBatchRateLimiter: named('limiter:batch')
      }));
      const router = require('../../src/routes/rental-payment-reminder-routes').default;
      const guardsOf = (method: string, path: string): string[] => {
        const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods[method]);
        expect(layer).toBeDefined();
        return layer.route.stack.map((s: any) => s.handle.name);
      };
      const R = '/tenants/:tenantId/rental/payment-reminders';
      const I = '/tenants/:tenantId/rental/installments/:installmentId';
      const base = ['authenticate', 'requireTenantAccess', 'enforceTenantIsolation'];

      expect(guardsOf('get', `${R}/preview`)).toEqual([...base, 'perm:RENTAL_PAYMENTS_VIEW', expect.any(String)]);
      expect(guardsOf('post', `${R}/batch`)).toEqual([
        ...base,
        'perm:RENTAL_PAYMENTS_ALLOCATE',
        'limiter:batch',
        expect.any(String)
      ]);
      expect(guardsOf('get', R)).toEqual([...base, 'perm:RENTAL_PAYMENTS_VIEW', expect.any(String)]);
      expect(guardsOf('post', `${I}/reminder`)).toEqual([
        ...base,
        'perm:RENTAL_PAYMENTS_ALLOCATE',
        'limiter:send',
        expect.any(String)
      ]);
      expect(guardsOf('get', `${I}/reminders`)).toEqual([...base, 'perm:RENTAL_PAYMENTS_VIEW', expect.any(String)]);

      // preview et batch précèdent toute route paramétrée.
      const paths = router.stack.filter((l: any) => l.route).map((l: any) => l.route.path);
      expect(paths.indexOf(`${R}/preview`)).toBeLessThan(paths.indexOf(R));
      expect(paths.indexOf(`${R}/batch`)).toBeLessThan(paths.indexOf(`${I}/reminder`));
    });
  }, 120000);
});
