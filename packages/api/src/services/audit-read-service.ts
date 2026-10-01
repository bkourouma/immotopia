import type { AuditLog, Prisma } from '@prisma/client';
import { prisma } from '../utils/database';
import { BadRequestError } from '../middleware/error-middleware';
import { enrichAuditLogsWithResourceLabels } from './audit-service';
import { AuditActorTypeValue, AuditCategoryValue, AuditOutcomeValue } from '../types/audit-types';

/**
 * Lecture du journal d'audit côté AGENCE (ADR-006, specs/023-audit-deux-niveaux §7).
 *
 * C'est le **seul** chemin par lequel une agence lit `audit_logs`. `AuditLog`
 * est exempté de l'extension Prisma de garde tenant (une action de plateforme
 * n'a pas d'agence) : l'étanchéité de la lecture repose donc sur CE module et
 * sur son test (`__tests__/unit/audit-read-service.test.ts`, étanchéité de bout
 * en bout dans `__tests__/integration/isolation.test.ts`).
 *
 * Deux filtres sont posés ici et ne viennent jamais du client :
 *   - `tenantId`, passé en paramètre séparé de `filters` (qui n'a pas de champ
 *     `tenantId`, donc rien à écraser) ;
 *   - `visibility = TENANT` : jamais un événement `PLATFORM_ONLY`.
 */

export const TENANT_AUDIT_DEFAULT_LIMIT = 50;
export const TENANT_AUDIT_MAX_LIMIT = 100;

/** Libellé affiché quand l'acteur est le personnel de la plateforme : son identité n'est jamais envoyée. */
const PLATFORM_STAFF: AuditActorTypeValue = 'SUPER_ADMIN';

export interface TenantAuditFilters {
  category?: AuditCategoryValue;
  outcome?: AuditOutcomeValue;
  actionKey?: string;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  cursor?: string;
  limit?: number;
}

export interface TenantAuditLogDto {
  id: string;
  createdAt: Date;
  action: string;
  category: AuditCategoryValue;
  outcome: AuditOutcomeValue;
  actorType: AuditActorTypeValue;
  user?: { id: string; email: string; fullName: string | null };
  actorLabel?: string;
  resourceType: string;
  resourceId: string;
  resourceLabel?: string;
  details?: unknown;
  changes?: unknown;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface TenantAuditPage {
  logs: TenantAuditLogDto[];
  /** `null` quand il n'y a plus de page. */
  nextCursor: string | null;
}

interface DecodedCursor {
  createdAt: Date;
  id: string;
}

export function encodeAuditCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ t: row.createdAt.toISOString(), i: row.id })).toString('base64url');
}

export function decodeAuditCursor(raw: string): DecodedCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { t?: unknown; i?: unknown };
    const createdAt = typeof parsed.t === 'string' ? new Date(parsed.t) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime()) || typeof parsed.i !== 'string' || parsed.i.length > 64) {
      throw new Error('curseur mal formé');
    }
    return { createdAt, id: parsed.i };
  } catch {
    throw new BadRequestError('Curseur de pagination invalide');
  }
}

/**
 * Clause `where` d'une page. `tenantId` et `visibility` sont posés EN PREMIER et
 * aucun filtre ne peut les remplacer : ils ne figurent pas dans `TenantAuditFilters`.
 */
export function buildTenantAuditWhere(
  tenantId: string,
  filters: TenantAuditFilters,
  cursor?: DecodedCursor
): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];

  if (filters.startDate || filters.endDate) {
    and.push({
      createdAt: {
        ...(filters.startDate ? { gte: filters.startDate } : {}),
        ...(filters.endDate ? { lte: filters.endDate } : {})
      }
    });
  }
  if (cursor) {
    and.push({
      OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }]
    });
  }

  return {
    tenantId,
    visibility: 'TENANT',
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.outcome ? { outcome: filters.outcome } : {}),
    ...(filters.actionKey ? { actionKey: filters.actionKey } : {}),
    ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(and.length > 0 ? { AND: and } : {})
  };
}

type AuditRowRead = AuditLog;

function toDto(
  row: AuditRowRead,
  actors: Map<string, { id: string; email: string; fullName: string | null }>,
  labels: Map<string, string>
): TenantAuditLogDto {
  const isPlatformStaff = row.actorType === PLATFORM_STAFF;
  const actor = !isPlatformStaff && row.actorUserId ? actors.get(row.actorUserId) : undefined;

  return {
    id: row.id,
    createdAt: row.createdAt,
    action: row.actionKey,
    category: row.category,
    outcome: row.outcome,
    actorType: row.actorType,
    // Le personnel de la plateforme apparaît sans identité, sans IP ni agent.
    user: actor,
    actorLabel: isPlatformStaff ? undefined : (row.actorLabel ?? undefined),
    resourceType: row.entityType,
    resourceId: row.entityId,
    resourceLabel: labels.get(row.id),
    details: row.payload ?? undefined,
    changes: row.changes ?? undefined,
    ipAddress: isPlatformStaff ? undefined : (row.ipAddress ?? undefined),
    userAgent: isPlatformStaff ? undefined : (row.userAgent ?? undefined),
    requestId: row.requestId ?? undefined
  };
}

async function loadActors(rows: AuditRowRead[]) {
  const ids = [
    ...new Set(
      rows
        .filter(row => row.actorType !== PLATFORM_STAFF)
        .map(row => row.actorUserId)
        .filter((id): id is string => Boolean(id))
    )
  ];
  if (ids.length === 0) {
    return new Map<string, { id: string; email: string; fullName: string | null }>();
  }
  // `select` explicite : l'objet `User` complet porte `passwordHash`.
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true, fullName: true }
  });
  return new Map(users.map(user => [user.id, user]));
}

/**
 * Une page du journal de l'agence, la plus récente d'abord. Pagination par
 * curseur `(createdAt, id)` : stable pendant que de nouveaux événements arrivent,
 * et servie par l'index `(tenant_id, visibility, created_at DESC)`.
 */
export async function getTenantAuditLogs(tenantId: string, filters: TenantAuditFilters = {}): Promise<TenantAuditPage> {
  const limit = Math.min(Math.max(filters.limit ?? TENANT_AUDIT_DEFAULT_LIMIT, 1), TENANT_AUDIT_MAX_LIMIT);
  const cursor = filters.cursor ? decodeAuditCursor(filters.cursor) : undefined;

  const found = await prisma.auditLog.findMany({
    where: buildTenantAuditWhere(tenantId, filters, cursor),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1
  });

  const hasMore = found.length > limit;
  const rows = hasMore ? found.slice(0, limit) : found;

  const [actors, labels] = await Promise.all([
    loadActors(rows),
    enrichAuditLogsWithResourceLabels(
      rows.map(row => ({
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        tenantId: row.tenantId,
        payload: row.payload
      })),
      tenantId
    )
  ]);

  return {
    logs: rows.map(row => toDto(row, actors, labels)),
    nextCursor: hasMore ? encodeAuditCursor(rows[rows.length - 1]) : null
  };
}
