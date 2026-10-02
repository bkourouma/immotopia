/**
 * Événements d'accès du journal (ADR-006, phase 3) : refus de droit, fichiers
 * et exports servis, posés à partir de la réponse.
 */
import express from 'express';
import request from 'supertest';

const logAuditEvent = jest.fn();
let contextSeenByLogger: any;
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (entry: unknown) => {
    contextSeenByLogger = require('../../src/utils/request-context').getRequestContext();
    return logAuditEvent(entry);
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

import { requestContextMiddleware } from '../../src/middleware/request-context-middleware';
import {
  auditAccessMiddleware,
  normalizeAuditPath,
  resetAuditAccessState
} from '../../src/middleware/audit-access-middleware';
import { setAuditActor } from '../../src/utils/request-context';

const T = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';

const app = express();
app.use(requestContextMiddleware);
app.use(auditAccessMiddleware);
// Simule `authenticate` + `requireTenantAccess` : l'acteur vient d'en-têtes de test.
app.use((req, _res, next) => {
  const user = req.get('x-user');
  if (user) setAuditActor({ userId: user, type: 'USER' });
  const tenant = req.get('x-tenant');
  if (tenant) setAuditActor({ tenantId: tenant });
  next();
});

app.get('/api/tenants/:t/denied-permission', (_req, res) => {
  res.status(403).json({ success: false, error: 'Forbidden', message: 'Permission denied: SYNDIC_EDIT' });
});
app.get('/api/tenants/:t/denied-typed', (_req, res) => {
  res.status(403).json({ success: false, code: 'FORBIDDEN', message: "Vous n'avez pas accès à cette ressource." });
});
app.get('/api/tenants/:t/suspended', (_req, res) => {
  res.status(403).json({ success: false, code: 'TENANT_SUSPENDED', message: 'Cette agence est suspendue.' });
});
app.get('/api/tenants/:t/module', (_req, res) => {
  res.status(403).json({ success: false, code: 'MODULE_NOT_INCLUDED', message: 'Module non inclus.' });
});
app.get('/api/tenants/:t/unauthorized', (_req, res) => {
  res.status(401).json({ success: false });
});
app.get('/api/admin/only', (_req, res) => {
  res.status(403).json({ success: false, message: 'Réservé' });
});
app.get('/api/tenants/:t/docs/:d/pdf', (_req, res) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="Quittance mars.pdf"');
  res.status(200).send(Buffer.from('%PDF'));
});
app.get('/api/tenants/:t/export.csv', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.status(200).send('a;b');
});
app.get('/api/tenants/:t/json', (_req, res) => {
  res.status(200).json({ ok: true });
});
app.get('/api/tenants/:t/data-exports/:e/download', (_req, res) => {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="export.zip"');
  res.status(200).send('zip');
});
app.get('/api/tenants/:t/missing.pdf', (_req, res) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.status(404).send('absent');
});

const flush = () => new Promise(resolve => setImmediate(resolve));
const lastEntry = () => logAuditEvent.mock.calls[logAuditEvent.mock.calls.length - 1][0];

beforeEach(() => {
  logAuditEvent.mockReset();
  contextSeenByLogger = undefined;
  resetAuditAccessState();
});

describe('refus de droit', () => {
  it('un membre privé d’un droit : ACCESS_DENIED avec la permission, sur son agence', async () => {
    await request(app).get(`/api/tenants/${T}/denied-permission`).set('x-user', 'u1').set('x-tenant', T);
    await flush();
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(lastEntry()).toMatchObject({
      actionKey: 'ACCESS_DENIED',
      outcome: 'DENIED',
      entityType: 'Route',
      entityId: 'SYNDIC_EDIT',
      payload: { method: 'GET', path: '/api/tenants/:id/denied-permission', permission: 'SYNDIC_EDIT' }
    });
  });

  it('le contexte de la requête (acteur, agence, requestId) est rétabli pour l’écriture', async () => {
    await request(app).get(`/api/tenants/${T}/denied-permission`).set('x-user', 'u1').set('x-tenant', T);
    await flush();
    expect(contextSeenByLogger.actor).toMatchObject({ userId: 'u1', tenantId: T });
    expect(contextSeenByLogger.requestId).toBeTruthy();
  });

  it('un refus typé (ForbiddenError, code FORBIDDEN) est tracé aussi', async () => {
    await request(app).get(`/api/tenants/${T}/denied-typed`).set('x-user', 'u1').set('x-tenant', T);
    await flush();
    expect(lastEntry()).toMatchObject({ actionKey: 'ACCESS_DENIED', entityId: '/api/tenants/:id/denied-typed' });
  });

  it('un étranger sur l’URL d’une agence : TENANT_ACCESS_DENIED, rattaché à aucune agence', async () => {
    await request(app).get(`/api/tenants/${T}/denied-permission`).set('x-user', 'outsider');
    await flush();
    expect(lastEntry()).toMatchObject({
      actionKey: 'TENANT_ACCESS_DENIED',
      tenantId: null,
      entityId: T,
      payload: { targetTenantId: T }
    });
  });

  it('une route réservée à la plateforme, sans agence : ACCESS_DENIED sans agence', async () => {
    await request(app).get('/api/admin/only').set('x-user', 'u1');
    await flush();
    expect(lastEntry()).toMatchObject({ actionKey: 'ACCESS_DENIED' });
    expect(lastEntry().tenantId).toBeUndefined();
  });

  it.each(['suspended', 'module'])('un 403 commercial (%s) n’est pas un refus de droit', async path => {
    await request(app).get(`/api/tenants/${T}/${path}`).set('x-user', 'u1').set('x-tenant', T);
    await flush();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('ne trace ni un 401, ni un 403 sans utilisateur identifié', async () => {
    await request(app).get(`/api/tenants/${T}/unauthorized`).set('x-user', 'u1').set('x-tenant', T);
    await request(app).get(`/api/tenants/${T}/denied-permission`);
    await flush();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe('anti-inondation des refus', () => {
  it('le même refus répété dans la minute ne fait qu’une ligne', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).get(`/api/tenants/${T}/denied-permission`).set('x-user', 'u1').set('x-tenant', T);
    }
    await flush();
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('un autre utilisateur, ou une autre route, est tracé', async () => {
    await request(app).get(`/api/tenants/${T}/denied-permission`).set('x-user', 'u1').set('x-tenant', T);
    await request(app).get(`/api/tenants/${T}/denied-permission`).set('x-user', 'u2').set('x-tenant', T);
    await request(app).get(`/api/tenants/${T}/denied-typed`).set('x-user', 'u1').set('x-tenant', T);
    await flush();
    expect(logAuditEvent).toHaveBeenCalledTimes(3);
  });

  it('plafonne à 30 refus tracés par minute et par utilisateur', async () => {
    for (let i = 0; i < 40; i++) {
      // identifiants d'agence distincts : chaque refus a une signature différente
      const other = `${i.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;
      await request(app).get(`/api/tenants/${other}/denied-permission`).set('x-user', 'u1').set('x-tenant', other);
    }
    await flush();
    expect(logAuditEvent.mock.calls.length).toBeLessThanOrEqual(30);
    expect(logAuditEvent.mock.calls.length).toBeGreaterThan(0);
  });
});

describe('fichiers et exports servis', () => {
  it('un PDF : DOCUMENT_DOWNLOADED, sur l’objet visé et non sur l’agence, avec le nom du fichier', async () => {
    await request(app).get(`/api/tenants/${T}/docs/${DOC}/pdf`).set('x-user', 'u1').set('x-tenant', T);
    await flush();
    expect(lastEntry()).toMatchObject({
      actionKey: 'DOCUMENT_DOWNLOADED',
      entityType: 'File',
      entityId: DOC,
      payload: {
        method: 'GET',
        path: '/api/tenants/:id/docs/:id/pdf',
        contentType: 'application/pdf',
        filename: 'Quittance mars.pdf'
      }
    });
  });

  it('un CSV : DATA_EXPORTED', async () => {
    await request(app).get(`/api/tenants/${T}/export.csv`).set('x-user', 'u1').set('x-tenant', T);
    await flush();
    expect(lastEntry()).toMatchObject({ actionKey: 'DATA_EXPORTED', payload: { contentType: 'text/csv' } });
  });

  it('ne trace ni une réponse JSON, ni un 404, ni un appel anonyme', async () => {
    await request(app).get(`/api/tenants/${T}/json`).set('x-user', 'u1').set('x-tenant', T);
    await request(app).get(`/api/tenants/${T}/missing.pdf`).set('x-user', 'u1').set('x-tenant', T);
    await request(app).get(`/api/tenants/${T}/docs/${DOC}/pdf`);
    await flush();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('ne double pas l’export de données d’agence, qui a ses propres événements', async () => {
    await request(app).get(`/api/tenants/${T}/data-exports/${DOC}/download`).set('x-user', 'u1').set('x-tenant', T);
    await flush();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe('robustesse', () => {
  it('une erreur d’écriture du journal ne perturbe jamais la réponse', async () => {
    logAuditEvent.mockImplementation(() => {
      throw new Error('journal indisponible');
    });
    const res = await request(app).get(`/api/tenants/${T}/denied-permission`).set('x-user', 'u1').set('x-tenant', T);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Permission denied: SYNDIC_EDIT');
  });

  it('normalise les identifiants et coupe la requête', () => {
    expect(normalizeAuditPath(`/api/tenants/${T}/docs/${DOC}/pdf?token=secret&x=1`)).toBe(
      '/api/tenants/:id/docs/:id/pdf'
    );
  });
});
