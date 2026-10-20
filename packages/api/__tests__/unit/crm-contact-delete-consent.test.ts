/**
 * Audit 2026-10-19 (lot B) : suppression d'un contact refusée en 409 s'il porte
 * un compte propriétaire / de tiers / une offre d'achat (liens Restrict), et
 * consentements `false` par défaut à la création.
 */
const mockPrisma: Record<string, any> = {
  crmContact: {
    findUnique: jest.fn(async () => null),
    findFirst: jest.fn(async () => ({ id: 'c1', email: 'a@b.c', firstName: 'A', lastName: 'B' })),
    create: jest.fn(async ({ data }: any) => ({ id: 'new', ...data }))
  },
  ownerAccount: { count: jest.fn(async () => 0) },
  saleOffer: { count: jest.fn(async () => 0) },
  thirdPartyAccount: { count: jest.fn(async () => 0) },
  $transaction: jest.fn()
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/whatsapp-group-automation-service', () => ({
  autoInviteContactToWhatsappGroup: jest.fn(async () => undefined)
}));

import { createContact, deleteContact } from '../../src/services/crm-contact-service';
import { deleteContactHandler } from '../../src/controllers/crm-controller';
import { ConflictError } from '../../src/middleware/error-middleware';

beforeEach(() => {
  mockPrisma.ownerAccount.count.mockResolvedValue(0);
  mockPrisma.saleOffer.count.mockResolvedValue(0);
  mockPrisma.thirdPartyAccount.count.mockResolvedValue(0);
  mockPrisma.$transaction.mockReset();
});

describe('deleteContact : garde financière', () => {
  it.each(['ownerAccount', 'saleOffer', 'thirdPartyAccount'])(
    'refuse (409) avec %s, sans rien supprimer',
    async key => {
      mockPrisma[key].count.mockResolvedValue(1);
      await expect(deleteContact('t1', 'c1', 'u1')).rejects.toBeInstanceOf(ConflictError);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    }
  );

  it('filtre chaque comptage par agence', async () => {
    mockPrisma.ownerAccount.count.mockResolvedValue(1);
    await deleteContact('t1', 'c1').catch(() => undefined);
    expect(mockPrisma.ownerAccount.count).toHaveBeenCalledWith({
      where: { contactId: 'c1', syndicate: { tenantId: 't1' } }
    });
    expect(mockPrisma.saleOffer.count).toHaveBeenCalledWith({ where: { buyerContactId: 'c1', tenantId: 't1' } });
    expect(mockPrisma.thirdPartyAccount.count.mock.calls[0][0].where.tenantId).toBe('t1');
  });

  it('rapproche le compte de tiers par e-mail sans tenir compte de la casse', async () => {
    mockPrisma.thirdPartyAccount.count.mockResolvedValue(1);
    await deleteContact('t1', 'c1').catch(() => undefined);
    expect(mockPrisma.thirdPartyAccount.count.mock.calls[0][0].where.tenantClient.user.email).toEqual({
      equals: 'a@b.c',
      mode: 'insensitive'
    });
  });

  it('le contrôleur renvoie 409 pour ce ConflictError', async () => {
    mockPrisma.ownerAccount.count.mockResolvedValue(1);
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const req: any = { params: { contactId: 'c1' }, user: { userId: 'u1' }, crmTenantId: 't1' };
    await deleteContactHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe('createContact : consentements', () => {
  const base = { firstName: 'A', lastName: 'B', email: 'x@y.z' } as any;

  it('sans consentement : trois champs à false, consentDate nulle', async () => {
    await createContact('t1', base);
    const { data } = mockPrisma.crmContact.create.mock.calls.at(-1)[0];
    expect(data).toMatchObject({
      consentMarketing: false,
      consentWhatsapp: false,
      consentEmail: false,
      consentDate: null
    });
  });

  it('consentement explicite conservé, consentDate renseignée', async () => {
    await createContact('t1', { ...base, consentEmail: true });
    const { data } = mockPrisma.crmContact.create.mock.calls.at(-1)[0];
    expect(data.consentEmail).toBe(true);
    expect(data.consentMarketing).toBe(false);
    expect(data.consentDate).toBeInstanceOf(Date);
  });
});
