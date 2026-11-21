/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `regenerateInvitationLinkForPlatform` : le super-admin regenere le lien de
 * l'invitation en attente d'une agence, sans e-mail ni WhatsApp, sans jamais
 * lire l'invitation d'une autre agence.
 */

const mockPrisma = {
  invitation: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const mockSendInviteEmail = jest.fn();
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendInviteEmail: (...args: any[]) => mockSendInviteEmail(...args) }
}));

const mockLogAudit = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...args: any[]) => mockLogAudit(...args),
  AuditActionKey: { USER_INVITED: 'USER_INVITED', USER_CREATED: 'USER_CREATED' }
}));

import { InvitationStatus } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../src/middleware/error-middleware';
import { regenerateInvitationLinkForPlatform } from '../../src/services/invitation-service';

const pending = { id: 'inv-1', email: 'admin@agence.test', status: InvitationStatus.PENDING, tenantId: 'tenant-A' };

describe('regenerateInvitationLinkForPlatform', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.invitation.update.mockResolvedValue({});
  });

  it("prend l'unique invitation en attente, change le hash et l'expiration, sans e-mail", async () => {
    mockPrisma.invitation.findMany.mockResolvedValueOnce([pending]);

    const result = await regenerateInvitationLinkForPlatform('tenant-A', 'super-1');

    const query = mockPrisma.invitation.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ tenantId: 'tenant-A', status: InvitationStatus.PENDING });

    const update = mockPrisma.invitation.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'inv-1' });
    expect(update.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(update.data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86400000);

    expect(result.acceptUrl).toContain('/auth/accept-invite?token=');
    expect(result).toMatchObject({ email: 'admin@agence.test', invitationId: 'inv-1' });
    expect(mockSendInviteEmail).not.toHaveBeenCalled();
  });

  it("chaque appel produit un nouveau jeton : l'ancien hash est remplace", async () => {
    mockPrisma.invitation.findMany.mockResolvedValue([pending]);

    const first = await regenerateInvitationLinkForPlatform('tenant-A', 'super-1');
    const second = await regenerateInvitationLinkForPlatform('tenant-A', 'super-1');

    const hashes = mockPrisma.invitation.update.mock.calls.map(c => c[0].data.tokenHash);
    expect(hashes[0]).not.toBe(hashes[1]);
    expect(first.acceptUrl).not.toBe(second.acceptUrl);
  });

  it("n'écrit ni le jeton ni l'URL dans l'audit", async () => {
    mockPrisma.invitation.findMany.mockResolvedValueOnce([pending]);

    const result = await regenerateInvitationLinkForPlatform('tenant-A', 'super-1');

    const serialized = JSON.stringify(mockLogAudit.mock.calls);
    const token = result.acceptUrl.split('token=')[1];
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain('accept-invite');
  });

  it("accepte une invitation expirée mais encore en attente (la requête ne filtre pas l'expiration)", async () => {
    mockPrisma.invitation.findMany.mockResolvedValueOnce([pending]);
    await regenerateInvitationLinkForPlatform('tenant-A', 'super-1');
    expect(mockPrisma.invitation.findMany.mock.calls[0][0].where).not.toHaveProperty('expiresAt');
  });

  it('aucune invitation en attente : ConflictError en français', async () => {
    mockPrisma.invitation.findMany.mockResolvedValueOnce([]);

    await expect(regenerateInvitationLinkForPlatform('tenant-A', 'super-1')).rejects.toBeInstanceOf(ConflictError);
    expect(mockPrisma.invitation.update).not.toHaveBeenCalled();
  });

  it("plusieurs invitations en attente sans invitationId : ConflictError, aucun lien d'un collaborateur invalidé", async () => {
    mockPrisma.invitation.findMany.mockResolvedValueOnce([pending, { ...pending, id: 'inv-2' }]);

    await expect(regenerateInvitationLinkForPlatform('tenant-A', 'super-1')).rejects.toBeInstanceOf(ConflictError);
    expect(mockPrisma.invitation.update).not.toHaveBeenCalled();
  });

  it("invitationId d'une autre agence : NotFoundError, rien n'est modifié", async () => {
    mockPrisma.invitation.findFirst.mockResolvedValueOnce(null);

    await expect(regenerateInvitationLinkForPlatform('tenant-A', 'super-1', 'inv-de-B')).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(mockPrisma.invitation.findFirst.mock.calls[0][0].where).toEqual({ id: 'inv-de-B', tenantId: 'tenant-A' });
    expect(mockPrisma.invitation.update).not.toHaveBeenCalled();
  });

  it("invitationId déjà acceptée : ConflictError, rien n'est modifié", async () => {
    mockPrisma.invitation.findFirst.mockResolvedValueOnce({ ...pending, status: InvitationStatus.ACCEPTED });

    await expect(regenerateInvitationLinkForPlatform('tenant-A', 'super-1', 'inv-1')).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(mockPrisma.invitation.update).not.toHaveBeenCalled();
  });
});
