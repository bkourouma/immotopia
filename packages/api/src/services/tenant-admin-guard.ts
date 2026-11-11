import { prisma, PrismaTransactionClient } from '../utils/database';
import { MembershipStatus } from '@prisma/client';
import { ForbiddenError } from '../middleware/error-middleware';
import { t } from '../i18n';

/** Rôle d'administrateur d'agence (voir `types/rbac-types.ts`). */
export const TENANT_ADMIN_ROLE_KEY = 'TENANT_ADMIN';

type UserRoleCounter = Pick<PrismaTransactionClient, 'userRole'>;

/**
 * Le compte porte-t-il le rôle d'administrateur dans cette agence (quel que
 * soit le statut de son appartenance) ? Sert à PROTÉGER une cible : un
 * administrateur désactivé reste un compte qu'un gestionnaire ne touche pas.
 * `client` : client de transaction quand la vérification est rejouée sous verrou.
 */
export async function isTenantAdmin(
  userId: string,
  tenantId: string,
  client: UserRoleCounter = prisma
): Promise<boolean> {
  const count = await client.userRole.count({
    where: { userId, tenantId, role: { key: TENANT_ADMIN_ROLE_KEY } }
  });
  return count > 0;
}

/**
 * L'ACTEUR est-il administrateur ACTIF de l'agence : rôle d'administrateur,
 * appartenance ACTIVE dans cette agence et compte actif ? Un administrateur
 * désactivé (même resté client de l'agence) n'exerce plus ce pouvoir.
 */
export async function isActiveTenantAdmin(
  userId: string,
  tenantId: string,
  client: UserRoleCounter = prisma
): Promise<boolean> {
  const count = await client.userRole.count({
    where: {
      userId,
      tenantId,
      role: { key: TENANT_ADMIN_ROLE_KEY },
      user: { isActive: true, memberships: { some: { tenantId, status: MembershipStatus.ACTIVE } } }
    }
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
 * absent : non. L'administrateur doit être ACTIF dans l'agence (appartenance
 * ACTIVE, compte actif) : un administrateur désactivé ne se réactive pas et ne
 * rétrograde personne.
 */
export async function actorMayTouchAdmin(actorUserId: string | undefined, tenantId: string): Promise<boolean> {
  if (!actorUserId) return false;
  if (await isSuperAdminUser(actorUserId)) return true;
  return isActiveTenantAdmin(actorUserId, tenantId);
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
 * Compte « partagé ou de portée plateforme » : le mot de passe est GLOBAL (sans
 * agence), l'imposer ou l'écraser depuis une agence toucherait les autres
 * agences du compte ou un super-admin. Ce prédicat ne sert QU'À refuser
 * d'imposer ou d'écraser un mot de passe (`resetMemberPassword`, qui envoie
 * alors seulement un lien de réinitialisation). Il ne protège PAS les sessions :
 * le titulaire d'une session volée pourrait se fabriquer une appartenance
 * ailleurs (espace personnel, profil client posé par une autre agence) pour
 * échapper à une révocation ; une déconnexion forcée est sans danger pour les
 * autres agences, elle est donc toujours faite (sauf super-admin).
 * Critères : super-admin, appartenance (même non active : invitation,
 * désactivée) à une autre agence, rôle de portée plateforme ou d'une autre
 * agence, profil client dans une autre agence.
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
