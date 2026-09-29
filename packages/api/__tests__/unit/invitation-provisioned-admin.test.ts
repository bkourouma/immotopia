/**
 * Acceptation d'invitation du premier administrateur cree par le
 * provisionnement de la plateforme (compte jamais active, mot de passe
 * jetable inconnu) : le jeton seul peut fixer son premier mot de passe.
 * Tout autre compte existant reste soumis a INVITATION_REQUIRES_LOGIN
 * (non-regression de la prise de compte corrigee par la PR #41).
 */

import crypto from 'crypto';
import { InvitationStatus, MembershipStatus } from '@prisma/client';
import { createFakePrisma } from '../helpers/fake-prisma';

const PLAIN_TOKEN = 'jeton-admin-provisionne';
const TOKEN_HASH = crypto.createHash('sha256').update(PLAIN_TOKEN).digest('hex');

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
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

import { acceptInvitation } from '../../src/services/invitation-service';
import { comparePassword, hashPassword } from '../../src/utils/password-utils';

const TENANT_A = 'a0000000-0000-0000-0000-00000000000a';
const TENANT_B = 'b0000000-0000-0000-0000-00000000000b';
const SUPER = 'super-1';
const TENANT_ADMIN_INVITER = 'inviter-agence';
const ADMIN_EMAIL = 'admin@agence.example';
const NEW_PASSWORD = 'MotDePasseValide#1';

let originalHash: string;

function seedUser(overrides: Record<string, unknown> = {}) {
  mockPrisma.user.rows.push({
    id: 'admin-1',
    email: ADMIN_EMAIL,
    passwordHash: originalHash,
    fullName: 'Nom Provisoire',
    isActive: true,
    emailVerified: false,
    lastLoginAt: null,
    globalRole: 'USER',
    ...overrides
  });
}

function seedMembership(overrides: Record<string, unknown> = {}) {
  mockPrisma.membership.rows.push({
    id: `m-${mockPrisma.membership.rows.length + 1}`,
    userId: 'admin-1',
    tenantId: TENANT_A,
    status: MembershipStatus.PENDING_INVITE,
    invitedBy: SUPER,
    ...overrides
  });
}

function seedInvitation(overrides: Record<string, unknown> = {}) {
  mockPrisma.invitation.rows.push({
    id: `inv-${mockPrisma.invitation.rows.length + 1}`,
    tenantId: TENANT_A,
    email: ADMIN_EMAIL,
    tokenHash: TOKEN_HASH,
    status: InvitationStatus.PENDING,
    expiresAt: new Date(Date.now() + 86_400_000),
    roleIds: ['role-admin'],
    invitedBy: SUPER,
    createdAt: new Date(),
    updatedAt: new Date(),
    acceptedAt: null,
    acceptedBy: null,
    revokedAt: null,
    tenant: { id: TENANT_A, name: 'Agence A' },
    ...overrides
  });
}

function seedProvisioned() {
  seedUser();
  seedMembership();
  seedInvitation();
}

async function expectRequiresLogin() {
  await expect(
    acceptInvitation({ token: PLAIN_TOKEN, password: NEW_PASSWORD, fullName: 'Pirate' })
  ).rejects.toMatchObject({
    statusCode: 403,
    code: 'INVITATION_REQUIRES_LOGIN'
  });
  const stored = mockPrisma.user.rows.find((r: any) => r.id === 'admin-1')!;
  expect(stored.passwordHash).toBe(originalHash);
  expect(mockPrisma.invitation.rows[0].status).toBe(InvitationStatus.PENDING);
}

beforeAll(async () => {
  originalHash = await hashPassword('MotJetableInconnu#9');
});

beforeEach(() => {
  mockPrisma.reset();
  for (const id of [TENANT_A, TENANT_B]) {
    mockPrisma.tenant.rows.push({ id, name: `Agence ${id}`, status: 'ACTIVE' });
  }
  mockPrisma.user.rows.push({
    id: SUPER,
    email: 'super@example.com',
    passwordHash: 'x',
    isActive: true,
    globalRole: 'SUPER_ADMIN'
  });
  mockPrisma.user.rows.push({
    id: TENANT_ADMIN_INVITER,
    email: 'gerant@example.com',
    passwordHash: 'x',
    isActive: true,
    globalRole: 'USER'
  });
});

describe('acceptInvitation — administrateur provisionne par le super-admin', () => {
  it("fixe le mot de passe sans session, active l'adhesion, verifie l'e-mail, attribue le role", async () => {
    seedProvisioned();

    const result = await acceptInvitation({ token: PLAIN_TOKEN, password: NEW_PASSWORD, fullName: 'Awa Traore' });

    expect(result.user.id).toBe('admin-1');
    const stored = mockPrisma.user.rows.find((r: any) => r.id === 'admin-1')!;
    expect(await comparePassword(NEW_PASSWORD, stored.passwordHash)).toBe(true);
    expect(await comparePassword('MotJetableInconnu#9', stored.passwordHash)).toBe(false);
    expect(stored.fullName).toBe('Awa Traore');
    expect(stored.emailVerified).toBe(true);
    const membership = mockPrisma.membership.rows.find((r: any) => r.userId === 'admin-1' && r.tenantId === TENANT_A)!;
    expect(membership.status).toBe(MembershipStatus.ACTIVE);
    expect(mockPrisma.invitation.rows[0].status).toBe(InvitationStatus.ACCEPTED);
    expect(mockPrisma.userRole.rows.some((r: any) => r.userId === 'admin-1' && r.roleId === 'role-admin')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('refuse un mot de passe faible ou absent sans rien ecrire', async () => {
    seedProvisioned();
    await expect(acceptInvitation({ token: PLAIN_TOKEN, password: 'faible', fullName: 'X' })).rejects.toMatchObject({
      statusCode: 400
    });
    await expect(acceptInvitation({ token: PLAIN_TOKEN, fullName: 'X' })).rejects.toMatchObject({ statusCode: 400 });
    const stored = mockPrisma.user.rows.find((r: any) => r.id === 'admin-1')!;
    expect(stored.passwordHash).toBe(originalHash);
    expect(mockPrisma.invitation.rows[0].status).toBe(InvitationStatus.PENDING);
  });

  it("deux acceptations simultanees : une seule ecrit le mot de passe, l'autre echoue", async () => {
    seedProvisioned();
    const results = await Promise.allSettled([
      acceptInvitation({ token: PLAIN_TOKEN, password: 'PremierMotDePasse#1', fullName: 'A' }),
      acceptInvitation({ token: PLAIN_TOKEN, password: 'SecondMotDePasse#2', fullName: 'B' })
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect([409, 403]).toContain(rejected.reason.statusCode);
    const stored = mockPrisma.user.rows.find((r: any) => r.id === 'admin-1')!;
    const first = await comparePassword('PremierMotDePasse#1', stored.passwordHash);
    const second = await comparePassword('SecondMotDePasse#2', stored.passwordHash);
    expect(first !== second).toBe(true);
  });

  it('une seconde acceptation apres coup est refusee et ne touche pas au mot de passe', async () => {
    seedProvisioned();
    await acceptInvitation({ token: PLAIN_TOKEN, password: NEW_PASSWORD, fullName: 'A' });
    const hashAfter = mockPrisma.user.rows.find((r: any) => r.id === 'admin-1')!.passwordHash;
    await expect(
      acceptInvitation({ token: PLAIN_TOKEN, password: 'Pirate#Mdp2024', fullName: 'B' })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.user.rows.find((r: any) => r.id === 'admin-1')!.passwordHash).toBe(hashAfter);
  });

  it('jeton expire ou revoque : comportement inchange (409)', async () => {
    seedProvisioned();
    mockPrisma.invitation.rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(acceptInvitation({ token: PLAIN_TOKEN, password: NEW_PASSWORD, fullName: 'A' })).rejects.toMatchObject(
      {
        statusCode: 409
      }
    );
    mockPrisma.invitation.rows[0].status = InvitationStatus.REVOKED;
    mockPrisma.invitation.rows[0].expiresAt = new Date(Date.now() + 86_400_000);
    await expect(acceptInvitation({ token: PLAIN_TOKEN, password: NEW_PASSWORD, fullName: 'A' })).rejects.toMatchObject(
      {
        statusCode: 409
      }
    );
    expect(mockPrisma.user.rows.find((r: any) => r.id === 'admin-1')!.passwordHash).toBe(originalHash);
  });
});

describe('acceptInvitation — non-regression securite (INVITATION_REQUIRES_LOGIN)', () => {
  it('compte actif ayant deja ouvert une session', async () => {
    seedUser({ emailVerified: true, lastLoginAt: new Date() });
    seedMembership();
    seedInvitation();
    await expectRequiresLogin();
  });

  it('compte ayant deja ouvert une session mais e-mail non verifie', async () => {
    seedUser({ lastLoginAt: new Date() });
    seedMembership();
    seedInvitation();
    await expectRequiresLogin();
  });

  it('compte non verifie inscrit librement (aucune adhesion creee par un super-admin)', async () => {
    seedUser();
    seedInvitation();
    await expectRequiresLogin();
  });

  it("adhesion posee par un autre acteur que celui de l'invitation", async () => {
    seedUser();
    seedMembership({ invitedBy: TENANT_ADMIN_INVITER });
    seedInvitation();
    await expectRequiresLogin();
  });

  it("invitation posee par un administrateur d'agence (pas super-admin) sur un compte non active", async () => {
    seedUser();
    seedMembership({ invitedBy: TENANT_ADMIN_INVITER });
    seedInvitation({ invitedBy: TENANT_ADMIN_INVITER });
    await expectRequiresLogin();
  });

  it('compte ayant une adhesion ACTIVE dans une autre agence', async () => {
    seedUser();
    seedMembership();
    seedMembership({ tenantId: TENANT_B, status: MembershipStatus.ACTIVE });
    seedInvitation();
    await expectRequiresLogin();
  });

  it("jeton d'une autre agence : pas d'adhesion PENDING_INVITE dans l'agence de l'invitation", async () => {
    seedUser();
    seedMembership({ tenantId: TENANT_B });
    seedInvitation();
    await expectRequiresLogin();
  });

  it('acteur inactif : refus', async () => {
    seedUser();
    seedMembership();
    seedInvitation();
    mockPrisma.user.rows.find((r: any) => r.id === SUPER)!.isActive = false;
    await expectRequiresLogin();
  });
});
