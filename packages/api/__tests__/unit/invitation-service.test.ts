/**
 * Correctif securite (invitations) :
 *
 * 1. IDOR entre agences sur `resendInvitation`/`revokeInvitation` — un
 *    administrateur de l'agence A ne doit jamais pouvoir agir sur une
 *    invitation de l'agence B (404, comme si elle n'existait pas).
 * 2. Prise de compte a l'acceptation : un compte EXISTANT ne doit jamais
 *    voir son mot de passe reecrit par le seul jeton d'invitation ; seule
 *    une session authentifiee de CE compte peut rattacher l'agence.
 * 3. Un administrateur d'agence ne peut pas inviter un compte super-admin
 *    de la plateforme.
 *
 * Modele de mock : `utils/database` remplace par le faux Prisma en memoire
 * (`__tests__/helpers/fake-prisma.ts`), qui applique vraiment les filtres
 * `where` — condition necessaire pour qu'un test d'IDOR prouve quelque
 * chose. `email-service` et `audit-service` sont simules pour eviter tout
 * effet de bord (envoi reel, file d'audit).
 */

import crypto from 'crypto';
import { InvitationStatus, MembershipStatus } from '@prisma/client';
import { createFakePrisma } from '../helpers/fake-prisma';

/** Jeton en clair utilise par les tests d'acceptation, et son hash associe. */
const PLAIN_TOKEN = 'peu-importe';
const TOKEN_HASH = crypto.createHash('sha256').update(PLAIN_TOKEN).digest('hex');

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

const sendInviteEmail = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendInviteEmail: (...args: any[]) => sendInviteEmail(...args) }
}));

jest.mock('../../src/services/audit-service', () => {
  const actual = jest.requireActual('../../src/services/audit-service');
  return { ...actual, logAuditEvent: jest.fn() };
});

import {
  inviteCollaborator,
  acceptInvitation,
  resendInvitation,
  revokeInvitation
} from '../../src/services/invitation-service';
import { hashPassword } from '../../src/utils/password-utils';

const TENANT_A = 'a0000000-0000-0000-0000-00000000000a';
const TENANT_B = 'b0000000-0000-0000-0000-00000000000b';

function seedTenant(id: string, overrides: Record<string, unknown> = {}) {
  mockPrisma.tenant.rows.push({
    id,
    name: `Agence ${id}`,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  });
}

interface TestInvitation {
  id: string;
  tenantId: string;
  email: string;
  tokenHash: string;
  status: InvitationStatus;
  [key: string]: unknown;
}

function seedInvitation(overrides: Record<string, unknown> = {}): TestInvitation {
  const id = (overrides.id as string) ?? `inv-${mockPrisma.invitation.rows.length + 1}`;
  const tenantId = (overrides.tenantId as string) ?? TENANT_A;
  const row: TestInvitation = {
    id,
    tenantId,
    email: 'invite@example.com',
    tokenHash: (overrides.tokenHash as string) ?? TOKEN_HASH,
    status: InvitationStatus.PENDING,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    roleIds: [] as string[],
    invitedBy: 'inviter-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    acceptedAt: null,
    acceptedBy: null,
    revokedAt: null,
    // Stocke directement le tenant imbrique : le faux Prisma ne fait pas de
    // vraie jointure, `include: { tenant: true }` renvoie ce qui est deja
    // sur la ligne (voir fake-prisma.ts, `project`).
    tenant: { id: tenantId, name: `Agence ${tenantId}` },
    ...overrides
  };
  mockPrisma.invitation.rows.push(row);
  return row;
}

beforeEach(() => {
  mockPrisma.reset();
  sendInviteEmail.mockClear();
  seedTenant(TENANT_A);
  seedTenant(TENANT_B);
});

describe('IDOR entre agences — resendInvitation / revokeInvitation', () => {
  it('resendInvitation : une invitation de agence B est introuvable pour agence A (404)', async () => {
    const invitation = seedInvitation({ tenantId: TENANT_B });

    await expect(resendInvitation(invitation.id, TENANT_A, 'actor-1')).rejects.toMatchObject({
      statusCode: 404
    });

    // Rien n'a ete modifie : ni le jeton, ni l'expiration.
    const stored = mockPrisma.invitation.rows.find((row: any) => row.id === invitation.id)!;
    expect(stored.tokenHash).toBe(invitation.tokenHash);
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it('revokeInvitation : une invitation de agence B est introuvable pour agence A (404)', async () => {
    const invitation = seedInvitation({ tenantId: TENANT_B });

    await expect(revokeInvitation(invitation.id, TENANT_A, 'actor-1')).rejects.toMatchObject({
      statusCode: 404
    });

    const stored = mockPrisma.invitation.rows.find((row: any) => row.id === invitation.id)!;
    expect(stored.status).toBe(InvitationStatus.PENDING);
  });

  it('resendInvitation : fonctionne normalement pour la BONNE agence', async () => {
    const invitation = seedInvitation({ tenantId: TENANT_A });
    // Capture AVANT l'appel : `invitation` et la ligne stockee sont le meme
    // objet (le faux Prisma mute en place), comparer apres coup comparerait
    // la ligne mutee a elle-meme.
    const originalTokenHash = invitation.tokenHash;

    const result = await resendInvitation(invitation.id, TENANT_A, 'actor-1');

    expect(result.acceptUrl).toContain('/auth/accept-invite?token=');
    expect(sendInviteEmail).toHaveBeenCalledTimes(1);
    const stored = mockPrisma.invitation.rows.find((row: any) => row.id === invitation.id)!;
    expect(stored.tokenHash).not.toBe(originalTokenHash);
  });

  it('revokeInvitation : fonctionne normalement pour la BONNE agence', async () => {
    const invitation = seedInvitation({ tenantId: TENANT_A });

    await revokeInvitation(invitation.id, TENANT_A, 'actor-1');

    const stored = mockPrisma.invitation.rows.find((row: any) => row.id === invitation.id)!;
    expect(stored.status).toBe(InvitationStatus.REVOKED);
  });
});

describe('inviteCollaborator — super-admin non invitable', () => {
  it('refuse une invitation vers un compte super-admin, avec un message neutre', async () => {
    mockPrisma.user.rows.push({
      id: 'super-1',
      email: 'super@example.com',
      globalRole: 'SUPER_ADMIN',
      passwordHash: 'hash',
      isActive: true
    });

    await expect(
      inviteCollaborator({
        email: 'super@example.com',
        tenantId: TENANT_A,
        roleIds: [],
        invitedByUserId: 'admin-1'
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    // Aucune invitation ne doit avoir ete creee.
    expect(mockPrisma.invitation.rows).toHaveLength(0);
  });

  it('accepte une invitation vers un compte USER ordinaire', async () => {
    mockPrisma.user.rows.push({
      id: 'user-1',
      email: 'collab@example.com',
      globalRole: 'USER',
      passwordHash: 'hash',
      isActive: true
    });

    const result = await inviteCollaborator({
      email: 'collab@example.com',
      tenantId: TENANT_A,
      roleIds: [],
      invitedByUserId: 'admin-1'
    });

    expect(result.invitation.email).toBe('collab@example.com');
    expect(mockPrisma.invitation.rows).toHaveLength(1);
  });
});

describe('acceptInvitation — jamais de reecriture de mot de passe sur un compte existant', () => {
  it("refuse l'acceptation sans session du compte existant (INVITATION_REQUIRES_LOGIN)", async () => {
    const originalHash = await hashPassword('MotDePasseInitial#1');
    mockPrisma.user.rows.push({
      id: 'existing-1',
      email: 'existant@example.com',
      passwordHash: originalHash,
      fullName: 'Compte Existant',
      isActive: true,
      emailVerified: true
    });
    const invitation = seedInvitation({ email: 'existant@example.com', tenantId: TENANT_A });

    await expect(acceptInvitation({ token: 'peu-importe', password: 'AutreMotDePasse#2' })).rejects.toMatchObject({
      statusCode: 403,
      code: 'INVITATION_REQUIRES_LOGIN'
    });

    // Le mot de passe n'a pas bouge, et l'invitation reste en attente.
    const storedUser = mockPrisma.user.rows.find((row: any) => row.id === 'existing-1')!;
    expect(storedUser.passwordHash).toBe(originalHash);
    const storedInvitation = mockPrisma.invitation.rows.find((row: any) => row.id === invitation.id)!;
    expect(storedInvitation.status).toBe(InvitationStatus.PENDING);
  });

  it("accepte sans mot de passe quand l'appelant EST le compte existant, et ne touche pas au mot de passe", async () => {
    const originalHash = await hashPassword('MotDePasseInitial#1');
    mockPrisma.user.rows.push({
      id: 'existing-2',
      email: 'existant2@example.com',
      passwordHash: originalHash,
      fullName: 'Compte Existant',
      isActive: true,
      emailVerified: true
    });
    mockPrisma.role.rows.push({ id: 'role-1', key: 'TENANT_AGENT', name: 'Agent', scope: 'TENANT' });
    const invitation = seedInvitation({
      email: 'existant2@example.com',
      tenantId: TENANT_A,
      roleIds: ['role-1']
    });

    const result = await acceptInvitation({
      token: 'peu-importe',
      requestingUserId: 'existing-2'
    });

    expect(result.user.id).toBe('existing-2');
    const storedUser = mockPrisma.user.rows.find((row: any) => row.id === 'existing-2')!;
    // Mot de passe INCHANGE.
    expect(storedUser.passwordHash).toBe(originalHash);
    const membership = mockPrisma.membership.rows.find(
      (row: any) => row.userId === 'existing-2' && row.tenantId === TENANT_A
    );
    expect(membership?.status).toBe(MembershipStatus.ACTIVE);
    const storedInvitation = mockPrisma.invitation.rows.find((row: any) => row.id === invitation.id)!;
    expect(storedInvitation.status).toBe(InvitationStatus.ACCEPTED);
    const roleAssignment = mockPrisma.userRole.rows.find(
      (row: any) => row.userId === 'existing-2' && row.roleId === 'role-1'
    );
    expect(roleAssignment).toBeDefined();
  });

  it("cree un nouveau compte avec le mot de passe fourni quand aucun compte n'existe", async () => {
    seedInvitation({ email: 'nouveau@example.com', tenantId: TENANT_A });

    const result = await acceptInvitation({
      token: 'peu-importe',
      password: 'MotDePasseValide#1',
      fullName: 'Nouveau Membre'
    });

    expect(result.user.email).toBe('nouveau@example.com');
    const createdUser = mockPrisma.user.rows.find((row: any) => row.email === 'nouveau@example.com')!;
    expect(createdUser).toBeDefined();
    expect(createdUser.passwordHash).not.toBe('MotDePasseValide#1');
  });

  it("refuse la creation d'un nouveau compte sans mot de passe", async () => {
    seedInvitation({ email: 'sanspass@example.com', tenantId: TENANT_A });

    await expect(acceptInvitation({ token: 'peu-importe' })).rejects.toMatchObject({ statusCode: 400 });
  });
});
