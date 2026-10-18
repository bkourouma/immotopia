/** Invitation / revocation du portail : un lot compte une fois, meme avec plusieurs profils. */
const mockSendEmail = jest.fn(async (..._args: unknown[]) => undefined);
const mockTx: Record<string, any> = {
  tenantClient: {
    findFirst: jest.fn(async () => null),
    create: jest.fn(async () => ({})),
    update: jest.fn(async () => ({}))
  },
  lotOwnerProfile: { update: jest.fn(async () => ({})) }
};
const profileRow = (id: string, lotId: string, enabled = false) => ({
  id,
  lotId,
  isActive: true,
  ownedUntil: null,
  portalAccessEnabled: enabled,
  portalAccessToken: enabled ? `tok-${id}` : null
});
const mockPrisma: Record<string, any> = {
  syndicate: {
    findFirst: jest.fn(async () => ({ id: 'syn-1' })),
    findMany: jest.fn(async () => [{ id: 'syn-1', name: 'Résidence A' }])
  },
  lotOwnerProfile: {
    findFirst: jest.fn(async () => ({ id: 'pr-1', lotId: 'lotA', contactId: 'c1', isActive: true })),
    findMany: jest.fn(async () => [profileRow('pr-1', 'lotA'), profileRow('pr-2', 'lotA'), profileRow('pr-3', 'lotB')])
  },
  syndicateLot: {
    findFirst: jest.fn(async () => ({ id: 'lotA' })),
    findMany: jest.fn(async () => [
      { id: 'lotA', syndicateId: 'syn-1', lotNumber: 'A1' },
      { id: 'lotB', syndicateId: 'syn-1', lotNumber: 'B2' }
    ])
  },
  crmContact: {
    findFirst: jest.fn(async () => ({
      id: 'c1',
      firstName: 'Awa',
      lastName: 'Koné',
      legalName: null,
      email: 'awa@example.com'
    }))
  },
  user: {
    findUnique: jest.fn(async () => ({
      id: 'u1',
      fullName: 'Awa',
      globalRole: 'USER',
      emailVerified: true,
      lastLoginAt: new Date(),
      googleId: null,
      isActive: true,
      preferredLanguage: 'fr'
    }))
  },
  membership: { count: jest.fn(async () => 0) },
  tenantClient: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
  tenant: { findUnique: jest.fn(async () => ({ name: 'Agence' })) },
  $transaction: jest.fn(async (fn: any) => fn(mockTx))
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/utils/password-utils', () => ({ hashPassword: jest.fn(async () => 'hash') }));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendCoOwnerPortalInvitationEmail: (...args: unknown[]) => mockSendEmail(...args) },
  isEmailDeliveryConfigured: () => true
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));

import { inviteCoOwnerToPortal, revokeCoOwnerPortalAccess } from '../../src/services/syndic-coowner-portal-service';

const params = { tenantId: 't1', syndicateId: 'syn-1', ownerProfileId: 'pr-1' };

describe('portail copropriétaire : lots distincts', () => {
  beforeEach(() => mockSendEmail.mockClear());

  it('invitation : 3 profils sur 2 lots => openedLots 2 et 2 lots dans l e-mail', async () => {
    const result = await inviteCoOwnerToPortal(params);
    expect(result.openedLots).toBe(2);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const arg = mockSendEmail.mock.calls[0][0] as any;
    expect(arg.lots).toEqual([
      { syndicateName: 'Résidence A', lotNumber: 'A1' },
      { syndicateName: 'Résidence A', lotNumber: 'B2' }
    ]);
    // L'accès reste ouvert profil par profil.
    expect(mockTx.lotOwnerProfile.update).toHaveBeenCalledTimes(3);
  });

  it('revocation : closedLots = lots distincts, chaque profil est tout de même refermé', async () => {
    mockTx.lotOwnerProfile.update.mockClear();
    mockPrisma.lotOwnerProfile.findMany.mockResolvedValueOnce([
      profileRow('pr-1', 'lotA', true),
      profileRow('pr-2', 'lotA', true),
      profileRow('pr-3', 'lotB', true)
    ]);
    const result = await revokeCoOwnerPortalAccess(params);
    expect(result.closedLots).toBe(2);
    expect(mockTx.lotOwnerProfile.update).toHaveBeenCalledTimes(3);
  });
});
