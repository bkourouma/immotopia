import { isLanguage } from '../../../i18n';
import { prisma, type PrismaTransactionClient } from '../../../utils/database';
import { resolveWhatsappQuotaPolicy } from '../quota';
import type { ChefAccess, ChefAccessDeniedReason, ChefLanguage } from '../types';

/**
 * Contrôle d'accès d'un chef de chantier, relu EN BASE à chaque message et
 * avant chaque écriture d'inventaire (lot 041, spec W3-R10, W12).
 *
 * Jamais le cache des permissions (`getUserPermissions`, `hasPermission`) : un
 * rôle retiré, une adhésion désactivée ou une agence suspendue se voient au
 * message suivant, sans attendre l'expiration d'un cache (W3, critère 8).
 *
 * Ordre (refus au premier échec) : agence non suspendue ; adhésion `ACTIVE` ;
 * `User.isActive` ; rôle `TENANT_SITE_MANAGER` détenu dans l'agence ET
 * portant `STOCK_COUNT` ; inscription `ACTIVE` ; droits d'abonnement (W11-R4).
 */

export const SITE_MANAGER_ROLE_KEY = 'TENANT_SITE_MANAGER';
export const STOCK_COUNT_PERMISSION_KEY = 'STOCK_COUNT';

type Db = PrismaTransactionClient | typeof prisma;

export type MemberAccess =
  | { ok: true; language: ChefLanguage }
  | { ok: false; reason: Exclude<ChefAccessDeniedReason, 'REGISTRATION_NOT_ACTIVE' | 'OPTION_MISSING'> };

/** Langue du chef : `User.preferredLanguage`, français s'il est nul ou inconnu (spec §8.5). */
export function chefLanguage(preferredLanguage: string | null | undefined): ChefLanguage {
  return isLanguage(preferredLanguage) ? preferredLanguage : 'fr';
}

/** Vrai si l'utilisateur détient, DANS cette agence, le rôle Chef de chantier portant `STOCK_COUNT`. */
export async function holdsSiteManagerRole(db: Db, tenantId: string, userId: string): Promise<boolean> {
  const held = await db.userRole.findFirst({
    where: {
      tenantId,
      userId,
      role: {
        key: SITE_MANAGER_ROLE_KEY,
        permissions: { some: { permission: { key: STOCK_COUNT_PERMISSION_KEY } } }
      }
    },
    select: { id: true }
  });
  return held !== null;
}

/** Les quatre premiers contrôles de W3-R10 (agence, adhésion, compte, rôle). */
export async function evaluateMemberAccess(db: Db, tenantId: string, userId: string): Promise<MemberAccess> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { status: true } });
  if (!tenant || tenant.status === 'SUSPENDED') return { ok: false, reason: 'TENANT_SUSPENDED' };

  // `findFirst` sur `tenantId` en clair : la garde tenant ne reconnaît pas la
  // clé composée `userId_tenantId` sous contexte d'agence.
  const membership = await db.membership.findFirst({
    where: { tenantId, userId },
    select: { status: true }
  });
  if (!membership || membership.status !== 'ACTIVE') return { ok: false, reason: 'MEMBERSHIP_NOT_ACTIVE' };

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isActive: true, preferredLanguage: true }
  });
  if (!user || !user.isActive) return { ok: false, reason: 'USER_INACTIVE' };

  if (!(await holdsSiteManagerRole(db, tenantId, userId))) return { ok: false, reason: 'ROLE_MISSING' };

  return { ok: true, language: chefLanguage(user.preferredLanguage) };
}

/**
 * Accès complet d'une inscription (contrat plan §3.3). `options.db` : client
 * de transaction, pour la relecture sous verrou avant une écriture (W12-R2).
 */
export async function resolveChefAccess(
  registrationId: string,
  options: { db?: Db; now?: Date; tenantId?: string } = {}
): Promise<ChefAccess> {
  const db = options.db ?? prisma;
  // Lecture transverse assumée hors contexte : l'agence se déduit de
  // l'inscription (spec §8.2). Sous contexte d'agence, `tenantId` la borne.
  const registration = await db.stockWhatsappRegistration.findFirst({
    where: { id: registrationId, ...(options.tenantId ? { tenantId: options.tenantId } : {}) },
    select: { id: true, tenantId: true, userId: true, status: true }
  });
  if (!registration) return { ok: false, reason: 'REGISTRATION_NOT_ACTIVE' };

  const member = await evaluateMemberAccess(db, registration.tenantId, registration.userId);
  if (!member.ok) return member;
  if (registration.status !== 'ACTIVE') return { ok: false, reason: 'REGISTRATION_NOT_ACTIVE' };

  const policy = await resolveWhatsappQuotaPolicy(registration.tenantId, options.now);
  if (!policy.ok) return { ok: false, reason: 'OPTION_MISSING' };

  return {
    ok: true,
    tenantId: registration.tenantId,
    userId: registration.userId,
    registrationId: registration.id,
    language: member.language,
    quota: { limit: policy.limit, source: policy.source }
  };
}
