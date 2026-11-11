/**
 * A1 : inviter avec le rôle TENANT_ADMIN = attribuer ce rôle. Réservé au super-admin
 * et aux administrateurs de l'agence ; un gestionnaire (USERS_CREATE) peut inviter
 * un agent. À l'acceptation, une invitation TENANT_ADMIN posée par un non-admin
 * n'élève personne.
 */
const tx: any = {
  invitation: { create: jest.fn() },
  role: { count: jest.fn() },
  userRole: { createMany: jest.fn() }
};
const prismaMock: any = {
  tenant: { findUnique: jest.fn() },
  invitation: { findFirst: jest.fn() },
  user: { findFirst: jest.fn(), findUnique: jest.fn() },
  membership: { findUnique: jest.fn() },
  role: { findMany: jest.fn() },
  userRole: { count: jest.fn() },
  $transaction: jest.fn(async (cb: (client: unknown) => Promise<unknown>) => cb(tx))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendInviteEmail: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock('../../src/services/audit-service', () => {
  const actual = jest.requireActual('../../src/services/audit-service');
  return { ...actual, logAuditEvent: jest.fn() };
});
jest.mock('../../src/services/whatsapp-contact-resolve', () => ({
  getCrmContactIdForWhatsApp: jest.fn().mockResolvedValue(null)
}));

import { inviteCollaborator } from '../../src/services/invitation-service';

const T = 't1';
const ADMIN_ROLE = { id: 'r-admin', key: 'TENANT_ADMIN', scope: 'TENANT' };
const AGENT_ROLE = { id: 'r-agent', key: 'TENANT_AGENT', scope: 'TENANT' };

/** Acteur 'actor' : gestionnaire par défaut ; `admin` / `superAdmin` l'élèvent. */
function scene(opts: { admin?: boolean; superAdmin?: boolean } = {}) {
  prismaMock.tenant.findUnique.mockResolvedValue({ id: T, name: 'Agence', status: 'ACTIVE' });
  prismaMock.invitation.findFirst.mockResolvedValue(null);
  prismaMock.user.findFirst.mockResolvedValue(null);
  prismaMock.user.findUnique.mockResolvedValue({ globalRole: opts.superAdmin ? 'SUPER_ADMIN' : 'USER' });
  prismaMock.userRole.count.mockResolvedValue(opts.admin ? 1 : 0);
  tx.invitation.create.mockResolvedValue({ id: 'i1', email: 'n@x.test', expiresAt: new Date() });
}

const invite = (role: { id: string }) =>
  inviteCollaborator({ email: 'n@x.test', tenantId: T, roleIds: [role.id], invitedByUserId: 'actor' });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('inviteCollaborator : rôle TENANT_ADMIN', () => {
  it('un gestionnaire ne peut pas inviter avec TENANT_ADMIN (403), rien créé', async () => {
    scene();
    prismaMock.role.findMany.mockResolvedValue([ADMIN_ROLE]);
    await expect(invite(ADMIN_ROLE)).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.invitation.create).not.toHaveBeenCalled();
  });

  it("un administrateur de l'agence peut inviter avec TENANT_ADMIN", async () => {
    scene({ admin: true });
    prismaMock.role.findMany.mockResolvedValue([ADMIN_ROLE]);
    await invite(ADMIN_ROLE);
    expect(tx.invitation.create).toHaveBeenCalledTimes(1);
  });

  it('un super-admin peut inviter avec TENANT_ADMIN', async () => {
    scene({ superAdmin: true });
    prismaMock.role.findMany.mockResolvedValue([ADMIN_ROLE]);
    await invite(ADMIN_ROLE);
    expect(tx.invitation.create).toHaveBeenCalledTimes(1);
  });

  it('un gestionnaire peut inviter un agent', async () => {
    scene();
    prismaMock.role.findMany.mockResolvedValue([AGENT_ROLE]);
    await invite(AGENT_ROLE);
    expect(tx.invitation.create).toHaveBeenCalledTimes(1);
  });
});
