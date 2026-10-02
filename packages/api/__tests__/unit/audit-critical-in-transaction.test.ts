/**
 * Phase 3 du journal d'audit a deux niveaux (ADR-006) : une action `critical`
 * n'est jamais commitee sans sa trace. Son evenement s'ecrit avec
 * `recordAuditEvent(tx, ...)` DANS la transaction metier ; si l'ecriture de
 * l'audit echoue, l'effet metier n'est pas commite (la transaction echoue).
 * Un evenement non critique reste sur la file asynchrone `logAuditEvent`.
 */
const tx: any = {
  userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
  membership: { update: jest.fn() },
  refreshToken: { updateMany: jest.fn() },
  user: { update: jest.fn() },
  passwordResetToken: { updateMany: jest.fn(), create: jest.fn() },
  tenant: { update: jest.fn() },
  subscription: { update: jest.fn() },
  capacityOverride: { create: jest.fn(), update: jest.fn() }
};
const prismaMock: any = {
  membership: { findUnique: jest.fn() },
  role: { findMany: jest.fn() },
  tenant: { findUnique: jest.fn() },
  subscription: { findUnique: jest.fn() },
  capacityOverride: { findFirst: jest.fn() },
  // Le faux client de transaction est `tx` (verifie par identite dans les assertions).
  $transaction: jest.fn(async (cb: (client: unknown) => Promise<unknown>) => cb(tx))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

const mockLogAudit = jest.fn();
const mockRecordAudit = jest.fn();
jest.mock('../../src/services/audit-service', () => {
  const actual = jest.requireActual('../../src/services/audit-service');
  return {
    ...actual,
    logAuditEvent: (...a: unknown[]) => mockLogAudit(...a),
    recordAuditEvent: (...a: unknown[]) => mockRecordAudit(...a)
  };
});
jest.mock('../../src/middleware/session-invalidation', () => ({
  revokeTenantSessions: jest.fn(),
  revokeUserSessions: jest.fn()
}));
jest.mock('../../src/services/permission-service', () => ({ invalidateAllUserPermissionCache: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined) }
}));

import { MembershipStatus, SubscriptionStatus, TenantStatus } from '@prisma/client';
import {
  disableMember,
  enableMember,
  resetMemberPassword,
  revokeMemberSessions,
  updateMemberRoles
} from '../../src/services/membership-service';
import { activateTenant, suspendTenant, updateTenant } from '../../src/services/tenant-service';
import { cancelSubscription } from '../../src/services/subscription-service';
import { grantCapacityOverride, revokeCapacityOverride } from '../../src/services/subscription-v2-service';

const ACTOR = 'actor-1';
const TENANT = 'tenant-a';
const USER = 'user-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockRecordAudit.mockResolvedValue(undefined);
  tx.refreshToken.updateMany.mockResolvedValue({ count: 2 });
  prismaMock.membership.findUnique.mockResolvedValue({
    id: 'm1',
    status: MembershipStatus.ACTIVE,
    user: { email: 'u@example.test', fullName: 'U', preferredLanguage: 'fr' }
  });
});

/** Le dernier evenement critique est ecrit avec `tx`, jamais via la file asynchrone. */
function expectRecorded(actionKey: string) {
  expect(mockLogAudit).not.toHaveBeenCalled();
  expect(mockRecordAudit).toHaveBeenCalledTimes(1);
  const [client, entry] = mockRecordAudit.mock.calls[0];
  expect(client).toBe(tx);
  expect(entry).toMatchObject({ actionKey, tenantId: TENANT });
}

describe('membership-service : actions critiques dans la transaction', () => {
  it('ROLE_ASSIGNED : remplacement des roles et audit dans la meme transaction', async () => {
    prismaMock.role.findMany.mockResolvedValue([{ id: 'r1' }]);
    // getMemberById relit apres commit : on neutralise la lecture finale.
    prismaMock.membership.findUnique.mockResolvedValue({ id: 'm1', user: {}, tenant: {} });
    await updateMemberRoles(USER, TENANT, { roleIds: ['r1'] }, ACTOR).catch(() => undefined);
    expect(tx.userRole.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.userRole.createMany).toHaveBeenCalledTimes(1);
    expectRecorded('ROLE_ASSIGNED');
    expect(mockRecordAudit.mock.calls[0][1]).toMatchObject({ entityId: USER, payload: { roleIds: ['r1'] } });
  });

  it('USER_DISABLED : statut, revocation des sessions et audit dans la transaction', async () => {
    tx.membership.update.mockResolvedValue({ id: 'm1', status: MembershipStatus.DISABLED });
    await disableMember(USER, TENANT, ACTOR);
    expect(tx.membership.update).toHaveBeenCalledTimes(1);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    expectRecorded('USER_DISABLED');
  });

  it('USER_ENABLED : statut et audit dans la transaction', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ id: 'm1', status: MembershipStatus.DISABLED });
    tx.membership.update.mockResolvedValue({ id: 'm1', status: MembershipStatus.ACTIVE });
    await enableMember(USER, TENANT, ACTOR);
    expectRecorded('USER_ENABLED');
  });

  it('PASSWORD_RESET : mot de passe, sessions, jeton et audit dans la transaction', async () => {
    await resetMemberPassword(USER, TENANT, undefined, ACTOR);
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.passwordResetToken.create).toHaveBeenCalledTimes(1);
    expectRecorded('PASSWORD_RESET');
  });

  it('PASSWORD_RESET sans mot de passe fourni : le mot de passe généré n’est jamais refusé par la politique', async () => {
    // 32 octets nuls → « AAAA… » en base64url : ni minuscule, ni chiffre, ni caractère
    // spécial. Avant correction, la réinitialisation échouait alors sur sa propre
    // validation (environ une fois sur quatre avec de vrais octets aléatoires).
    const spy = jest.spyOn(require('crypto'), 'randomBytes').mockReturnValueOnce(Buffer.alloc(32) as never);
    try {
      await expect(resetMemberPassword(USER, TENANT, undefined, ACTOR)).resolves.not.toThrow();
    } finally {
      spy.mockRestore();
    }
    expectRecorded('PASSWORD_RESET');
  });

  it('PASSWORD_RESET avec un mot de passe saisi trop faible : toujours refusé', async () => {
    await expect(resetMemberPassword(USER, TENANT, 'faible', ACTOR)).rejects.toThrow();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('SESSIONS_REVOKED : revocation et audit dans la transaction', async () => {
    await revokeMemberSessions(USER, TENANT, ACTOR);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    expectRecorded('SESSIONS_REVOKED');
  });

  it("l'echec de l'audit fait echouer l'action (aucune trace, pas de succes)", async () => {
    mockRecordAudit.mockRejectedValue(new Error('audit indisponible'));
    await expect(revokeMemberSessions(USER, TENANT, ACTOR)).rejects.toThrow('audit indisponible');
  });
});

describe('tenant-service : activation et suspension critiques', () => {
  beforeEach(() => {
    prismaMock.tenant.findUnique.mockResolvedValue({ id: TENANT, status: TenantStatus.ACTIVE, subdomain: null });
    tx.tenant.update.mockResolvedValue({ id: TENANT });
  });

  it('suspendTenant : TENANT_SUSPENDED dans la transaction', async () => {
    await suspendTenant(TENANT, ACTOR);
    expectRecorded('TENANT_SUSPENDED');
  });

  it('activateTenant : TENANT_ACTIVATED dans la transaction', async () => {
    await activateTenant(TENANT, ACTOR);
    expectRecorded('TENANT_ACTIVATED');
  });

  it('updateTenant vers SUSPENDED : critique, dans la transaction', async () => {
    await updateTenant(TENANT, { status: TenantStatus.SUSPENDED as any }, ACTOR);
    expectRecorded('TENANT_SUSPENDED');
  });

  it('updateTenant sans changement de statut : TENANT_UPDATED reste sur la file asynchrone', async () => {
    await updateTenant(TENANT, { name: 'Nouveau nom' }, ACTOR);
    expect(mockRecordAudit).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ actionKey: 'TENANT_UPDATED' }));
  });
});

describe('subscription-service : SUBSCRIPTION_CANCELED', () => {
  it("l'annulation et son audit s'engagent dans la meme transaction", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 'sub1',
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date('2026-12-01')
    });
    tx.subscription.update.mockResolvedValue({ id: 'sub1' });
    await cancelSubscription(TENANT, undefined, ACTOR);
    expect(tx.subscription.update).toHaveBeenCalledTimes(1);
    expectRecorded('SUBSCRIPTION_CANCELED');
    expect(mockRecordAudit.mock.calls[0][1]).toMatchObject({ entityId: 'sub1' });
  });
});

describe('subscription-v2-service : derogations de capacite', () => {
  it('CAPACITY_OVERRIDE_GRANTED : creation et audit dans la transaction', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({ id: TENANT });
    tx.capacityOverride.create.mockResolvedValue({ id: 'ov1', capacityKey: 'PROPERTIES', delta: 5, reason: 'Reprise' });
    await grantCapacityOverride(
      TENANT,
      { capacityKey: 'PROPERTIES' as any, delta: 5, reason: 'Reprise' },
      ACTOR,
      prismaMock
    );
    expectRecorded('CAPACITY_OVERRIDE_GRANTED');
    expect(mockRecordAudit.mock.calls[0][1]).toMatchObject({ entityType: 'CapacityOverride', entityId: 'ov1' });
  });

  it('CAPACITY_OVERRIDE_REVOKED : revocation et audit dans la transaction', async () => {
    prismaMock.capacityOverride.findFirst.mockResolvedValue({ id: 'ov1', revokedAt: null });
    tx.capacityOverride.update.mockResolvedValue({ id: 'ov1', capacityKey: 'PROPERTIES', delta: 5 });
    await revokeCapacityOverride(TENANT, 'ov1', ACTOR);
    expectRecorded('CAPACITY_OVERRIDE_REVOKED');
  });
});
