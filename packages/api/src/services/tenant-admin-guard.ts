import { prisma, PrismaTransactionClient } from '../utils/database';
import { ForbiddenError } from '../middleware/error-middleware';
import { t } from '../i18n';

/** Rôle d'administrateur d'agence (voir `types/rbac-types.ts`). */
export const TENANT_ADMIN_ROLE_KEY = 'TENANT_ADMIN';

/** Le compte porte-t-il le rôle d'administrateur dans cette agence ? */
export async function isTenantAdmin(userId: string, tenantId: string): Promise<boolean> {
  const count = await prisma.userRole.count({
    where: { userId, tenantId, role: { key: TENANT_ADMIN_ROLE_KEY } }
  });
  return count > 0;
}

/** L'acteur est-il super-admin de la plateforme (rôle global) ? Acteur absent : non. */
export async function isSuperAdminUser(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { globalRole: true } });
  return user?.globalRole === 'SUPER_ADMIN';
}

/**
 * L'acteur peut-il toucher un compte administrateur (ou attribuer le rôle) ?
 * Seuls le super-admin (rôle global) et un administrateur de la MÊME agence le
 * peuvent ; un gestionnaire (USERS_EDIT / USERS_CREATE) ne le peut pas. Acteur
 * absent : non.
 */
export async function actorMayTouchAdmin(actorUserId: string | undefined, tenantId: string): Promise<boolean> {
  if (!actorUserId) return false;
  if (await isSuperAdminUser(actorUserId)) return true;
  return isTenantAdmin(actorUserId, tenantId);
}

export async function assertActorMayTouchAdmin(actorUserId: string | undefined, tenantId: string): Promise<void> {
  if (!(await actorMayTouchAdmin(actorUserId, tenantId))) {
    throw new ForbiddenError(
      t(
        "Seul un administrateur de l'agence peut attribuer ou retirer ce rôle, ou modifier le compte d'un administrateur."
      )
    );
  }
}

/** Seul un super-admin agit sur un compte super-admin (rôle global, portée plateforme). */
export async function assertActorMayTouchSuperAdmin(
  targetGlobalRole: string | null | undefined,
  actorUserId: string | undefined
): Promise<void> {
  if (targetGlobalRole !== 'SUPER_ADMIN') return;
  if (await isSuperAdminUser(actorUserId)) return;
  throw new ForbiddenError(t("Seul un super-administrateur peut agir sur le compte d'un super-administrateur."));
}

/**
 * Compte « partagé ou de portée plateforme » : un mot de passe et des refresh
 * tokens sont GLOBAUX (sans agence), les écraser ou les révoquer depuis une
 * agence toucherait les autres agences du compte ou un super-admin.
 * Critères (UN SEUL prédicat, partagé par `resetMemberPassword` et la
 * révocation de sessions) : super-admin, appartenance (même non active :
 * invitation, désactivée) à une autre agence, rôle de portée plateforme ou
 * d'une autre agence, profil client dans une autre agence.
 */
export async function isSharedOrPlatformAccount(
  client: Pick<PrismaTransactionClient, 'user' | 'membership' | 'userRole' | 'tenantClient'>,
  userId: string,
  tenantId: string,
  /** Rôle global déjà lu par l'appelant : évite une relecture. */
  knownGlobalRole?: string | null
): Promise<boolean> {
  const globalRole =
    knownGlobalRole ??
    (await client.user.findUnique({ where: { id: userId }, select: { globalRole: true } }))?.globalRole;
  if (globalRole === 'SUPER_ADMIN') return true;
  const [otherMemberships, foreignRoles, foreignClients] = await Promise.all([
    client.membership.count({ where: { userId, tenantId: { not: tenantId } } }),
    client.userRole.count({
      where: { userId, OR: [{ tenantId: null }, { tenantId: { not: tenantId } }] }
    }),
    client.tenantClient.count({ where: { userId, tenantId: { not: tenantId } } })
  ]);
  return otherMemberships > 0 || foreignRoles > 0 || foreignClients > 0;
}
