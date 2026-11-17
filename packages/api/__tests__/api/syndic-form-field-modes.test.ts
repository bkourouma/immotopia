/**
 * Formulaires paramétrables (lot SA) : le middleware `formFieldModes` est monté
 * sur les routes d'écriture du Syndic. Trois routes représentatives : un POST
 * (appel de charges), un PATCH partiel (assemblée) et le multipart (documents,
 * après multer). `getEffectiveFieldModes` est simulé.
 */
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
    req.tenantContext = { tenantId: req.originalUrl.split('/')[3], isCollaborator: true, isClient: false };
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
jest.mock('../../src/lib/form-settings/service', () => ({
  getEffectiveFieldModes: jest.fn()
}));

const captured: Record<string, any> = {};
jest.mock('../../src/controllers/syndic-controller', () => {
  const actual = jest.requireActual('../../src/controllers/syndic-controller');
  const capture = (name: string) => (req: any, res: any) => {
    captured[name] = { body: { ...req.body }, file: req.file };
    res.status(200).json({ success: true });
  };
  return {
    ...actual,
    createChargeCallHandler: capture('charge'),
    updateMeetingHandler: capture('meeting'),
    createDocumentHandler: capture('document')
  };
});

import syndicRoutes from '../../src/routes/syndic-routes';
import { errorHandler } from '../../src/middleware/error-middleware';
import { getEffectiveFieldModes } from '../../src/lib/form-settings/service';

const mockModes = getEffectiveFieldModes as jest.Mock;
const base = '/api/tenants/t-1/syndics/s-1';

function modes(formKey: string, fields: Record<string, 'OPTIONAL' | 'REQUIRED' | 'HIDDEN'>) {
  mockModes.mockResolvedValue({ formKey, fields });
}

describe('formFieldModes monté sur les routes Syndic', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', syndicRoutes);
  app.use(errorHandler);

  beforeEach(() => {
    mockModes.mockReset();
    for (const k of Object.keys(captured)) delete captured[k];
  });

  it('POST charges : champ REQUIRED absent -> 400 FORM_FIELD_REQUIRED', async () => {
    modes('syndic.appel-de-charges', { fundId: 'REQUIRED' });
    const res = await request(app).post(`${base}/charges`).send({ period: '2026-01' });
    expect(res.status).toBe(400);
    expect(res.body.error?.code ?? res.body.code).toBe('FORM_FIELD_REQUIRED');
    expect(mockModes).toHaveBeenCalledWith('t-1', 'syndic.appel-de-charges', undefined);
    expect(captured.charge).toBeUndefined();
  });

  it('POST charges : champ HIDDEN supprimé du corps', async () => {
    modes('syndic.appel-de-charges', { isRecurring: 'HIDDEN' });
    const res = await request(app).post(`${base}/charges`).send({ period: '2026-01', isRecurring: true });
    expect(res.status).toBe(200);
    expect(captured.charge.body).toEqual({ period: '2026-01' });
  });

  it('PATCH assemblée (partiel) : REQUIRED absent accepté, REQUIRED vide refusé, HIDDEN supprimé', async () => {
    modes('syndic.assemblee-informations', { location: 'REQUIRED', videoConferenceUrl: 'HIDDEN' });
    const ok = await request(app)
      .patch(`${base}/assemblees/m-1`)
      .send({ status: 'COMPLETED', videoConferenceUrl: 'x' });
    expect(ok.status).toBe(200);
    expect(captured.meeting.body).toEqual({ status: 'COMPLETED' });

    const empty = await request(app).patch(`${base}/assemblees/m-1`).send({ location: '  ' });
    expect(empty.status).toBe(400);
    expect(empty.body.error?.code ?? empty.body.code).toBe('FORM_FIELD_REQUIRED');
  });

  it('POST documents (multipart) : contrôlé après multer', async () => {
    modes('syndic.document', { expiresAt: 'REQUIRED', visibleToCoOwners: 'HIDDEN' });
    const missing = await request(app)
      .post(`${base}/documents`)
      .field('title', 'Règlement')
      .field('visibleToCoOwners', 'true')
      .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(missing.status).toBe(400);
    expect(missing.body.error?.code ?? missing.body.code).toBe('FORM_FIELD_REQUIRED');

    const ok = await request(app)
      .post(`${base}/documents`)
      .field('title', 'Règlement')
      .field('expiresAt', '2027-01-01')
      .field('visibleToCoOwners', 'true')
      .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(ok.status).toBe(200);
    expect(captured.document.body.visibleToCoOwners).toBeUndefined();
    expect(captured.document.body.expiresAt).toBe('2027-01-01');
  });
});
