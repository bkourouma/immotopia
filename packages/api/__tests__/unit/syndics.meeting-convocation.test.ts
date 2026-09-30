/**
 * BUG-2026-09-30-090 : la convocation compte envoyes / echoues ; un e-mail en
 * echec ne bloque pas les suivants.
 */
const mockPrisma = {
  generalMeeting: { findUnique: jest.fn() },
  auditLog: { findMany: jest.fn(async () => [] as any[]), create: jest.fn(async () => ({})) }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const mockSendEmail = jest.fn();
jest.mock('../../src/services/email-service', () => ({ emailService: { sendEmail: mockSendEmail } }));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: jest
    .fn()
    .mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null })
}));
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: jest.fn().mockResolvedValue(false)
}));

import { notifyMeetingConvocation } from '../../src/lib/syndics/notifications';

const owner = (id: string, email: string | null) => ({
  id,
  firstName: id,
  lastName: 'X',
  legalName: null,
  email,
  phone: null
});

describe('notifyMeetingConvocation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('compte les envois, les échecs et les copropriétaires sans e-mail', async () => {
    mockPrisma.generalMeeting.findUnique.mockResolvedValue({
      id: 'm1',
      scheduledAt: new Date('2026-02-20T09:00:00Z'),
      location: 'Salle',
      syndicate: {
        tenantId: 't1',
        name: 'Résidence',
        lots: [
          { generalShares: 100, owner: owner('a', 'a@x.ci') },
          { generalShares: 100, owner: owner('b', 'b@x.ci') },
          { generalShares: 100, owner: owner('c', null) },
          { generalShares: 100, owner: owner('a', 'a@x.ci') }
        ]
      }
    });
    mockSendEmail.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('SMTP'));

    const result = await notifyMeetingConvocation('m1');

    expect(result).toMatchObject({
      owners: 3,
      emailEnabled: true,
      emailSent: 1,
      emailFailed: 1,
      emailSkippedNoAddress: 1,
      failures: ['b X']
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });
});

describe('notifyMeetingConvocation : destinataires et renvoi (M3)', () => {
  const profile = (id: string, contact: any, pct: number) => ({
    id: `p-${id}`,
    contactId: contact.id,
    ownershipPercentage: pct,
    ownedSince: new Date('2020-01-01'),
    ownedUntil: null,
    isActive: true,
    contact
  });
  const meeting = () => ({
    id: 'm1',
    scheduledAt: new Date('2026-02-20T09:00:00Z'),
    location: 'Salle',
    syndicate: {
      tenantId: 't1',
      name: 'Résidence',
      lots: [
        // Indivision 60/40 : les deux co-indivisaires sont convoqués (le lot porte le principal).
        {
          generalShares: 200,
          owner: owner('a', 'a@x.ci'),
          ownerProfiles: [profile('a', owner('a', 'a@x.ci'), 60), profile('b', owner('b', 'b@x.ci'), 40)]
        },
        // Lot désactivé (0 tantième) : son propriétaire n'est pas convoqué.
        { generalShares: 0, owner: owner('z', 'z@x.ci'), ownerProfiles: [profile('z', owner('z', 'z@x.ci'), 100)] },
        // Même adresse e-mail qu'un autre contact : un seul envoi.
        { generalShares: 100, owner: owner('c', 'a@x.ci'), ownerProfiles: [profile('c', owner('c', 'a@x.ci'), 100)] },
        // Sans profil : repli sur le propriétaire saisi sur le lot.
        { generalShares: 100, owner: owner('d', 'd@x.ci'), ownerProfiles: [] }
      ]
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockSendEmail.mockResolvedValue(undefined);
  });

  it('convoque tous les co-indivisaires, pas les lots à 0 tantième, sans doublon d e-mail', async () => {
    mockPrisma.generalMeeting.findUnique.mockResolvedValue(meeting());
    const result = await notifyMeetingConvocation('m1');
    const recipients = mockSendEmail.mock.calls.map(call => (call[0] as any).to).sort();
    expect(recipients).toEqual(['a@x.ci', 'b@x.ci', 'd@x.ci']);
    expect(result).toMatchObject({ owners: 3, emailSent: 3 });
  });

  it('le renvoi ne relance que les destinataires en échec ou jamais servis', async () => {
    mockPrisma.generalMeeting.findUnique.mockResolvedValue(meeting());
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { payload: { contactId: 'a', status: 'SENT' } },
      { payload: { contactId: 'b', status: 'FAILED' } }
      // d : jamais servi
    ]);
    const result = await notifyMeetingConvocation('m1');
    expect(mockSendEmail.mock.calls.map(call => (call[0] as any).to).sort()).toEqual(['b@x.ci', 'd@x.ci']);
    expect(result).toMatchObject({ owners: 2, alreadyServed: 1, emailSent: 2 });
    // Le dernier résultat de chaque destinataire est journalisé pour le renvoi suivant.
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it('l option all renvoie à tous', async () => {
    mockPrisma.generalMeeting.findUnique.mockResolvedValue(meeting());
    mockPrisma.auditLog.findMany.mockResolvedValue([{ payload: { contactId: 'a', status: 'SENT' } }]);
    await notifyMeetingConvocation('m1', { all: true });
    expect(mockSendEmail).toHaveBeenCalledTimes(3);
  });
});
