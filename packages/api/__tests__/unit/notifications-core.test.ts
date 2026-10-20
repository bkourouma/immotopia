/**
 * Service central de notifications (menu lot 3) : persist-first, echec d'un
 * canal sans effet sur la notification, journalisation sans effet de bord,
 * relance des seuls canaux FAILED, isolation par agence.
 *
 * Aucune base : `prisma` est remplace par un petit magasin en memoire qui
 * respecte les filtres `tenantId` / `id` utilises par le service.
 */
interface Delivery {
  id: string;
  tenantId: string;
  notificationId: string;
  channel: string;
  status: string;
  target: string | null;
  failureReason: string | null;
  attempts: number;
  resendPayload: unknown;
  createdAt: Date;
  lastAttemptAt: Date | null;
  sentAt: Date | null;
}
interface Notif {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  link: string | null;
  status: string;
  failureReason: string | null;
  recipientLabel: string;
  recipientUserId: string | null;
  senderUserId: string | null;
  deliveries: Delivery[];
  [k: string]: unknown;
}

const mockStore: {
  notifs: Notif[];
  events: string[];
  failCreate: boolean;
  failDeliveryUpdate: boolean;
  recipientInactive: boolean;
  emailEventDisabled: boolean;
  whatsappEventDisabled: boolean;
  seq: number;
} = {
  notifs: [],
  events: [],
  failCreate: false,
  failDeliveryUpdate: false,
  recipientInactive: false,
  emailEventDisabled: false,
  whatsappEventDisabled: false,
  seq: 0
};
const mockSendEmail = jest.fn();
const mockSendWhatsapp = jest.fn();
const mockSmsSend = jest.fn();
const mockUserFindMany = jest.fn();
const mockCrmFindFirst = jest.fn();
const mockHasSmsBudget = jest.fn();
const mockContactOwnsPhone = jest.fn();

function mockFindNotif(where: { id?: string; tenantId?: string; recipientUserId?: string }) {
  return mockStore.notifs.find(
    n =>
      (!where.id || n.id === where.id) &&
      (!where.tenantId || n.tenantId === where.tenantId) &&
      (!where.recipientUserId || n.recipientUserId === where.recipientUserId)
  );
}

jest.mock('../../src/utils/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'u1' ? { id: 'u1', email: 'alice@x.test', fullName: 'Alice Martin' } : null
      ),
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
      // Garde de renvoi : compte actif rattache a l'agence.
      findFirst: jest.fn(async ({ where }: { where: { isActive?: boolean } }) =>
        where.isActive && !mockStore.recipientInactive ? { id: 'u1' } : null
      )
    },
    emailNotificationConfig: {
      findFirst: jest.fn(async () => (mockStore.emailEventDisabled ? { enabled: false } : null))
    },
    whatsappNotificationConfig: {
      findFirst: jest.fn(async () => (mockStore.whatsappEventDisabled ? { enabled: false } : null))
    },
    userNotification: {
      create: jest.fn(
        async ({ data }: { data: Record<string, unknown> & { deliveries: { create: Partial<Delivery>[] } } }) => {
          mockStore.events.push('create');
          if (mockStore.failCreate) throw new Error('db down');
          const id = `n${++mockStore.seq}`;
          const { deliveries, ...rest } = data;
          const notif = {
            ...rest,
            id,
            deliveries: deliveries.create.map((d, i) => ({
              attempts: 0,
              failureReason: null,
              resendPayload: null,
              lastAttemptAt: null,
              sentAt: null,
              createdAt: new Date(2026, 0, 1, 0, 0, i),
              ...d,
              id: `${id}-d${i}`,
              notificationId: id
            }))
          } as unknown as Notif;
          mockStore.notifs.push(notif);
          return {
            id,
            deliveries: notif.deliveries.map(d => ({
              id: d.id,
              channel: d.channel,
              status: d.status,
              failureReason: d.failureReason
            }))
          };
        }
      ),
      findFirst: jest.fn(async ({ where }: { where: { id?: string; tenantId?: string } }) => {
        const n = mockFindNotif(where);
        return n
          ? {
              ...n,
              readAt: null,
              sentAt: null,
              createdAt: new Date(),
              key: 'K',
              link: n.link,
              relatedEntityType: null,
              relatedEntityId: null
            }
          : null;
      }),
      updateMany: jest.fn(
        async ({ where, data }: { where: { id: string; tenantId: string }; data: Record<string, unknown> }) => {
          const n = mockFindNotif(where);
          if (!n) return { count: 0 };
          Object.assign(n, data);
          return { count: 1 };
        }
      ),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0)
    },
    crmContact: { findFirst: (...a: unknown[]) => mockCrmFindFirst(...a) },
    notificationDelivery: {
      updateMany: jest.fn(
        async ({ where, data }: { where: { id: string; tenantId: string }; data: Record<string, unknown> }) => {
          if (mockStore.failDeliveryUpdate) throw new Error('db down');
          for (const n of mockStore.notifs) {
            const d = n.deliveries.find(
              x =>
                x.id === where.id &&
                x.tenantId === where.tenantId &&
                (!(where as { status?: string }).status || x.status === (where as { status?: string }).status)
            );
            if (d) {
              const { attempts, ...rest } = data as { attempts?: { increment: number } };
              Object.assign(d, rest);
              if (attempts) d.attempts += attempts.increment;
              return { count: 1 };
            }
          }
          return { count: 0 };
        }
      )
    }
  }
}));
jest.mock('../../src/config/env', () => ({
  env: { FRONTEND_URL: 'https://app.immotopia.test', CLIENT_URL: undefined, SMS_ALLOWED_DIAL_CODES: ['225'] }
}));
jest.mock('../../src/lib/signature/sms-guard', () => ({
  isAllowedSmsDialCode: (e164: string) => e164.startsWith('+225'),
  contactOwnsPhone: (...a: unknown[]) => mockContactOwnsPhone(...a),
  hasSmsBudget: (...a: unknown[]) => mockHasSmsBudget(...a)
}));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (...a: unknown[]) => mockSendEmail(...a) }
}));
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: (...a: unknown[]) => mockSendWhatsapp(...a)
}));
jest.mock('../../src/lib/sms', () => ({ getSmsTransport: () => ({ send: (...a: unknown[]) => mockSmsSend(...a) }) }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { prisma } from '../../src/utils/database';
import { describeFailure } from '../../src/lib/notifications/describe-error';
import { normalizeLink } from '../../src/lib/notifications/link';
import { isReplayableVariables } from '../../src/lib/notifications/replayable';
import { NotFoundError } from '../../src/middleware/error-middleware';
import {
  aggregateStatus,
  getAdminNotification,
  getPlatformNotification,
  listAdminNotifications,
  listMyNotifications,
  listNotificationRecipients,
  listPlatformNotifications,
  logNotificationDelivery,
  markRead,
  notify,
  resendNotification
} from '../../src/lib/notifications';

const TENANT = 'tenant-a';
const OTHER = 'tenant-b';
const base = { tenantId: TENANT, key: 'TEST_KEY', title: 'Titre', body: 'Corps' };

beforeEach(() => {
  mockStore.notifs = [];
  mockStore.events = [];
  mockStore.failCreate = false;
  mockStore.failDeliveryUpdate = false;
  mockStore.recipientInactive = false;
  mockStore.emailEventDisabled = false;
  mockStore.whatsappEventDisabled = false;
  mockStore.seq = 0;
  mockSendEmail.mockReset().mockImplementation(async () => {
    mockStore.events.push('email');
  });
  mockSendWhatsapp.mockReset();
  mockSmsSend.mockReset();
  mockUserFindMany.mockReset().mockResolvedValue([]);
  mockCrmFindFirst.mockReset().mockResolvedValue({ consentWhatsapp: true, consentEmail: true });
  mockHasSmsBudget.mockReset().mockResolvedValue(true);
  mockContactOwnsPhone.mockReset().mockResolvedValue(true);
  (prisma.userNotification.findFirst as jest.Mock).mockClear();
  (prisma.userNotification.findMany as jest.Mock).mockClear();
  (prisma.userNotification.count as jest.Mock).mockClear();
});

describe('notify', () => {
  it('ecrit la notification AVANT tout envoi, puis passe en SENT', async () => {
    const res = await notify({ ...base, recipients: [{ userId: 'u1' }], channels: ['IN_APP', 'EMAIL'] });
    expect(mockStore.events).toEqual(['create', 'email']);
    expect(res.notifications).toEqual([{ id: 'n1', recipientLabel: 'Alice Martin', status: 'SENT' }]);
    const n = mockStore.notifs[0];
    expect(n.tenantId).toBe(TENANT);
    expect(n.deliveries.map(d => [d.channel, d.status])).toEqual([
      ['IN_APP', 'SENT'],
      ['EMAIL', 'SENT']
    ]);
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'alice@x.test', tenantId: TENANT }));
  });

  it('IN_APP seul par defaut, sans aucun envoi externe', async () => {
    await notify({ ...base, recipients: [{ userId: 'u1' }] });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockStore.notifs[0].deliveries).toHaveLength(1);
  });

  it('un canal en echec : delivery FAILED + raison, la notification reste (SENT partiel)', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('SMTP refuse'));
    const res = await notify({ ...base, recipients: [{ userId: 'u1' }], channels: ['IN_APP', 'EMAIL'] });
    const n = mockStore.notifs[0];
    expect(n.deliveries.find(d => d.channel === 'EMAIL')).toMatchObject({
      status: 'FAILED',
      // Jamais le message brut du transport : nom + code seulement.
      failureReason: 'Error',
      attempts: 1
    });
    expect(res.notifications[0].status).toBe('SENT');
    expect(n.status).toBe('SENT');
    expect(n.failureReason).toContain('EMAIL');
  });

  it('tous les canaux en echec : statut FAILED', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('SMTP refuse'));
    const res = await notify({ ...base, recipients: [{ userId: 'u1' }], channels: ['EMAIL'] });
    expect(res.notifications[0].status).toBe('FAILED');
    expect(mockStore.notifs[0].failureReason).toContain('EMAIL : Error');
    expect(mockStore.notifs[0].failureReason).not.toContain('SMTP refuse');
  });

  it('WhatsApp non envoye (sans consentement) : SKIPPED, pas FAILED', async () => {
    mockSendWhatsapp.mockResolvedValueOnce(false);
    await notify({
      ...base,
      recipients: [{ userId: 'u1', phone: '+2250700000000' }],
      channels: ['IN_APP', 'WHATSAPP'],
      whatsapp: { notificationKey: 'LEASE_ACTIVATED', variables: { a: 'b' } }
    });
    expect(mockStore.notifs[0].deliveries.find(d => d.channel === 'WHATSAPP')?.status).toBe('SKIPPED');
    expect(mockSendWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, notificationKey: 'LEASE_ACTIVATED', to: '+2250700000000' })
    );
  });

  it('SMS desactive : SKIPPED ; echec transport : FAILED', async () => {
    mockSmsSend.mockResolvedValueOnce({ ok: false, reason: 'DISABLED' });
    mockSmsSend.mockResolvedValueOnce({ ok: false, reason: 'SEND_FAILED' });
    await notify({ ...base, recipients: [{ userId: 'u1', phone: '+2250700000000' }], channels: ['SMS'] });
    await notify({ ...base, recipients: [{ userId: 'u1', phone: '+2250700000000' }], channels: ['SMS'] });
    expect(mockStore.notifs.map(n => n.deliveries[0].status)).toEqual(['SKIPPED', 'FAILED']);
  });

  it('destinataire sans compte : libelle fige, IN_APP ignore', async () => {
    const res = await notify({ ...base, recipients: [{ contactId: 'c1', label: 'M. Kone' }] });
    expect(res.notifications[0].recipientLabel).toBe('M. Kone');
    expect(mockStore.notifs[0].deliveries[0].status).toBe('SKIPPED');
  });

  it('ne leve jamais, meme si la journalisation d’un canal echoue', async () => {
    mockStore.failDeliveryUpdate = true;
    await expect(notify({ ...base, recipients: [{ userId: 'u1' }], channels: ['IN_APP', 'EMAIL'] })).resolves.toEqual({
      notifications: [expect.objectContaining({ id: 'n1' })]
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('ne leve jamais si la creation echoue', async () => {
    mockStore.failCreate = true;
    await expect(notify({ ...base, recipients: [{ userId: 'u1' }] })).resolves.toEqual({ notifications: [] });
  });
});

describe('logNotificationDelivery', () => {
  const log = (run: () => Promise<void | { status: 'SENT' | 'SKIPPED' | 'FAILED' }>) =>
    logNotificationDelivery({
      tenantId: TENANT,
      recipient: { userId: 'u1' },
      key: 'LEGACY',
      title: 'T',
      body: 'B',
      channel: 'EMAIL',
      run
    });

  it('ecrit PENDING avant run(), puis SENT', async () => {
    const result = await log(async () => {
      mockStore.events.push('run');
      expect(mockStore.notifs[0].deliveries[0].status).toBe('PENDING');
    });
    expect(result).toBeUndefined();
    expect(mockStore.events).toEqual(['create', 'run']);
    expect(mockStore.notifs[0].deliveries[0]).toMatchObject({ status: 'SENT', target: 'alice@x.test' });
    expect(mockStore.notifs[0].status).toBe('SENT');
  });

  it("relance l'erreur de run() telle quelle, apres avoir note FAILED", async () => {
    const boom = new Error('boom');
    await expect(
      log(async () => {
        throw boom;
      })
    ).rejects.toBe(boom);
    expect(mockStore.notifs[0].deliveries[0]).toMatchObject({ status: 'FAILED', failureReason: 'Error' });
  });

  it('SKIPPED rapporte par run()', async () => {
    await log(async () => ({ status: 'SKIPPED' }));
    expect(mockStore.notifs[0].deliveries[0].status).toBe('SKIPPED');
  });

  it("si la journalisation echoue, l'envoi part quand meme et rien n'est change pour l'appelant", async () => {
    mockStore.failCreate = true;
    const run = jest.fn().mockResolvedValue(undefined);
    await expect(log(run)).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);

    const boom = new Error('boom');
    await expect(log(jest.fn().mockRejectedValue(boom))).rejects.toBe(boom);
  });

  it("une panne d'ecriture du statut final ne masque ni ne cree d'erreur", async () => {
    mockStore.failDeliveryUpdate = true;
    await expect(log(async () => undefined)).resolves.toBeUndefined();
  });
});

describe('resendNotification', () => {
  it('ne rejoue que les canaux FAILED', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('SMTP refuse'));
    mockSendWhatsapp.mockResolvedValueOnce(true);
    await notify({
      ...base,
      recipients: [{ userId: 'u1', phone: '+2250700000000' }],
      channels: ['IN_APP', 'EMAIL', 'WHATSAPP'],
      whatsapp: { notificationKey: 'LEASE_ACTIVATED', variables: {} }
    });
    mockSendEmail.mockClear();
    mockSendWhatsapp.mockClear();

    const detail = await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendWhatsapp).not.toHaveBeenCalled();
    const byChannel = Object.fromEntries(mockStore.notifs[0].deliveries.map(d => [d.channel, d]));
    expect(byChannel.EMAIL).toMatchObject({ status: 'SENT', attempts: 2 });
    expect(byChannel.IN_APP.attempts).toBe(1);
    expect(byChannel.WHATSAPP.attempts).toBe(1);
    expect(detail.id).toBe('n1');
  });

  it('respecte le filtre de canaux', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('SMTP refuse'));
    await notify({ ...base, recipients: [{ userId: 'u1' }], channels: ['EMAIL'] });
    mockSendEmail.mockClear();
    await resendNotification({ tenantId: TENANT, notificationId: 'n1', channels: ['SMS'] });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('un echec reste FAILED (avec raison) quand le canal ne peut pas etre rejoue', async () => {
    mockSendWhatsapp.mockResolvedValueOnce(true);
    await notify({
      ...base,
      recipients: [{ userId: 'u1' }],
      channels: ['WHATSAPP'] // pas de gabarit : SKIPPED a l'envoi
    });
    mockStore.notifs[0].deliveries[0].status = 'FAILED';
    await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
    expect(mockStore.notifs[0].deliveries[0].status).toBe('FAILED');
    expect(mockStore.notifs[0].deliveries[0].failureReason).toMatch(/Relance impossible/);
  });

  it("notification d'une autre agence : la meme NotFoundError qu'une notification inexistante", async () => {
    await notify({ ...base, recipients: [{ userId: 'u1' }], channels: ['EMAIL'] });
    await expect(resendNotification({ tenantId: OTHER, notificationId: 'n1' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(resendNotification({ tenantId: TENANT, notificationId: 'absent' })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(prisma.userNotification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'n1', tenantId: OTHER }) })
    );
  });

  it('un message prive (MESSAGE_RECEIVED) ne se renvoie jamais : meme NotFoundError', async () => {
    await notify({ ...base, recipients: [{ userId: 'u1' }], channels: ['EMAIL'] });
    await resendNotification({ tenantId: TENANT, notificationId: 'n1' }).catch(() => undefined);
    expect(prisma.userNotification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: { not: 'MESSAGE_RECEIVED' } }) })
    );
    // le vrai filtre est en base : on verifie ici que la requete l'exige, et que son absence de resultat leve NotFound
    (prisma.userNotification.findFirst as jest.Mock).mockResolvedValueOnce(null);
    await expect(resendNotification({ tenantId: TENANT, notificationId: 'n1' })).rejects.toBeInstanceOf(NotFoundError);
  });

  describe('garde-fous du renvoi', () => {
    const failEmailThenReset = async (recipient: Record<string, unknown> = { userId: 'u1' }) => {
      mockSendEmail.mockRejectedValueOnce(new Error('SMTP refuse'));
      await notify({ ...base, recipients: [recipient as never], channels: ['EMAIL'] });
      mockSendEmail.mockClear();
    };

    it('destinataire desactive ou evenement e-mail desactive : refus explicite, aucun envoi', async () => {
      await failEmailThenReset();
      mockStore.recipientInactive = true;
      await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockStore.notifs[0].deliveries[0].failureReason).toBe(
        'Relance impossible : destinataire ou événement désactivé'
      );
      mockStore.recipientInactive = false;
      mockStore.emailEventDisabled = true;
      await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockStore.notifs[0].deliveries[0].failureReason).toBe(
        'Relance impossible : destinataire ou événement désactivé'
      );
    });

    it('livraison PENDING depuis plus de 5 minutes : rejouee comme un FAILED ; recente : laissee', async () => {
      await notify({ ...base, recipients: [{ userId: 'u1' }], channels: ['EMAIL'] });
      mockSendEmail.mockClear();
      const d = mockStore.notifs[0].deliveries[0];
      d.status = 'PENDING';
      d.lastAttemptAt = new Date() as never;
      await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
      expect(mockSendEmail).not.toHaveBeenCalled();
      d.lastAttemptAt = new Date(Date.now() - 6 * 60 * 1000) as never;
      await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(d.status).toBe('SENT');
    });

    it("une livraison marquee replayable:false n'est JAMAIS rejouee (reste FAILED, motif explicite)", async () => {
      await failEmailThenReset();
      mockStore.notifs[0].deliveries[0].resendPayload = { replayable: false };
      await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockStore.notifs[0].deliveries[0]).toMatchObject({
        status: 'FAILED',
        failureReason: 'Relance impossible : message non rejouable',
        attempts: 1
      });
    });

    it('logNotificationDelivery({ replayable:false }) ecrit le drapeau et AUCUN autre contenu', async () => {
      await logNotificationDelivery({
        tenantId: TENANT,
        recipient: { userId: 'u1' },
        key: 'SIGNATURE_MESSAGE',
        title: 'T',
        body: 'B',
        channel: 'EMAIL',
        resendPayload: { whatsapp: { notificationKey: 'K', variables: { lien: 'https://x' } } },
        replayable: false,
        run: async () => {
          throw new Error('SMTP');
        }
      }).catch(() => undefined);
      expect(mockStore.notifs[0].deliveries[0].resendPayload).toEqual({ replayable: false });
    });

    it('consentement e-mail retire chez le contact CRM : non rejoue', async () => {
      await failEmailThenReset({ contactId: 'c1', email: 'k@x.test' });
      mockCrmFindFirst.mockResolvedValue({ consentWhatsapp: true, consentEmail: false });
      await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockStore.notifs[0].deliveries[0]).toMatchObject({
        status: 'FAILED',
        failureReason: 'Relance impossible : consentement retiré'
      });
      expect(mockCrmFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1', tenantId: TENANT } }));
    });

    it('consentement e-mail maintenu : rejoue', async () => {
      await failEmailThenReset({ contactId: 'c1', email: 'k@x.test' });
      await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockStore.notifs[0].deliveries[0].status).toBe('SENT');
    });

    it('contact CRM supprime : refuse comme un consentement retire', async () => {
      await failEmailThenReset({ contactId: 'c1', email: 'k@x.test' });
      mockCrmFindFirst.mockResolvedValue(null);
      await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('consentement WhatsApp retire : non rejoue', async () => {
      mockSendWhatsapp.mockRejectedValueOnce(new Error('WA down'));
      await notify({
        ...base,
        recipients: [{ contactId: 'c1', phone: '+2250700000000' }],
        channels: ['WHATSAPP'],
        whatsapp: { notificationKey: 'LEASE_ACTIVATED', variables: { tenantName: 'Kone' } }
      });
      mockSendWhatsapp.mockClear();
      mockCrmFindFirst.mockResolvedValue({ consentWhatsapp: false, consentEmail: true });
      await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
      expect(mockSendWhatsapp).not.toHaveBeenCalled();
      expect(mockStore.notifs[0].deliveries[0].failureReason).toBe('Relance impossible : consentement retiré');
    });

    it('variables WhatsApp sensibles (lien, jeton long) : notify() ne les garde pas, non rejouable', async () => {
      const cas: Array<Record<string, string>> = [
        { nom: 'https://acces.test/x' },
        { ref: 'a'.repeat(30) },
        { lien: 'ok' }
      ];
      for (const variables of cas) {
        mockStore.notifs = [];
        mockSendWhatsapp.mockRejectedValueOnce(new Error('WA down'));
        await notify({
          ...base,
          recipients: [{ userId: 'u1', phone: '+2250700000000' }],
          channels: ['WHATSAPP'],
          whatsapp: { notificationKey: 'LEASE_ACTIVATED', variables }
        });
        expect(mockStore.notifs[0].deliveries[0].resendPayload).toEqual({ replayable: false });
      }
    });

    const failSms = async (recipient: Record<string, unknown>) => {
      mockSmsSend.mockResolvedValueOnce({ ok: false, reason: 'SEND_FAILED' });
      await notify({ ...base, recipients: [recipient as never], channels: ['SMS'] });
      mockSmsSend.mockClear();
    };

    it("SMS sans contact CRM de l'agence : non rejouable", async () => {
      await failSms({ userId: 'u1', phone: '+2250700000000' });
      await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
      expect(mockSmsSend).not.toHaveBeenCalled();
      expect(mockStore.notifs[0].deliveries[0].failureReason).toMatch(/SMS non rejouable/);
    });

    it('SMS : repasse par les gardes (indicatif, numero du contact, plafond), sinon refuse', async () => {
      await failSms({ contactId: 'c1', phone: '+2250700000000' });
      mockContactOwnsPhone.mockResolvedValue(false);
      await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
      expect(mockSmsSend).not.toHaveBeenCalled();
      mockContactOwnsPhone.mockResolvedValue(true);
      mockHasSmsBudget.mockResolvedValue(false);
      await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
      expect(mockSmsSend).not.toHaveBeenCalled();
      expect(mockStore.notifs[0].deliveries[0].failureReason).toMatch(/SMS non autorisé/);
      expect(mockContactOwnsPhone).toHaveBeenCalledWith(TENANT, 'c1', '+2250700000000');
    });

    it('SMS : numero hors indicatifs autorises refuse', async () => {
      await failSms({ contactId: 'c1', phone: '+33612345678' });
      await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
      expect(mockSmsSend).not.toHaveBeenCalled();
    });

    it('SMS : tous les gardes passent => rejoue', async () => {
      await failSms({ contactId: 'c1', phone: '+2250700000000' });
      mockSmsSend.mockResolvedValueOnce({ ok: true, providerMessageId: 'p1' });
      await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
      expect(mockSmsSend).toHaveBeenCalledTimes(1);
      expect(mockStore.notifs[0].deliveries[0]).toMatchObject({ status: 'SENT', providerMessageId: 'p1' });
    });

    it("verrou anti double envoi : FAILED -> PENDING conditionnel, pas de rejeu si une autre requete l'a pris", async () => {
      await failEmailThenReset();
      const updateMany = prisma.notificationDelivery.updateMany as jest.Mock;
      updateMany.mockClear();
      updateMany.mockResolvedValueOnce({ count: 0 }); // le verrou est perdu
      await resendNotification({ tenantId: TENANT, notificationId: 'n1' });
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'n1-d0', tenantId: TENANT, status: 'FAILED' },
        data: { status: 'PENDING' }
      });
    });

    it('verrou : deux renvois simultanes envoient UNE seule fois', async () => {
      await failEmailThenReset();
      await Promise.all([
        resendNotification({ tenantId: TENANT, notificationId: 'n1' }),
        resendNotification({ tenantId: TENANT, notificationId: 'n1' })
      ]);
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });
  });
});

describe("journal : un message prive n'y apparait jamais", () => {
  const keyFilter = { key: { not: 'MESSAGE_RECEIVED' } };

  it('liste admin, detail, destinataires, liste et detail plateforme excluent MESSAGE_RECEIVED', async () => {
    const find = prisma.userNotification.findMany as jest.Mock;
    const first = prisma.userNotification.findFirst as jest.Mock;
    const count = prisma.userNotification.count as jest.Mock;

    await listAdminNotifications(TENANT, { q: 'abc', status: 'FAILED' });
    expect(find.mock.calls[0][0].where).toEqual(expect.objectContaining(keyFilter));
    expect(count.mock.calls[0][0].where).toEqual(expect.objectContaining(keyFilter));

    find.mockClear();
    await listPlatformNotifications({ tenantId: TENANT });
    expect(find.mock.calls[0][0].where).toEqual(expect.objectContaining(keyFilter));

    find.mockClear();
    await listNotificationRecipients(TENANT, 'a');
    expect(find.mock.calls[0][0].where).toEqual(expect.objectContaining(keyFilter));

    first.mockClear();
    await getAdminNotification(TENANT, 'n1').catch(() => undefined);
    expect(first.mock.calls[0][0].where).toEqual(expect.objectContaining({ id: 'n1', tenantId: TENANT, ...keyFilter }));
    first.mockClear();
    await getPlatformNotification('n1').catch(() => undefined);
    expect(first.mock.calls[0][0].where).toEqual(expect.objectContaining({ id: 'n1', ...keyFilter }));
  });

  it('« mes notifications » du destinataire ne filtre PAS MESSAGE_RECEIVED', async () => {
    const find = prisma.userNotification.findMany as jest.Mock;
    await listMyNotifications({ tenantId: TENANT, userId: 'u1' });
    expect(find.mock.calls[0][0].where).not.toHaveProperty('key');
  });
});

describe("motif d'echec : generique pour l'utilisateur, detaille pour le journal", () => {
  const row = {
    id: 'n1',
    tenantId: TENANT,
    key: 'K',
    title: 'T',
    body: 'B',
    link: null,
    status: 'FAILED',
    failureReason: 'EMAIL : 535 auth failed smtp.interne.local',
    readAt: null,
    sentAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    recipientUserId: 'u1',
    recipientLabel: 'Alice',
    senderUserId: null,
    relatedEntityType: null,
    relatedEntityId: null,
    deliveries: [
      {
        channel: 'EMAIL',
        status: 'FAILED',
        target: 'a@x.test',
        failureReason: '535 auth failed smtp.interne.local',
        attempts: 1,
        lastAttemptAt: null,
        sentAt: null
      }
    ]
  };

  it('listMyNotifications : motif generique, y compris par livraison', async () => {
    (prisma.userNotification.findMany as jest.Mock).mockResolvedValueOnce([row]);
    const res = await listMyNotifications({ tenantId: TENANT, userId: 'u1' });
    expect(res.items[0].failureReason).toBe("L'envoi a échoué.");
    expect(res.items[0].deliveries[0].failureReason).toBe("L'envoi a échoué.");
    expect(JSON.stringify(res)).not.toMatch(/smtp|535/i);
  });

  it('un echec absent reste null', async () => {
    (prisma.userNotification.findMany as jest.Mock).mockResolvedValueOnce([
      { ...row, failureReason: null, deliveries: [{ channel: 'IN_APP', status: 'SENT', failureReason: null }] }
    ]);
    const res = await listMyNotifications({ tenantId: TENANT, userId: 'u1' });
    expect(res.items[0].failureReason).toBeNull();
    expect(res.items[0].deliveries[0].failureReason).toBeNull();
  });

  it('journal admin et plateforme : motif detaille conserve', async () => {
    (prisma.userNotification.findMany as jest.Mock).mockResolvedValueOnce([row]);
    const admin = await listAdminNotifications(TENANT);
    // Canal traduit, motif inconnu (deja lisible) conserve tel quel.
    expect(admin.items[0].failureReason).toBe('E-mail : 535 auth failed smtp.interne.local');
    expect(admin.items[0].deliveries[0].failureReason).toBe('535 auth failed smtp.interne.local');
    (prisma.userNotification.findMany as jest.Mock).mockResolvedValueOnce([
      { ...row, tenant: { id: TENANT, name: 'Agence A' } }
    ]);
    const platform = await listPlatformNotifications();
    expect(platform.items[0].failureReason).toBe('E-mail : 535 auth failed smtp.interne.local');
  });
});

describe('liens', () => {
  it("un lien absolu vers l'origine de l'application est ramene a son chemin relatif", async () => {
    await notify({
      ...base,
      recipients: [{ userId: 'u1' }],
      link: 'https://app.immotopia.test/syndic/ag/12?tab=2#vote'
    });
    expect(mockStore.notifs[0].link).toBe('/syndic/ag/12?tab=2#vote');
  });

  it('un lien absolu vers une AUTRE origine, protocol-relatif ou javascript: est supprime', async () => {
    for (const link of [
      'https://evil.test/phish',
      '//evil.test/x',
      '/\\evil.test/x',
      'javascript:alert(1)',
      'http://app.immotopia.test.evil.test/'
    ]) {
      mockStore.notifs = [];
      await notify({ ...base, recipients: [{ userId: 'u1' }], link });
      expect(mockStore.notifs[0].link).toBeNull();
    }
  });

  it("un lien relatif est conserve ; le canal e-mail recoit l'URL absolue", async () => {
    await notify({ ...base, recipients: [{ userId: 'u1' }], link: '/messages/c1', channels: ['EMAIL'] });
    expect(mockStore.notifs[0].link).toBe('/messages/c1');
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('https://app.immotopia.test/messages/c1') })
    );
  });

  it('logNotificationDelivery applique la meme normalisation', async () => {
    const log = (link: string) =>
      logNotificationDelivery({
        tenantId: TENANT,
        recipient: { userId: 'u1' },
        key: 'LEGACY',
        title: 'T',
        body: 'B',
        link,
        channel: 'EMAIL',
        run: async () => undefined
      });
    await log('https://app.immotopia.test/a/b');
    await log('https://evil.test/a');
    expect(mockStore.notifs.map(n => n.link)).toEqual(['/a/b', null]);
  });
});

describe('liens : caracteres interdits et chemin strict', () => {
  it('rejette controle, tabulation, retour ligne, espace, //hote, /\\hote, javascript:', () => {
    for (const link of [
      'javascript:alert(1)',
      '//evil.test',
      '/\\evil.test',
      '/a\nb',
      '/a\tb',
      '/a b',
      ' /a',
      '/a\u0000b',
      '/a\u007Fb',
      'relatif/sans-slash'
    ]) {
      expect(normalizeLink(link)).toBeNull();
    }
    expect(normalizeLink('/messages/c1?x=1#y')).toBe('/messages/c1?x=1#y');
  });
});

describe('motif d echec stocke : nom + code seulement', () => {
  it('describeFailure ne reprend jamais le message brut', () => {
    const e = Object.assign(new Error('connect ECONNREFUSED smtp.interne.local:25 pour alice@x.test'), {
      code: 'ECONNREFUSED'
    });
    expect(describeFailure(e)).toBe('Error ECONNREFUSED');
    expect(describeFailure(new Error('secret'))).toBe('Error');
    expect(describeFailure('texte alice@x.test')).toBe('Erreur inconnue');
  });

  it('logNotificationDelivery avec redactTarget : ni adresse ni hote dans failureReason', async () => {
    const err = Object.assign(new Error('535 auth failed jean@exemple.ci smtp.interne.local'), { code: 'EAUTH' });
    await expect(
      logNotificationDelivery({
        tenantId: TENANT,
        recipient: { email: 'jean@exemple.ci' },
        key: 'DIRECT_DEBIT_PRENOTIFICATION',
        title: 'T',
        body: 'B',
        channel: 'EMAIL',
        redactTarget: true,
        run: async () => {
          throw err;
        }
      })
    ).rejects.toBe(err);
    expect(mockStore.notifs[0].deliveries[0].failureReason).toBe('Error EAUTH');
    expect(JSON.stringify(mockStore.notifs[0])).not.toMatch(/jean@|smtp\.interne/);
  });
});

describe('variables WhatsApp : liste blanche du gabarit', () => {
  it('seules les variables declarees pour la cle sont rejouables', () => {
    expect(isReplayableVariables({ tenantName: 'Alice', agencyName: 'Agence' }, 'PAYMENT_APPROVED_TENANT')).toBe(true);
    expect(isReplayableVariables({ tenantName: 'Alice', extra: 'x' }, 'PAYMENT_APPROVED_TENANT')).toBe(false);
    expect(isReplayableVariables({ tenantName: 'Alice' }, 'CLE_INCONNUE')).toBe(false);
  });
  it('une valeur URL ou un mot long reste refuse meme sous un nom declare', () => {
    expect(isReplayableVariables({ tenantName: 'https://x.test/t' }, 'PAYMENT_APPROVED_TENANT')).toBe(false);
    expect(isReplayableVariables({ tenantName: 'abcdefghijklmnopqrstuvwxyz0123' }, 'PAYMENT_APPROVED_TENANT')).toBe(
      false
    );
  });
  it('notify : variable hors gabarit => non rejouable mais le premier envoi part', async () => {
    mockSendWhatsapp.mockResolvedValueOnce(true);
    await notify({
      ...base,
      recipients: [{ userId: 'u1', phone: '+2250700000000' }],
      channels: ['WHATSAPP'],
      whatsapp: { notificationKey: 'LEASE_ACTIVATED', variables: { inconnue: 'b' } }
    });
    const d = mockStore.notifs[0].deliveries[0];
    expect(d.resendPayload).toEqual({ replayable: false });
    expect(mockSendWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({ notificationKey: 'LEASE_ACTIVATED', variables: { inconnue: 'b' } })
    );
  });
});

describe('adresse masquee (prelevements)', () => {
  it('redactTarget : cible et libelle masques, livraison non rejouable', async () => {
    await logNotificationDelivery({
      tenantId: TENANT,
      recipient: { email: 'jean@exemple.ci' },
      key: 'DIRECT_DEBIT_PRENOTIFICATION',
      title: 'T',
      body: 'B',
      channel: 'EMAIL',
      target: 'jean@exemple.ci',
      redactTarget: true,
      run: async () => undefined
    });
    const n = mockStore.notifs[0];
    expect(n.deliveries[0].target).toBe('j***@exemple.ci');
    expect(n.recipientLabel).toBe('j***@exemple.ci');
    expect(n.deliveries[0].resendPayload).toEqual({ replayable: false });
    expect(JSON.stringify(n)).not.toContain('jean@');
  });
});

describe('lectures', () => {
  it('getAdminNotification / markRead : autre agence => NotFoundError', async () => {
    await notify({ ...base, recipients: [{ userId: 'u1' }] });
    await expect(getAdminNotification(OTHER, 'n1')).rejects.toBeInstanceOf(NotFoundError);
    await expect(markRead(OTHER, 'u1', 'n1')).rejects.toBeInstanceOf(NotFoundError);
    await expect(getAdminNotification(TENANT, 'n1')).resolves.toMatchObject({
      id: 'n1',
      recipient: { userId: 'u1', label: 'Alice Martin' },
      sender: null,
      deliveries: [expect.objectContaining({ channel: 'IN_APP', status: 'SENT' })]
    });
  });

  it("le libelle de l'expediteur est lu par select explicite (jamais passwordHash)", async () => {
    await notify({ ...base, recipients: [{ userId: 'u1' }], senderUserId: 'u9' });
    mockUserFindMany.mockResolvedValueOnce([{ id: 'u9', email: 'bob@x.test', fullName: null }]);
    const detail = await getAdminNotification(TENANT, 'n1');
    expect(detail.sender).toEqual({ userId: 'u9', label: 'bob@x.test' });
    const select = mockUserFindMany.mock.calls[0][0].select;
    expect(select).toEqual({ id: true, email: true, fullName: true });
    expect(select).not.toHaveProperty('passwordHash');
  });
});

describe('aggregateStatus', () => {
  const d = (status: string, failureReason: string | null = null) => ({ channel: 'EMAIL', status, failureReason });
  it('FAILED seulement si aucun canal n’est parti', () => {
    expect(aggregateStatus([d('FAILED', 'x')]).status).toBe('FAILED');
    expect(aggregateStatus([d('FAILED', 'x'), d('SENT')])).toMatchObject({
      status: 'SENT',
      failureReason: 'EMAIL : x'
    });
    expect(aggregateStatus([d('SENT')])).toEqual({ status: 'SENT', failureReason: null });
    expect(aggregateStatus([d('DELIVERED')]).status).toBe('SENT');
  });
  it('PENDING tant qu’un canal attend, SKIPPED si tout est ignore', () => {
    expect(aggregateStatus([d('PENDING'), d('SKIPPED')]).status).toBe('PENDING');
    expect(aggregateStatus([d('SKIPPED')]).status).toBe('SKIPPED');
    expect(aggregateStatus([]).status).toBe('SKIPPED');
  });
});
