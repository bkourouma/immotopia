/**
 * Le rattrapage des propriétaires (`syncOwnerClients`) tourne en arrière-plan
 * à l'ouverture du formulaire de bien : il crée les comptes manquants mais ne
 * doit déclencher AUCUNE notification (WhatsApp + lien de réinitialisation).
 * La conversion explicite d'un contact garde son comportement (notification).
 */
const mockSend = jest.fn(async () => undefined);

const contact = { id: 'c1', tenantId: 't1', email: 'p@a.test', firstName: 'Awa', lastName: 'K', phonePrimary: null };
const createdUser = { id: 'u1', email: contact.email, fullName: 'Awa K', avatarUrl: null };
const clientRow = { id: 'tc1', userId: 'u1', tenantId: 't1', details: { crmContactId: 'c1' }, user: createdUser };

const mockPrisma: Record<string, any> = {
  crmContact: {
    findMany: jest.fn(async () => [{ id: 'c1', email: contact.email }]),
    findFirst: jest.fn(async () => contact)
  },
  user: { findUnique: jest.fn(async () => null) },
  tenantClient: {
    findUnique: jest.fn(async () => null),
    create: jest.fn(async () => clientRow)
  },
  tenant: { findUnique: jest.fn(async () => ({ name: 'Agence' })) },
  $transaction: jest.fn(async (fn: any) =>
    fn({
      user: { create: jest.fn(async () => createdUser) },
      passwordResetToken: { create: jest.fn(async () => ({})) }
    })
  )
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: (...a: unknown[]) => (mockSend as any)(...a)
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/middleware/session-invalidation', () => ({ revokeTenantSessions: jest.fn() }));

import { syncOwnerClients } from '../../src/services/owner-client-service';
import { getOrCreateTenantClientFromContact } from '../../src/services/tenant-service';

beforeEach(() => {
  mockSend.mockClear();
  mockPrisma.user.findUnique.mockResolvedValue(null);
});

describe('notification à la création du compte', () => {
  it('le rattrapage crée le compte sans envoyer aucune notification', async () => {
    const res = await syncOwnerClients('t1');
    expect(res).toEqual({ examined: 1, created: 1 });
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('la conversion explicite continue de notifier', async () => {
    const res = await getOrCreateTenantClientFromContact('t1', 'c1', 'OWNER');
    expect(res.isNewUser).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ notificationKey: 'PORTAL_ACCOUNT_CREATED' }));
  });
});
