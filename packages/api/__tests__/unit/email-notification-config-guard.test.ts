/**
 * TEN-05 : ecriture des gabarits e-mail reservee a TENANT_SETTINGS_EDIT ; sujet et corps assainis a l'ecriture.
 */
const mockHasPermission = jest.fn();
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: (...a: unknown[]) => mockHasPermission(...a)
}));
jest.mock('../../src/middleware/auth-middleware', () => ({ authenticate: (_q: any, _s: any, n: any) => n() }));
jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (_q: any, _s: any, n: any) => n(),
  requireTenantCollaborator: (_q: any, _s: any, n: any) => n()
}));
jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  enforceTenantIsolation: (_q: any, _s: any, n: any) => n()
}));
jest.mock('../../src/lib/subscription/notification-feature-gate', () => ({
  requireNotificationKeyFeature: (_q: any, _s: any, n: any) => n(),
  filterNotificationItems: async (_t: string, items: unknown) => items
}));
const mockUpsert = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: { emailNotificationConfig: { upsert: (...a: unknown[]) => mockUpsert(...a), deleteMany: jest.fn() } }
}));

// jsdom/dompurify (ESM-only) ne se chargent pas sous Jest : espion qui retire script/handlers/javascript:.
// La conservation des placeholders par le vrai DOMPurify est verifiee hors Jest (voir rapport).
const mockSanitize = jest.fn((html: string) =>
  html
    .replace(/<script.*?<\/script>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/\s(on\w+|href)="?(javascript:[^" >]*|[^" >]*)"?/gi, (m: string, a: string, v: string) =>
      a.toLowerCase() === 'href' && !/^javascript:/i.test(v) ? m : ''
    )
);
jest.mock('../../src/utils/sanitize-html', () => ({ sanitizeHtml: (h: string) => mockSanitize(h) }));

import express from 'express';
import request from 'supertest';
import router from '../../src/routes/email-notification-config-routes';
import {
  sanitizeEmailBody,
  sanitizeEmailSubject,
  updateEmailNotificationConfig
} from '../../src/services/email-notification-config-service';
import { EMAIL_NOTIFICATION_KEYS } from '../../src/constants/email-notification-keys';

const KEY = EMAIL_NOTIFICATION_KEYS[0];

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.user = { userId: 'u1' };
    req.tenantContext = { tenantId: 't1' };
    next();
  });
  a.use('/api/tenants/:tenantId/email-notifications', router);
  return a;
}

describe('TEN-05 garde d ecriture', () => {
  beforeEach(() => {
    mockHasPermission.mockReset();
    mockUpsert.mockReset();
  });

  it('refuse PATCH et POST reset sans TENANT_SETTINGS_EDIT (403)', async () => {
    mockHasPermission.mockResolvedValue(false);
    const base = `/api/tenants/t1/email-notifications/${KEY}`;
    expect((await request(app()).patch(base).send({ enabled: false })).status).toBe(403);
    expect((await request(app()).post(`${base}/reset`)).status).toBe(403);
    expect(mockHasPermission).toHaveBeenCalledWith('u1', 'TENANT_SETTINGS_EDIT', 't1');
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('admin (droit accorde) : passe la garde', async () => {
    mockHasPermission.mockResolvedValue(true);
    mockUpsert.mockResolvedValue({
      id: 'c',
      tenant_id: 't1',
      notification_key: KEY,
      enabled: false,
      subject_override: null,
      body_html_override: null,
      created_at: new Date(),
      updated_at: new Date()
    });
    const res = await request(app()).patch(`/api/tenants/t1/email-notifications/${KEY}`).send({ enabled: false });
    expect(res.status).toBe(200);
  });

  it('la lecture reste ouverte aux collaborateurs (aucune permission demandee)', async () => {
    mockHasPermission.mockResolvedValue(false);
    const layer = (router as any).stack.find((l: any) => l.route?.path === '/' && l.route.methods.get);
    expect(layer.route.stack).toHaveLength(1);
  });
});

describe('TEN-05 assainissement', () => {
  it('passe par sanitizeHtml, retire script/onerror/javascript: et garde les placeholders', async () => {
    mockSanitize.mockClear();
    const out = (await sanitizeEmailBody(
      '<p>Bonjour {{name}}</p><script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">x</a>' +
        '<img src=x onerror=alert(1)><a href="{{paymentUrl}}">Payer {{amount}}</a>'
    )) as string;
    expect(out).not.toMatch(/script|onerror|onclick|javascript:|<img/i);
    expect(out).toContain('{{name}}');
    expect(out).toContain('href="{{paymentUrl}}"');
    expect(out).toContain('{{amount}}');
    expect(mockSanitize).toHaveBeenCalledTimes(1);
  });

  it('retire sauts de ligne et caracteres de controle du sujet, borne la longueur', () => {
    expect(sanitizeEmailSubject('Avis {{name}}\r\nBcc: evil@x.com\u0000')).toBe('Avis {{name}} Bcc: evil@x.com');
    expect(sanitizeEmailSubject('a'.repeat(900))).toHaveLength(500);
    expect(sanitizeEmailSubject('   ')).toBeNull();
  });

  it('applique l assainissement a l ecriture', async () => {
    mockUpsert.mockResolvedValue({
      id: 'c',
      tenant_id: 't1',
      notification_key: KEY,
      enabled: true,
      subject_override: 's',
      body_html_override: 'b',
      created_at: new Date(),
      updated_at: new Date()
    });
    await updateEmailNotificationConfig('t1', KEY, {
      subjectOverride: 'Hi\nBcc: x',
      bodyHtmlOverride: '<p>ok</p><script>x</script>'
    });
    const arg = mockUpsert.mock.calls[0][0];
    expect(arg.update.subject_override).toBe('Hi Bcc: x');
    expect(arg.update.body_html_override).toBe('<p>ok</p>');
    expect(arg.create.body_html_override).toBe('<p>ok</p>');
  });
});
