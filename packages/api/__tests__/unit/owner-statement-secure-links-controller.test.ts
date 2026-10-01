/**
 * `controllers/owner-statement-secure-links-controller.ts` — app Express
 * minimale : handlers réels, vrai `errorHandler`, services mockés à la
 * frontière (`lib/patrimoine/queries`, `lib/patrimoine/notifications`,
 * `lib/secure-links`). Aucun jeton réel, aucun message envoyé.
 */

import express from 'express';
import request from 'supertest';

const getOwnerStatementById = jest.fn();
jest.mock('../../src/lib/patrimoine/queries', () => ({
  getOwnerStatementById: (...a: any[]) => getOwnerStatementById(...a)
}));

const sendOwnerMonthlyReport = jest.fn();
jest.mock('../../src/lib/patrimoine/notifications', () => ({
  sendOwnerMonthlyReport: (...a: any[]) => sendOwnerMonthlyReport(...a)
}));

const createSecureLink = jest.fn();
const listSecureLinks = jest.fn();
const revokeSecureLink = jest.fn();
jest.mock('../../src/lib/secure-links', () => ({
  createSecureLink: (...a: any[]) => createSecureLink(...a),
  listSecureLinks: (...a: any[]) => listSecureLinks(...a),
  revokeSecureLink: (...a: any[]) => revokeSecureLink(...a)
}));

import {
  createOwnerStatementSecureLinkHandler,
  listOwnerStatementSecureLinksHandler,
  revokeOwnerStatementSecureLinkHandler,
  sendOwnerMonthlyReportHandler
} from '../../src/controllers/owner-statement-secure-links-controller';
import { BadRequestError, NotFoundError, errorHandler } from '../../src/middleware/error-middleware';
import { notFound } from '../../src/lib/errors';
import { OWNER_STATEMENT_COMPUTATION_VERSION } from '../../src/lib/patrimoine/owner-statement-computation';

const TENANT = 't1';
const STATEMENT = 'statement-1';
const BASE = `/tenants/${TENANT}/owner-statements/${STATEMENT}`;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).tenantContext = { tenantId: TENANT };
    (req as any).user = { userId: 'user-1' };
    next();
  });
  app.post('/tenants/:tenantId/owner-statements/:statementId/secure-links', createOwnerStatementSecureLinkHandler);
  app.get('/tenants/:tenantId/owner-statements/:statementId/secure-links', listOwnerStatementSecureLinksHandler);
  app.delete(
    '/tenants/:tenantId/owner-statements/:statementId/secure-links/:linkId',
    revokeOwnerStatementSecureLinkHandler
  );
  app.post('/tenants/:tenantId/owner-statements/:statementId/send-monthly-report', sendOwnerMonthlyReportHandler);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  getOwnerStatementById.mockResolvedValue({
    id: STATEMENT,
    tenantId: TENANT,
    status: 'SENT',
    computationVersion: OWNER_STATEMENT_COMPUTATION_VERSION
  });
});

describe('POST /secure-links', () => {
  it('201 : renvoie id, url et expiresAt (jamais le hash), relevé vérifié avant création', async () => {
    const expiresAt = new Date('2026-10-14T00:00:00.000Z');
    createSecureLink.mockResolvedValue({ id: 'link-1', token: 'tok', url: 'https://app.test/r/tok', expiresAt });

    const res = await request(buildApp()).post(`${BASE}/secure-links`).send({ ttlDays: 5 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: { id: 'link-1', url: 'https://app.test/r/tok', expiresAt: expiresAt.toISOString() }
    });
    expect(getOwnerStatementById).toHaveBeenCalledWith(TENANT, STATEMENT);
    expect(createSecureLink).toHaveBeenCalledWith({
      tenantId: TENANT,
      scope: 'OWNER_MONTHLY_REPORT',
      objectType: 'OwnerStatement',
      objectId: STATEMENT,
      createdByUserId: 'user-1',
      ttlDays: 5
    });
  });

  it('201 : corps vide accepté (durée par défaut)', async () => {
    createSecureLink.mockResolvedValue({ id: 'l', token: 't', url: 'u', expiresAt: new Date() });

    const res = await request(buildApp()).post(`${BASE}/secure-links`).send({});

    expect(res.status).toBe(201);
    expect(createSecureLink.mock.calls[0][0].ttlDays).toBeUndefined();
  });

  it('404 : relevé d’une autre agence, aucun lien créé', async () => {
    getOwnerStatementById.mockRejectedValue(notFound('Releve introuvable'));

    const res = await request(buildApp()).post(`${BASE}/secure-links`).send({});

    expect(res.status).toBe(404);
    expect(createSecureLink).not.toHaveBeenCalled();
  });

  it('400 : corps invalide (champ inconnu ou durée non entière)', async () => {
    const unknown = await request(buildApp()).post(`${BASE}/secure-links`).send({ foo: 1 });
    const fractional = await request(buildApp()).post(`${BASE}/secure-links`).send({ ttlDays: 1.5 });

    expect(unknown.status).toBe(400);
    expect(fractional.status).toBe(400);
    expect(createSecureLink).not.toHaveBeenCalled();
  });

  it('400 : durée hors bornes refusée par le service, relayée telle quelle', async () => {
    createSecureLink.mockRejectedValue(new BadRequestError('La durée du lien doit être comprise entre 1 et 30 jours.'));

    const res = await request(buildApp()).post(`${BASE}/secure-links`).send({ ttlDays: 999 });

    expect(res.status).toBe(400);
  });
});

describe('GET /secure-links', () => {
  it('200 : liens actifs de ce relevé uniquement', async () => {
    listSecureLinks.mockResolvedValue([{ id: 'link-1', status: 'ACTIVE' }]);

    const res = await request(buildApp()).get(`${BASE}/secure-links`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ id: 'link-1', status: 'ACTIVE' }] });
    expect(listSecureLinks).toHaveBeenCalledWith(TENANT, {
      scope: 'OWNER_MONTHLY_REPORT',
      objectType: 'OwnerStatement',
      objectId: STATEMENT,
      activeOnly: true
    });
  });

  it('404 : relevé d’une autre agence, aucune lecture de lien', async () => {
    getOwnerStatementById.mockRejectedValue(notFound('Releve introuvable'));

    const res = await request(buildApp()).get(`${BASE}/secure-links`);

    expect(res.status).toBe(404);
    expect(listSecureLinks).not.toHaveBeenCalled();
  });
});

describe('DELETE /secure-links/:linkId', () => {
  it('200 : révoque un lien de ce relevé (filtre objet transmis au service)', async () => {
    revokeSecureLink.mockResolvedValue(undefined);

    const res = await request(buildApp()).delete(`${BASE}/secure-links/link-1`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { revoked: true } });
    expect(revokeSecureLink).toHaveBeenCalledWith(TENANT, 'link-1', 'user-1', {
      objectType: 'OwnerStatement',
      objectId: STATEMENT
    });
    expect(listSecureLinks).not.toHaveBeenCalled();
  });

  it('404 : lien d’un autre relevé ou d’une autre agence (refus du service)', async () => {
    revokeSecureLink.mockRejectedValue(new NotFoundError('Lien introuvable.'));

    const res = await request(buildApp()).delete(`${BASE}/secure-links/link-etranger`);

    expect(res.status).toBe(404);
  });

  it('404 : relevé d’une autre agence', async () => {
    getOwnerStatementById.mockRejectedValue(notFound('Releve introuvable'));

    const res = await request(buildApp()).delete(`${BASE}/secure-links/link-1`);

    expect(res.status).toBe(404);
    expect(revokeSecureLink).not.toHaveBeenCalled();
  });
});

describe('POST /send-monthly-report', () => {
  it('202 : envoyé, envoi manuel forcé avec l’acteur', async () => {
    sendOwnerMonthlyReport.mockResolvedValue({ sent: true, channel: 'WHATSAPP' });

    const res = await request(buildApp()).post(`${BASE}/send-monthly-report`);

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ success: true, data: { sent: true, channel: 'WHATSAPP' } });
    expect(sendOwnerMonthlyReport).toHaveBeenCalledWith(STATEMENT, TENANT, { actorUserId: 'user-1', force: true });
  });

  it('200 : non envoyé, avec la raison', async () => {
    sendOwnerMonthlyReport.mockResolvedValue({ sent: false, channel: null, reason: 'NO_ELIGIBLE_CHANNEL' });

    const res = await request(buildApp()).post(`${BASE}/send-monthly-report`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ sent: false, channel: null, reason: 'NO_ELIGIBLE_CHANNEL' });
  });

  it('404 : relevé d’une autre agence, rien envoyé', async () => {
    getOwnerStatementById.mockRejectedValue(notFound('Releve introuvable'));

    const res = await request(buildApp()).post(`${BASE}/send-monthly-report`);

    expect(res.status).toBe(404);
    expect(sendOwnerMonthlyReport).not.toHaveBeenCalled();
  });

  it('409 : relevé calculé selon l’ancienne méthode', async () => {
    getOwnerStatementById.mockResolvedValue({
      id: STATEMENT,
      status: 'SENT',
      computationVersion: OWNER_STATEMENT_COMPUTATION_VERSION - 1
    });

    const res = await request(buildApp()).post(`${BASE}/send-monthly-report`);

    expect(res.status).toBe(409);
    expect(sendOwnerMonthlyReport).not.toHaveBeenCalled();
  });

  it('409 : relevé DRAFT, rien envoyé', async () => {
    getOwnerStatementById.mockResolvedValue({
      id: STATEMENT,
      status: 'DRAFT',
      computationVersion: OWNER_STATEMENT_COMPUTATION_VERSION
    });

    const res = await request(buildApp()).post(`${BASE}/send-monthly-report`);

    expect(res.status).toBe(409);
    expect(sendOwnerMonthlyReport).not.toHaveBeenCalled();
  });

  it.each(['SENT', 'PAID'])('relevé %s accepté', async status => {
    getOwnerStatementById.mockResolvedValue({
      id: STATEMENT,
      status,
      computationVersion: OWNER_STATEMENT_COMPUTATION_VERSION
    });
    sendOwnerMonthlyReport.mockResolvedValue({ sent: true, channel: 'EMAIL' });

    const res = await request(buildApp()).post(`${BASE}/send-monthly-report`);

    expect(res.status).toBe(202);
  });
});

describe('POST /secure-links : garde du relevé', () => {
  it('409 : relevé DRAFT, aucun lien créé', async () => {
    getOwnerStatementById.mockResolvedValue({
      id: STATEMENT,
      status: 'DRAFT',
      computationVersion: OWNER_STATEMENT_COMPUTATION_VERSION
    });

    const res = await request(buildApp()).post(`${BASE}/secure-links`).send({});

    expect(res.status).toBe(409);
    expect(createSecureLink).not.toHaveBeenCalled();
  });

  it('409 : relevé de version de calcul obsolète, aucun lien créé', async () => {
    getOwnerStatementById.mockResolvedValue({
      id: STATEMENT,
      status: 'SENT',
      computationVersion: OWNER_STATEMENT_COMPUTATION_VERSION - 1
    });

    const res = await request(buildApp()).post(`${BASE}/secure-links`).send({});

    expect(res.status).toBe(409);
    expect(createSecureLink).not.toHaveBeenCalled();
  });

  it.each(['SENT', 'PAID'])('relevé %s accepté : 201', async status => {
    getOwnerStatementById.mockResolvedValue({
      id: STATEMENT,
      status,
      computationVersion: OWNER_STATEMENT_COMPUTATION_VERSION
    });
    createSecureLink.mockResolvedValue({ id: 'l', token: 't', url: 'u', expiresAt: new Date() });

    const res = await request(buildApp()).post(`${BASE}/secure-links`).send({});

    expect(res.status).toBe(201);
  });
});

describe('relevé brouillon : message du 409 (BUG-2026-10-01-006)', () => {
  const DRAFT_MESSAGE =
    "Ce relevé est encore un brouillon : il ne peut être partagé qu'une fois envoyé au propriétaire, depuis la liste des relevés (bouton « Envoyer »).";

  beforeEach(() => {
    getOwnerStatementById.mockResolvedValue({
      id: STATEMENT,
      status: 'DRAFT',
      computationVersion: OWNER_STATEMENT_COMPUTATION_VERSION
    });
  });

  it.each([
    ['secure-links', () => createSecureLink],
    ['send-monthly-report', () => sendOwnerMonthlyReport]
  ])('POST /%s : 409, accents, et action réellement disponible (sans « valider »)', async (route, sideEffect) => {
    const res = await request(buildApp()).post(`${BASE}/${route}`).send({});

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(DRAFT_MESSAGE);
    // L'invite à « valider » est retirée : aucune action de validation n'existe,
    // l'envoi depuis la liste (`POST /send`) est le seul moyen de sortir du brouillon.
    expect(res.body.message).not.toMatch(/valid/i);
    expect(res.body.message).toContain('liste des relevés');
    expect(res.body.message).toContain('Envoyer');
    expect(sideEffect()).not.toHaveBeenCalled();
  });
});
