/**
 * Équipe de l'agence « 3 ans » : membres actifs, un suspendu, un ancien membre
 * retiré, invitations (acceptées, en attente, expirées, révoquées) et menus
 * coupés par rôle.
 *
 * Mécanique reprise de `seed-pack-test-tenants.ts` (`seedMember`) : utilisateur,
 * membership, rôle d'agence réel de la table `roles`, mot de passe de test
 * PUBLIC (`PACK_TEST_PASSWORD`, importé), hash par le service existant. Les
 * e-mails sont en `@packs.immotopia.test` (domaine `.test`, jamais routé).
 *
 * Idempotent par bloc : un membre dont l'e-mail est déjà rattaché à l'agence est
 * sauté ; les invitations et les menus ne sont écrits qu'une fois.
 */
import { createHash } from 'crypto';
import { GlobalRole, InvitationStatus, MembershipStatus } from '@prisma/client';

import { hashPassword } from '../../../src/utils/password-utils';
import { PACK_TEST_EMAIL_DOMAIN, PACK_TEST_PASSWORD } from '../pack-test-tenants';
import { between } from './types';
import type { HistoryContext } from './types';
import {
  INVITEES,
  MENU_CUTS,
  TEAM_ROSTERS,
  avatarDataUri,
  daysAfter,
  daysBefore,
  emailLocalPart,
  monthDate
} from './equipe-plateforme-data';
import type { TeamRoleKey } from './equipe-plateforme-data';

const INVITATION_VALIDITY_DAYS = 7;

let cachedHash: string | null = null;
async function testPasswordHash(): Promise<string> {
  if (!cachedHash) cachedHash = await hashPassword(PACK_TEST_PASSWORD);
  return cachedHash;
}

function tokenHashOf(tenantId: string, email: string, state: string): string {
  return createHash('sha256').update(`seed-invitation:${tenantId}:${email}:${state}`).digest('hex');
}

/** Code du pack souscrit par l'agence (ex. `AGENCE`, `INTEGRE`), ou `null`. */
export async function detectPack(ctx: HistoryContext): Promise<string | null> {
  const item = await ctx.prisma.subscriptionItem.findFirst({
    where: { tenantId: ctx.tenantId, catalogItem: { kind: 'PACK' } },
    orderBy: { startsAt: 'asc' },
    select: { catalogItem: { select: { code: true } } }
  });
  return item?.catalogItem.code ?? null;
}

async function roleIdsByKey(ctx: HistoryContext): Promise<Map<string, string>> {
  const roles = await ctx.prisma.role.findMany({ where: { scope: 'TENANT' }, select: { id: true, key: true } });
  return new Map(roles.map(r => [r.key, r.id]));
}

/** Rattache l'administrateur au début de l'histoire (compte « de la première heure »). */
async function backdateAdmin(ctx: HistoryContext, roleIds: Map<string, string>): Promise<void> {
  const { prisma, tenantId, adminUserId, start, end } = ctx;
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { createdAt: true, lastLoginAt: true, avatarUrl: true, fullName: true }
  });
  if (!admin) return;
  const founded = monthDate(start, 0, 5, 8);
  if (admin.createdAt.getTime() > daysAfter(start, 40).getTime()) {
    await prisma.user.update({ where: { id: adminUserId }, data: { createdAt: founded } });
    await prisma.membership.updateMany({
      where: { tenantId, userId: adminUserId },
      data: { createdAt: founded, invitedAt: founded, acceptedAt: daysAfter(founded, 1) }
    });
    await prisma.invitation.updateMany({
      where: { tenantId, acceptedBy: adminUserId },
      data: {
        createdAt: founded,
        expiresAt: daysAfter(founded, INVITATION_VALIDITY_DAYS),
        acceptedAt: daysAfter(founded, 1)
      }
    });
    void roleIds;
  }
  const updates: { lastLoginAt?: Date; avatarUrl?: string } = {};
  if (!admin.lastLoginAt) updates.lastLoginAt = daysBefore(end, 0);
  if (!admin.avatarUrl && admin.fullName) updates.avatarUrl = avatarDataUri(admin.fullName, 0);
  if (Object.keys(updates).length > 0) await prisma.user.update({ where: { id: adminUserId }, data: updates });
}

export interface TeamResult {
  created: number;
  skipped: number;
}

export async function seedTeam(ctx: HistoryContext, packCode: string): Promise<TeamResult> {
  const { prisma, tenantId, adminUserId, rng, start, end, log } = ctx;
  const result: TeamResult = { created: 0, skipped: 0 };
  const roster = TEAM_ROSTERS[packCode];
  if (!roster) {
    log(`équipe : pack ${packCode} sans effectif défini, ignoré.`);
    return result;
  }
  const roleIds = await roleIdsByKey(ctx);
  const passwordHash = await testPasswordHash();
  await backdateAdmin(ctx, roleIds);

  const invitedBy = adminUserId;

  for (const [index, member] of roster.entries()) {
    const email = `${emailLocalPart(member.fullName)}@${PACK_TEST_EMAIL_DOMAIN}`;
    const roleId = roleIds.get(member.roleKey);
    if (!roleId) throw new Error(`Rôle ${member.roleKey} introuvable : vérifiez le seed des rôles.`);

    // eslint-disable-next-line no-await-in-loop -- quelques membres par agence.
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, memberships: { where: { tenantId }, select: { id: true } } }
    });
    if (existing) {
      if (existing.memberships.length === 0) log(`équipe : ${email} existe dans une autre agence, ignoré.`);
      result.skipped += 1;
      continue;
    }

    const joinedAt = monthDate(start, member.joinMonth, between(rng, 3, 25), between(rng, 8, 11));
    const invitedAt = daysBefore(joinedAt, between(rng, 1, 3));
    const lastLogin = new Date(
      daysBefore(end, member.lastLoginDaysAgo).getTime() - between(rng, 0, 9) * 3_600_000 - between(rng, 0, 59) * 60_000
    );
    const removed = member.kind === 'removed';
    const suspended = member.kind === 'suspended';
    // Le départ d'un ancien membre : environ 14 mois avant maintenant ; la suspension : il y a quelques semaines.
    const endedAt = removed
      ? daysBefore(lastLogin, -between(rng, 1, 6))
      : suspended
        ? daysBefore(end, between(rng, 14, 30))
        : null;

    // eslint-disable-next-line no-await-in-loop -- quelques membres par agence.
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: member.fullName,
        avatarUrl: member.avatar ? avatarDataUri(member.fullName, index + 1) : null,
        globalRole: GlobalRole.USER,
        emailVerified: true,
        isActive: !removed,
        preferredLanguage: 'fr',
        lastLoginAt: lastLogin,
        createdAt: invitedAt
      },
      select: { id: true }
    });
    // eslint-disable-next-line no-await-in-loop -- quelques membres par agence.
    await prisma.membership.create({
      data: {
        userId: user.id,
        tenantId,
        status: removed || suspended ? MembershipStatus.DISABLED : MembershipStatus.ACTIVE,
        invitedAt,
        invitedBy,
        acceptedAt: joinedAt,
        createdAt: invitedAt,
        updatedAt: endedAt ?? joinedAt
      }
    });
    if (!removed) {
      // eslint-disable-next-line no-await-in-loop -- quelques membres par agence.
      await prisma.userRole.create({ data: { userId: user.id, roleId, tenantId, createdAt: joinedAt } });
    }
    // eslint-disable-next-line no-await-in-loop -- quelques membres par agence.
    await prisma.invitation.create({
      data: {
        tenantId,
        email,
        tokenHash: tokenHashOf(tenantId, email, 'ACCEPTED'),
        expiresAt: daysAfter(invitedAt, INVITATION_VALIDITY_DAYS),
        status: InvitationStatus.ACCEPTED,
        roleIds: [roleId],
        invitedBy,
        acceptedBy: user.id,
        acceptedAt: joinedAt,
        createdAt: invitedAt,
        updatedAt: joinedAt
      }
    });
    result.created += 1;
  }

  await seedInvitees(ctx, packCode, roleIds);
  await seedMenuAccess(
    ctx,
    roster.map(m => m.roleKey)
  );
  log(`équipe : ${result.created} membre(s) créé(s), ${result.skipped} déjà présent(s).`);
  return result;
}

/** Invitations en attente, expirées ou révoquées : une seule fois par agence. */
async function seedInvitees(ctx: HistoryContext, packCode: string, roleIds: Map<string, string>): Promise<void> {
  const { prisma, tenantId, adminUserId, end, rng } = ctx;
  const invitees = INVITEES[packCode] ?? [];
  const already = await prisma.invitation.count({
    where: { tenantId, status: { in: [InvitationStatus.PENDING, InvitationStatus.EXPIRED, InvitationStatus.REVOKED] } }
  });
  if (already > 0 || invitees.length === 0) return;

  const passwordless = { passwordHash: null as string | null };
  for (const invitee of invitees) {
    const email = `${emailLocalPart(invitee.fullName)}@${PACK_TEST_EMAIL_DOMAIN}`;
    const roleId = roleIds.get(invitee.roleKey as TeamRoleKey);
    if (!roleId) continue;
    const sentAt = new Date(daysBefore(end, invitee.sentDaysAgo).getTime() - between(rng, 0, 8) * 3_600_000);
    const expiresAt = daysAfter(sentAt, INVITATION_VALIDITY_DAYS);
    const status =
      invitee.state === 'expired'
        ? InvitationStatus.EXPIRED
        : invitee.state === 'revoked'
          ? InvitationStatus.REVOKED
          : InvitationStatus.PENDING;

    // eslint-disable-next-line no-await-in-loop -- quelques invitations par agence.
    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true }
    });
    if (invitee.state === 'pending-with-account' && !existingUser) {
      // Compte créé par l'invitation (jamais activé) : visible « en attente » dans la liste des collaborateurs.
      // eslint-disable-next-line no-await-in-loop -- quelques invitations par agence.
      const user = await prisma.user.create({
        data: {
          email,
          ...passwordless,
          fullName: invitee.fullName,
          globalRole: GlobalRole.USER,
          emailVerified: false,
          isActive: true,
          preferredLanguage: 'fr',
          createdAt: sentAt
        },
        select: { id: true }
      });
      // eslint-disable-next-line no-await-in-loop -- quelques invitations par agence.
      await prisma.membership.create({
        data: {
          userId: user.id,
          tenantId,
          status: MembershipStatus.PENDING_INVITE,
          invitedAt: sentAt,
          invitedBy: adminUserId,
          createdAt: sentAt,
          updatedAt: sentAt
        }
      });
    }

    // eslint-disable-next-line no-await-in-loop -- quelques invitations par agence.
    await prisma.invitation.create({
      data: {
        tenantId,
        email,
        tokenHash: tokenHashOf(tenantId, email, invitee.state),
        expiresAt,
        status,
        roleIds: [roleId],
        invitedBy: adminUserId,
        revokedAt: invitee.state === 'revoked' ? daysAfter(sentAt, between(rng, 1, 3)) : null,
        createdAt: sentAt,
        updatedAt: invitee.state === 'revoked' ? daysAfter(sentAt, 2) : sentAt
      }
    });
  }
}

/** Menus coupés par rôle : le rôle limité (agents, comptable, magasinier, chef de chantier) ne voit pas tout. */
async function seedMenuAccess(ctx: HistoryContext, rolesInTeam: readonly TeamRoleKey[]): Promise<void> {
  const { prisma, tenantId } = ctx;
  const already = await prisma.roleMenuAccess.count({ where: { tenantId } });
  if (already > 0) return;
  const rows: Array<{ tenantId: string; roleKey: string; menuKey: string; enabled: boolean }> = [];
  for (const roleKey of new Set(rolesInTeam)) {
    for (const menuKey of MENU_CUTS[roleKey] ?? []) rows.push({ tenantId, roleKey, menuKey, enabled: false });
  }
  if (rows.length > 0) await prisma.roleMenuAccess.createMany({ data: rows, skipDuplicates: true });
}
