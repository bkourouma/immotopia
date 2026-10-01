import type { AuditLog, Prisma } from '@prisma/client';
import { prisma } from '../utils/database';
import { enrichAuditLogsWithResourceLabels } from './audit-service';
import { decodeAuditCursor, DecodedCursor, encodeAuditCursor } from './audit-read-service';
import {
  AuditActorTypeValue,
  AuditCategoryValue,
  AuditOutcomeValue,
  AuditScopeValue,
  AuditVisibilityValue
} from '../types/audit-types';

/**
 * Lecture du journal d'audit côté PLATEFORME (ADR-006, phase 4).
 *
 * Contrairement à `audit-read-service` (agence), ce module ne pose AUCUN filtre
 * d'agence ni de visibilité : le super-administrateur lit tout, y compris les
 * lignes `PLATFORM_ONLY`, les lignes sans agence, l'IP et le navigateur du
 * personnel. Il ne doit donc être atteint que par une route gardée
 * `PLATFORM_AUDIT_VIEW` / `PLATFORM_AUDIT_EXPORT` (voir `routes/admin-routes.ts`) ;
 * aucune route d'agence ne l'importe (`check:architecture` et la revue le
 * surveillent).
 */

export const PLATFORM_AUDIT_DEFAULT_LIMIT = 50;
export const PLATFORM_AUDIT_MAX_LIMIT = 100;
/** Plafond d'un export CSV : au-delà, le filtre est trop large et l'export est tronqué. */
export const PLATFORM_AUDIT_EXPORT_MAX_ROWS = 50_000;
const EXPORT_BATCH_SIZE = 1000;

export interface PlatformAuditFilters {
  tenantId?: string;
  scope?: AuditScopeValue;
  visibility?: AuditVisibilityValue;
  category?: AuditCategoryValue;
  outcome?: AuditOutcomeValue;
  actorType?: AuditActorTypeValue;
  actionKey?: string;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  requestId?: string;
  startDate?: Date;
  endDate?: Date;
  cursor?: string;
  limit?: number;
}

export interface PlatformAuditLogDto {
  id: string;
  createdAt: Date;
  action: string;
  category: AuditCategoryValue;
  outcome: AuditOutcomeValue;
  scope: AuditScopeValue;
  visibility: AuditVisibilityValue;
  actorType: AuditActorTypeValue;
  source?: string;
  user?: { id: string; email: string; fullName: string | null };
  userId?: string;
  actorLabel?: string;
  tenantId?: string;
  tenant?: { id: string; name: string };
  resourceType: string;
  resourceId: string;
  resourceLabel?: string;
  details?: unknown;
  changes?: unknown;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface PlatformAuditPage {
  logs: PlatformAuditLogDto[];
  nextCursor: string | null;
}

/** Clause `where` d'une page ou d'un export : seuls les filtres demandés, jamais de filtre implicite. */
export function buildPlatformAuditWhere(
  filters: PlatformAuditFilters,
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
    ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
    ...(filters.scope ? { scope: filters.scope } : {}),
    ...(filters.visibility ? { visibility: filters.visibility } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.outcome ? { outcome: filters.outcome } : {}),
    ...(filters.actorType ? { actorType: filters.actorType } : {}),
    ...(filters.actionKey ? { actionKey: filters.actionKey } : {}),
    ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.requestId ? { requestId: filters.requestId } : {}),
    ...(and.length > 0 ? { AND: and } : {})
  };
}

const ORDER: Prisma.AuditLogOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];

/** Acteurs et agences nommés, libellés de ressource : trois requêtes par lot, pas une par ligne. */
async function hydrate(rows: AuditLog[]): Promise<PlatformAuditLogDto[]> {
  const actorIds = [...new Set(rows.map(row => row.actorUserId).filter((id): id is string => Boolean(id)))];
  const tenantIds = [...new Set(rows.map(row => row.tenantId).filter((id): id is string => Boolean(id)))];

  const [actors, tenants, labels] = await Promise.all([
    actorIds.length > 0
      ? // `select` explicite : l'objet `User` complet porte `passwordHash`.
        prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true, fullName: true } })
      : Promise.resolve([]),
    tenantIds.length > 0
      ? prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    enrichAuditLogsWithResourceLabels(
      rows.map(row => ({
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        tenantId: row.tenantId,
        payload: row.payload
      }))
    )
  ]);

  const actorById = new Map(actors.map(actor => [actor.id, actor]));
  const tenantById = new Map(tenants.map(tenant => [tenant.id, tenant]));

  return rows.map(row => ({
    id: row.id,
    createdAt: row.createdAt,
    action: row.actionKey,
    category: row.category,
    outcome: row.outcome,
    scope: row.scope,
    visibility: row.visibility,
    actorType: row.actorType,
    source: row.source ?? undefined,
    user: row.actorUserId ? actorById.get(row.actorUserId) : undefined,
    userId: row.actorUserId ?? undefined,
    actorLabel: row.actorLabel ?? undefined,
    tenantId: row.tenantId ?? undefined,
    tenant: row.tenantId ? tenantById.get(row.tenantId) : undefined,
    resourceType: row.entityType,
    resourceId: row.entityId,
    resourceLabel: labels.get(row.id),
    details: row.payload ?? undefined,
    changes: row.changes ?? undefined,
    ipAddress: row.ipAddress ?? undefined,
    userAgent: row.userAgent ?? undefined,
    requestId: row.requestId ?? undefined
  }));
}

/** Une page du journal de la plateforme, la plus récente d'abord, par curseur `(createdAt, id)`. */
export async function getPlatformAuditLogs(filters: PlatformAuditFilters = {}): Promise<PlatformAuditPage> {
  const limit = Math.min(Math.max(filters.limit ?? PLATFORM_AUDIT_DEFAULT_LIMIT, 1), PLATFORM_AUDIT_MAX_LIMIT);
  const cursor = filters.cursor ? decodeAuditCursor(filters.cursor) : undefined;

  const found = await prisma.auditLog.findMany({
    where: buildPlatformAuditWhere(filters, cursor),
    orderBy: ORDER,
    take: limit + 1
  });

  const hasMore = found.length > limit;
  const rows = hasMore ? found.slice(0, limit) : found;
  return {
    logs: await hydrate(rows),
    nextCursor: hasMore ? encodeAuditCursor(rows[rows.length - 1]) : null
  };
}

/** Nombre de lignes qu'un export avec ces filtres produirait (avant plafonnement). */
export async function countPlatformAuditLogs(filters: PlatformAuditFilters = {}): Promise<number> {
  return prisma.auditLog.count({ where: buildPlatformAuditWhere(filters) });
}

/**
 * Parcourt le journal par lots de 1 000 (curseur, mémoire constante) jusqu'à
 * `maxRows` lignes, la plus récente d'abord. Sert l'export CSV.
 */
export async function* iteratePlatformAuditLogs(
  filters: PlatformAuditFilters = {},
  maxRows: number = PLATFORM_AUDIT_EXPORT_MAX_ROWS
): AsyncGenerator<PlatformAuditLogDto[]> {
  let cursor: DecodedCursor | undefined;
  let remaining = maxRows;

  while (remaining > 0) {
    const rows = await prisma.auditLog.findMany({
      where: buildPlatformAuditWhere(filters, cursor),
      orderBy: ORDER,
      take: Math.min(EXPORT_BATCH_SIZE, remaining)
    });
    if (rows.length === 0) return;

    yield await hydrate(rows);

    remaining -= rows.length;
    const last = rows[rows.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
    if (rows.length < EXPORT_BATCH_SIZE) return;
  }
}
