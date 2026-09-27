import { promises as fs } from 'fs';
import { TenantDataExportStatus, type TenantDataExport } from '@prisma/client';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { logAuditEvent } from '../audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { AppError, ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { buildTenantArchive, type ExportDataSource } from './archive-builder';
import { EXPORT_TTL_DAYS, defaultFileRoots, exportArchivePath, exportStagingDir, isInsideExportsRoot } from './storage';

/**
 * Export complet d'une agence (lot S7, besoin 8) — cycle de vie.
 *
 * QUEUED → RUNNING → READY | FAILED, puis READY → EXPIRED apres
 * `EXPORT_TTL_DAYS` jours (archive supprimee). La demande repond tout de
 * suite ; la preparation tourne dans le processus, une archive a la fois pour
 * toute la plateforme (file sequentielle), et une seule demande en cours
 * (QUEUED ou RUNNING) par agence. Au demarrage, un export RUNNING orphelin
 * passe FAILED et les QUEUED sont relances (`recoverTenantDataExports`).
 *
 * Aucune reponse ne porte `filePath` : seul `downloadPath` (route API) sort.
 */

const ENTITY_TYPE = 'TENANT_DATA_EXPORT';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE_STATUSES = [TenantDataExportStatus.QUEUED, TenantDataExportStatus.RUNNING];

export interface TenantDataExportDto {
  id: string;
  tenantId: string;
  status: TenantDataExportStatus;
  requestedBy: { id: string; fullName: string | null; email: string | null };
  sizeBytes: number | null;
  modelCount: number | null;
  rowCount: number | null;
  fileCount: number | null;
  missingFileCount: number | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  downloadPath: string | null;
}

export interface ExportDownload {
  absolutePath: string;
  fileName: string;
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// Lecture et mise en forme
// ---------------------------------------------------------------------------

async function requireTenant(tenantId: string): Promise<{ id: string; name: string; slug: string }> {
  const tenant =
    UUID_PATTERN.test(tenantId) || /^[A-Za-z0-9_-]{1,64}$/.test(tenantId)
      ? await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true } })
      : null;
  if (!tenant) throw new NotFoundError('Agence introuvable.');
  return tenant;
}

async function findExport(tenantId: string, exportId: string): Promise<TenantDataExport> {
  const found = UUID_PATTERN.test(exportId)
    ? await prisma.tenantDataExport.findFirst({ where: { id: exportId, tenantId } })
    : null;
  if (!found) throw new NotFoundError('Export introuvable.');
  return found;
}

function downloadPathOf(row: TenantDataExport): string | null {
  return row.status === TenantDataExportStatus.READY
    ? `/api/admin/tenants/${row.tenantId}/data-exports/${row.id}/download`
    : null;
}

async function toDtos(rows: TenantDataExport[]): Promise<TenantDataExportDto[]> {
  const userIds = [...new Set(rows.map(r => r.requestedById))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } })
    : [];
  const byId = new Map(users.map(u => [u.id, u]));
  return rows.map(row => ({
    id: row.id,
    tenantId: row.tenantId,
    status: row.status,
    requestedBy: byId.get(row.requestedById) ?? { id: row.requestedById, fullName: null, email: null },
    sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
    modelCount: row.modelCount,
    rowCount: row.rowCount,
    fileCount: row.fileCount,
    missingFileCount: row.missingFileCount,
    error: row.error,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    downloadPath: downloadPathOf(row)
  }));
}

async function removeArchive(filePath: string | null): Promise<void> {
  if (!filePath || !isInsideExportsRoot(filePath)) return;
  await fs.rm(filePath, { force: true });
}

/**
 * Archives echues : fichier supprime, statut EXPIRED. Appele a chaque demande
 * et a chaque lecture de la liste (pas de tache planifiee).
 */
export async function expireOldExports(tenantId?: string, now: Date = new Date()): Promise<number> {
  const due = await prisma.tenantDataExport.findMany({
    where: { status: TenantDataExportStatus.READY, expiresAt: { lt: now }, ...(tenantId ? { tenantId } : {}) },
    select: { id: true, filePath: true }
  });
  for (const row of due) {
    await removeArchive(row.filePath);
    await prisma.tenantDataExport.update({
      where: { id: row.id },
      data: { status: TenantDataExportStatus.EXPIRED, filePath: null }
    });
  }
  return due.length;
}

// ---------------------------------------------------------------------------
// Execution en tache de fond
// ---------------------------------------------------------------------------

let queue: Promise<void> = Promise.resolve();

async function latestMigration(): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY finished_at DESC, migration_name DESC LIMIT 1`;
    return rows[0]?.migration_name ?? null;
  } catch (error) {
    logger.warn('Export agence : version du schema illisible', { error: (error as Error).message });
    return null;
  }
}

export async function runTenantDataExport(exportId: string): Promise<void> {
  const claimed = await prisma.tenantDataExport.updateMany({
    where: { id: exportId, status: TenantDataExportStatus.QUEUED },
    data: { status: TenantDataExportStatus.RUNNING, startedAt: new Date() }
  });
  if (claimed.count === 0) return; // Supprime ou deja pris entre-temps.

  const row = await prisma.tenantDataExport.findUnique({ where: { id: exportId } });
  if (!row) return;
  const archivePath = exportArchivePath(row.tenantId, row.id);
  try {
    const tenant = await requireTenant(row.tenantId);
    const result = await buildTenantArchive({
      db: prisma as unknown as ExportDataSource,
      tenant,
      exportId: row.id,
      schemaVersion: await latestMigration(),
      roots: defaultFileRoots(),
      archivePath,
      stagingDir: exportStagingDir(row.tenantId, row.id)
    });
    const finishedAt = new Date();
    await prisma.tenantDataExport.update({
      where: { id: row.id },
      data: {
        status: TenantDataExportStatus.READY,
        filePath: archivePath,
        sizeBytes: BigInt(result.sizeBytes),
        modelCount: result.modelCount,
        rowCount: result.rowCount,
        fileCount: result.fileCount,
        missingFileCount: result.missingFileCount,
        finishedAt,
        expiresAt: new Date(finishedAt.getTime() + EXPORT_TTL_DAYS * 24 * 3600 * 1000)
      }
    });
    if (result.unclassified.length > 0) {
      logger.warn('Export agence : modeles non classes ignores', { exportId, models: result.unclassified });
    }
  } catch (error) {
    logger.error('Export agence : echec', {
      exportId,
      message: (error as Error).message,
      stack: (error as Error).stack
    });
    await removeArchive(archivePath);
    await prisma.tenantDataExport.update({
      where: { id: row.id },
      data: {
        status: TenantDataExportStatus.FAILED,
        finishedAt: new Date(),
        error: "La préparation de l'archive a échoué. Consultez les journaux du serveur, puis relancez l'export."
      }
    });
  }
}

/** Met un export dans la file (une archive a la fois pour tout le processus). */
export function scheduleTenantDataExport(exportId: string): void {
  queue = queue
    .then(() => runTenantDataExport(exportId))
    .catch(error => {
      logger.error('Export agence : file interrompue', { exportId, message: (error as Error).message });
    });
}

/** Au demarrage : RUNNING orphelins → FAILED, QUEUED relances. */
export async function recoverTenantDataExports(): Promise<void> {
  const orphans = await prisma.tenantDataExport.findMany({
    where: { status: TenantDataExportStatus.RUNNING },
    select: { id: true, tenantId: true }
  });
  for (const orphan of orphans) {
    await fs.rm(exportStagingDir(orphan.tenantId, orphan.id), { recursive: true, force: true });
    await fs.rm(`${exportArchivePath(orphan.tenantId, orphan.id)}.part`, { force: true });
  }
  if (orphans.length > 0) {
    await prisma.tenantDataExport.updateMany({
      where: { id: { in: orphans.map(o => o.id) }, status: TenantDataExportStatus.RUNNING },
      data: {
        status: TenantDataExportStatus.FAILED,
        finishedAt: new Date(),
        error: 'Préparation interrompue par un redémarrage du serveur. Relancez l’export.'
      }
    });
  }
  const queued = await prisma.tenantDataExport.findMany({
    where: { status: TenantDataExportStatus.QUEUED },
    orderBy: { createdAt: 'asc' },
    select: { id: true }
  });
  queued.forEach(row => scheduleTenantDataExport(row.id));
  await expireOldExports();
}

// ---------------------------------------------------------------------------
// Operations des routes super-admin
// ---------------------------------------------------------------------------

/** Verrou du processus : deux demandes simultanees pour une meme agence. */
const creating = new Set<string>();

export async function requestTenantDataExport(tenantId: string, actorUserId: string): Promise<TenantDataExportDto> {
  const tenant = await requireTenant(tenantId);
  await expireOldExports(tenant.id);
  if (creating.has(tenant.id)) throw new ConflictError('Un export de cette agence est déjà en préparation.');
  creating.add(tenant.id);
  try {
    const active = await prisma.tenantDataExport.findFirst({
      where: { tenantId: tenant.id, status: { in: ACTIVE_STATUSES } },
      select: { id: true }
    });
    if (active) throw new ConflictError('Un export de cette agence est déjà en préparation.');
    const created = await prisma.tenantDataExport.create({
      data: { tenantId: tenant.id, requestedById: actorUserId, status: TenantDataExportStatus.QUEUED }
    });
    logAuditEvent({
      actorUserId,
      tenantId: tenant.id,
      actionKey: AuditActionKey.TENANT_DATA_EXPORT_REQUESTED,
      entityType: ENTITY_TYPE,
      entityId: created.id
    });
    scheduleTenantDataExport(created.id);
    return (await toDtos([created]))[0];
  } finally {
    creating.delete(tenant.id);
  }
}

export async function listTenantDataExports(tenantId: string): Promise<TenantDataExportDto[]> {
  const tenant = await requireTenant(tenantId);
  await expireOldExports(tenant.id);
  const rows = await prisma.tenantDataExport.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
  return toDtos(rows);
}

export async function getTenantDataExport(tenantId: string, exportId: string): Promise<TenantDataExportDto> {
  await expireOldExports(tenantId);
  return (await toDtos([await findExport(tenantId, exportId)]))[0];
}

function archiveFileName(slug: string, date: Date): string {
  const safeSlug =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'agence';
  return `immotopia-export-${safeSlug}-${date.toISOString().slice(0, 10)}.zip`;
}

/** 410 : l'archive a depasse sa duree de vie (ou son fichier a disparu). */
function exportExpiredError(): AppError {
  return new AppError('Cette archive a expiré et a été supprimée. Lancez un nouvel export.', 410, 'EXPORT_EXPIRED');
}

export async function openTenantDataExportDownload(
  tenantId: string,
  exportId: string,
  actorUserId: string
): Promise<ExportDownload> {
  const tenant = await requireTenant(tenantId);
  await expireOldExports(tenant.id);
  const row = await findExport(tenant.id, exportId);
  if (row.status === TenantDataExportStatus.EXPIRED) throw exportExpiredError();
  if (row.status !== TenantDataExportStatus.READY || !row.filePath) {
    throw new ConflictError("Cette archive n'est pas prête au téléchargement.");
  }
  const stat = isInsideExportsRoot(row.filePath) ? await fs.stat(row.filePath).catch(() => null) : null;
  if (!stat?.isFile()) {
    await prisma.tenantDataExport.update({
      where: { id: row.id },
      data: { status: TenantDataExportStatus.EXPIRED, filePath: null }
    });
    throw exportExpiredError();
  }
  logAuditEvent({
    actorUserId,
    tenantId: tenant.id,
    actionKey: AuditActionKey.TENANT_DATA_EXPORT_DOWNLOADED,
    entityType: ENTITY_TYPE,
    entityId: row.id
  });
  return {
    absolutePath: row.filePath,
    fileName: archiveFileName(tenant.slug, row.finishedAt ?? row.createdAt),
    sizeBytes: stat.size
  };
}

export async function deleteTenantDataExport(tenantId: string, exportId: string, actorUserId: string): Promise<void> {
  const row = await findExport(tenantId, exportId);
  if (row.status === TenantDataExportStatus.RUNNING) {
    throw new ConflictError('Cet export est en cours de préparation : attendez sa fin avant de le supprimer.');
  }
  await removeArchive(row.filePath);
  await prisma.tenantDataExport.delete({ where: { id: row.id } });
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.TENANT_DATA_EXPORT_DELETED,
    entityType: ENTITY_TYPE,
    entityId: row.id
  });
}
