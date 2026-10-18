/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Emargement par le gestionnaire : mandataire d'une procuration appliquee par
 * lot, et lot emarge ABSENT non votable en ligne.
 */
const mockTx: any = {
  syndicateLot: { findMany: jest.fn() },
  gMAttendance: { upsert: jest.fn(async () => ({})) }
};
const mockPrisma: any = { $transaction: jest.fn(async (cb: any) => cb(mockTx)) };
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/lib/syndics/meeting-visio', () => ({ notifyVisioRefresh: jest.fn() }));
jest.mock('../../src/lib/syndics/meeting-results', () => ({
  lockMeetingTx: jest.fn(async () => undefined),
  recomputeMeetingResultsTx: jest.fn(async () => undefined)
}));
const mockAssertBelongs = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../src/utils/tenant-ownership', () => ({
  assertBelongsToTenant: (...args: unknown[]) => mockAssertBelongs(...args)
}));

let mockCtx: any;
jest.mock('../../src/lib/syndics/meeting-live-context', () => ({
  ...jest.requireActual('../../src/lib/syndics/meeting-live-context'),
  loadMeetingBase: jest.fn(async () => mockCtx.meeting),
  loadLiveContext: jest.fn(async () => mockCtx),
  loadContactNames: jest.fn(async () => new Map())
}));

import { proxyHolderForLot, setLotAttendances } from '../../src/lib/syndics/meeting-live';
import { assertLotsNotAbsent, votableLotsFor } from '../../src/lib/syndics/meeting-live-context';

function makeCtx(over: Record<string, unknown> = {}) {
  const lots = [
    { id: 'L1', lotNumber: '1', generalShares: 100, voters: [{ contactId: 'awa' }] },
    { id: 'L2', lotNumber: '2', generalShares: 200, voters: [{ contactId: 'bakary' }] },
    { id: 'L3', lotNumber: '3', generalShares: 0, voters: [{ contactId: 'zero' }] }
  ];
  return {
    meeting: {
      id: 'm1',
      type: 'ORDINARY',
      status: 'IN_PROGRESS',
      scheduledAt: new Date('2026-10-10T09:00:00Z'),
      startTime: null,
      endTime: null,
      location: null,
      videoConferenceUrl: null,
      syndicateId: 's1',
      syndicate: { id: 's1', name: 'Residence', tenantId: 't1' }
    },
    lots,
    majorityLots: lots.map(l => ({ id: l.id, generalShares: l.generalShares })),
    resolutions: [],
    attendances: [],
    participants: [],
    proxies: [{ grantorContactId: 'awa', representativeContactId: 'eric' }],
    ...over
  };
}

describe('setLotAttendances - procuration appliquee par lot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCtx = makeCtx();
    mockTx.syndicateLot.findMany.mockImplementation(async ({ where }: any) =>
      where.id.in.map((id: string) => ({ id }))
    );
  });

  const created = (lotId: string) =>
    mockTx.gMAttendance.upsert.mock.calls
      .map((call: any[]) => call[0])
      .find((arg: any) => arg.where.meetingId_lotId.lotId === lotId)?.create;

  it('REPRESENTED sans mandataire : prend celui de la procuration du lot, null sans procuration', async () => {
    await setLotAttendances('t1', 's1', 'm1', 'u1', { lotIds: ['L1', 'L2'], status: 'REPRESENTED' });
    expect(created('L1')).toMatchObject({ representedByContactId: 'eric', attendeeContactId: 'eric' });
    expect(created('L2')).toMatchObject({ representedByContactId: null, attendeeContactId: null });
    expect(mockAssertBelongs).not.toHaveBeenCalled();
  });

  it('un mandataire explicite l emporte et est verifie dans l agence', async () => {
    await setLotAttendances('t1', 's1', 'm1', 'u1', {
      lotIds: ['L1', 'L2'],
      status: 'REPRESENTED',
      representedByContactId: 'paul'
    });
    expect(created('L1')).toMatchObject({ representedByContactId: 'paul', attendeeContactId: 'paul' });
    expect(created('L2')).toMatchObject({ representedByContactId: 'paul' });
    expect(mockAssertBelongs).toHaveBeenCalledTimes(1);
  });

  it('PRESENT n applique aucune procuration', async () => {
    await setLotAttendances('t1', 's1', 'm1', 'u1', { lotIds: ['L1'], status: 'PRESENT' });
    expect(created('L1')).toMatchObject({ representedByContactId: null, attendeeContactId: 'awa' });
  });

  it('proxyHolderForLot est deterministe : premier votant ayant une procuration, puis la premiere', () => {
    const proxies = [
      { grantorContactId: 'b', representativeContactId: 'rep-b' },
      { grantorContactId: 'a', representativeContactId: 'rep-a1' },
      { grantorContactId: 'a', representativeContactId: 'rep-a2' }
    ];
    expect(proxyHolderForLot(proxies, [{ contactId: 'a' }, { contactId: 'b' }])).toBe('rep-a1');
    expect(proxyHolderForLot(proxies, [{ contactId: 'x' }])).toBeNull();
  });
});

describe('lot emarge ABSENT : non votable en ligne', () => {
  it('votableLotsFor exclut un lot ABSENT, garde un lot sans emargement et un lot present', () => {
    const ctx = makeCtx({
      attendances: [
        { lotId: 'L1', status: 'ABSENT' },
        { lotId: 'L2', status: 'PRESENT' }
      ]
    }) as any;
    expect(votableLotsFor(ctx, 'awa')).toEqual([]);
    expect(votableLotsFor(ctx, 'bakary').map(l => l.lotId)).toEqual(['L2']);
    expect(votableLotsFor(makeCtx() as any, 'awa').map(l => l.lotId)).toEqual(['L1']);
  });

  it('un mandataire ne peut pas non plus voter le lot ABSENT de son mandant', () => {
    const ctx = makeCtx({ attendances: [{ lotId: 'L1', status: 'ABSENT' }] }) as any;
    expect(votableLotsFor(ctx, 'eric')).toEqual([]);
  });

  it('assertLotsNotAbsent leve un 409 pour un lot ABSENT', () => {
    const ctx = makeCtx({ attendances: [{ lotId: 'L1', status: 'ABSENT' }] }) as any;
    expect(() => assertLotsNotAbsent(ctx, ['L1'])).toThrow('Ce lot est émargé absent');
    expect(() => assertLotsNotAbsent(ctx, ['L2'])).not.toThrow();
  });
});
