/**
 * BUG-2026-09-30-090 (creation rend l'AG creee, relue apres validation) et
 * BUG-2026-09-30-082 (ordre du jour fige apres cloture, comme votes/pouvoirs).
 */
const mockPrisma = {
  syndicate: { findFirst: jest.fn() },
  generalMeeting: { findFirst: jest.fn(), create: jest.fn() },
  gMAgendaItem: { findFirst: jest.fn() },
  gMResolution: { createMany: jest.fn() },
  $transaction: jest.fn()
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const mockQueries = {
  addAgendaItemToMeeting: jest.fn(),
  updateAgendaItemByTenant: jest.fn(),
  deleteAgendaItemByTenant: jest.fn(),
  getMeetingByTenant: jest.fn()
};
jest.mock('../../src/lib/syndics/queries', () => mockQueries);

import {
  addAgendaItemGuarded,
  createMeetingForTenant,
  deleteAgendaItemGuarded,
  updateAgendaItemGuarded
} from '../../src/lib/syndics/meeting-writes';

describe('meeting-writes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createMeetingForTenant', () => {
    it("relit l'AG APRES la validation de la transaction et la renvoie", async () => {
      const order: string[] = [];
      mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 's1' });
      mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<string>) => {
        const tx = {
          generalMeeting: { create: jest.fn(async () => ({ id: 'm1' })) },
          gMResolution: { createMany: jest.fn() }
        };
        const result = await callback(tx);
        order.push('commit');
        return result;
      });
      mockQueries.getMeetingByTenant.mockImplementation(async () => {
        order.push('read');
        return { id: 'm1', status: 'PLANNED' };
      });

      const meeting = await createMeetingForTenant('t1', {
        syndicateId: 's1',
        type: 'EXTRAORDINARY',
        scheduledAt: new Date('2026-02-20T09:00:00Z'),
        resolutions: []
      });

      expect(meeting).toMatchObject({ id: 'm1' });
      expect(order).toEqual(['commit', 'read']);
      expect(mockQueries.getMeetingByTenant).toHaveBeenCalledWith('t1', 's1', 'm1');
    });

    it("refuse une copropriete d'une autre agence (404)", async () => {
      mockPrisma.syndicate.findFirst.mockResolvedValue(null);
      await expect(
        createMeetingForTenant('t1', { syndicateId: 'x', type: 'ORDINARY', scheduledAt: new Date(), resolutions: [] })
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe.each(['COMPLETED', 'CANCELLED'])("ordre du jour d'une AG %s", status => {
    it('refuse ajout, modification et suppression avec un 409', async () => {
      mockPrisma.generalMeeting.findFirst.mockResolvedValue({ id: 'm1', status });
      mockPrisma.gMAgendaItem.findFirst.mockResolvedValue({ id: 'a1', meeting: { status } });

      await expect(
        addAgendaItemGuarded('t1', 's1', { meetingId: 'm1', title: 'x', discussions: [] })
      ).rejects.toMatchObject({ status: 409 });
      await expect(updateAgendaItemGuarded('t1', 's1', 'a1', { title: 'y' })).rejects.toMatchObject({ status: 409 });
      await expect(deleteAgendaItemGuarded('t1', 's1', 'a1')).rejects.toMatchObject({ status: 409 });
      expect(mockQueries.addAgendaItemToMeeting).not.toHaveBeenCalled();
      expect(mockQueries.updateAgendaItemByTenant).not.toHaveBeenCalled();
      expect(mockQueries.deleteAgendaItemByTenant).not.toHaveBeenCalled();
    });
  });

  it.each(['PLANNED', 'IN_PROGRESS'])("laisse modifier l'ordre du jour d'une AG %s", async status => {
    mockPrisma.generalMeeting.findFirst.mockResolvedValue({ id: 'm1', status });
    mockPrisma.gMAgendaItem.findFirst.mockResolvedValue({ id: 'a1', meeting: { status } });
    mockQueries.addAgendaItemToMeeting.mockResolvedValue({ id: 'a2' });

    await expect(addAgendaItemGuarded('t1', 's1', { meetingId: 'm1', title: 'x', discussions: [] })).resolves.toEqual({
      id: 'a2'
    });
    await updateAgendaItemGuarded('t1', 's1', 'a1', { title: 'y' });
    await deleteAgendaItemGuarded('t1', 's1', 'a1');
    expect(mockQueries.updateAgendaItemByTenant).toHaveBeenCalled();
    expect(mockQueries.deleteAgendaItemByTenant).toHaveBeenCalled();
  });

  it("renvoie 404 pour un point inexistant ou d'une autre agence", async () => {
    mockPrisma.gMAgendaItem.findFirst.mockResolvedValue(null);
    await expect(deleteAgendaItemGuarded('t1', 's1', 'zz')).rejects.toMatchObject({ status: 404 });
  });
});
