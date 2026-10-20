/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `listSubscribers` sur une liste dérivée (propriétaires, locataires, contacts
 * CRM) : aucun abonné n'est stocké, la liste doit renvoyer les destinataires
 * résolus, avec la même pagination que les listes manuelles.
 */
import './../helpers/app-shims';

const lists = [
  { id: 'l-manual', tenantId: 't1', type: 'MANUAL' },
  { id: 'l-owners', tenantId: 't1', type: 'FROM_OWNERS' },
  { id: 'l-foreign', tenantId: 't2', type: 'FROM_OWNERS' }
];
const ownerFindMany = jest.fn();
const subscriberFindMany = jest.fn();
const subscriberCount = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    newsletterList: {
      findFirst: jest.fn(
        async ({ where }: any) => lists.find(l => l.id === where.id && l.tenantId === where.tenantId) ?? null
      )
    },
    newsletterSubscriber: {
      findMany: (...a: any[]) => subscriberFindMany(...a),
      count: (...a: any[]) => subscriberCount(...a)
    },
    tenantClient: { findMany: (...a: any[]) => ownerFindMany(...a) },
    crmContact: { findMany: jest.fn(async () => []) }
  }
}));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));

import { listSubscribers } from '../../src/services/newsletter-subscriber.service';

const owners = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    user: { id: `u${i}`, email: `owner${i}@ex.com`, fullName: `Prenom${i} Nom${i}` }
  }));

beforeEach(() => {
  ownerFindMany.mockReset().mockResolvedValue(owners(3));
  subscriberFindMany.mockReset().mockResolvedValue([]);
  subscriberCount.mockReset().mockResolvedValue(0);
});

describe('listSubscribers — liste dérivée', () => {
  it('renvoie les destinataires résolus, paginés, au même format', async () => {
    const res = await listSubscribers('t1', 'l-owners', { page: 1, limit: 2 });

    expect(res.subscribers).toHaveLength(2);
    expect(res.subscribers[0]).toEqual(
      expect.objectContaining({ email: 'owner0@ex.com', name: 'Prenom0 Nom0', status: 'ACTIVE' })
    );
    expect(res.pagination).toEqual({ total: 3, page: 1, limit: 2, totalPages: 2 });
    expect(subscriberFindMany).not.toHaveBeenCalled();

    const page2 = await listSubscribers('t1', 'l-owners', { page: 2, limit: 2 });
    expect(page2.subscribers.map((s: any) => s.email)).toEqual(['owner2@ex.com']);
  });

  it("n'expose pas une liste d'une autre agence (404)", async () => {
    await expect(listSubscribers('t1', 'l-foreign', {})).rejects.toMatchObject({ statusCode: 404 });
    expect(ownerFindMany).not.toHaveBeenCalled();
  });

  it('un filtre de statut autre que ACTIVE ne renvoie rien', async () => {
    const res = await listSubscribers('t1', 'l-owners', { status: 'UNSUBSCRIBED' });
    expect(res.subscribers).toEqual([]);
    expect(res.pagination.total).toBe(0);
  });

  it('liste manuelle : lecture de la table des abonnés, inchangée', async () => {
    subscriberFindMany.mockResolvedValue([{ id: 's1', email: 'a@b.c' }]);
    subscriberCount.mockResolvedValue(1);
    const res = await listSubscribers('t1', 'l-manual', {});
    expect(res.subscribers).toEqual([{ id: 's1', email: 'a@b.c' }]);
    expect(subscriberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { listId: 'l-manual', tenantId: 't1' } })
    );
  });
});
