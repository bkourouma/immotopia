/**
 * Un lot emarge ABSENT ne compte jamais comme votant : ses bulletins en base
 * sont ignores par getMeetingByTenant, le portail copropriétaire et la vue
 * gestionnaire de l'AG en direct (ballotCount). Le PV ne répète pas le
 * representant dans la colonne « personne ».
 */
const mockPrisma: Record<string, any> = {
  generalMeeting: { findFirst: jest.fn(), findMany: jest.fn() },
  crmContact: { findMany: jest.fn(async () => []) },
  syndicate: { findMany: jest.fn(async () => [{ id: 's1', name: 'Residence', address: 'Abidjan' }]) },
  gMAgendaItem: { findMany: jest.fn(async () => []) },
  gMResolution: { findMany: jest.fn() },
  gMVote: { findMany: jest.fn() },
  gMAttendance: { findMany: jest.fn() },
  syndicateLot: { findMany: jest.fn() }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));

import { getMeetingByTenant } from '../../src/lib/syndics/queries';
import { listCoOwnerMeetings } from '../../src/lib/syndics/coowner-portal';
import { buildAdminView } from '../../src/lib/syndics/meeting-live';
import { buildAttendanceSheet } from '../../src/lib/syndics/minutes-generator';

const SCHEDULED = new Date('2026-10-17T09:00:00Z');
const lotRows = [
  { id: 'l1', lotNumber: '001', generalShares: 100, coownerId: 'c1', ownerContactId: 'c1' },
  { id: 'l2', lotNumber: '002', generalShares: 100, coownerId: 'c2', ownerContactId: 'c2' }
];
const votes = [
  { lotId: 'l1', vote: 'FOR' },
  { lotId: 'l2', vote: 'AGAINST' }
];

beforeEach(() => jest.clearAllMocks());

describe('getMeetingByTenant', () => {
  it('ignore le bulletin d un lot emarge absent dans le decompte', async () => {
    mockPrisma.generalMeeting.findFirst.mockResolvedValue({
      id: 'm1',
      scheduledAt: SCHEDULED,
      syndicate: { id: 's1', lots: lotRows.map(lot => ({ ...lot, ownerProfiles: [], owner: null })) },
      agendaItems: [],
      proxies: [],
      attendances: [
        { lotId: 'l1', status: 'PRESENT', mode: 'IN_PERSON', attendeeContactId: null, representedByContactId: null },
        { lotId: 'l2', status: 'ABSENT', mode: 'IN_PERSON', attendeeContactId: null, representedByContactId: null }
      ],
      resolutions: [{ id: 'r1', majorityRule: 'ARTICLE_24', votes }]
    });
    const meeting: any = await getMeetingByTenant('t1', 's1', 'm1');
    expect(meeting.resolutions[0].tally.votesFor).toBe(1);
    expect(meeting.resolutions[0].tally.votesAgainst).toBe(0);
    expect(meeting.resolutions[0].tally.sharesAgainst).toBe(0);
  });
});

describe('portail copropriétaire', () => {
  it('ignore le bulletin d un lot emarge absent dans les resultats', async () => {
    mockPrisma.generalMeeting.findMany.mockResolvedValue([
      { id: 'm1', syndicateId: 's1', type: 'ORDINARY', scheduledAt: SCHEDULED, location: null, status: 'COMPLETED' }
    ]);
    mockPrisma.gMResolution.findMany.mockResolvedValue([
      { id: 'r1', meetingId: 'm1', title: 'Comptes', description: null, majorityRule: 'ARTICLE_24', result: 'APPROVED' }
    ]);
    mockPrisma.gMVote.findMany.mockResolvedValue(votes.map(vote => ({ ...vote, resolutionId: 'r1' })));
    mockPrisma.syndicateLot.findMany.mockResolvedValue(lotRows.map(lot => ({ ...lot, syndicateId: 's1' })));
    mockPrisma.gMAttendance.findMany.mockResolvedValue([
      { meetingId: 'm1', lotId: 'l1', status: 'PRESENT' },
      { meetingId: 'm1', lotId: 'l2', status: 'ABSENT' }
    ]);
    const scope: any = { tenantId: 't1', contactIds: ['c1'], lots: [], lotIds: ['l1'], syndicateIds: ['s1'] };
    const meetings: any[] = await listCoOwnerMeetings(scope);
    const tally = meetings[0].resolutions[0];
    expect(mockPrisma.gMAttendance.findMany.mock.calls[0][0].where.tenantId).toBe('t1');
    expect(tally.sharesFor).toBe(100);
    expect(tally.sharesAgainst).toBe(0);
  });
});

describe('vue gestionnaire de l AG en direct', () => {
  it('ballotCount ne compte pas les bulletins des lots absents', async () => {
    const ctx: any = {
      meeting: { id: 'm1', status: 'IN_PROGRESS', scheduledAt: SCHEDULED, syndicate: { name: 'R' } },
      lots: lotRows.map(lot => ({
        id: lot.id,
        lotNumber: lot.lotNumber,
        generalShares: lot.generalShares,
        voters: []
      })),
      majorityLots: lotRows,
      proxies: [],
      participants: [],
      attendances: [
        {
          lotId: 'l1',
          status: 'PRESENT',
          mode: 'IN_PERSON',
          recordedBy: 'MANAGER',
          attendeeContactId: null,
          representedByContactId: null,
          updatedAt: SCHEDULED
        },
        {
          lotId: 'l2',
          status: 'ABSENT',
          mode: 'IN_PERSON',
          recordedBy: 'MANAGER',
          attendeeContactId: null,
          representedByContactId: null,
          updatedAt: SCHEDULED
        }
      ],
      resolutions: [
        {
          id: 'r1',
          title: 'Comptes',
          description: null,
          majorityRule: 'ARTICLE_24',
          voteStatus: 'CLOSED',
          voteOpenedAt: null,
          voteClosedAt: null,
          votes: votes.map(vote => ({ ...vote, source: 'MANAGER', castByContactId: null, updatedAt: SCHEDULED }))
        }
      ]
    };
    const view: any = await buildAdminView(mockPrisma as any, 't1', ctx);
    expect(view.resolutions[0].ballotCount).toBe(1);
    expect(view.resolutions[0].tally.votesAgainst).toBe(0);
  });
});

describe('procès-verbal : colonne personne', () => {
  it('un lot représenté n y répète pas le représentant (déjà dans la colonne mode)', () => {
    const sheet = buildAttendanceSheet({
      syndicate: {
        lots: [{ id: 'l1', lotNumber: '001', generalShares: 100, voters: [{ firstName: 'Awa', lastName: 'Kone' }] }]
      },
      attendances: [{ lotId: 'l1', status: 'REPRESENTED', mode: 'IN_PERSON', representedByName: 'Jean Kouadio' }],
      resolutions: []
    } as any);
    const lot = sheet.rows[0];
    expect(lot.person).toBe('Awa Kone');
    expect(lot.mode).toContain('Jean Kouadio');
  });
});
