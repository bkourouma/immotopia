/**
 * Un lot emarge ABSENT ne compte jamais comme present ni votant : ses bulletins
 * en base sont ignores dans la vue publique (decompte et ballotCount), et un
 * vote public sur ce lot est refuse par un 409 explicite (404 hors perimetre).
 */
const mockTx: Record<string, any> = {
  gMParticipant: { findFirst: jest.fn() },
  gMResolution: { findFirst: jest.fn() },
  gMVote: { findMany: jest.fn(async () => []), upsert: jest.fn() },
  gMAttendance: { upsert: jest.fn() }
};
const mockPrisma: Record<string, any> = {
  gMParticipant: { findFirst: jest.fn(), updateMany: jest.fn() },
  gMAgendaItem: { findMany: jest.fn(async () => []) },
  crmContact: { findFirst: jest.fn(async () => ({ id: 'c1', firstName: 'Awa', lastName: 'Kone' })) },
  $transaction: jest.fn(async (fn: any) => fn(mockTx))
};
const mockCtx: { value: any } = { value: null };

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/livekit-service', () => ({ isVisioEnabled: () => false }));
jest.mock('../../src/lib/syndics/meeting-recording', () => ({ hasActiveRecording: jest.fn(async () => false) }));
jest.mock('../../src/lib/syndics/meeting-results', () => ({
  lockMeetingTx: jest.fn(async () => undefined),
  recomputeMeetingResultsTx: jest.fn(async () => undefined)
}));
jest.mock('../../src/lib/secure-links', () => ({
  invalidSecureLinkError: () => new Error('lien invalide'),
  verifySecureLink: jest.fn(async () => ({ tenantId: 't1', objectType: 'GENERAL_MEETING_PARTICIPANT', objectId: 'p1' }))
}));
jest.mock('../../src/lib/syndics/meeting-live-context', () => ({
  ...jest.requireActual('../../src/lib/syndics/meeting-live-context'),
  loadMeetingBaseById: jest.fn(async () => mockCtx.value.meeting),
  loadLiveContext: jest.fn(async () => mockCtx.value)
}));

import { MEETING_LINK_OBJECT_TYPE } from '../../src/lib/syndics/meeting-participants';
import { verifySecureLink } from '../../src/lib/secure-links';
import { castPublicVotes, getPublicLiveState } from '../../src/lib/syndics/meeting-live-public';

const voter = (contactId: string) => ({ contactId, firstName: 'X', lastName: contactId });
const row = (lotId: string, status: 'PRESENT' | 'ABSENT') => ({
  lotId,
  status,
  mode: 'ONLINE',
  recordedBy: 'SELF',
  attendeeContactId: null,
  representedByContactId: null,
  updatedAt: new Date()
});

function buildCtx(resolutionOverrides: Record<string, unknown> = {}) {
  const lots = [
    { id: 'l1', lotNumber: '001', generalShares: 100, voters: [voter('c1')] },
    { id: 'l2', lotNumber: '002', generalShares: 100, voters: [voter('c1')] },
    { id: 'l3', lotNumber: '003', generalShares: 100, voters: [voter('c9')] }
  ];
  return {
    meeting: {
      id: 'm1',
      type: 'ORDINARY',
      status: 'IN_PROGRESS',
      scheduledAt: new Date('2026-10-17T09:00:00Z'),
      startTime: null,
      endTime: null,
      location: null,
      videoConferenceUrl: null,
      syndicateId: 's1',
      syndicate: { id: 's1', name: 'Residence', tenantId: 't1' },
      mediaLockedAt: null
    },
    lots,
    majorityLots: lots.map(lot => ({
      id: lot.id,
      generalShares: lot.generalShares,
      coownerId: lot.voters[0].contactId
    })),
    attendances: [row('l1', 'PRESENT'), row('l2', 'ABSENT')],
    participants: [],
    proxies: [],
    resolutions: [
      {
        id: 'r1',
        title: 'Comptes',
        description: null,
        majorityRule: 'ARTICLE_24',
        voteStatus: 'CLOSED',
        voteOpenedAt: null,
        voteClosedAt: null,
        votes: [
          { lotId: 'l1', vote: 'FOR', source: 'CO_OWNER', castByContactId: 'c1', updatedAt: new Date() },
          { lotId: 'l2', vote: 'AGAINST', source: 'CO_OWNER', castByContactId: 'c1', updatedAt: new Date() }
        ],
        ...resolutionOverrides
      }
    ]
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCtx.value = buildCtx();
  (verifySecureLink as jest.Mock).mockResolvedValue({
    tenantId: 't1',
    objectType: MEETING_LINK_OBJECT_TYPE,
    objectId: 'p1'
  });
  const participant = {
    id: 'p1',
    contactId: 'c1',
    meetingId: 'm1',
    joinedAt: new Date(),
    lastSeenAt: new Date(),
    mediaPolicy: null
  };
  mockPrisma.gMParticipant.findFirst.mockResolvedValue(participant);
  mockTx.gMParticipant.findFirst.mockResolvedValue({ joinedAt: new Date() });
  mockTx.gMResolution.findFirst.mockResolvedValue({ id: 'r1', voteStatus: 'OPEN' });
});

describe('lot emarge absent : vue publique', () => {
  it('ignore le bulletin du lot absent dans le decompte et dans ballotCount', async () => {
    const view = await getPublicLiveState('tok');
    const resolution = view.resolutions[0];
    expect(resolution.ballotCount).toBe(1);
    expect(resolution.result?.votesFor).toBe(1);
    expect(resolution.result?.votesAgainst).toBe(0);
    expect(resolution.result?.sharesAgainst).toBe(0);
  });
});

describe('lot emarge absent : vote public', () => {
  it('refuse le vote d un lot absent par un 409 explicite', async () => {
    await expect(
      castPublicVotes('tok', { resolutionId: 'r1', votes: [{ lotId: 'l2', vote: 'FOR' }] } as any)
    ).rejects.toMatchObject({ statusCode: 409, message: 'Ce lot est émargé absent : il ne peut pas voter' });
    expect(mockTx.gMVote.upsert).not.toHaveBeenCalled();
  });

  it('un lot hors perimetre reste une 404', async () => {
    await expect(
      castPublicVotes('tok', { resolutionId: 'r1', votes: [{ lotId: 'l3', vote: 'FOR' }] } as any)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
