/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Routes de la messagerie d'agence (menu lot 3) : gardes posees sur chaque
 * route, enveloppe { success, data }, validation zod, tenantId jamais lu du
 * corps, aucun acces administrateur au contenu.
 *
 * Le routeur est importe directement (sans l'app complete) ; l'inventaire
 * global des routes est verifie par routes-inventory.test.ts.
 */
jest.mock('../../src/utils/database', () => ({
  prisma: require('../helpers/messaging-fake-prisma').fakePrisma
}));
jest.mock('../../src/services/permission-service', () => ({ hasPermission: jest.fn().mockResolvedValue(true) }));
jest.mock('../../src/lib/notifications', () => ({ notify: jest.fn().mockResolvedValue({ notifications: [] }) }));
jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const userId = req.header('x-test-user');
    if (!userId) return res.status(401).json({ success: false, message: 'Authentification requise.' });
    req.user = { userId, email: `${userId}@exemple.test`, globalRole: 'USER' };
    next();
  }
}));
jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isSuperAdmin: false };
    next();
  },
  requireTenantCollaborator: (req: any, res: any, next: any) =>
    req.tenantContext?.isCollaborator ? next() : res.status(403).json({ success: false })
}));

import express from 'express';
import request from 'supertest';
import router from '../../src/routes/messaging-routes';
import { authenticate } from '../../src/middleware/auth-middleware';
import { requireTenantAccess, requireTenantCollaborator } from '../../src/middleware/tenant-middleware';
import { messagingSendRateLimiter } from '../../src/middleware/rate-limit-middleware';
import { errorHandler } from '../../src/middleware/error-middleware';
import { hasPermission } from '../../src/services/permission-service';
import { addClient, addStaff, resetFake, tables } from '../helpers/messaging-fake-prisma';

const T1 = 'tenant-1';
const app = express();
app.use(express.json());
app.use('/api', router);
app.use(errorHandler as any);

const as = (userId: string) => ({ 'x-test-user': userId });
const base = (tenantId = T1) => `/api/tenants/${tenantId}/messages`;

beforeEach(() => {
  resetFake();
  for (const u of ['alice', 'bob', 'admin']) messagingSendRateLimiter.resetKey(`messaging-send:${T1}:${u}`);
  addStaff(T1, 'alice');
  addStaff(T1, 'bob');
  addStaff(T1, 'admin');
  addStaff('tenant-2', 'zed');
  addClient(T1, 'cli');
});

describe('gardes', () => {
  it('chaque route porte authenticate + requireTenantAccess + requireTenantCollaborator', () => {
    const layers = (router as any).stack.filter((l: any) => l.route);
    expect(layers.length).toBe(10);
    for (const layer of layers) {
      const handlers = layer.route.stack.map((s: any) => s.handle);
      expect(handlers.slice(0, 3)).toEqual([authenticate, requireTenantAccess, requireTenantCollaborator]);
      // limiteur d'envoi APRES les gardes, AVANT le controleur
      const sends =
        layer.route.methods.post && /\/conversations(\/:id\/(messages|participants))?$/.test(layer.route.path);
      expect(handlers.includes(messagingSendRateLimiter)).toBe(Boolean(sends));
      if (sends) expect(handlers.indexOf(messagingSendRateLimiter)).toBe(3);
      expect(layer.route.path).toMatch(/^\/tenants\/:tenantId\/messages\//);
    }
    // aucun router.use nu
    expect((router as any).stack.filter((l: any) => !l.route)).toHaveLength(0);
  });

  it('les chemins fixes precedent les chemins parametres', () => {
    const paths = (router as any).stack.map((l: any) => l.route.path as string);
    expect(paths[0]).toBe('/tenants/:tenantId/messages/unread-count');
    expect(paths.indexOf('/tenants/:tenantId/messages/directory')).toBeLessThan(
      paths.indexOf('/tenants/:tenantId/messages/conversations/:id')
    );
  });

  it('sans session : 401', async () => {
    await request(app).get(`${base()}/conversations`).expect(401);
  });
});

describe('flux complet', () => {
  it('cree un 1-a-1, envoie, lit, compte les non-lus, quitte', async () => {
    const created = await request(app)
      .post(`${base()}/conversations`)
      .set(as('alice'))
      .send({ participantUserIds: ['bob'], firstMessage: 'Salut' })
      .expect(201);
    expect(created.body.success).toBe(true);
    const id = created.body.data.id;
    expect(created.body.data).toMatchObject({ kind: 'DIRECT', title: null, lastMessage: { body: 'Salut' } });

    // meme conversation redemandee par l'autre : dedupliquee
    const again = await request(app)
      .post(`${base()}/conversations`)
      .set(as('bob'))
      .send({ participantUserIds: ['alice'] })
      .expect(201);
    expect(again.body.data.id).toBe(id);

    const unread = await request(app).get(`${base()}/unread-count`).set(as('bob')).expect(200);
    expect(unread.body).toEqual({ success: true, data: { count: 1 } });

    const msgs = await request(app).get(`${base()}/conversations/${id}/messages?limit=10`).set(as('bob')).expect(200);
    expect(msgs.body.data.items).toHaveLength(1);
    expect(msgs.body.data).toMatchObject({ hasMore: false, items: [{ body: 'Salut', mine: false }] });

    const read = await request(app).post(`${base()}/conversations/${id}/read`).set(as('bob')).expect(200);
    expect(typeof read.body.data.lastReadAt).toBe('string');
    await request(app)
      .get(`${base()}/unread-count`)
      .set(as('bob'))
      .expect(200, { success: true, data: { count: 0 } });

    const sent = await request(app)
      .post(`${base()}/conversations/${id}/messages`)
      .set(as('bob'))
      .send({ body: '  Re ' })
      .expect(201);
    expect(sent.body.data).toMatchObject({ body: 'Re', mine: true, authorUserId: 'bob' });

    const list = await request(app).get(`${base()}/conversations`).set(as('alice')).expect(200);
    expect(list.body.data).toMatchObject({ total: 1, page: 1, pageSize: 20 });

    await request(app).delete(`${base()}/conversations/${id}/participants/me`).set(as('bob')).expect(200);
    await request(app).get(`${base()}/conversations/${id}`).set(as('bob')).expect(404);
  });

  it('directory : personnes joignables', async () => {
    const res = await request(app).get(`${base()}/directory?q=cli`).set(as('alice')).expect(200);
    expect(res.body.data).toEqual([{ userId: 'cli', label: 'Nom cli', kind: 'CLIENT' }]);
  });

  it('directory : sans CRM_CONTACTS_VIEW, aucun client portail', async () => {
    (hasPermission as jest.Mock).mockResolvedValueOnce(false);
    const res = await request(app).get(`${base()}/directory?q=cli`).set(as('alice')).expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('page plafonnee a 10000 (400 au-dela)', async () => {
    await request(app).get(`${base()}/conversations?page=10001`).set(as('alice')).expect(400);
    await request(app).get(`${base()}/conversations?page=10000`).set(as('alice')).expect(200);
  });
});

describe('securite', () => {
  let id: string;
  beforeEach(async () => {
    const res = await request(app)
      .post(`${base()}/conversations`)
      .set(as('alice'))
      .send({ participantUserIds: ['bob'], firstMessage: 'prive' });
    id = res.body.data.id;
  });

  it('un administrateur non participant recoit 404 (jamais 403) sur toutes les routes de contenu', async () => {
    await request(app).get(`${base()}/conversations/${id}`).set(as('admin')).expect(404);
    await request(app).get(`${base()}/conversations/${id}/messages`).set(as('admin')).expect(404);
    await request(app).post(`${base()}/conversations/${id}/messages`).set(as('admin')).send({ body: 'x' }).expect(404);
    await request(app).post(`${base()}/conversations/${id}/read`).set(as('admin')).expect(404);
    await request(app)
      .post(`${base()}/conversations/${id}/participants`)
      .set(as('admin'))
      .send({ userIds: ['admin'] })
      .expect(404);
    await request(app).delete(`${base()}/conversations/${id}/participants/me`).set(as('admin')).expect(404);
    expect((await request(app).get(`${base()}/conversations`).set(as('admin'))).body.data.items).toEqual([]);
  });

  it('une autre agence ne voit pas la conversation', async () => {
    await request(app)
      .get(`${base('tenant-2')}/conversations/${id}`)
      .set(as('zed'))
      .expect(404);
  });

  it("un participant d'une autre agence est refuse en 404", async () => {
    const res = await request(app)
      .post(`${base()}/conversations`)
      .set(as('alice'))
      .send({ participantUserIds: ['zed'] })
      .expect(404);
    expect(res.body.success).toBe(false);
  });

  it('un tenantId dans le corps est rejete et jamais utilise', async () => {
    await request(app)
      .post(`${base()}/conversations`)
      .set(as('alice'))
      .send({ participantUserIds: ['bob'], tenantId: 'tenant-2' })
      .expect(400);
    await request(app)
      .post(`${base()}/conversations/${id}/messages`)
      .set(as('alice'))
      .send({ body: 'ok', tenantId: 'tenant-2' })
      .expect(400);
    expect(tables.message.every(m => m.tenantId === T1)).toBe(true);
  });

  it('valide les corps : vide, trop long, participants manquants', async () => {
    await request(app)
      .post(`${base()}/conversations/${id}/messages`)
      .set(as('alice'))
      .send({ body: '   ' })
      .expect(400);
    await request(app)
      .post(`${base()}/conversations/${id}/messages`)
      .set(as('alice'))
      .send({ body: 'x'.repeat(5001) })
      .expect(400);
    await request(app).post(`${base()}/conversations`).set(as('alice')).send({ participantUserIds: [] }).expect(400);
  });

  it("aucune route d'administration du contenu des messages", async () => {
    await request(app).get(`${base()}/admin/conversations`).set(as('admin')).expect(404);
    await request(app).get(`${base()}/conversations/${id}/export`).set(as('admin')).expect(404);
  });
});

describe("plafond d'envoi : 30 messages par minute et par utilisateur", () => {
  it('le 31e envoi recoit 429, un autre utilisateur et une autre agence ne sont pas touches', async () => {
    const created = await request(app)
      .post(`${base()}/conversations`)
      .set(as('alice'))
      .send({ participantUserIds: ['bob'], firstMessage: 'Salut' })
      .expect(201);
    const id = created.body.data.id;
    // 1 envoi deja compte (creation), 29 de plus restent permis
    for (let i = 0; i < 29; i += 1) {
      await request(app)
        .post(`${base()}/conversations/${id}/messages`)
        .set(as('alice'))
        .send({ body: `m${i}` })
        .expect(201);
    }
    const blocked = await request(app)
      .post(`${base()}/conversations/${id}/messages`)
      .set(as('alice'))
      .send({ body: 'trop' });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
    expect(blocked.headers['ratelimit-limit'] ?? blocked.headers['ratelimit']).toBeDefined();
    await request(app).post(`${base()}/conversations/${id}/messages`).set(as('bob')).send({ body: 'ok' }).expect(201);
    // la creation de conversation partage le meme plafond
    await request(app)
      .post(`${base()}/conversations`)
      .set(as('alice'))
      .send({ participantUserIds: ['admin'] })
      .expect(429);
    for (const key of ['alice', 'bob']) messagingSendRateLimiter.resetKey(`messaging-send:${T1}:${key}`);
    await request(app).post(`${base()}/conversations/${id}/messages`).set(as('alice')).send({ body: 'ok' }).expect(201);
    for (const key of ['alice', 'bob']) messagingSendRateLimiter.resetKey(`messaging-send:${T1}:${key}`);
  });
});
