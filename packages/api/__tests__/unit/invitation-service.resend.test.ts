/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BUG-2026-09-28-004 : `resendInvitation` ne doit invalider l'ancien jeton
 * (tokenHash/expiresAt) que si l'e-mail est effectivement parti. Un echec
 * d'envoi doit laisser l'invitation intacte et remonter une erreur, pas
 * ecraser le jeton avant de lever.
 *
 * `inviteCollaborator` doit aussi signaler honnetement (emailSent: false)
 * quand l'envoi initial echoue, au lieu d'annoncer un succes silencieux.
 */

const mockPrisma = {
  invitation: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn()
  },
  tenant: {
    findUnique: jest.fn()
  },
  user: {
    findUnique: jest.fn()
  },
  membership: {
    findUnique: jest.fn()
  },
  role: {
    findMany: jest.fn()
  },
  $transaction: jest.fn()
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const mockSendInviteEmail = jest.fn();
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendInviteEmail: (...args: any[]) => mockSendInviteEmail(...args) }
}));

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  AuditActionKey: { USER_INVITED: 'USER_INVITED', USER_CREATED: 'USER_CREATED' }
}));

import { InvitationStatus } from '@prisma/client';
import { inviteCollaborator, resendInvitation } from '../../src/services/invitation-service';

describe('resendInvitation', () => {
  const invitationId = 'inv-1';
  const baseInvitation = {
    id: invitationId,
    email: 'agent.oi@recette.test',
    tenantId: 'tenant-1',
    status: InvitationStatus.PENDING,
    tokenHash: 'old-hash',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    roleIds: ['role-1'],
    tenant: { id: 'tenant-1', name: 'Groupe Intégré Recette OI' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.invitation.findUnique.mockResolvedValue({ ...baseInvitation });
  });

  it("laisse le tokenHash et l'expiration inchangés quand l'envoi de l'e-mail échoue", async () => {
    mockSendInviteEmail.mockRejectedValueOnce(new Error('SMTP down'));

    await expect(resendInvitation(invitationId, 'actor-1')).rejects.toThrow(
      "Échec de l'envoi de l'email. L'ancien lien d'invitation reste valable."
    );

    expect(mockPrisma.invitation.update).not.toHaveBeenCalled();
  });

  it("met à jour tokenHash et expiresAt seulement quand l'e-mail part avec succès", async () => {
    mockSendInviteEmail.mockResolvedValueOnce(undefined);
    mockPrisma.invitation.update.mockResolvedValueOnce({ ...baseInvitation });

    const result = await resendInvitation(invitationId, 'actor-1');

    expect(mockPrisma.invitation.update).toHaveBeenCalledTimes(1);
    const updateArgs = mockPrisma.invitation.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: invitationId });
    expect(updateArgs.data.tokenHash).not.toBe('old-hash');
    expect(updateArgs.data.expiresAt).toBeInstanceOf(Date);
    expect(result.emailSent).toBe(true);
    expect(result.acceptUrl).toContain('/auth/accept-invite?token=');
  });
});

describe("inviteCollaborator — honnêteté du message quand l'e-mail échoue", () => {
  const tenantId = 'tenant-1';

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: tenantId,
      name: 'Groupe Intégré Recette OI',
      status: 'ACTIVE'
    });
    mockPrisma.invitation.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.role.findMany.mockResolvedValue([{ id: 'role-1', scope: 'TENANT', key: 'TENANT_AGENT', name: 'Agent' }]);
    mockPrisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        invitation: {
          create: jest.fn().mockResolvedValue({
            id: 'inv-new',
            tenantId,
            email: 'agent.oi@recette.test',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: InvitationStatus.PENDING,
            roleIds: ['role-1'],
            invitedBy: 'actor-1'
          })
        }
      })
    );
  });

  it("retourne emailSent:false quand l'envoi initial échoue, sans faire échouer la création", async () => {
    mockSendInviteEmail.mockRejectedValueOnce(new Error('SMTP down'));

    const result = await inviteCollaborator({
      email: 'agent.oi@recette.test',
      tenantId,
      roleIds: ['role-1'],
      invitedByUserId: 'actor-1'
    });

    expect(result.emailSent).toBe(false);
    expect(result.invitation.id).toBe('inv-new');
  });

  it("retourne emailSent:true quand l'envoi réussit", async () => {
    mockSendInviteEmail.mockResolvedValueOnce(undefined);

    const result = await inviteCollaborator({
      email: 'agent.oi@recette.test',
      tenantId,
      roleIds: ['role-1'],
      invitedByUserId: 'actor-1'
    });

    expect(result.emailSent).toBe(true);
  });
});
