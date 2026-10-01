import { prisma } from '../../utils/database';
import { env } from '../../config/env';
import { t } from '../../i18n';
import { BadRequestError, NotFoundError } from '../../middleware/error-middleware';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { runWithTenantContext } from '../../utils/tenant-context';
import { generateToken, hashToken, hashesMatch, looksLikeToken } from './token';
import { invalidSecureLinkError } from './errors';

export type SecureLinkScope = 'OWNER_MONTHLY_REPORT' | 'INSTALLMENT_PAYMENT'; // = enum Prisma

export interface CreateSecureLinkInput {
  tenantId: string;
  scope: SecureLinkScope;
  objectType: string;
  objectId: string;
  createdByUserId?: string | null;
  ttlDays?: number;
}

export interface CreatedSecureLink {
  id: string;
  /** Jeton en clair : remis UNE seule fois, ni stocké ni journalisé. */
  token: string;
  expiresAt: Date;
  url: string;
}

export interface SecureLinkSummary {
  id: string;
  scope: SecureLinkScope;
  objectType: string;
  objectId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  createdByUserId: string | null;
  viewCount: number;
  lastViewedAt: Date | null;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
}

export interface VerifiedSecureLink {
  id: string;
  tenantId: string;
  scope: SecureLinkScope;
  objectType: string;
  objectId: string;
  expiresAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Le jeton voyage dans le FRAGMENT de l'URL (`#`) : le navigateur ne l'envoie
 * jamais au serveur, donc il n'atterrit dans aucun journal d'accès.
 */
export function buildSecureLinkUrl(scope: SecureLinkScope, token: string): string {
  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  switch (scope) {
    case 'OWNER_MONTHLY_REPORT':
      return `${base}/rapport-proprietaire#${token}`;
    case 'INSTALLMENT_PAYMENT':
      return `${base}/payer#${token}`;
  }
}

function resolveTtlDays(requested: number | undefined): number {
  const max = env.SECURE_LINK_MAX_TTL_DAYS;
  if (requested === undefined) {
    return Math.min(env.SECURE_LINK_DEFAULT_TTL_DAYS, max);
  }
  if (!Number.isInteger(requested) || requested < 1 || requested > max) {
    throw new BadRequestError(t('La durée du lien doit être comprise entre 1 et {{max}} jours.', { max }));
  }
  return requested;
}

export async function createSecureLink(input: CreateSecureLinkInput): Promise<CreatedSecureLink> {
  const ttlDays = resolveTtlDays(input.ttlDays);
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);

  const created = await prisma.secureLink.create({
    data: {
      tenantId: input.tenantId,
      scope: input.scope,
      objectType: input.objectType,
      objectId: input.objectId,
      tokenHash: hashToken(token),
      expiresAt,
      createdByUserId: input.createdByUserId ?? null
    },
    select: { id: true }
  });

  logAuditEvent({
    actorUserId: input.createdByUserId ?? null,
    tenantId: input.tenantId,
    actionKey: AuditActionKey.SECURE_LINK_CREATED,
    entityType: 'SecureLink',
    entityId: created.id,
    payload: {
      linkId: created.id,
      scope: input.scope,
      objectType: input.objectType,
      objectId: input.objectId,
      expiresAt: expiresAt.toISOString()
    }
  });

  return { id: created.id, token, expiresAt, url: buildSecureLinkUrl(input.scope, token) };
}

/**
 * Vérifie un jeton, sans effet de bord. La recherche par empreinte est
 * volontairement transverse (la route publique n'a pas de contexte d'agence,
 * donc l'extension Prisma de garde n'a rien à contrôler) ; toute lecture
 * suivante se fait sous `runWithTenantContext` de l'agence du lien. Tout refus
 * est la même `NotFoundError`.
 */
export async function verifySecureLink(token: string, scope: SecureLinkScope): Promise<VerifiedSecureLink> {
  if (!looksLikeToken(token)) throw invalidSecureLinkError();

  const hash = hashToken(token);
  const row = await prisma.secureLink.findUnique({
    where: { tokenHash: hash },
    select: {
      id: true,
      tenantId: true,
      scope: true,
      objectType: true,
      objectId: true,
      tokenHash: true,
      expiresAt: true,
      revokedAt: true,
      tenant: { select: { isActive: true, status: true } }
    }
  });

  if (!row || !hashesMatch(row.tokenHash, hash)) throw invalidSecureLinkError();
  if (row.scope !== scope) throw invalidSecureLinkError();
  if (row.revokedAt) throw invalidSecureLinkError();
  if (row.expiresAt.getTime() <= Date.now()) throw invalidSecureLinkError();
  if (!row.tenant || row.tenant.isActive !== true || row.tenant.status === 'SUSPENDED') {
    throw invalidSecureLinkError();
  }

  return {
    id: row.id,
    tenantId: row.tenantId,
    scope: row.scope,
    objectType: row.objectType,
    objectId: row.objectId,
    expiresAt: row.expiresAt
  };
}

/** Enregistre une consultation réussie : compteur, dernière date, audit. */
export async function recordSecureLinkView(
  link: VerifiedSecureLink,
  ctx: { ip?: string; userAgent?: string }
): Promise<void> {
  await runWithTenantContext({ tenantId: link.tenantId }, () =>
    prisma.secureLink.updateMany({
      where: { id: link.id, tenantId: link.tenantId },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() }
    })
  );

  logAuditEvent({
    actorUserId: null,
    tenantId: link.tenantId,
    actionKey: AuditActionKey.SECURE_LINK_VIEWED,
    entityType: 'SecureLink',
    entityId: link.id,
    ipAddress: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
    payload: {
      linkId: link.id,
      scope: link.scope,
      objectType: link.objectType,
      objectId: link.objectId
    }
  });
}

/**
 * `onObject` (facultatif) restreint la révocation aux liens de CET objet : un
 * lien d'un autre objet répond comme un lien inexistant, en une seule lecture.
 */
export async function revokeSecureLink(
  tenantId: string,
  linkId: string,
  actorUserId: string,
  onObject?: { objectType: string; objectId: string }
): Promise<void> {
  const link = await prisma.secureLink.findFirst({
    where: {
      id: linkId,
      tenantId,
      ...(onObject ? { objectType: onObject.objectType, objectId: onObject.objectId } : {})
    },
    select: { id: true, scope: true, objectType: true, objectId: true, revokedAt: true }
  });
  if (!link) throw new NotFoundError(t('Lien introuvable.'));
  if (link.revokedAt) return; // idempotent

  await prisma.secureLink.updateMany({
    where: { id: link.id, tenantId, revokedAt: null },
    data: { revokedAt: new Date() }
  });

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SECURE_LINK_REVOKED,
    entityType: 'SecureLink',
    entityId: link.id,
    payload: { linkId: link.id, scope: link.scope, objectType: link.objectType, objectId: link.objectId }
  });
}

export async function listSecureLinks(
  tenantId: string,
  filter: { scope?: SecureLinkScope; objectType?: string; objectId?: string; activeOnly?: boolean }
): Promise<SecureLinkSummary[]> {
  const now = new Date();
  const rows = await prisma.secureLink.findMany({
    where: {
      tenantId,
      ...(filter.scope ? { scope: filter.scope } : {}),
      ...(filter.objectType ? { objectType: filter.objectType } : {}),
      ...(filter.objectId ? { objectId: filter.objectId } : {}),
      ...(filter.activeOnly ? { revokedAt: null, expiresAt: { gt: now } } : {})
    },
    // Jamais le jeton ni son empreinte.
    select: {
      id: true,
      scope: true,
      objectType: true,
      objectId: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
      createdByUserId: true,
      viewCount: true,
      lastViewedAt: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return rows.map(row => ({
    ...row,
    status: row.revokedAt ? 'REVOKED' : row.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : 'ACTIVE'
  }));
}
