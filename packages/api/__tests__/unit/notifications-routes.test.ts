/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Routes REST des notifications (menu lot 3) : boîte de réception, journal
 * d'agence, journal plateforme. Vrais routeurs, vrais contrôleurs, vraies
 * requêtes ; seuls la base (faux Prisma en mémoire), l'authentification, le
 * rattachement à l'agence et les canaux d'envoi sont simulés.
 */
import express from 'express';
import request from 'supertest';

// --- Base en mémoire ---------------------------------------------------------

type Row = Record<string, any>;
const db: { notifications: Row[]; users: Row[]; disabledEmailKeys: string[]; disabledWhatsappKeys: string[] } = {
  notifications: [],
  users: [],
  disabledEmailKeys: [],
  disabledWhatsappKeys: []
};

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'id' || key === 'tenantId' || key === 'recipientUserId' || key === 'readAt') {
      return expected === null ? row[key] == null : row[key] === expected;
    }
    if (key === 'key' && expected && typeof expected === 'object' && 'not' in expected) {
      return row.key !== expected.not;
    }
    return true; // autres filtres non exercés ici (q, channel, dates…)
  });
}

const newer = (a: Row, b: Row) => b.createdAt.getTime() - a.createdAt.getTime();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    userNotification: {
      findMany: jest.fn(async ({ where, skip = 0, take = 1000 }: any) =>
        db.notifications
          .filter(r => matches(r, where))
          .sort(newer)
          .slice(skip, skip + take)
      ),
      count: jest.fn(async ({ where }: any) => db.notifications.filter(r => matches(r, where)).length),
      findFirst: jest.fn(async ({ where }: any) => db.notifications.find(r => matches(r, where)) ?? null),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rows = db.notifications.filter(r => matches(r, where));
        rows.forEach(r => Object.assign(r, data));
        return { count: rows.length };
      })
    },
    notificationDelivery: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const n of db.notifications) {
          for (const d of n.deliveries) {
            if (d.id === where.id) {
              const { attempts, ...rest } = data;
              Object.assign(d, rest, { attempts: d.attempts + (attempts?.increment ?? 0) });
              count += 1;
            }
          }
        }
        return { count };
      })
    },
    user: {
      findMany: jest.fn(async ({ where }: any) => db.users.filter(u => where.id.in.includes(u.id))),
      findUnique: jest.fn(async ({ where }: any) => db.users.find(u => u.id === where.id) ?? null),
      // Garde de renvoi : compte actif (le rattachement a l'agence est suppose acquis dans ce faux).
      findFirst: jest.fn(
        async ({ where }: any) => db.users.find(u => u.id === where.id && u.isActive === where.isActive) ?? null
      )
    },
    emailNotificationConfig: {
      findFirst: jest.fn(async ({ where }: any) =>
        db.disabledEmailKeys.includes(where.notification_key) ? { enabled: false } : null
      )
    },
    whatsappNotificationConfig: {
      findFirst: jest.fn(async ({ where }: any) =>
        db.disabledWhatsappKeys.includes(where.notification_key) ? { enabled: false } : null
      )
    }
  }
}));

// --- Authentification, agence, droits, canaux, audit -------------------------

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const userId = req.header('x-user');
    if (!userId) return res.status(401).json({ success: false });
    req.user = { userId };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  // Agence lue dans l'URL, après contrôle d'appartenance (en-tête x-member-of).
  requireTenantAccess: (req: any, res: any, next: any) => {
    const isSuperAdmin = req.header('x-super') === '1';
    const memberOf = (req.header('x-member-of') ?? '').split(',');
    if (!isSuperAdmin && !memberOf.includes(req.params.tenantId)) {
      return res.status(403).json({ success: false, message: 'Acces refuse' });
    }
    req.tenantContext = {
      tenantId: req.params.tenantId,
      isSuperAdmin,
      isCollaborator: req.header('x-collab') !== '0'
    };
    next();
  },
  requireTenantCollaborator: jest.requireActual('../../src/middleware/tenant-middleware').requireTenantCollaborator
}));

const PERMISSIONS: Record<string, string[]> = {
  admin: ['TENANT_NOTIFICATIONS_ADMIN'],
  superadmin: ['TENANT_NOTIFICATIONS_ADMIN', 'PLATFORM_TENANTS_VIEW', 'PLATFORM_TENANTS_EDIT'],
  superviewer: ['PLATFORM_TENANTS_VIEW'], // super-admin en lecture seule : peut lire le journal, pas renvoyer
  delegate: ['PLATFORM_TENANTS_VIEW'] // rôle plateforme délégué : pas super-admin
};
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: async (userId: string, key: string) => (PERMISSIONS[userId] ?? []).includes(key),
  hasAnyPermission: async () => false,
  hasAllPermissions: async () => false
}));
jest.mock('../../src/services/subscription-service', () => ({ checkSubscriptionAccess: jest.fn() }));

const sendEmail = jest.fn();
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (...a: unknown[]) => sendEmail(...a) }
}));
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({ sendWhatsappNotification: jest.fn() }));
jest.mock('../../src/lib/sms', () => ({ getSmsTransport: () => ({ send: jest.fn() }) }));

const logAuditEvent = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: unknown[]) => logAuditEvent(...a)
}));

import notificationRoutes from '../../src/routes/notification-routes';
import notificationAdminRoutes from '../../src/routes/notification-admin-routes';
import platformNotificationRoutes from '../../src/routes/platform-notification-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.use('/api', notificationRoutes);
app.use('/api', notificationAdminRoutes);
app.use('/api', platformNotificationRoutes);
app.use(errorHandler);

// --- Données -----------------------------------------------------------------

const T1 = 'tenant-1';
const T2 = 'tenant-2';

function notif(over: Row): Row {
  return {
    key: 'TEST',
    title: 'Titre',
    body: 'Corps',
    link: null,
    status: 'SENT',
    failureReason: null,
    readAt: null,
    sentAt: new Date('2026-10-19T08:00:00Z'),
    createdAt: new Date('2026-10-19T08:00:00Z'),
    recipientLabel: 'Alice',
    senderUserId: null,
    relatedEntityType: null,
    relatedEntityId: null,
    deliveries: [],
    tenant: { id: over.tenantId, name: `Agence ${over.tenantId}` },
    ...over
  };
}

const delivery = (id: string, channel: string, status: string, over: Row = {}) => ({
  id,
  channel,
  status,
  target: channel === 'EMAIL' ? 'alice@example.com' : null,
  failureReason: status === 'FAILED' ? 'SMTP indisponible' : null,
  attempts: 1,
  lastAttemptAt: null,
  sentAt: null,
  resendPayload: null,
  createdAt: new Date('2026-10-19T08:00:00Z'),
  ...over
});

beforeEach(() => {
  jest.clearAllMocks();
  db.disabledEmailKeys = [];
  db.disabledWhatsappKeys = [];
  db.users = [
    { id: 'u1', email: 'u1@example.com', fullName: 'Alice', globalRole: 'USER', isActive: true },
    { id: 'superadmin', email: 'sa@example.com', fullName: 'Super', globalRole: 'SUPER_ADMIN', isActive: true },
    { id: 'delegate', email: 'd@example.com', fullName: 'Delegue', globalRole: 'USER', isActive: true },
    { id: 'superviewer', email: 'sv@example.com', fullName: 'Lecteur', globalRole: 'SUPER_ADMIN', isActive: true }
  ];
  db.notifications = [
    notif({ id: 'n1', tenantId: T1, recipientUserId: 'u1', createdAt: new Date('2026-10-19T09:00:00Z') }),
    notif({ id: 'n2', tenantId: T1, recipientUserId: 'u2', recipientLabel: 'Bob' }),
    notif({ id: 'n3', tenantId: T2, recipientUserId: 'u1', recipientLabel: 'Alice (autre agence)' }),
    notif({
      id: 'n4',
      tenantId: T1,
      recipientUserId: 'u1',
      status: 'SENT',
      failureReason: 'SMTP indisponible',
      createdAt: new Date('2026-10-19T07:00:00Z'),
      deliveries: [
        delivery('d-inapp', 'IN_APP', 'SENT'),
        delivery('d-mail', 'EMAIL', 'FAILED'),
        delivery('d-wa', 'WHATSAPP', 'FAILED', { failureReason: 'Gabarit refusé' }),
        delivery('d-sms', 'SMS', 'SKIPPED', { failureReason: 'Canal SMS non active.' })
      ]
    })
  ];
  sendEmail.mockResolvedValue(undefined);
});

const asUser = (r: request.Test, user: string, memberOf = T1) => r.set('x-user', user).set('x-member-of', memberOf);

// --- Boîte de réception ------------------------------------------------------

describe('GET /tenants/:tenantId/notifications', () => {
  it('ne renvoie que les notifications de l’utilisateur dans cette agence', async () => {
    const res = await asUser(request(app).get(`/api/tenants/${T1}/notifications`), 'u1');
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((i: any) => i.id);
    expect(ids).toEqual(['n1', 'n4']); // ni n2 (autre utilisateur), ni n3 (autre agence)
    expect(res.body.data).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(res.body.data.items[0]).not.toHaveProperty('recipientUserId');
  });

  it('ignore un tenantId glissé dans la requête : 400, pas de lecture croisée', async () => {
    const res = await asUser(request(app).get(`/api/tenants/${T1}/notifications?tenantId=${T2}`), 'u1');
    expect(res.status).toBe(400);
  });

  it('plafonne pageSize à 100', async () => {
    const res = await asUser(request(app).get(`/api/tenants/${T1}/notifications?pageSize=500`), 'u1');
    expect(res.status).toBe(400);
  });

  it('refuse un non-collaborateur (403) et un anonyme (401)', async () => {
    const denied = await asUser(request(app).get(`/api/tenants/${T1}/notifications`), 'u1').set('x-collab', '0');
    expect(denied.status).toBe(403);
    const anonymous = await request(app).get(`/api/tenants/${T1}/notifications`);
    expect(anonymous.status).toBe(401);
  });

  it('refuse un utilisateur qui n’appartient pas à l’agence demandée (403)', async () => {
    const res = await asUser(request(app).get(`/api/tenants/${T2}/notifications`), 'u1', T1);
    expect(res.status).toBe(403);
  });

  it('compte les non lues de l’utilisateur seulement (route avant /:id)', async () => {
    const res = await asUser(request(app).get(`/api/tenants/${T1}/notifications/unread-count`), 'u1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ count: 2 });
  });
});

describe('marquer comme lu', () => {
  it('marque une notification à soi', async () => {
    const res = await asUser(request(app).post(`/api/tenants/${T1}/notifications/n1/read`), 'u1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('n1');
    expect(db.notifications.find(n => n.id === 'n1')?.readAt).toBeInstanceOf(Date);
  });

  it('404 sur la notification d’un autre utilisateur de la même agence, sans la modifier', async () => {
    const res = await asUser(request(app).post(`/api/tenants/${T1}/notifications/n2/read`), 'u1');
    expect(res.status).toBe(404);
    expect(db.notifications.find(n => n.id === 'n2')?.readAt).toBeNull();
  });

  it('404 sur la notification d’une AUTRE agence (isolation), sans la modifier', async () => {
    const res = await asUser(request(app).post(`/api/tenants/${T1}/notifications/n3/read`), 'u1');
    expect(res.status).toBe(404);
    expect(db.notifications.find(n => n.id === 'n3')?.readAt).toBeNull();
  });

  it('read-all ne touche que les siennes dans l’agence courante', async () => {
    const res = await asUser(request(app).post(`/api/tenants/${T1}/notifications/read-all`), 'u1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ updated: 2 });
    expect(db.notifications.find(n => n.id === 'n2')?.readAt).toBeNull();
    expect(db.notifications.find(n => n.id === 'n3')?.readAt).toBeNull();
  });
});

// --- Journal d'agence --------------------------------------------------------

describe('journal admin de l’agence', () => {
  it('403 sans TENANT_NOTIFICATIONS_ADMIN', async () => {
    const res = await asUser(request(app).get(`/api/tenants/${T1}/admin/notifications`), 'u1');
    expect(res.status).toBe(403);
    expect(res.body.requiredPermission).toBe('TENANT_NOTIFICATIONS_ADMIN');
  });

  it('l’admin voit tout le tenant, jamais les autres tenants', async () => {
    const res = await asUser(request(app).get(`/api/tenants/${T1}/admin/notifications`), 'admin');
    expect(res.status).toBe(200);
    expect(res.body.data.items.map((i: any) => i.id).sort()).toEqual(['n1', 'n2', 'n4']);
    expect(res.body.data.items[0]).toHaveProperty('recipient');
  });

  it('l’admin ne lit pas le détail d’une notification d’une autre agence (404)', async () => {
    const res = await asUser(request(app).get(`/api/tenants/${T1}/admin/notifications/n3`), 'admin');
    expect(res.status).toBe(404);
  });

  it('refuse un paramètre tenantId (400)', async () => {
    const res = await asUser(request(app).get(`/api/tenants/${T1}/admin/notifications?tenantId=${T2}`), 'admin');
    expect(res.status).toBe(400);
  });

  it('refuse une date invalide (400)', async () => {
    const res = await asUser(request(app).get(`/api/tenants/${T1}/admin/notifications?from=pas-une-date`), 'admin');
    expect(res.status).toBe(400);
  });

  it('le super-admin passe sans être membre de l’agence', async () => {
    const res = await request(app)
      .get(`/api/tenants/${T1}/admin/notifications`)
      .set('x-user', 'superadmin')
      .set('x-super', '1');
    expect(res.status).toBe(200);
  });

  it('/recipients est routé avant /:id', async () => {
    const res = await asUser(request(app).get(`/api/tenants/${T1}/admin/notifications/recipients`), 'admin');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('messages prives : jamais au journal', () => {
  beforeEach(() => {
    db.notifications.push(
      notif({
        id: 'm1',
        key: 'MESSAGE_RECEIVED',
        tenantId: T1,
        recipientUserId: 'u1',
        recipientLabel: 'Alice',
        body: 'Vous avez reçu un nouveau message.',
        deliveries: [delivery('d-m1', 'IN_APP', 'FAILED')]
      })
    );
  });

  it('absent du journal admin, du detail, du renvoi, des destinataires et du journal plateforme', async () => {
    const list = await asUser(request(app).get(`/api/tenants/${T1}/admin/notifications`), 'admin');
    expect(list.body.data.items.map((i: any) => i.id)).not.toContain('m1');
    expect((await asUser(request(app).get(`/api/tenants/${T1}/admin/notifications/m1`), 'admin')).status).toBe(404);
    const resend = await asUser(request(app).post(`/api/tenants/${T1}/admin/notifications/m1/resend`), 'admin').send(
      {}
    );
    expect(resend.status).toBe(404);
    const platform = await request(app).get('/api/admin/notifications').set('x-user', 'superadmin');
    expect(platform.body.data.items.map((i: any) => i.id)).not.toContain('m1');
    expect((await request(app).get('/api/admin/notifications/m1').set('x-user', 'superadmin')).status).toBe(404);
    expect(
      (await request(app).post('/api/admin/notifications/m1/resend').set('x-user', 'superadmin').send({})).status
    ).toBe(404);
  });

  it("reste visible dans « mes notifications » du destinataire, avec un motif d'echec generique", async () => {
    const res = await asUser(request(app).get(`/api/tenants/${T1}/notifications`), 'u1');
    expect(res.status).toBe(200);
    const mine = res.body.data.items.find((i: any) => i.id === 'm1');
    expect(mine).toBeDefined();
    expect(mine.deliveries[0].failureReason).toBe("L'envoi a échoué.");
  });
});

describe("motifs d'echec : generique pour l'utilisateur, detaille pour l'admin", () => {
  it('« mes notifications » ne montre jamais le motif brut (SMTP, WhatsApp)', async () => {
    const res = await asUser(request(app).get(`/api/tenants/${T1}/notifications`), 'u1');
    const n4 = res.body.data.items.find((i: any) => i.id === 'n4');
    expect(n4.failureReason).toBe("L'envoi a échoué.");
    expect(n4.deliveries.map((d: any) => d.failureReason)).toEqual([
      null,
      "L'envoi a échoué.",
      "L'envoi a échoué.",
      "L'envoi a échoué."
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/SMTP|Gabarit/);
  });

  it('le journal admin garde le motif detaille', async () => {
    const res = await asUser(request(app).get(`/api/tenants/${T1}/admin/notifications/n4`), 'admin');
    expect(res.body.data.failureReason).toBe('SMTP indisponible');
    expect(res.body.data.deliveries.find((d: any) => d.channel === 'WHATSAPP').failureReason).toBe('Gabarit refusé');
  });
});

describe('renvoi (agence)', () => {
  it('ne rejoue que les canaux FAILED, puis trace l’action dans l’audit', async () => {
    const res = await asUser(request(app).post(`/api/tenants/${T1}/admin/notifications/n4/resend`), 'admin').send({
      channels: ['EMAIL']
    });
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const byChannel = Object.fromEntries(res.body.data.deliveries.map((d: any) => [d.channel, d]));
    expect(byChannel.EMAIL.status).toBe('SENT');
    expect(byChannel.EMAIL.attempts).toBe(2);
    expect(byChannel.IN_APP.status).toBe('SENT'); // déjà parti : non rejoué
    expect(byChannel.IN_APP.attempts).toBe(1);
    expect(byChannel.WHATSAPP.status).toBe('FAILED'); // non demandé : non rejoué
    expect(byChannel.SMS.status).toBe('SKIPPED'); // volontairement ignoré : non rejoué
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: T1, actorUserId: 'admin', actionKey: 'NOTIFICATION_RESENT', entityId: 'n4' })
    );
  });

  it('sans liste de canaux, rejoue tous les FAILED et seulement eux', async () => {
    await asUser(request(app).post(`/api/tenants/${T1}/admin/notifications/n4/resend`), 'admin').send({});
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const sms = db.notifications.find(n => n.id === 'n4')?.deliveries.find((d: Row) => d.channel === 'SMS');
    expect(sms?.status).toBe('SKIPPED');
  });

  it('403 sans droit, 404 pour une notification d’une autre agence', async () => {
    const denied = await asUser(request(app).post(`/api/tenants/${T1}/admin/notifications/n4/resend`), 'u1').send({});
    expect(denied.status).toBe(403);
    const other = await asUser(request(app).post(`/api/tenants/${T1}/admin/notifications/n3/resend`), 'admin').send({});
    expect(other.status).toBe(404);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('refuse le renvoi quand le destinataire est desactive', async () => {
    db.users.find(u => u.id === 'u1')!.isActive = false;
    const res = await asUser(request(app).post(`/api/tenants/${T1}/admin/notifications/n4/resend`), 'admin').send({
      channels: ['EMAIL']
    });
    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    const mail = res.body.data.deliveries.find((d: any) => d.channel === 'EMAIL');
    expect(mail.status).toBe('FAILED');
    expect(mail.failureReason).toBe('Relance impossible : destinataire ou événement désactivé');
  });

  it('refuse le renvoi e-mail quand l evenement e-mail est desactive (cle de la notification)', async () => {
    db.disabledEmailKeys = ['TEST'];
    const res = await asUser(request(app).post(`/api/tenants/${T1}/admin/notifications/n4/resend`), 'admin').send({
      channels: ['EMAIL']
    });
    expect(sendEmail).not.toHaveBeenCalled();
    const mail = res.body.data.deliveries.find((d: any) => d.channel === 'EMAIL');
    expect(mail.failureReason).toBe('Relance impossible : destinataire ou événement désactivé');
  });

  it('traite une livraison PENDING depuis plus de 5 minutes comme un FAILED rejouable', async () => {
    const n4 = db.notifications.find(n => n.id === 'n4')!;
    const mail = n4.deliveries.find((d: Row) => d.channel === 'EMAIL');
    mail.status = 'PENDING';
    mail.lastAttemptAt = new Date(Date.now() - 6 * 60 * 1000);
    const res = await asUser(request(app).post(`/api/tenants/${T1}/admin/notifications/n4/resend`), 'admin').send({
      channels: ['EMAIL']
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(res.body.data.deliveries.find((d: any) => d.channel === 'EMAIL').status).toBe('SENT');
  });

  it('ne rejoue pas une livraison PENDING recente (envoi en cours)', async () => {
    const n4 = db.notifications.find(n => n.id === 'n4')!;
    const mail = n4.deliveries.find((d: Row) => d.channel === 'EMAIL');
    mail.status = 'PENDING';
    mail.lastAttemptAt = new Date();
    await asUser(request(app).post(`/api/tenants/${T1}/admin/notifications/n4/resend`), 'admin').send({
      channels: ['EMAIL']
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('limite les renvois a 10 par minute et par utilisateur (429)', async () => {
    PERMISSIONS.spammer = ['TENANT_NOTIFICATIONS_ADMIN'];
    let last = 0;
    for (let i = 0; i < 11; i += 1) {
      const res = await asUser(request(app).post(`/api/tenants/${T1}/admin/notifications/n3/resend`), 'spammer').send(
        {}
      );
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it('refuse un canal inconnu dans le corps (400)', async () => {
    const res = await asUser(request(app).post(`/api/tenants/${T1}/admin/notifications/n4/resend`), 'admin').send({
      channels: ['PIGEON']
    });
    expect(res.status).toBe(400);
  });
});

// --- Plateforme --------------------------------------------------------------

describe('journal plateforme', () => {
  it('refuse un non super-admin, même avec PLATFORM_TENANTS_VIEW (403)', async () => {
    const res = await request(app).get('/api/admin/notifications').set('x-user', 'delegate');
    expect(res.status).toBe(403);
  });

  it('refuse un utilisateur sans permission plateforme (403)', async () => {
    const res = await request(app).get('/api/admin/notifications').set('x-user', 'u1');
    expect(res.status).toBe(403);
  });

  it('le super-admin voit toutes les agences, avec le nom de l’agence', async () => {
    const res = await request(app).get('/api/admin/notifications').set('x-user', 'superadmin');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(4);
    expect(res.body.data.items[0].tenant).toEqual(
      expect.objectContaining({ id: expect.any(String), name: expect.any(String) })
    );
  });

  it('filtre par agence quand tenantId est donné', async () => {
    const res = await request(app).get(`/api/admin/notifications?tenantId=${T2}`).set('x-user', 'superadmin');
    expect(res.body.data.items.map((i: any) => i.id)).toEqual(['n3']);
  });

  it('renvoi : rejoue dans l’agence portée par la notification, uniquement les FAILED', async () => {
    const res = await request(app).post('/api/admin/notifications/n4/resend').set('x-user', 'superadmin').send({});
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ tenantId: T1 }));
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: T1, actionKey: 'NOTIFICATION_RESENT' })
    );
  });

  it('renvoi : PLATFORM_TENANTS_EDIT exigé (la lecture seule ne suffit pas), lecture toujours permise', async () => {
    const read = await request(app).get('/api/admin/notifications').set('x-user', 'superviewer');
    expect(read.status).toBe(200);
    const resend = await request(app).post('/api/admin/notifications/n4/resend').set('x-user', 'superviewer').send({});
    expect(resend.status).toBe(403);
    expect(resend.body.requiredPermission).toBe('PLATFORM_TENANTS_EDIT');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('renvoi refusé à un non super-admin', async () => {
    const res = await request(app).post('/api/admin/notifications/n4/resend').set('x-user', 'delegate').send({});
    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('404 pour une notification inexistante', async () => {
    const res = await request(app).get('/api/admin/notifications/nope').set('x-user', 'superadmin');
    expect(res.status).toBe(404);
  });
});
