/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Notifications + messagerie des portails (menu lot 3, T5a).
 *
 * Les gardes de portail réelles lisent la base ; elles sont remplacées ici par
 * des gardes factices qui posent le même contexte sur `req` (tenantId résolu,
 * userId) et refusent comme les vraies (compte inactif, agence suspendue).
 * Leur logique propre est couverte par portal-access.test.ts et
 * coowner-portal-access.test.ts. Ici : câblage, étanchéité, audience CLIENT.
 */
jest.mock('../../src/utils/database', () => ({
  prisma: require('../helpers/messaging-fake-prisma').fakePrisma
}));
jest.mock('../../src/lib/notifications', () => ({ notify: jest.fn().mockResolvedValue({ notifications: [] }) }));
jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const userId = req.header('x-test-user');
    if (!userId) return res.status(401).json({ success: false, message: 'Authentification requise.' });
    req.user = { userId, email: `${userId}@exemple.test`, globalRole: 'USER' };
    next();
  }
}));

/** Garde factice : agence résolue par `x-test-tenant` (jamais lue par les handlers). */
function fakeGuard(attach: (req: any, tenantId: string) => void) {
  return (req: any, res: any, next: any) => {
    const tenantId = req.header('x-test-tenant');
    if (req.header('x-test-suspended') === '1') {
      return res.status(403).json({ success: false, code: 'TENANT_SUSPENDED' });
    }
    if (req.header('x-test-inactive') === '1' || !tenantId) {
      return res.status(403).json({ success: false, message: 'Accès portail refusé.' });
    }
    attach(req, tenantId);
    next();
  };
}
jest.mock('../../src/middleware/tenant-portal-access', () => ({
  requireTenantPortalAccess: fakeGuard((req, tenantId) => {
    req.tenantPortal = { tenantId, tenantClientId: 'tc', leaseId: 'l', lease: {}, availableTenantIds: [tenantId] };
  })
}));
jest.mock('../../src/middleware/owner-portal-access', () => ({
  requireOwnerPortalAccess: fakeGuard((req, tenantId) => {
    req.ownerPortal = { tenantId, tenantClientId: 'tc', propertyIds: [], availableTenantIds: [tenantId] };
  })
}));
jest.mock('../../src/middleware/coowner-portal-access', () => ({
  requireCoOwnerPortalAccess: fakeGuard((req, tenantId) => {
    req.coOwnerPortal = { tenantClientId: 'tc', availableTenantIds: [tenantId], scope: { tenantId } };
  })
}));

import express from 'express';
import { messagingSendRateLimiter } from '../../src/middleware/rate-limit-middleware';
import request from 'supertest';
import {
  coOwnerPortalInboxRouter,
  ownerPortalInboxRouter,
  tenantPortalInboxRouter
} from '../../src/routes/portal-inbox-routes';
import { errorHandler } from '../../src/middleware/error-middleware';
import { addClient, addStaff, resetFake, tables } from '../helpers/messaging-fake-prisma';

const T1 = 'tenant-1';
const T2 = 'tenant-2';
const app = express();
app.use(express.json());
app.use('/api/portal/tenant', tenantPortalInboxRouter);
app.use('/api/portal/owner', ownerPortalInboxRouter);
app.use('/api/portal/copropriete', coOwnerPortalInboxRouter);
app.use(errorHandler as any);

const as = (userId: string, tenantId = T1) => ({ 'x-test-user': userId, 'x-test-tenant': tenantId });
const PORTALS = ['tenant', 'owner', 'copropriete'] as const;

function addNotification(id: string, tenantId: string, recipientUserId: string, extra: Record<string, unknown> = {}) {
  tables.userNotification.push({
    id,
    tenantId,
    recipientUserId,
    key: 'MESSAGE_RECEIVED',
    title: `titre ${id}`,
    body: 'corps',
    link: null,
    status: 'SENT',
    failureReason: null,
    readAt: null,
    sentAt: new Date(),
    createdAt: new Date(),
    deliveries: [],
    ...extra
  });
}

beforeEach(() => {
  resetFake();
  for (const u of ['loc1', 'loc2', 'alice', 'bob']) messagingSendRateLimiter.resetKey(`messaging-send:${T1}:${u}`);
  addStaff(T1, 'alice');
  addStaff(T1, 'bob');
  addStaff(T2, 'zed');
  addClient(T1, 'loc1');
  addClient(T1, 'loc2');
  addClient(T2, 'locX');
});

describe('gardes', () => {
  it('chaque chemin porte authenticate + la garde du portail, sans router.use nu', () => {
    for (const router of [tenantPortalInboxRouter, ownerPortalInboxRouter, coOwnerPortalInboxRouter]) {
      const stack = (router as any).stack;
      expect(stack.every((l: any) => l.route)).toBe(true);
      expect(stack.length).toBe(14);
      for (const layer of stack) {
        const sends =
          layer.route.methods.post &&
          /^\/messages\/conversations(\/:id\/(messages|participants))?$/.test(layer.route.path);
        // authenticate + garde (+ limiteur d'envoi) + contrôleur
        expect(layer.route.stack.length).toBe(sends ? 4 : 3);
        if (sends) expect(layer.route.stack[2].handle).toBe(messagingSendRateLimiter);
      }
    }
  });

  it.each(PORTALS)('%s : sans session => 401, compte inactif / agence suspendue => 403', async portal => {
    const base = `/api/portal/${portal}`;
    expect((await request(app).get(`${base}/notifications`)).status).toBe(401);
    const inactive = await request(app)
      .get(`${base}/messages/conversations`)
      .set(as('loc1'))
      .set('x-test-inactive', '1');
    expect(inactive.status).toBe(403);
    const suspended = await request(app).get(`${base}/notifications`).set(as('loc1')).set('x-test-suspended', '1');
    expect(suspended.status).toBe(403);
    expect(suspended.body.code).toBe('TENANT_SUSPENDED');
    // Aucun effet de bord quand la garde refuse.
    const refused = await request(app)
      .post(`${base}/messages/conversations`)
      .set(as('loc1'))
      .set('x-test-suspended', '1')
      .send({ participantUserIds: ['alice'], firstMessage: 'x' });
    expect(refused.status).toBe(403);
    expect(tables.conversation).toHaveLength(0);
  });
});

describe('notifications', () => {
  it.each(PORTALS)(
    "%s : ne liste et ne compte que les notifications de l'utilisateur dans son agence",
    async portal => {
      const base = `/api/portal/${portal}`;
      addNotification('n1', T1, 'loc1');
      addNotification('n2', T1, 'loc2');
      addNotification('n3', T2, 'loc1');
      const list = await request(app).get(`${base}/notifications`).set(as('loc1'));
      expect(list.status).toBe(200);
      expect(list.body.data.items.map((i: any) => i.id)).toEqual(['n1']);
      const count = await request(app).get(`${base}/notifications/unread-count`).set(as('loc1'));
      expect(count.body.data.count).toBe(1);
    }
  );

  it('le tenantId de la requête est refusé (query) ou ignoré (en-tête) : seule la garde compte', async () => {
    addNotification('n1', T1, 'loc1');
    addNotification('n3', T2, 'loc1');
    const query = await request(app).get(`/api/portal/tenant/notifications?tenantId=${T2}`).set(as('loc1'));
    expect(query.status).toBe(400);
    const res = await request(app)
      .get('/api/portal/tenant/notifications')
      .set(as('loc1'))
      .set('x-portal-tenant-id', T2);
    expect(res.body.data.items.map((i: any) => i.id)).toEqual(['n1']);
  });

  it("marquer lue la notification d'un autre utilisateur ou d'une autre agence => 404", async () => {
    addNotification('n2', T1, 'loc2');
    addNotification('n3', T2, 'loc1');
    expect((await request(app).post('/api/portal/tenant/notifications/n2/read').set(as('loc1'))).status).toBe(404);
    expect((await request(app).post('/api/portal/tenant/notifications/n3/read').set(as('loc1'))).status).toBe(404);
    expect((await request(app).post('/api/portal/tenant/notifications/inconnue/read').set(as('loc1'))).status).toBe(
      404
    );
    expect(tables.userNotification.every(n => n.readAt === null)).toBe(true);
  });

  it('marque lue la sienne, puis read-all ne touche que les siennes', async () => {
    addNotification('n1', T1, 'loc1');
    addNotification('n4', T1, 'loc1');
    addNotification('n2', T1, 'loc2');
    const one = await request(app).post('/api/portal/owner/notifications/n1/read').set(as('loc1'));
    expect(one.status).toBe(200);
    expect(one.body.data.id).toBe('n1');
    const all = await request(app).post('/api/portal/owner/notifications/read-all').set(as('loc1'));
    expect(all.status).toBe(200);
    expect(all.body.data.updated).toBe(1);
    expect(tables.userNotification.find(n => n.id === 'n2')?.readAt).toBeNull();
  });
});

describe('messagerie (audience CLIENT)', () => {
  it.each(PORTALS)('%s : un client joint le personnel et le directory ne liste que le personnel', async portal => {
    const base = `/api/portal/${portal}/messages`;
    const dir = await request(app).get(`${base}/directory`).set(as('loc1'));
    expect(dir.status).toBe(200);
    expect(dir.body.data.every((e: any) => e.kind === 'STAFF')).toBe(true);
    expect(dir.body.data.map((e: any) => e.userId).sort()).toEqual(['alice', 'bob']);

    const created = await request(app)
      .post(`${base}/conversations`)
      .set(as('loc1'))
      .send({ participantUserIds: ['alice'], firstMessage: 'Bonjour' });
    expect(created.status).toBe(201);
    expect(created.body.data.participants.map((p: any) => p.userId).sort()).toEqual(['alice', 'loc1']);
  });

  it("un client ne peut pas écrire à un autre client, ni à un utilisateur d'une autre agence (même 404)", async () => {
    const base = '/api/portal/tenant/messages/conversations';
    const other = await request(app)
      .post(base)
      .set(as('loc1'))
      .send({ participantUserIds: ['loc2'] });
    const foreign = await request(app)
      .post(base)
      .set(as('loc1'))
      .send({ participantUserIds: ['zed'] });
    const unknown = await request(app)
      .post(base)
      .set(as('loc1'))
      .send({ participantUserIds: ['inconnu'] });
    expect(other.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(other.body).toEqual(unknown.body);
    expect(tables.conversation).toHaveLength(0);
  });

  it('un client ne voit que ses conversations et pas celles des autres (404)', async () => {
    const base = '/api/portal/tenant/messages/conversations';
    const mine = await request(app)
      .post(base)
      .set(as('loc1'))
      .send({ participantUserIds: ['alice'], firstMessage: 'a' });
    const theirs = await request(app)
      .post(base)
      .set(as('loc2'))
      .send({ participantUserIds: ['bob'], firstMessage: 'b' });

    const list = await request(app).get(base).set(as('loc1'));
    expect(list.body.data.items.map((c: any) => c.id)).toEqual([mine.body.data.id]);

    for (const sub of ['', '/messages', '/read']) {
      const method = sub === '/read' ? 'post' : 'get';
      const res = await (request(app) as any)[method](`${base}/${theirs.body.data.id}${sub}`).set(as('loc1'));
      expect(res.status).toBe(404);
    }
    const send = await request(app)
      .post(`${base}/${theirs.body.data.id}/messages`)
      .set(as('loc1'))
      .send({ body: 'intrusion' });
    expect(send.status).toBe(404);
    expect(tables.message.every(m => m.body !== 'intrusion')).toBe(true);
  });

  it("une conversation d'une autre agence est introuvable même avec un identifiant valide", async () => {
    const base = '/api/portal/tenant/messages/conversations';
    const created = await request(app)
      .post(base)
      .set(as('locX', T2))
      .send({ participantUserIds: ['zed'] });
    expect(created.status).toBe(201);
    const res = await request(app).get(`${base}/${created.body.data.id}`).set(as('loc1', T1));
    expect(res.status).toBe(404);
  });

  it("envoyer, lire, compter les non-lus : formes JSON identiques à l'agence", async () => {
    const base = '/api/portal/copropriete/messages';
    const created = await request(app)
      .post(`${base}/conversations`)
      .set(as('loc1'))
      .send({ participantUserIds: ['alice'] });
    const id = created.body.data.id;
    const sent = await request(app)
      .post(`${base}/conversations/${id}/messages`)
      .set(as('loc1'))
      .send({ body: 'Salut' });
    expect(sent.status).toBe(201);
    expect(sent.body.data).toMatchObject({ body: 'Salut', authorUserId: 'loc1', mine: true });
    const msgs = await request(app).get(`${base}/conversations/${id}/messages`).set(as('loc1'));
    expect(msgs.body.data).toEqual({ items: [expect.objectContaining({ body: 'Salut' })], hasMore: false });
    const read = await request(app).post(`${base}/conversations/${id}/read`).set(as('loc1'));
    expect(typeof read.body.data.lastReadAt).toBe('string');
    const unread = await request(app).get(`${base}/unread-count`).set(as('loc1'));
    expect(unread.body.data).toEqual({ count: 0 });
  });

  it('le lien de la notification de message est /messages/<id> (routes web réutilisées par les portails)', async () => {
    const { notify } = require('../../src/lib/notifications');
    const base = '/api/portal/tenant/messages/conversations';
    const created = await request(app)
      .post(base)
      .set(as('loc1'))
      .send({ participantUserIds: ['alice'] });
    await request(app).post(`${base}/${created.body.data.id}/messages`).set(as('loc1')).send({ body: 'Salut' });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: T1,
        recipients: [{ userId: 'alice' }],
        link: `/messages/${created.body.data.id}`
      })
    );
  });
});

describe("compte desactive et motifs d'echec", () => {
  it.each(PORTALS)(
    '%s : un compte desactive apres la connexion est refuse (403) sur chaque operation',
    async portal => {
      const base = `/api/portal/${portal}`;
      addNotification('n1', T1, 'loc1');
      const conv = await request(app)
        .post(`${base}/messages/conversations`)
        .set(as('loc1'))
        .send({ participantUserIds: ['alice'] });
      expect(conv.status).toBe(201);
      const id = conv.body.data.id;
      tables.user.find(u => u.id === 'loc1')!.isActive = false;

      const calls = [
        request(app).get(`${base}/notifications`),
        request(app).get(`${base}/notifications/unread-count`),
        request(app).post(`${base}/notifications/n1/read`),
        request(app).post(`${base}/notifications/read-all`),
        request(app).get(`${base}/messages/unread-count`),
        request(app).get(`${base}/messages/directory`),
        request(app).get(`${base}/messages/conversations`),
        request(app)
          .post(`${base}/messages/conversations`)
          .send({ participantUserIds: ['alice'], firstMessage: 'x' }),
        request(app).get(`${base}/messages/conversations/${id}`),
        request(app).get(`${base}/messages/conversations/${id}/messages`),
        request(app).post(`${base}/messages/conversations/${id}/messages`).send({ body: 'x' }),
        request(app).post(`${base}/messages/conversations/${id}/read`),
        request(app)
          .post(`${base}/messages/conversations/${id}/participants`)
          .send({ userIds: ['bob'] }),
        request(app).delete(`${base}/messages/conversations/${id}/participants/me`)
      ];
      for (const call of calls) {
        const res = await call.set(as('loc1'));
        expect(res.status).toBe(403);
      }
      expect(tables.message).toHaveLength(0);
      expect(tables.userNotification.find(n => n.id === 'n1')?.readAt).toBeNull();
    }
  );

  it('un utilisateur supprime (compte introuvable) est refuse comme un compte desactive', async () => {
    tables.user.splice(
      tables.user.findIndex(u => u.id === 'loc2'),
      1
    );
    expect((await request(app).get('/api/portal/tenant/notifications').set(as('loc2'))).status).toBe(403);
  });

  it.each(PORTALS)(
    "%s : le client ne recoit qu'un motif d'echec generique, jamais l'erreur SMTP/WhatsApp",
    async portal => {
      addNotification('nf', T1, 'loc1', {
        key: 'PAYMENT_APPROVED_TENANT',
        status: 'FAILED',
        failureReason: 'EMAIL : 535 5.7.8 auth failed for smtp.interne.local (user relay@agence.ci)',
        deliveries: [
          { channel: 'EMAIL', status: 'FAILED', failureReason: '535 5.7.8 auth failed for smtp.interne.local' },
          { channel: 'IN_APP', status: 'SENT', failureReason: null }
        ]
      });
      const res = await request(app).get(`/api/portal/${portal}/notifications`).set(as('loc1'));
      expect(res.status).toBe(200);
      const item = res.body.data.items[0];
      expect(item.failureReason).toBe("L'envoi a échoué.");
      expect(item.deliveries).toEqual([
        { channel: 'EMAIL', status: 'FAILED', failureReason: "L'envoi a échoué." },
        { channel: 'IN_APP', status: 'SENT', failureReason: null }
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(/smtp|535|relay@/i);
    }
  );
});

describe("plafond d'envoi des portails", () => {
  it.each(PORTALS)('%s : le 31e envoi de la minute recoit 429, un autre utilisateur non', async portal => {
    const base = `/api/portal/${portal}`;
    const created = await request(app)
      .post(`${base}/messages/conversations`)
      .set(as('loc1'))
      .send({ participantUserIds: ['alice'], firstMessage: 'Bonjour' })
      .expect(201);
    const id = created.body.data.id;
    for (let i = 0; i < 29; i += 1) {
      await request(app)
        .post(`${base}/messages/conversations/${id}/messages`)
        .set(as('loc1'))
        .send({ body: `m${i}` })
        .expect(201);
    }
    await request(app)
      .post(`${base}/messages/conversations/${id}/messages`)
      .set(as('loc1'))
      .send({ body: 'trop' })
      .expect(429);
    await request(app)
      .post(`${base}/messages/conversations/${id}/messages`)
      .set(as('alice'))
      .send({ body: 'ok' })
      .expect(201);
    for (const key of ['loc1', 'alice']) messagingSendRateLimiter.resetKey(`messaging-send:${T1}:${key}`);
  });
});
