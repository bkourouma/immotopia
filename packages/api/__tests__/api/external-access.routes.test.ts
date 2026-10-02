/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import request from 'supertest';

/**
 * Routes d'agence des accès tiers de confiance (lot B3) — bout en bout via
 * `supertest` : `authenticate`, `requireTenantAccess` et les gardes RBAC sont
 * remplacés par des passe-plats (les permissions réellement demandées par
 * chaque route sont enregistrées et contrôlées) ; seul le domaine
 * (`lib/external-access`, services) est simulé, ses schémas zod sont réels.
 * Modèle : `__tests__/api/patrimoine.entities.routes.test.ts`.
 */

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    // Le contexte d'agence vient de l'URL, jamais du corps.
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));

/** Droits de l'appelant de test : en-tête `x-perms` (liste séparée par des virgules). */
const granted = (req: any): string[] =>
  String(req.headers['x-perms'] || '')
    .split(',')
    .filter(Boolean);
jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requirePropertyPermission: (key: string) => (req: any, res: any, next: any) =>
    granted(req).includes(key)
      ? next()
      : res.status(403).json({ success: false, message: `Permission denied: ${key}` }),
  requireAnyPropertyPermission: (keys: string[]) => (req: any, res: any, next: any) =>
    keys.some(key => granted(req).includes(key))
      ? next()
      : res.status(403).json({ success: false, message: `Permission denied: ${keys.join(',')}` })
}));

const domain = {
  listExternalAccessGrants: jest.fn(),
  getExternalAccessScopeOptions: jest.fn(),
  listPropertyDocumentsForSharing: jest.fn(),
  createExternalAccessGrant: jest.fn(),
  getExternalAccessGrantDetail: jest.fn(),
  updateExternalAccessGrant: jest.fn(),
  revokeExternalAccessGrant: jest.fn(),
  sendExternalAccessLink: jest.fn(),
  listExternalAccessLog: jest.fn()
};
jest.mock('../../src/lib/external-access', () => ({
  ...jest.requireActual('../../src/lib/external-access/schemas'),
  listExternalAccessGrants: (...a: any[]) => domain.listExternalAccessGrants(...a),
  getExternalAccessScopeOptions: (...a: any[]) => domain.getExternalAccessScopeOptions(...a),
  listPropertyDocumentsForSharing: (...a: any[]) => domain.listPropertyDocumentsForSharing(...a),
  createExternalAccessGrant: (...a: any[]) => domain.createExternalAccessGrant(...a),
  getExternalAccessGrantDetail: (...a: any[]) => domain.getExternalAccessGrantDetail(...a),
  updateExternalAccessGrant: (...a: any[]) => domain.updateExternalAccessGrant(...a),
  revokeExternalAccessGrant: (...a: any[]) => domain.revokeExternalAccessGrant(...a),
  sendExternalAccessLink: (...a: any[]) => domain.sendExternalAccessLink(...a),
  listExternalAccessLog: (...a: any[]) => domain.listExternalAccessLog(...a)
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const externalAccessRoutes = require('../../src/routes/external-access-routes').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { errorHandler, NotFoundError, ConflictError } = require('../../src/middleware/error-middleware');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', externalAccessRoutes);
  app.use(errorHandler);
  return app;
}

const TENANT = 'tenant-1';
const BASE = `/api/tenants/${TENANT}/patrimoine/external-access`;
const VIEW = 'PROPERTIES_VIEW';
const EDIT = 'PROPERTIES_EDIT';
const app = buildApp();

const validCreate = () => ({
  type: 'NOTARY',
  recipientName: 'Maître Koné',
  recipientEmail: 'notaire@example.test',
  propertyIds: ['p1'],
  documentIds: []
});

beforeEach(() => {
  for (const fn of Object.values(domain)) fn.mockReset();
});

describe('permissions : VIEW pour lire, EDIT pour écrire', () => {
  const reads: Array<[string, string, jest.Mock]> = [
    ['GET', BASE, domain.listExternalAccessGrants],
    ['GET', `${BASE}/scope-options`, domain.getExternalAccessScopeOptions],
    ['GET', `${BASE}/property-documents/p1`, domain.listPropertyDocumentsForSharing],
    ['GET', `${BASE}/g1`, domain.getExternalAccessGrantDetail],
    ['GET', `${BASE}/g1/access-log`, domain.listExternalAccessLog]
  ];
  const writes: Array<[string, string, object | undefined, jest.Mock]> = [
    ['POST', BASE, validCreate(), domain.createExternalAccessGrant],
    ['PATCH', `${BASE}/g1`, { recipientName: 'X' }, domain.updateExternalAccessGrant],
    ['POST', `${BASE}/g1/revoke`, {}, domain.revokeExternalAccessGrant],
    ['POST', `${BASE}/g1/send-link`, {}, domain.sendExternalAccessLink]
  ];

  it.each(reads)(
    '%s %s : refusé sans droit de lecture (403), accepté avec PROPERTIES_VIEW',
    async (method, path, fn) => {
      fn.mockResolvedValue({ items: [] });
      const denied = await (request(app) as any)[method.toLowerCase()](path).set('x-perms', EDIT);
      expect(denied.status).toBe(403);
      expect(fn).not.toHaveBeenCalled();
      const ok = await (request(app) as any)[method.toLowerCase()](path).set('x-perms', VIEW);
      expect(ok.status).toBe(200);
      expect(ok.body.success).toBe(true);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  );

  it.each(writes)(
    '%s %s : refusé avec la seule lecture (403), accepté avec PROPERTIES_EDIT',
    async (method, path, body, fn) => {
      fn.mockResolvedValue({ grant: {}, link: {}, email: {} });
      const denied = await (request(app) as any)[method.toLowerCase()](path).set('x-perms', VIEW).send(body);
      expect(denied.status).toBe(403);
      expect(fn).not.toHaveBeenCalled();
      const ok = await (request(app) as any)[method.toLowerCase()](path).set('x-perms', EDIT).send(body);
      expect([200, 201]).toContain(ok.status);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  );

  it('aucune permission : 403 partout', async () => {
    expect((await request(app).get(BASE)).status).toBe(403);
    expect((await request(app).post(BASE).send(validCreate())).status).toBe(403);
    expect((await request(app).post(`${BASE}/g1/revoke`).send({})).status).toBe(403);
  });
});

describe('POST / (création)', () => {
  it('201 : l’agence et l’acteur viennent de l’URL et de la session, le corps est validé puis transmis', async () => {
    const created = {
      grant: { id: 'g1', status: 'ACTIVE' },
      link: { id: 'l1', url: 'https://app.example.test/acces-partage#TOKEN', expiresAt: '2026-10-08T00:00:00.000Z' },
      email: { sent: true }
    };
    domain.createExternalAccessGrant.mockResolvedValue(created);
    const res = await request(app)
      .post(BASE)
      .set('x-perms', EDIT)
      .send({ ...validCreate(), sendEmail: false });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: created });
    const [tenantId, actorId, input] = domain.createExternalAccessGrant.mock.calls[0];
    expect(tenantId).toBe(TENANT);
    expect(actorId).toBe('user-1');
    expect(input).toMatchObject({
      type: 'NOTARY',
      recipientEmail: 'notaire@example.test',
      propertyIds: ['p1'],
      sendEmail: false
    });
  });

  it('un tenantId dans le corps est refusé (400), jamais lu', async () => {
    const res = await request(app)
      .post(BASE)
      .set('x-perms', EDIT)
      .send({ ...validCreate(), tenantId: 'tenant-b' });
    expect(res.status).toBe(400);
    expect(domain.createExternalAccessGrant).not.toHaveBeenCalled();
  });

  it.each([
    ['sections vides', { sections: [] }],
    ['e-mail invalide', { recipientEmail: 'nope' }],
    ['expiration passée', { expiresAt: '2020-01-01T00:00:00.000Z' }],
    ['type inconnu', { type: 'AVOCAT' }],
    ['trop de biens', { propertyIds: Array.from({ length: 201 }, (_, i) => `p${i}`) }],
    ['entité non uuid', { entityIds: ['x'] }],
    ['rubrique inconnue', { sections: ['TOUT'] }]
  ])('400 : %s', async (_label, patch) => {
    const res = await request(app)
      .post(BASE)
      .set('x-perms', EDIT)
      .send({ ...validCreate(), ...patch });
    expect(res.status).toBe(400);
    expect(domain.createExternalAccessGrant).not.toHaveBeenCalled();
  });

  it('404 identique quand le domaine refuse un bien, une entité ou un propriétaire d’une autre agence (IDOR)', async () => {
    domain.createExternalAccessGrant.mockRejectedValue(new NotFoundError('Bien introuvable.'));
    const res = await request(app)
      .post(BASE)
      .set('x-perms', EDIT)
      .send({ ...validCreate(), propertyIds: ['p-autre-agence'] });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, message: 'Bien introuvable.' });
  });
});

describe('/:grantId', () => {
  it('GET détail et journal : l’agence de l’URL est transmise', async () => {
    domain.getExternalAccessGrantDetail.mockResolvedValue({ id: 'g1' });
    domain.listExternalAccessLog.mockResolvedValue({ items: [] });
    await request(app).get(`${BASE}/g1`).set('x-perms', VIEW);
    await request(app).get(`${BASE}/g1/access-log?limit=10`).set('x-perms', VIEW);
    expect(domain.getExternalAccessGrantDetail).toHaveBeenCalledWith(TENANT, 'g1');
    expect(domain.listExternalAccessLog).toHaveBeenCalledWith(TENANT, 'g1', 10);
  });

  it('journal : limite bornée à 100 (400 au-delà)', async () => {
    domain.listExternalAccessLog.mockResolvedValue({ items: [] });
    const res = await request(app).get(`${BASE}/g1/access-log?limit=500`).set('x-perms', VIEW);
    expect(res.status).toBe(400);
    expect(domain.listExternalAccessLog).not.toHaveBeenCalled();
  });

  it('un accès d’une autre agence ou inexistant : 404 sur chaque route', async () => {
    const missing = new NotFoundError('Accès introuvable.');
    for (const fn of Object.values(domain)) fn.mockRejectedValue(missing);
    const calls = [
      request(app).get(`${BASE}/g-b`).set('x-perms', VIEW),
      request(app).get(`${BASE}/g-b/access-log`).set('x-perms', VIEW),
      request(app).patch(`${BASE}/g-b`).set('x-perms', EDIT).send({ recipientName: 'X' }),
      request(app).post(`${BASE}/g-b/revoke`).set('x-perms', EDIT).send({}),
      request(app).post(`${BASE}/g-b/send-link`).set('x-perms', EDIT).send({})
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ success: false, message: 'Accès introuvable.' });
    }
  });

  it('PATCH : champ non modifiable (type, agence) refusé ; corps vide refusé', async () => {
    for (const body of [{ type: 'BANKER' }, { tenantId: 'x' }, {}, { sections: [] }, { expiresAt: '2001-01-01' }]) {
      const res = await request(app).patch(`${BASE}/g1`).set('x-perms', EDIT).send(body);
      expect(res.status).toBe(400);
    }
    expect(domain.updateExternalAccessGrant).not.toHaveBeenCalled();
  });

  it('PATCH sur un accès révoqué : le 409 du domaine remonte tel quel', async () => {
    domain.updateExternalAccessGrant.mockRejectedValue(new ConflictError('Cet accès est révoqué.'));
    const res = await request(app).patch(`${BASE}/g1`).set('x-perms', EDIT).send({ recipientName: 'Autre' });
    expect(res.status).toBe(409);
  });

  it('PATCH valide : acteur et corps validés transmis, expiration nulle comprise (permanent)', async () => {
    domain.updateExternalAccessGrant.mockResolvedValue({ id: 'g1' });
    const res = await request(app)
      .patch(`${BASE}/g1`)
      .set('x-perms', EDIT)
      .send({ expiresAt: null, sections: ['LOANS'] });
    expect(res.status).toBe(200);
    expect(domain.updateExternalAccessGrant).toHaveBeenCalledWith(TENANT, 'user-1', 'g1', {
      expiresAt: null,
      sections: ['LOANS']
    });
  });

  it('POST /revoke renvoie le détail ; POST /send-link renvoie l’URL du lien (201) et valide ses options', async () => {
    domain.revokeExternalAccessGrant.mockResolvedValue({ id: 'g1', status: 'REVOKED' });
    const revoked = await request(app).post(`${BASE}/g1/revoke`).set('x-perms', EDIT).send({});
    expect(revoked.body).toEqual({ success: true, data: { id: 'g1', status: 'REVOKED' } });
    expect(domain.revokeExternalAccessGrant).toHaveBeenCalledWith(TENANT, 'user-1', 'g1');

    domain.sendExternalAccessLink.mockResolvedValue({
      link: { id: 'l2', url: 'https://app.example.test/acces-partage#T2', expiresAt: '2026-10-08T00:00:00.000Z' },
      email: { sent: false, reason: 'NOT_REQUESTED' }
    });
    const sent = await request(app)
      .post(`${BASE}/g1/send-link`)
      .set('x-perms', EDIT)
      .send({ linkTtlDays: 3, revokePreviousLinks: true, sendEmail: false });
    expect(sent.status).toBe(201);
    expect(sent.body.data.link.url).toMatch(/#T2$/);
    expect(domain.sendExternalAccessLink).toHaveBeenCalledWith(TENANT, 'user-1', 'g1', {
      linkTtlDays: 3,
      revokePreviousLinks: true,
      sendEmail: false
    });

    const invalid = await request(app).post(`${BASE}/g1/send-link`).set('x-perms', EDIT).send({ linkTtlDays: 0 });
    expect(invalid.status).toBe(400);
  });

  it('liste et détail : le jeton ne ressort jamais d’une réponse de lecture', async () => {
    domain.listExternalAccessGrants.mockResolvedValue({ items: [{ id: 'g1', activeLinkCount: 1 }] });
    domain.getExternalAccessGrantDetail.mockResolvedValue({ id: 'g1', activeLinkCount: 1 });
    const list = await request(app).get(BASE).set('x-perms', VIEW);
    const detail = await request(app).get(`${BASE}/g1`).set('x-perms', VIEW);
    expect(JSON.stringify([list.body, detail.body])).not.toMatch(/token|url|hash/i);
  });
});
