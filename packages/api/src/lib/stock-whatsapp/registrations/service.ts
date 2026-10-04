import crypto, { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { env } from '../../../config/env';
import { AppError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { logAuditEvent, recordAuditEvent, AuditActionKey } from '../../../services/audit-service';
import { prisma, type PrismaTransactionClient } from '../../../utils/database';
import { assertBelongsToTenant } from '../../../utils/tenant-ownership';
import { maskPhone, normalizePhoneE164 } from '../../phone/e164';
import { resolveWhatsappQuotaPolicy } from '../quota';
import { abandonPendingCapture, closeSessionRow, findOpenSession, withRegistrationLock } from '../engine/states';
import { SITE_ELIGIBILITY_SELECT, toSiteRef, type SiteEligibilityRow, type SiteRef } from '../engine/site-choice';
import { evaluateMemberAccess, SITE_MANAGER_ROLE_KEY } from './access';
import { ACTIVATION_MAX_ATTEMPTS, ACTIVATION_VALIDITY_MS, activationCodeHash } from './activation';

/**
 * Inscriptions des chefs de chantier à l'inventaire par WhatsApp (lot 041,
 * spec W3 ; contrat plan §3.3, signatures `(tenantId, actorUserId, input)`).
 *
 * - Éligibilité d'un membre lue EN BASE (adhésion `ACTIVE`, compte actif, rôle
 *   `TENANT_SITE_MANAGER` dans l'agence), jamais dans le cache des droits ; un
 *   utilisateur d'une autre agence lève la même erreur qu'un membre inéligible.
 * - Un numéro n'a qu'une inscription non révoquée SUR TOUTE LA PLATEFORME
 *   (index unique partiel) ; le refus ne dit jamais qu'une autre agence
 *   l'utilise.
 * - Chaque chantier passe par `assertBelongsToTenant` (même 404 qu'un chantier
 *   inexistant), puis par son éligibilité (409, `data.siteIds`).
 * - Le code d'activation (6 chiffres, `crypto.randomInt`) n'est rendu qu'UNE
 *   fois, à la création et à la régénération ; seule son empreinte est stockée.
 *
 * Les droits de la route (`FINANCE_SETTINGS_MANAGE`, `requireTenantAccess`)
 * sont posés par le routeur (W4).
 */

export const MAX_SITES_PER_REGISTRATION = 10;
const REVOKE_REASON_MAX = 500;
const PHONE_UNAVAILABLE_MESSAGE = 'Ce numéro ne peut pas être inscrit.';

type RegistrationStatusValue = 'PENDING_ACTIVATION' | 'ACTIVE' | 'REVOKED';

/** Contrat `RegistrationView`. */
export type RegistrationView = {
  id: string;
  userId: string;
  userLabel: string;
  phoneE164: string;
  phoneMasked: string;
  status: RegistrationStatusValue;
  activationExpiresAt: Date | null;
  activationAttemptsLeft: number | null;
  activatedAt: Date | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  lastInboundAt: Date | null;
  access: {
    ok: boolean;
    reason: 'TENANT_SUSPENDED' | 'MEMBERSHIP_NOT_ACTIVE' | 'USER_INACTIVE' | 'ROLE_MISSING' | 'OPTION_MISSING' | null;
  };
  sites: SiteRef[];
  openSessionId: string | null;
  createdAt: Date;
};

/** Contrat `RegistrationWithCode`. */
export type RegistrationWithCode = RegistrationView & { activationCode: string; botNumber: string | null };

export type EligibleMember = { userId: string; label: string; registered: boolean };

const VIEW_SELECT = {
  id: true,
  tenantId: true,
  userId: true,
  phoneE164: true,
  status: true,
  activationExpiresAt: true,
  activationAttempts: true,
  activatedAt: true,
  revokedAt: true,
  revokeReason: true,
  lastInboundAt: true,
  createdAt: true,
  user: { select: { fullName: true, email: true } },
  sites: { select: { site: { select: SITE_ELIGIBILITY_SELECT } } },
  sessions: { where: { closedAt: null }, select: { id: true }, take: 1 }
} as const;

type ViewRow = Prisma.StockWhatsappRegistrationGetPayload<{ select: typeof VIEW_SELECT }>;

function userLabel(user: { fullName: string | null; email: string } | null): string {
  return user?.fullName?.trim() || user?.email || '';
}

async function viewAccess(row: ViewRow): Promise<RegistrationView['access']> {
  const member = await evaluateMemberAccess(prisma, row.tenantId, row.userId);
  if (!member.ok) return { ok: false, reason: member.reason };
  const policy = await resolveWhatsappQuotaPolicy(row.tenantId);
  return policy.ok ? { ok: true, reason: null } : { ok: false, reason: 'OPTION_MISSING' };
}

async function toView(row: ViewRow): Promise<RegistrationView> {
  return {
    id: row.id,
    userId: row.userId,
    userLabel: userLabel(row.user),
    phoneE164: row.phoneE164,
    phoneMasked: maskPhone(row.phoneE164),
    status: row.status,
    activationExpiresAt: row.status === 'PENDING_ACTIVATION' ? row.activationExpiresAt : null,
    activationAttemptsLeft:
      row.status === 'PENDING_ACTIVATION' ? Math.max(0, ACTIVATION_MAX_ATTEMPTS - row.activationAttempts) : null,
    activatedAt: row.activatedAt,
    revokedAt: row.revokedAt,
    revokeReason: row.revokeReason,
    lastInboundAt: row.lastInboundAt,
    access: await viewAccess(row),
    sites: row.sites
      .map(link => toSiteRef(link.site as SiteEligibilityRow))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    openSessionId: row.sessions[0]?.id ?? null,
    createdAt: row.createdAt
  };
}

async function loadView(tenantId: string, registrationId: string): Promise<RegistrationView> {
  const row = await prisma.stockWhatsappRegistration.findFirst({
    where: { id: registrationId, tenantId },
    select: VIEW_SELECT
  });
  if (!row) throw new NotFoundError('Inscription introuvable.');
  return toView(row);
}

/** Six chiffres tirés par `crypto.randomInt` (W3-R6). */
export function generateActivationCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function botNumber(): string | null {
  return env.WHATSAPP_INVENTORY_PUBLIC_NUMBER ?? null;
}

// ---------------------------------------------------------------------------
// Contrôles
// ---------------------------------------------------------------------------

function normalizeSiteIds(siteIds: unknown): string[] {
  const list = Array.isArray(siteIds)
    ? siteIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const unique = [...new Set(list)];
  if (unique.length === 0) {
    throw new AppError('Choisissez au moins un chantier.', 400, ErrorCode.STOCK_WHATSAPP_SITES_REQUIRED);
  }
  if (unique.length > MAX_SITES_PER_REGISTRATION) {
    throw new AppError('Dix chantiers au plus par inscription.', 400, ErrorCode.VALIDATION_ERROR);
  }
  return unique;
}

/** Chaque chantier de l'agence (404 sinon), puis éligible (409, `data.siteIds`) — W3-R5. */
async function assertEligibleSites(db: PrismaTransactionClient, tenantId: string, siteIds: string[]): Promise<void> {
  for (const siteId of siteIds) {
    await assertBelongsToTenant(db, 'constructionSite', siteId, tenantId, { message: 'Chantier introuvable.' });
  }
  const sites = await db.constructionSite.findMany({
    where: { tenantId, id: { in: siteIds } },
    select: SITE_ELIGIBILITY_SELECT
  });
  const ineligible = sites.map(site => toSiteRef(site as SiteEligibilityRow)).filter(ref => !ref.eligible);
  if (ineligible.length > 0) {
    throw new AppError(
      'Un chantier choisi n’est pas ouvert au comptage par WhatsApp.',
      409,
      ErrorCode.STOCK_WHATSAPP_SITE_NOT_ELIGIBLE,
      undefined,
      { siteIds: ineligible.map(ref => ref.siteId) }
    );
  }
}

/** Membre éligible (W3-R2) ; un utilisateur d'une autre agence lève la même erreur. */
async function assertEligibleMember(tenantId: string, userId: unknown): Promise<string> {
  const id = typeof userId === 'string' ? userId : '';
  const access = id ? await evaluateMemberAccess(prisma, tenantId, id) : null;
  if (!access || !access.ok) {
    throw new AppError(
      'Ce membre ne peut pas être inscrit : il doit être actif et détenir le rôle Chef de chantier.',
      409,
      ErrorCode.STOCK_WHATSAPP_MEMBER_NOT_ELIGIBLE
    );
  }
  return id;
}

function phoneUnavailable(): AppError {
  return new AppError(PHONE_UNAVAILABLE_MESSAGE, 409, ErrorCode.STOCK_WHATSAPP_PHONE_UNAVAILABLE);
}

function memberAlreadyRegistered(): AppError {
  return new AppError(
    'Ce membre a déjà une inscription en cours. Révoquez-la avant d’en créer une autre.',
    409,
    ErrorCode.STOCK_WHATSAPP_MEMBER_ALREADY_REGISTERED
  );
}

/**
 * Violation d'un index unique partiel : `one_live_member` (membre déjà inscrit
 * dans l'agence, course avec le contrôle préalable) ou `one_live_phone` (numéro
 * déjà inscrit, ici ou dans une autre agence — W3-R4). Rend l'erreur métier, ou
 * `null` si l'erreur n'en est pas une.
 */
function uniqueViolationError(error: unknown): { error: AppError; phone: boolean } | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = JSON.stringify(error.meta ?? {});
    const member = target.includes('member') || target.includes('user_id');
    return member ? { error: memberAlreadyRegistered(), phone: false } : { error: phoneUnavailable(), phone: true };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Création, modification, code, révocation
// ---------------------------------------------------------------------------

export async function createRegistration(
  tenantId: string,
  actorUserId: string,
  input: { userId: string; phone: string; siteIds: string[] }
): Promise<RegistrationWithCode> {
  const phoneE164 = normalizePhoneE164(String(input.phone ?? ''));
  if (!phoneE164) {
    throw new AppError('Numéro de téléphone invalide.', 400, ErrorCode.STOCK_WHATSAPP_PHONE_INVALID);
  }
  const siteIds = normalizeSiteIds(input.siteIds);
  const userId = await assertEligibleMember(tenantId, input.userId);
  await assertEligibleSites(prisma, tenantId, siteIds);

  // L'unicité du numéro vaut pour TOUTE la plateforme (W3-R4) : aucune lecture
  // transverse ici (la garde tenant la refuserait sous contexte d'agence), c'est
  // l'index unique partiel `stock_whatsapp_registrations_one_live_phone` qui
  // tranche à la création, sans rien révéler de l'autre agence.
  const memberTaken = await prisma.stockWhatsappRegistration.findFirst({
    where: { tenantId, userId, status: { not: 'REVOKED' } },
    select: { id: true }
  });
  if (memberTaken) throw memberAlreadyRegistered();

  const id = randomUUID();
  const code = generateActivationCode();
  try {
    await prisma.$transaction(async tx => {
      await tx.stockWhatsappRegistration.create({
        data: {
          id,
          tenantId,
          userId,
          phoneE164,
          status: 'PENDING_ACTIVATION',
          activationCodeHash: activationCodeHash(code, id),
          activationExpiresAt: new Date(Date.now() + ACTIVATION_VALIDITY_MS),
          activationAttempts: 0,
          createdByUserId: actorUserId
        }
      });
      await tx.stockWhatsappRegistrationSite.createMany({
        data: siteIds.map(siteId => ({ tenantId, registrationId: id, siteId }))
      });
      await recordAuditEvent(tx, {
        tenantId,
        actorUserId,
        actionKey: AuditActionKey.STOCK_WHATSAPP_REGISTRATION_CREATED,
        entityType: 'StockWhatsappRegistration',
        entityId: id,
        payload: { registrationId: id, userId, siteIds, phoneMasked: maskPhone(phoneE164) }
      });
    });
  } catch (error) {
    const violation = uniqueViolationError(error);
    if (!violation) throw error;
    if (violation.phone) {
      // Refus audité pour rendre visible une énumération des numéros ; jamais
      // le numéro, même masqué, ni l'agence qui le détient.
      logAuditEvent({
        tenantId,
        actorUserId,
        actionKey: AuditActionKey.STOCK_WHATSAPP_REGISTRATION_CREATED,
        entityType: 'StockWhatsappRegistration',
        entityId: id,
        outcome: 'DENIED',
        payload: { reason: 'PHONE_UNAVAILABLE', userId }
      });
    }
    throw violation.error;
  }
  return { ...(await loadView(tenantId, id)), activationCode: code, botNumber: botNumber() };
}

async function requireRegistration(tenantId: string, registrationId: string) {
  const row = await prisma.stockWhatsappRegistration.findFirst({
    where: { id: registrationId, tenantId },
    select: { id: true, status: true, userId: true, sites: { select: { siteId: true } } }
  });
  if (!row) throw new NotFoundError('Inscription introuvable.');
  return row;
}

function wrongStatus(message: string): AppError {
  return new AppError(message, 409, ErrorCode.STOCK_WHATSAPP_REGISTRATION_WRONG_STATUS);
}

export async function updateRegistrationSites(
  tenantId: string,
  actorUserId: string,
  input: { registrationId: string; siteIds: string[] }
): Promise<RegistrationView> {
  const registration = await requireRegistration(tenantId, input.registrationId);
  if (registration.status === 'REVOKED') throw wrongStatus('Cette inscription est révoquée.');
  const siteIds = normalizeSiteIds(input.siteIds);
  await assertEligibleSites(prisma, tenantId, siteIds);
  const before = registration.sites.map(link => link.siteId).sort();

  await prisma.$transaction(async tx => {
    await tx.stockWhatsappRegistrationSite.deleteMany({ where: { tenantId, registrationId: registration.id } });
    await tx.stockWhatsappRegistrationSite.createMany({
      data: siteIds.map(siteId => ({ tenantId, registrationId: registration.id, siteId }))
    });
  });
  logAuditEvent({
    tenantId,
    actorUserId,
    actionKey: AuditActionKey.STOCK_WHATSAPP_REGISTRATION_UPDATED,
    entityType: 'StockWhatsappRegistration',
    entityId: registration.id,
    changes: { siteIds: { before, after: [...siteIds].sort() } }
  });
  return loadView(tenantId, registration.id);
}

export async function regenerateActivationCode(
  tenantId: string,
  actorUserId: string,
  input: { registrationId: string }
): Promise<RegistrationWithCode> {
  const registration = await requireRegistration(tenantId, input.registrationId);
  if (registration.status !== 'PENDING_ACTIVATION') {
    throw wrongStatus('Le code ne se régénère que pour une inscription en attente d’activation.');
  }
  const code = generateActivationCode();
  const updated = await prisma.stockWhatsappRegistration.updateMany({
    where: { id: registration.id, tenantId, status: 'PENDING_ACTIVATION' },
    data: {
      activationCodeHash: activationCodeHash(code, registration.id),
      activationExpiresAt: new Date(Date.now() + ACTIVATION_VALIDITY_MS),
      activationAttempts: 0
    }
  });
  if (updated.count !== 1)
    throw wrongStatus('Le code ne se régénère que pour une inscription en attente d’activation.');
  logAuditEvent({
    tenantId,
    actorUserId,
    actionKey: AuditActionKey.STOCK_WHATSAPP_ACTIVATION_CODE_REGENERATED,
    entityType: 'StockWhatsappRegistration',
    entityId: registration.id,
    payload: { registrationId: registration.id }
  });
  return { ...(await loadView(tenantId, registration.id)), activationCode: code, botNumber: botNumber() };
}

/**
 * Révocation (W3-R9) : `REVOKED`, session ouverte fermée (`REVOKED`),
 * proposition abandonnée (`EXPIRED`), AUCUN message au chef. Le numéro
 * redevient inscriptible. Sous le verrou de l'inscription (W4-R9).
 */
export async function revokeRegistration(
  tenantId: string,
  actorUserId: string,
  input: { registrationId: string; reason?: string | null }
): Promise<RegistrationView> {
  const registration = await requireRegistration(tenantId, input.registrationId);
  if (registration.status === 'REVOKED') throw wrongStatus('Cette inscription est déjà révoquée.');
  const reason =
    typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim().slice(0, REVOKE_REASON_MAX) : null;
  const now = new Date();

  await withRegistrationLock(registration.id, async tx => {
    const updated = await tx.stockWhatsappRegistration.updateMany({
      where: { id: registration.id, tenantId, status: { not: 'REVOKED' } },
      data: {
        status: 'REVOKED',
        revokedAt: now,
        revokedByUserId: actorUserId,
        revokeReason: reason,
        activationCodeHash: null
      }
    });
    if (updated.count !== 1) throw wrongStatus('Cette inscription est déjà révoquée.');
    const session = await findOpenSession(tx, tenantId, registration.id);
    if (session) {
      await abandonPendingCapture(tx, session);
      await closeSessionRow(tx, session, 'REVOKED', now);
    }
    await recordAuditEvent(tx, {
      tenantId,
      actorUserId,
      actionKey: AuditActionKey.STOCK_WHATSAPP_REGISTRATION_REVOKED,
      entityType: 'StockWhatsappRegistration',
      entityId: registration.id,
      payload: {
        registrationId: registration.id,
        userId: registration.userId,
        reason,
        sessionClosed: session?.id ?? null
      }
    });
  });
  return loadView(tenantId, registration.id);
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

export async function listRegistrations(
  tenantId: string,
  _actorUserId: string,
  input: { status?: RegistrationStatusValue | null } = {}
): Promise<RegistrationView[]> {
  const rows = await prisma.stockWhatsappRegistration.findMany({
    where: { tenantId, ...(input.status ? { status: input.status } : {}) },
    select: VIEW_SELECT,
    orderBy: { createdAt: 'desc' }
  });
  return Promise.all(rows.map(toView));
}

export async function getRegistration(
  tenantId: string,
  _actorUserId: string,
  input: { registrationId: string }
): Promise<RegistrationView> {
  return loadView(tenantId, input.registrationId);
}

/** Membres ACTIFS de l'agence titulaires du rôle Chef de chantier, lus en base. */
export async function listEligibleMembers(
  tenantId: string,
  _actorUserId: string,
  _input: Record<string, never> = {}
): Promise<EligibleMember[]> {
  const holders = await prisma.userRole.findMany({
    where: {
      tenantId,
      role: { key: SITE_MANAGER_ROLE_KEY, permissions: { some: { permission: { key: 'STOCK_COUNT' } } } },
      user: { isActive: true, memberships: { some: { tenantId, status: 'ACTIVE' } } }
    },
    select: { user: { select: { id: true, fullName: true, email: true } } }
  });
  const registered = await prisma.stockWhatsappRegistration.findMany({
    where: { tenantId, status: { not: 'REVOKED' } },
    select: { userId: true }
  });
  const registeredIds = new Set(registered.map(row => row.userId));
  const seen = new Set<string>();
  const members: EligibleMember[] = [];
  for (const holder of holders) {
    if (seen.has(holder.user.id)) continue;
    seen.add(holder.user.id);
    members.push({
      userId: holder.user.id,
      label: userLabel(holder.user),
      registered: registeredIds.has(holder.user.id)
    });
  }
  return members.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

/** Chantiers ouverts, basculés au stock, au lieu actif (W3-R5). */
export async function listEligibleSites(
  tenantId: string,
  _actorUserId: string,
  _input: Record<string, never> = {}
): Promise<SiteRef[]> {
  const sites = await prisma.constructionSite.findMany({
    where: { tenantId, status: { not: 'CLOSED' }, stockEnabledAt: { not: null } },
    select: SITE_ELIGIBILITY_SELECT,
    orderBy: { name: 'asc' }
  });
  return sites.map(site => toSiteRef(site as SiteEligibilityRow)).filter(ref => ref.eligible);
}
