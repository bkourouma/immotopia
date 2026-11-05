/**
 * Mes notifications : recherche libre (titre, message) et période, ET avec « non lues »,
 * toujours bornées au destinataire et à l'agence.
 */
const findMany = jest.fn();
const count = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    userNotification: {
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a)
    }
  }
}));

import { listMyNotifications } from '../../src/lib/notifications/queries';
import { myNotificationsQuerySchema } from '../../src/lib/notifications/schemas';

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  count.mockReset().mockResolvedValue(0);
});

describe('listMyNotifications : recherche', () => {
  it("reste borné à l'agence et au destinataire, sans filtre superflu", async () => {
    await listMyNotifications({ tenantId: 't1', userId: 'u1' });
    expect(findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', recipientUserId: 'u1' });
  });

  it('cherche dans le titre et le message (insensible à la casse), avec non lues et période', async () => {
    const from = new Date('2026-10-01T00:00:00.000Z');
    const to = new Date('2026-10-31T23:59:59.999Z');
    await listMyNotifications({ tenantId: 't1', userId: 'u1', unreadOnly: true, q: ' loyer ', from, to });
    const contains = { contains: 'loyer', mode: 'insensitive' };
    expect(findMany.mock.calls[0][0].where).toEqual({
      tenantId: 't1',
      recipientUserId: 'u1',
      readAt: null,
      OR: [{ title: contains }, { body: contains }],
      createdAt: { gte: from, lte: to }
    });
    // Le total compte avec les mêmes critères.
    expect(count.mock.calls[0][0].where).toEqual(findMany.mock.calls[0][0].where);
  });
});

describe('myNotificationsQuerySchema', () => {
  it('lit q, from, to (jours UTC) et refuse un paramètre inconnu', () => {
    const parsed = myNotificationsQuerySchema.parse({ q: '  facture ', from: '2026-10-01', to: '2026-10-31' });
    expect(parsed.q).toBe('facture');
    expect(parsed.from?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(parsed.to?.toISOString()).toBe('2026-10-31T23:59:59.999Z');
    expect(() => myNotificationsQuerySchema.parse({ tenantId: 'autre' })).toThrow();
    expect(() => myNotificationsQuerySchema.parse({ from: 'hier' })).toThrow();
    // Un jour impossible ne glisse pas au mois suivant.
    expect(() => myNotificationsQuerySchema.parse({ from: '2026-02-31' })).toThrow();
    expect(() => myNotificationsQuerySchema.parse({ to: '2026-13-45' })).toThrow();
  });
});
