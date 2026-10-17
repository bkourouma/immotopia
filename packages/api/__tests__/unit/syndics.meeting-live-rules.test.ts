/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AG en direct (spec 043) : regles pures, gabarits de convocation, feuille de
 * presence et acces portail.
 */
const mockPrisma: any = {
  generalMeeting: { findUnique: jest.fn(), findFirst: jest.fn() },
  notificationMarker: { findMany: jest.fn(async () => [] as any[]), create: jest.fn(async () => ({})) },
  gMParticipant: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn(async () => []) },
  gMAttendance: { findMany: jest.fn(async () => []) },
  gMResolution: { findMany: jest.fn(async () => []) },
  gMProxy: { findMany: jest.fn(async () => []) },
  syndicateLot: { findMany: jest.fn(async () => []) },
  secureLink: { create: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

const mockSendEmail = jest.fn();
jest.mock('../../src/services/email-service', () => ({ emailService: { sendEmail: mockSendEmail } }));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: jest
    .fn()
    .mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null })
}));
let mockRecordingEnabled = false;
jest.mock('../../src/services/livekit-service', () => ({
  ...jest.requireActual('../../src/services/livekit-service'),
  isRecordingEnabled: () => mockRecordingEnabled
}));
const mockWhatsapp = jest.fn().mockResolvedValue(true);
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  ...jest.requireActual('../../src/services/whatsapp-notification-send-service'),
  sendWhatsappNotification: (...args: unknown[]) => mockWhatsapp(...args)
}));

import {
  canCloseVote,
  canOpenVote,
  isOnline,
  isResultVisible,
  meetingLinkTtlDays,
  planAttendanceForContact,
  resolveVotableLots,
  shouldTouchLastSeen
} from '../../src/lib/syndics/meeting-live-rules';
import { computeMeetingAttendance } from '../../src/lib/syndics/meeting-majority';
import { updateMeetingSchema } from '../../src/lib/syndics/schemas';
import {
  dropEmptyVariableParagraphs,
  dropMeetingLinkParagraph,
  notifyMeetingConvocation
} from '../../src/lib/syndics/notifications';
import { omitSentencesWithEmptyVariables } from '../../src/services/whatsapp-notification-send-service';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../src/constants/email-notification-default-templates';
import { WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES } from '../../src/constants/whatsapp-notification-default-templates';
import { buildAttendanceSheet } from '../../src/lib/syndics/minutes-generator';
import { isLiveAvailable } from '../../src/lib/syndics/coowner-portal';
import { issueCoOwnerPortalMeetingLink } from '../../src/lib/syndics/meeting-participants';

const lots = [
  { id: 'a', generalShares: 100 },
  { id: 'b', generalShares: 200 },
  { id: 'c', generalShares: 300 },
  { id: 'd', generalShares: 400 }
];

describe('computeMeetingAttendance (D3)', () => {
  it('sans emargement : un lot qui a vote compte (AG deja tenues, meme quorum)', () => {
    const result = computeMeetingAttendance(lots, [{ lotId: 'a' }, { lotId: 'a' }, { lotId: 'd' }]);
    expect(result).toMatchObject({
      representedLots: 2,
      representedShares: 500,
      quorumPercent: 50,
      presentLots: 2,
      representedOnlyLots: 0,
      onlineLots: 0,
      totalLots: 4,
      totalShares: 1000
    });
  });

  it('PRESENT et REPRESENTED comptent, ABSENT non ; ABSENT qui a vote compte comme present', () => {
    const result = computeMeetingAttendance(
      lots,
      [{ lotId: 'd' }],
      [
        { lotId: 'a', status: 'PRESENT', mode: 'ONLINE' },
        { lotId: 'b', status: 'REPRESENTED', mode: 'IN_PERSON' },
        { lotId: 'c', status: 'ABSENT', mode: 'IN_PERSON' },
        { lotId: 'd', status: 'ABSENT', mode: 'IN_PERSON' }
      ]
    );
    expect(result).toMatchObject({
      presentLots: 2,
      presentShares: 500,
      representedOnlyLots: 1,
      representedOnlyShares: 200,
      representedLots: 3,
      representedShares: 700,
      quorumPercent: 70,
      onlineLots: 1
    });
  });

  it('ignore les lots etrangers a la copropriete et un total nul', () => {
    expect(
      computeMeetingAttendance(lots, [{ lotId: 'zzz' }], [{ lotId: 'zzz', status: 'PRESENT' }]).quorumPercent
    ).toBe(0);
    expect(computeMeetingAttendance([], [], []).quorumPercent).toBe(0);
  });
});

describe('resolveVotableLots (D6)', () => {
  const votable = [
    { lotId: 'a', voterContactIds: ['awa'] },
    { lotId: 'b', voterContactIds: ['bakary'] },
    { lotId: 'c', voterContactIds: ['awa', 'cheick'] },
    { lotId: 'd', voterContactIds: ['dieu'] }
  ];

  it('lots dont le contact est votant, indivision comprise', () => {
    expect(resolveVotableLots('awa', votable, [])).toEqual([
      { lotId: 'a', role: 'OWNER', grantorContactId: null },
      { lotId: 'c', role: 'OWNER', grantorContactId: null }
    ]);
    expect(resolveVotableLots('cheick', votable, []).map(lot => lot.lotId)).toEqual(['c']);
  });

  it('ajoute les lots des mandants ; un lot en propre reste OWNER', () => {
    expect(resolveVotableLots('eric', votable, ['bakary', 'awa'])).toEqual([
      { lotId: 'a', role: 'PROXY', grantorContactId: 'awa' },
      { lotId: 'b', role: 'PROXY', grantorContactId: 'bakary' },
      { lotId: 'c', role: 'PROXY', grantorContactId: 'awa' }
    ]);
    expect(resolveVotableLots('awa', votable, ['cheick']).find(lot => lot.lotId === 'c')?.role).toBe('OWNER');
  });

  it('un contact sans lot ni pouvoir ne vote rien ; pas de pouvoir sur soi-meme', () => {
    expect(resolveVotableLots('inconnu', votable, [])).toEqual([]);
    expect(resolveVotableLots('awa', votable, ['awa']).every(lot => lot.role === 'OWNER')).toBe(true);
  });
});

describe('planAttendanceForContact', () => {
  const votable = [
    { lotId: 'a', role: 'OWNER' as const, grantorContactId: null },
    { lotId: 'b', role: 'PROXY' as const, grantorContactId: 'bakary' },
    { lotId: 'c', role: 'OWNER' as const, grantorContactId: null }
  ];
  it('PRESENT pour ses lots, REPRESENTED pour ceux d un mandant, sans retrograder', () => {
    const plans = planAttendanceForContact('eric', votable, [
      { lotId: 'a', status: 'REPRESENTED' },
      { lotId: 'c', status: 'ABSENT' }
    ]);
    expect(plans).toEqual([
      { lotId: 'b', status: 'REPRESENTED', attendeeContactId: 'eric', representedByContactId: 'eric' },
      { lotId: 'c', status: 'PRESENT', attendeeContactId: 'eric', representedByContactId: null }
    ]);
  });
});

describe('petites regles', () => {
  const now = new Date('2026-10-15T10:00:00Z');
  it('en ligne sous 30 s, ecriture de lastSeenAt toutes les 10 s', () => {
    expect(isOnline(new Date(now.getTime() - 29_000), now)).toBe(true);
    expect(isOnline(new Date(now.getTime() - 30_000), now)).toBe(false);
    expect(isOnline(null, now)).toBe(false);
    expect(shouldTouchLastSeen(null, now)).toBe(true);
    expect(shouldTouchLastSeen(new Date(now.getTime() - 9_000), now)).toBe(false);
    expect(shouldTouchLastSeen(new Date(now.getTime() - 10_000), now)).toBe(true);
  });

  it('duree du lien : 7 jours apres l AG, au moins 1 jour, plafonnee', () => {
    expect(meetingLinkTtlDays(new Date('2026-10-18T10:00:00Z'), 30, now)).toBe(10);
    expect(meetingLinkTtlDays(new Date('2026-09-01T10:00:00Z'), 30, now)).toBe(1);
    expect(meetingLinkTtlDays(new Date('2027-03-01T10:00:00Z'), 30, now)).toBe(30);
  });

  it('transitions de vote et visibilite des resultats', () => {
    expect(canOpenVote('PENDING')).toBe(true);
    expect(canOpenVote('CLOSED')).toBe(true);
    expect(canOpenVote('OPEN')).toBe(false);
    expect(canCloseVote('OPEN')).toBe(true);
    expect(canCloseVote('PENDING')).toBe(false);
    expect(isResultVisible('OPEN', 'IN_PROGRESS')).toBe(false);
    expect(isResultVisible('CLOSED', 'IN_PROGRESS')).toBe(true);
    expect(isResultVisible('PENDING', 'COMPLETED')).toBe(true);
  });

  it('liveAvailable : AG planifiee ou en cours a J-1', () => {
    const at = (d: string) => new Date(d).getTime();
    expect(isLiveAvailable('PLANNED', '2026-10-16T09:00:00Z', at('2026-10-15T10:00:00Z'))).toBe(true);
    expect(isLiveAvailable('PLANNED', '2026-10-17T09:00:00Z', at('2026-10-15T10:00:00Z'))).toBe(false);
    expect(isLiveAvailable('IN_PROGRESS', '2026-10-10T09:00:00Z', at('2026-10-15T10:00:00Z'))).toBe(true);
    expect(isLiveAvailable('COMPLETED', '2026-10-10T09:00:00Z', at('2026-10-15T10:00:00Z'))).toBe(false);
    expect(isLiveAvailable('CANCELLED', '2026-10-16T09:00:00Z', at('2026-10-15T10:00:00Z'))).toBe(false);
  });
});

describe('PATCH /:meetingId : videoConferenceUrl', () => {
  it('https seulement, 2 000 caracteres au plus, null ou vide efface', () => {
    expect(updateMeetingSchema.parse({ videoConferenceUrl: 'https://meet.example.test/x' }).videoConferenceUrl).toBe(
      'https://meet.example.test/x'
    );
    expect(updateMeetingSchema.parse({ videoConferenceUrl: null }).videoConferenceUrl).toBeNull();
    expect(updateMeetingSchema.parse({ videoConferenceUrl: '' }).videoConferenceUrl).toBeNull();
    for (const bad of [
      'http://meet.example.test',
      'javascript:alert(1)',
      'meet.example.test',
      `https://a.test/${'x'.repeat(2000)}`
    ]) {
      expect(updateMeetingSchema.safeParse({ videoConferenceUrl: bad }).success).toBe(false);
    }
  });
});

describe('gabarits de convocation', () => {
  it('les gabarits par defaut portent la phrase du lien', () => {
    expect(EMAIL_NOTIFICATION_DEFAULT_TEMPLATES.GENERAL_MEETING_CONVOCATION.bodyHtml).toContain(
      'Suivez l’assemblée et votez en ligne : {{meetingLink}}'
    );
    expect(WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES.GENERAL_MEETING_CONVOCATION).toContain(
      'Suivez l’assemblée et votez en ligne : {{meetingLink}}'
    );
  });

  it('lien vide : la phrase est omise (e-mail et WhatsApp), jamais un deux-points orphelin', () => {
    const html = dropMeetingLinkParagraph(
      EMAIL_NOTIFICATION_DEFAULT_TEMPLATES.GENERAL_MEETING_CONVOCATION.bodyHtml,
      ''
    );
    expect(html).not.toContain('meetingLink');
    expect(html).not.toContain('Suivez');
    expect(html).toContain('{{meetingLocation}}');
    expect(dropMeetingLinkParagraph('<p>x {{meetingLink}}</p>', 'https://x.test')).toContain('{{meetingLink}}');

    const text = omitSentencesWithEmptyVariables(
      WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES.GENERAL_MEETING_CONVOCATION,
      { meetingLink: '', recordingNotice: '' },
      ['meetingLink', 'recordingNotice']
    );
    expect(text).not.toContain('Suivez');
    expect(text.endsWith('lieu : {{meetingLocation}}.')).toBe(true);
    const kept = omitSentencesWithEmptyVariables('A. Lien : {{meetingLink}}', { meetingLink: 'https://x.test' }, [
      'meetingLink'
    ]);
    expect(kept).toContain('{{meetingLink}}');
  });
});

describe('notifyMeetingConvocation avec lien personnel', () => {
  const owner = (contactId: string) => ({
    id: contactId,
    firstName: contactId,
    lastName: 'X',
    legalName: null,
    email: `${contactId}@x.ci`,
    whatsappNumber: null,
    phonePrimary: null
  });
  const meeting = () => ({
    id: 'm1',
    scheduledAt: new Date(Date.now() + 5 * 86_400_000),
    location: 'Salle',
    syndicate: {
      tenantId: 't1',
      name: 'Residence',
      lots: [
        { generalShares: 100, owner: owner('a'), ownerProfiles: [] },
        { generalShares: 100, owner: owner('b'), ownerProfiles: [] }
      ]
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.notificationMarker.findMany.mockResolvedValue([]);
    mockPrisma.generalMeeting.findUnique.mockResolvedValue(meeting());
    mockPrisma.gMParticipant.findFirst.mockResolvedValue(null);
    let n = 0;
    mockPrisma.gMParticipant.create.mockImplementation(async () => ({ id: `p${++n}` }));
    mockPrisma.secureLink.create.mockResolvedValue({ id: 'link-1' });
    mockSendEmail.mockResolvedValue(undefined);
    mockRecordingEnabled = false;
  });

  it('un participant et un lien personnel par destinataire, passes aux gabarits e-mail et WhatsApp', async () => {
    const result = await notifyMeetingConvocation('m1');
    expect(result).toMatchObject({ owners: 2, emailSent: 2 });
    expect(mockPrisma.gMParticipant.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.secureLink.create).toHaveBeenCalledTimes(2);
    const created = mockPrisma.secureLink.create.mock.calls.map((call: any) => call[0].data);
    expect(created[0]).toMatchObject({
      scope: 'GENERAL_MEETING_ACCESS',
      objectType: 'GM_PARTICIPANT',
      objectId: 'p1',
      tenantId: 't1'
    });
    expect(created[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);

    const mails = mockSendEmail.mock.calls.map(call => (call[0] as any).html as string);
    const links = mails.map(html => /\/ag-direct#([A-Za-z0-9_-]+)/.exec(html)?.[1]);
    expect(links[0]).toBeTruthy();
    expect(links[1]).toBeTruthy();
    expect(links[0]).not.toBe(links[1]);
    expect(mails[0]).toContain('Suivez l’assemblée et votez en ligne');
    expect(mockWhatsapp.mock.calls[0][0].variables.meetingLink).toMatch(/\/ag-direct#/);
    expect(mockWhatsapp.mock.calls[0][0].optionalVariables).toEqual(['meetingLink', 'recordingNotice']);
  });

  it('un echec de creation du lien ne fait pas echouer la convocation : e-mail sans la phrase du lien', async () => {
    mockPrisma.secureLink.create.mockRejectedValue(new Error('base indisponible'));
    const result = await notifyMeetingConvocation('m1');
    expect(result).toMatchObject({ owners: 2, emailSent: 2, emailFailed: 0 });
    for (const call of mockSendEmail.mock.calls) {
      const html = (call[0] as any).html as string;
      expect(html).not.toContain('Suivez');
      expect(html).not.toContain('{{');
      expect(html).toContain('Convocation');
    }
    expect(mockWhatsapp.mock.calls[0][0].variables.meetingLink).toBe('');
  });
});

const NOTICE =
  "La séance pourra être enregistrée (image et son) ; un avis s'affichera à l'écran pendant l'enregistrement.";

describe('avis d enregistrement dans la convocation (spec 045)', () => {
  const owner = (id: string) => ({
    id,
    firstName: id,
    lastName: 'X',
    legalName: null,
    email: `${id}@x.ci`,
    whatsappNumber: null,
    phonePrimary: null
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.notificationMarker.findMany.mockResolvedValue([]);
    mockPrisma.generalMeeting.findUnique.mockResolvedValue({
      id: 'm1',
      scheduledAt: new Date(Date.now() + 5 * 86_400_000),
      location: 'Salle',
      syndicate: {
        tenantId: 't1',
        name: 'Residence',
        lots: [{ generalShares: 100, owner: owner('a'), ownerProfiles: [] }]
      }
    });
    mockPrisma.gMParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.gMParticipant.create.mockResolvedValue({ id: 'p1' });
    mockPrisma.secureLink.create.mockResolvedValue({ id: 'link-1' });
    mockSendEmail.mockResolvedValue(undefined);
    mockWhatsapp.mockResolvedValue(true);
    mockRecordingEnabled = false;
  });

  it('gabarits par défaut : paragraphe e-mail après celui du lien, phrase WhatsApp en fin de message', () => {
    const html = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES.GENERAL_MEETING_CONVOCATION.bodyHtml;
    expect(html).toContain('<p style="margin:0 0 12px 0; font-size:14px; color:#555;">{{recordingNotice}}</p>');
    expect(html.indexOf('{{recordingNotice}}')).toBeGreaterThan(html.indexOf('{{meetingLink}}'));
    expect(WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES.GENERAL_MEETING_CONVOCATION.endsWith('{{recordingNotice}}')).toBe(
      true
    );
  });

  it('enregistrement configuré : la phrase est dans l e-mail et fournie au WhatsApp', async () => {
    mockRecordingEnabled = true;
    await notifyMeetingConvocation('m1');
    const html = (mockSendEmail.mock.calls[0][0] as any).html as string;
    // L'e-mail est echappe en HTML : l'apostrophe devient une entite.
    expect(html).toContain(NOTICE.replace(/'/g, '&#39;'));
    expect(html).not.toContain('{{');
    expect(mockWhatsapp.mock.calls[0][0].variables.recordingNotice).toBe(NOTICE);
  });

  it('non configuré : ni phrase, ni paragraphe vide dans l e-mail', async () => {
    await notifyMeetingConvocation('m1');
    const html = (mockSendEmail.mock.calls[0][0] as any).html as string;
    expect(html).not.toContain('enregistrée');
    expect(html).not.toMatch(/<p[^>]*>\s*<\/p>/);
    expect(html).not.toContain('{{');
    expect(html).toContain('Suivez l’assemblée et votez en ligne');
    expect(mockWhatsapp.mock.calls[0][0].variables.recordingNotice).toBe('');
  });

  it('lien ET avis vides : aucun des deux paragraphes, aucun paragraphe vide', async () => {
    mockPrisma.secureLink.create.mockRejectedValue(new Error('base indisponible'));
    await notifyMeetingConvocation('m1');
    const html = (mockSendEmail.mock.calls[0][0] as any).html as string;
    expect(html).not.toContain('Suivez');
    expect(html).not.toMatch(/<p[^>]*>\s*<\/p>/);
    expect(html).not.toContain('{{');
  });

  it('dropEmptyVariableParagraphs : retire seulement le paragraphe de la variable vide', () => {
    const tpl = '<p>A</p><p style="x">Lien {{meetingLink}}</p><p style="y">{{recordingNotice}}</p>';
    expect(
      dropEmptyVariableParagraphs(tpl, { meetingLink: 'u', recordingNotice: '' }, ['meetingLink', 'recordingNotice'])
    ).toBe('<p>A</p><p style="x">Lien {{meetingLink}}</p>');
    expect(
      dropEmptyVariableParagraphs(tpl, { meetingLink: '', recordingNotice: 'n' }, ['meetingLink', 'recordingNotice'])
    ).toBe('<p>A</p><p style="y">{{recordingNotice}}</p>');
  });

  it('WhatsApp : avec avis, il termine le message ; sans avis, ni espace final ni phrase orpheline ; la phrase du lien reste', () => {
    const tpl = WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES.GENERAL_MEETING_CONVOCATION;
    const optional = ['meetingLink', 'recordingNotice'];
    const render = (vars: Record<string, string>) =>
      omitSentencesWithEmptyVariables(tpl, vars, optional).replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? '');
    const full = render({ meetingLink: 'https://x.test/ag-direct#t', recordingNotice: NOTICE, ownerName: 'A' });
    expect(full.endsWith(NOTICE)).toBe(true);
    expect(full).toContain('en ligne : https://x.test/ag-direct#t');
    const noNotice = render({ meetingLink: 'https://x.test/ag-direct#t', recordingNotice: '', ownerName: 'A' });
    expect(noNotice).toBe(noNotice.trimEnd());
    expect(noNotice.endsWith('https://x.test/ag-direct#t')).toBe(true);
    expect(noNotice).not.toContain('enregistrée');
    const neither = render({ meetingLink: '', recordingNotice: '', ownerName: 'A' });
    expect(neither).toBe(neither.trimEnd());
    expect(neither).not.toContain('Suivez');
    expect(neither.endsWith('lieu : {{meetingLocation}}.'.replace('{{meetingLocation}}', ''))).toBe(true);
  });
});

describe('feuille de presence du compte rendu', () => {
  const meeting = {
    id: 'm1',
    type: 'ORDINARY',
    scheduledAt: new Date('2026-10-10T09:00:00Z'),
    syndicate: {
      name: 'Residence',
      lots: [
        { id: 'l2', lotNumber: 'L2', generalShares: 200, voters: [{ firstName: 'Bakary', lastName: 'Diallo' }] },
        { id: 'l1', lotNumber: 'L1', generalShares: 100, voters: [{ firstName: 'Awa', lastName: 'Traore' }] },
        { id: 'l3', lotNumber: 'L3', generalShares: 300, voters: [{ firstName: 'Cheick', lastName: 'Kone' }] },
        { id: 'l4', lotNumber: 'L4', generalShares: 400, voters: [{ legalName: 'SCI Soleil' }] }
      ]
    },
    attendances: [
      { lotId: 'l1', status: 'PRESENT', mode: 'ONLINE' },
      { lotId: 'l2', status: 'REPRESENTED', mode: 'IN_PERSON', representedByName: 'Eric Mandataire' },
      { lotId: 'l3', status: 'ABSENT', mode: 'IN_PERSON' }
    ],
    resolutions: [{ title: 'R', votes: [{ lotId: 'l4' }] }]
  };

  it('une ligne par lot, statut et mode ; un lot qui a vote sans emargement est present', () => {
    const sheet = buildAttendanceSheet(meeting as any);
    expect(sheet.rows.map(row => row.lot)).toEqual(['L1', 'L2', 'L3', 'L4']);
    expect(sheet.rows[0]).toMatchObject({ person: 'Awa Traore', status: 'Présent(e)', mode: 'En ligne' });
    expect(sheet.rows[1]).toMatchObject({ status: 'Représenté(e)', mode: 'En salle' });
    expect(sheet.rows[1].person).toContain('Eric Mandataire');
    expect(sheet.rows[2]).toMatchObject({ status: 'Absent(e)', mode: '-' });
    expect(sheet.rows[3]).toMatchObject({ person: 'SCI Soleil', status: 'Présent(e)' });
    expect(sheet.summary).toContain('3 sur 4');
    expect(sheet.summary).toContain('700 tantièmes sur 1000');
  });
});

describe('acces portail a l AG en direct', () => {
  const scope = (over: Record<string, unknown> = {}) =>
    ({ tenantId: 't1', contactIds: ['awa'], lots: [], lotIds: [], syndicateIds: ['s1'], ...over }) as any;
  const base = (status = 'PLANNED', syndicateId = 's1') => ({
    id: 'm1',
    type: 'ORDINARY',
    status,
    scheduledAt: new Date(Date.now() + 86_400_000),
    startTime: null,
    endTime: null,
    location: null,
    videoConferenceUrl: null,
    syndicateId,
    syndicate: { id: syndicateId, name: 'R', tenantId: 't1' }
  });
  const profileOf = (contactId: string) => ({
    contactId,
    ownershipPercentage: 100,
    ownedSince: new Date('2020-01-01'),
    ownedUntil: null,
    contact: { id: contactId, firstName: 'A', lastName: 'B', legalName: null, email: null }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.gMAttendance.findMany.mockResolvedValue([]);
    mockPrisma.gMResolution.findMany.mockResolvedValue([]);
    mockPrisma.gMProxy.findMany.mockResolvedValue([]);
    mockPrisma.gMParticipant.findFirst.mockResolvedValue({ id: 'p1' });
    mockPrisma.secureLink.create.mockResolvedValue({ id: 'l1' });
    mockPrisma.syndicateLot.findMany.mockResolvedValue([
      {
        id: 'lot1',
        lotNumber: '1',
        generalShares: 100,
        coownerId: 'awa',
        ownerContactId: 'awa',
        owner: null,
        ownerProfiles: [profileOf('awa')]
      }
    ]);
  });

  it('delivre un lien au contact du portail qui vote un lot', async () => {
    mockPrisma.generalMeeting.findFirst.mockResolvedValue(base());
    const result = await issueCoOwnerPortalMeetingLink(scope(), 'm1', 'user-1');
    expect(result.url).toMatch(/\/ag-direct#[A-Za-z0-9_-]{20,}$/);
    expect(mockPrisma.secureLink.create.mock.calls[0][0].data).toMatchObject({
      createdByUserId: 'user-1',
      tenantId: 't1'
    });
  });

  it('404 hors du perimetre (autre copropriete, contact sans lot), 409 si cloturee', async () => {
    mockPrisma.generalMeeting.findFirst.mockResolvedValue(base('PLANNED', 's-autre'));
    await expect(issueCoOwnerPortalMeetingLink(scope(), 'm1', 'u')).rejects.toMatchObject({ statusCode: 404 });
    mockPrisma.generalMeeting.findFirst.mockResolvedValue(base());
    await expect(issueCoOwnerPortalMeetingLink(scope({ contactIds: ['inconnu'] }), 'm1', 'u')).rejects.toMatchObject({
      statusCode: 404
    });
    mockPrisma.generalMeeting.findFirst.mockResolvedValue(base('COMPLETED'));
    await expect(issueCoOwnerPortalMeetingLink(scope(), 'm1', 'u')).rejects.toMatchObject({ statusCode: 409 });
    mockPrisma.generalMeeting.findFirst.mockResolvedValue(null);
    await expect(issueCoOwnerPortalMeetingLink(scope(), 'm1', 'u')).rejects.toMatchObject({ statusCode: 404 });
  });
});
