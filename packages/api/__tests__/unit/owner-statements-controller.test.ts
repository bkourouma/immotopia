/**
 * `controllers/owner-statements-controller.ts` — bout en bout léger sur une
 * app Express minimale : les handlers réels, le vrai `errorHandler`, et
 * `lib/patrimoine/queries` / `lib/patrimoine/notifications` mockés à la
 * frontière service (règle de `.claude/rules/testing.md` : un test de
 * contrôleur mocke le service, pas Prisma). `owner-statement-computation`
 * reste réel : c'est une constante pure, sans accès base.
 */

import express from 'express';
import request from 'supertest';

const listOwnerStatements = jest.fn();
const getOwnerStatementById = jest.fn();
const generateOwnerStatement = jest.fn();
const updateOwnerStatement = jest.fn();
const recomputeOwnerStatement = jest.fn();

jest.mock('../../src/lib/patrimoine/queries', () => ({
  listOwnerStatements: (...a: any[]) => listOwnerStatements(...a),
  getOwnerStatementById: (...a: any[]) => getOwnerStatementById(...a),
  generateOwnerStatement: (...a: any[]) => generateOwnerStatement(...a),
  updateOwnerStatement: (...a: any[]) => updateOwnerStatement(...a),
  recomputeOwnerStatement: (...a: any[]) => recomputeOwnerStatement(...a)
}));

const sendOwnerStatement = jest.fn();
jest.mock('../../src/lib/patrimoine/notifications', () => ({
  sendOwnerStatement: (...a: any[]) => sendOwnerStatement(...a)
}));

import {
  createOwnerStatementHandler,
  getOwnerStatementHandler,
  listOwnerStatementsHandler,
  recomputeOwnerStatementHandler,
  sendOwnerStatementHandler,
  updateOwnerStatementHandler
} from '../../src/controllers/owner-statements-controller';
import { errorHandler } from '../../src/middleware/error-middleware';
import { badRequest, conflict, notFound } from '../../src/lib/errors';
import { ConflictError } from '../../src/middleware/error-middleware';
import { OWNER_STATEMENT_COMPUTATION_VERSION } from '../../src/lib/patrimoine/owner-statement-computation';

const TENANT = 't1';
const STATEMENT_ID = 'statement-1';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).tenantContext = { tenantId: TENANT };
    next();
  });
  app.get('/tenants/:tenantId/owner-statements', listOwnerStatementsHandler);
  app.post('/tenants/:tenantId/owner-statements', createOwnerStatementHandler);
  app.get('/tenants/:tenantId/owner-statements/:statementId', getOwnerStatementHandler);
  app.patch('/tenants/:tenantId/owner-statements/:statementId', updateOwnerStatementHandler);
  app.post('/tenants/:tenantId/owner-statements/:statementId/recompute', recomputeOwnerStatementHandler);
  app.post('/tenants/:tenantId/owner-statements/:statementId/send', sendOwnerStatementHandler);
  app.use(errorHandler);
  return app;
}

function baseStatement(overrides: Record<string, unknown> = {}) {
  return {
    id: STATEMENT_ID,
    tenantId: TENANT,
    computationVersion: OWNER_STATEMENT_COMPUTATION_VERSION,
    period: '2026-01',
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /owner-statements — liste', () => {
  it('200 : renvoie la liste', async () => {
    listOwnerStatements.mockResolvedValue([baseStatement()]);

    const res = await request(buildApp()).get(`/tenants/${TENANT}/owner-statements`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [baseStatement()] });
  });
});

describe('POST /owner-statements — création', () => {
  it('400 : corps invalide (ZodError), le service n’est pas appelé', async () => {
    const res = await request(buildApp())
      .post(`/tenants/${TENANT}/owner-statements`)
      .send({ ownerContactId: 'pas-un-uuid' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeTruthy();
    expect(generateOwnerStatement).not.toHaveBeenCalled();
  });

  it('400 : le service lève une erreur badRequest (lib/errors)', async () => {
    generateOwnerStatement.mockRejectedValue(badRequest('Periode invalide, format attendu YYYY-MM'));

    const res = await request(buildApp())
      .post(`/tenants/${TENANT}/owner-statements`)
      .send({
        ownerContactId: '11111111-1111-1111-1111-111111111111',
        period: '2026-01',
        propertyIds: ['22222222-2222-2222-2222-222222222222']
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('409 : le service lève une erreur conflict (lib/errors)', async () => {
    generateOwnerStatement.mockRejectedValue(conflict('Ce releve est deja regle'));

    const res = await request(buildApp())
      .post(`/tenants/${TENANT}/owner-statements`)
      .send({
        ownerContactId: '11111111-1111-1111-1111-111111111111',
        period: '2026-01',
        propertyIds: ['22222222-2222-2222-2222-222222222222']
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('201 : succès', async () => {
    generateOwnerStatement.mockResolvedValue(baseStatement());

    const res = await request(buildApp())
      .post(`/tenants/${TENANT}/owner-statements`)
      .send({
        ownerContactId: '11111111-1111-1111-1111-111111111111',
        period: '2026-01',
        propertyIds: ['22222222-2222-2222-2222-222222222222']
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: baseStatement() });
  });
});

describe('GET /owner-statements/:id — détail', () => {
  it('404 : releve introuvable (notFound de lib/errors)', async () => {
    getOwnerStatementById.mockRejectedValue(notFound('Releve introuvable'));

    const res = await request(buildApp()).get(`/tenants/${TENANT}/owner-statements/${STATEMENT_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('200 : succès', async () => {
    getOwnerStatementById.mockResolvedValue(baseStatement());

    const res = await request(buildApp()).get(`/tenants/${TENANT}/owner-statements/${STATEMENT_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: baseStatement() });
  });
});

describe('POST /owner-statements/:id/send — envoi', () => {
  it('404 : releve introuvable dès la lecture (getOwnerStatementById)', async () => {
    getOwnerStatementById.mockRejectedValue(notFound('Releve introuvable'));

    const res = await request(buildApp()).post(`/tenants/${TENANT}/owner-statements/${STATEMENT_ID}/send`);

    expect(res.status).toBe(404);
    expect(sendOwnerStatement).not.toHaveBeenCalled();
  });

  it('409 : computationVersion trop ancienne, sendOwnerStatement non appelé', async () => {
    getOwnerStatementById.mockResolvedValue(
      baseStatement({ computationVersion: OWNER_STATEMENT_COMPUTATION_VERSION - 1 })
    );

    const res = await request(buildApp()).post(`/tenants/${TENANT}/owner-statements/${STATEMENT_ID}/send`);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(sendOwnerStatement).not.toHaveBeenCalled();
  });

  it('409 : sendOwnerStatement refuse faute de consentement (ConflictError)', async () => {
    getOwnerStatementById.mockResolvedValue(baseStatement());
    sendOwnerStatement.mockRejectedValue(new ConflictError("Le propriétaire n'a pas consenti."));

    const res = await request(buildApp()).post(`/tenants/${TENANT}/owner-statements/${STATEMENT_ID}/send`);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('202 : envoi réussi (sent: true)', async () => {
    getOwnerStatementById.mockResolvedValue(baseStatement());
    sendOwnerStatement.mockResolvedValue({ sent: true, whatsappSent: false });

    const res = await request(buildApp()).post(`/tenants/${TENANT}/owner-statements/${STATEMENT_ID}/send`);

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ success: true, data: { sent: true, whatsappSent: false } });
  });

  it('200 : envoi non déclenché (sent: false)', async () => {
    getOwnerStatementById.mockResolvedValue(baseStatement());
    sendOwnerStatement.mockResolvedValue({ sent: false, reason: 'EVENT_DISABLED' });

    const res = await request(buildApp()).post(`/tenants/${TENANT}/owner-statements/${STATEMENT_ID}/send`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { sent: false, reason: 'EVENT_DISABLED' } });
  });
});

describe('PATCH /owner-statements/:id — mise à jour', () => {
  it('200 : succès', async () => {
    updateOwnerStatement.mockResolvedValue(baseStatement({ status: 'PAID' }));

    const res = await request(buildApp())
      .patch(`/tenants/${TENANT}/owner-statements/${STATEMENT_ID}`)
      .send({ status: 'PAID' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: baseStatement({ status: 'PAID' }) });
  });
});

describe('POST /owner-statements/:id/recompute — recalcul', () => {
  it('200 : succès', async () => {
    recomputeOwnerStatement.mockResolvedValue(baseStatement());

    const res = await request(buildApp()).post(`/tenants/${TENANT}/owner-statements/${STATEMENT_ID}/recompute`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: baseStatement() });
  });
});
