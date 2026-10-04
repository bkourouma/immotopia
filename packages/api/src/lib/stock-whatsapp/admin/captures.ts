import { prisma } from '../../../utils/database';
import { assertBelongsToTenant } from '../../../utils/tenant-ownership';
import { AppError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { recordAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { logger } from '../../../utils/logger';
import type { PrivateFile } from '../../files/private-files';
import type { StockCallerContext } from '../../finance/types-040-controle';
import { deleteCapturePhoto, readCapturePhoto } from '../capture-files';
import type { StockVisionResult } from '../types';
import { stockVisionResultSchema } from '../types';
import { isUuid, type CapturesQuery } from './schemas';
import { userLabelOf } from './sessions';

/**
 * Captures et preuve de l'inventaire par WhatsApp, côté agence (lot 041, T10,
 * W14-R2, W14-R4, W14-R5).
 *
 * Lecture : `STOCK_VIEW` (garde de la route). Une capture ne porte AUCUNE
 * quantité théorique (T10) : rien n'y est masqué au titre de l'aveugle ; les
 * quantités rendues sont celles que l'IA a proposées et que le chef a
 * comptées. Aucune valeur n'y figure (§8.1 sans objet).
 *
 * Le fichier ne se sert jamais en statique : `readCapturePhoto` relit le chemin
 * stocké sous le dossier attendu de l'agence, la route l'envoie par
 * `sendPrivateFile` (`no-store`) et le middleware d'accès trace la lecture
 * (`DOCUMENT_DOWNLOADED`).
 */

export const CONFIRMED_OUTCOMES = ['ACCEPTED', 'CORRECTED'] as const;

/** Écart toléré entre la confirmation d'une capture et l'heure serveur de la ligne qu'elle écrit. */
export const CAPTURE_LINE_TOLERANCE_MS = 2_000;

function quantityOf(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 10_000) / 10_000 : null;
}

/**
 * Vrai si la capture a écrit la valeur ACTUELLE de la ligne d'inventaire : même
 * auteur (le chef de la capture est le dernier compteur de la ligne) ET, soit la
 * même quantité (`lineQuantityAfter`, à défaut `confirmedQuantity`), soit une
 * confirmation au plus tôt 2 s avant `countedAtServer`.
 *
 * Après une ressaisie au bureau (autre auteur, ou même auteur plus tard avec une
 * autre quantité), la capture n'est plus « la » preuve de la ligne : la ligne
 * est de source `WEB` et la capture reste dans l'historique de l'inventaire
 * (`GET …/captures?countId=`). Une ligne non comptée n'a pas de preuve.
 */
export function captureWroteLineValue(
  capture: { userId: string; confirmedAt: Date | null; lineQuantityAfter: unknown; confirmedQuantity: unknown },
  line: { countedByUserId: string | null; countedQuantity: unknown; countedAtServer: Date | null }
): boolean {
  if (!capture.confirmedAt) return false;
  const lineQuantity = quantityOf(line.countedQuantity);
  if (lineQuantity === null) return false;
  if (!line.countedByUserId || line.countedByUserId !== capture.userId) return false;

  const written = quantityOf(capture.lineQuantityAfter) ?? quantityOf(capture.confirmedQuantity);
  if (written !== null && written === lineQuantity) return true;

  if (!line.countedAtServer) return false;
  return (
    new Date(capture.confirmedAt).getTime() >= new Date(line.countedAtServer).getTime() - CAPTURE_LINE_TOLERANCE_MS
  );
}

export type CaptureOutcome =
  | 'RECEIVED'
  | 'PENDING'
  | 'ACCEPTED'
  | 'CORRECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'UNREADABLE'
  | 'UNRECOGNIZED'
  | 'FAILED';

export type CaptureSummary = {
  id: string;
  receivedAt: string;
  outcome: CaptureOutcome;
  via: 'META' | 'SIMULATOR';
  siteName: string | null;
  locationId: string | null;
  itemId: string | null;
  itemLabel: string | null;
  unit: string | null;
  proposedTotal: number | null;
  confirmedQuantity: number | null;
  chefLabel: string;
  countId: string | null;
  hasPhoto: boolean;
};

export type CaptureView = CaptureSummary & {
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  itemImposed: boolean;
  itemReference: string | null;
  countLineId: string | null;
  countStatus: 'DRAFT' | 'COUNTED' | 'VALIDATED' | 'CANCELLED' | null;
  lineQuantityAfter: number | null;
  mergeMode: 'ADD' | 'REPLACE' | null;
  confirmedAt: string | null;
  sessionId: string;
  analysis: StockVisionResult | null;
  vision: {
    provider: string | null;
    model: string | null;
    analysisMs: number | null;
    failureReason: 'TIMEOUT' | 'PROVIDER_ERROR' | 'INVALID_OUTPUT' | 'DISABLED' | null;
  };
  photoRemoved: { at: string; byLabel: string; reason: string } | null;
  canRemovePhoto: boolean;
  canReadConversation: boolean;
};

export type CountFieldCaptures = {
  countId: string;
  source: 'WEB' | 'WHATSAPP';
  lines: Array<{
    itemId: string;
    countLineId: string | null;
    captureId: string;
    outcome: 'ACCEPTED' | 'CORRECTED';
    mergeMode: 'ADD' | 'REPLACE' | null;
    confirmedAt: string;
    hasPhoto: boolean;
    capturesCount: number;
  }>;
};

// ---------------------------------------------------------------------------
// Lecture des lignes
// ---------------------------------------------------------------------------

const userLabelSelect = { select: { fullName: true, email: true } } as const;

const summarySelect = {
  id: true,
  receivedAt: true,
  outcome: true,
  via: true,
  locationId: true,
  itemId: true,
  proposedTotal: true,
  confirmedQuantity: true,
  countId: true,
  fileUrl: true,
  photoRemovedAt: true,
  site: { select: { name: true } },
  item: { select: { label: true, unit: true, reference: true } },
  user: userLabelSelect
} as const;

const viewSelect = {
  ...summarySelect,
  tenantId: true,
  sessionId: true,
  sha256: true,
  mimeType: true,
  sizeBytes: true,
  itemImposed: true,
  countLineId: true,
  lineQuantityAfter: true,
  mergeMode: true,
  confirmedAt: true,
  analysis: true,
  visionProvider: true,
  visionModel: true,
  analysisMs: true,
  failureReason: true,
  photoRemovalReason: true,
  count: { select: { status: true } },
  photoRemovedBy: userLabelSelect
} as const;

/** Décimal Prisma (ou nombre) → nombre ; `null` reste `null`. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

type SummaryRecord = {
  id: string;
  receivedAt: Date;
  outcome: string;
  via: string;
  locationId: string | null;
  itemId: string | null;
  proposedTotal: unknown;
  confirmedQuantity: unknown;
  countId: string | null;
  fileUrl: string | null;
  photoRemovedAt: Date | null;
  site: { name: string } | null;
  item: { label: string; unit: string; reference: string } | null;
  user: { fullName: string | null; email: string } | null;
};

type ViewRecord = SummaryRecord & {
  tenantId: string;
  sessionId: string;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  itemImposed: boolean;
  countLineId: string | null;
  lineQuantityAfter: unknown;
  mergeMode: string | null;
  confirmedAt: Date | null;
  analysis: unknown;
  visionProvider: string | null;
  visionModel: string | null;
  analysisMs: number | null;
  failureReason: string | null;
  photoRemovalReason: string | null;
  count: { status: string } | null;
  photoRemovedBy: { fullName: string | null; email: string } | null;
};

/** Une photo est présente tant qu'elle n'a pas été retirée et qu'un fichier est rattaché. */
function hasPhotoOf(record: { fileUrl: string | null; photoRemovedAt: Date | null }): boolean {
  return Boolean(record.fileUrl) && !record.photoRemovedAt;
}

function mergeModeOf(value: string | null): 'ADD' | 'REPLACE' | null {
  return value === 'ADD' || value === 'REPLACE' ? value : null;
}

const FAILURE_REASONS = new Set(['TIMEOUT', 'PROVIDER_ERROR', 'INVALID_OUTPUT', 'DISABLED']);
const COUNT_STATUSES = new Set(['DRAFT', 'COUNTED', 'VALIDATED', 'CANCELLED']);

/** L'analyse stockée, relue par le schéma de l'IA : rien d'autre ne sort (jamais la réponse brute). */
function analysisOf(value: unknown): StockVisionResult | null {
  if (value === null || value === undefined) return null;
  const parsed = stockVisionResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toSummary(record: SummaryRecord): CaptureSummary {
  return {
    id: record.id,
    receivedAt: record.receivedAt.toISOString(),
    outcome: record.outcome as CaptureOutcome,
    via: record.via as CaptureSummary['via'],
    siteName: record.site?.name ?? null,
    locationId: record.locationId,
    itemId: record.itemId,
    itemLabel: record.item?.label ?? null,
    unit: record.item?.unit ?? null,
    proposedTotal: toNumber(record.proposedTotal),
    confirmedQuantity: toNumber(record.confirmedQuantity),
    chefLabel: userLabelOf(record.user),
    countId: record.countId,
    hasPhoto: hasPhotoOf(record)
  };
}

function toView(record: ViewRecord, ctx: StockCallerContext): CaptureView {
  const hasPhoto = hasPhotoOf(record);
  return {
    ...toSummary(record),
    sha256: record.sha256,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    itemImposed: record.itemImposed,
    itemReference: record.item?.reference ?? null,
    countLineId: record.countLineId,
    countStatus:
      record.count && COUNT_STATUSES.has(record.count.status)
        ? (record.count.status as CaptureView['countStatus'])
        : null,
    lineQuantityAfter: toNumber(record.lineQuantityAfter),
    mergeMode: mergeModeOf(record.mergeMode),
    confirmedAt: record.confirmedAt ? record.confirmedAt.toISOString() : null,
    sessionId: record.sessionId,
    analysis: analysisOf(record.analysis),
    vision: {
      provider: record.visionProvider,
      model: record.visionModel,
      analysisMs: record.analysisMs,
      failureReason:
        record.failureReason && FAILURE_REASONS.has(record.failureReason)
          ? (record.failureReason as CaptureView['vision']['failureReason'])
          : null
    },
    photoRemoved: record.photoRemovedAt
      ? {
          at: record.photoRemovedAt.toISOString(),
          byLabel: userLabelOf(record.photoRemovedBy),
          reason: record.photoRemovalReason ?? ''
        }
      : null,
    canRemovePhoto: ctx.canDispose && hasPhoto,
    canReadConversation: ctx.canManageSettings || ctx.canValidateCount
  };
}

// ---------------------------------------------------------------------------
// Curseur opaque : (receivedAt, id), du plus récent au plus ancien
// ---------------------------------------------------------------------------

function encodeCursor(receivedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify([receivedAt.toISOString(), id]), 'utf8').toString('base64url');
}

function decodeCursor(raw: string | undefined): { receivedAt: Date; id: string } | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [receivedAt, id] = parsed;
    if (typeof receivedAt !== 'string' || !isUuid(id)) return null;
    const date = new Date(receivedAt);
    return Number.isNaN(date.getTime()) ? null : { receivedAt: date, id };
  } catch {
    return null;
  }
}

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** `GET …/captures` — filtres de l'agence, du plus récent au plus ancien. */
export async function listCaptures(
  tenantId: string,
  query: CapturesQuery
): Promise<{ data: CaptureSummary[]; nextCursor: string | null }> {
  await assertBelongsToTenant(prisma, 'stockCount', query.countId, tenantId, { message: 'Inventaire introuvable.' });
  await assertBelongsToTenant(prisma, 'stockLocation', query.locationId, tenantId, {
    message: 'Lieu de stockage introuvable.'
  });
  await assertBelongsToTenant(prisma, 'stockItem', query.itemId, tenantId, { message: 'Article introuvable.' });

  const after = decodeCursor(query.cursor);
  const receivedAt: { gte?: Date; lt?: Date } = {};
  if (query.from) receivedAt.gte = new Date(`${query.from}T00:00:00.000Z`);
  if (query.to) receivedAt.lt = new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + DAY_MS);

  const rows = (await prisma.stockFieldCapture.findMany({
    where: {
      tenantId,
      ...(query.countId ? { countId: query.countId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(receivedAt.gte || receivedAt.lt ? { receivedAt } : {}),
      ...(after
        ? {
            OR: [{ receivedAt: { lt: after.receivedAt } }, { receivedAt: after.receivedAt, id: { lt: after.id } }]
          }
        : {})
    },
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    select: summarySelect
  })) as SummaryRecord[];

  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    data: page.map(toSummary),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last.receivedAt, last.id) : null
  };
}

async function findCaptureForTenant(tenantId: string, captureId: string): Promise<ViewRecord> {
  if (!isUuid(captureId)) throw new NotFoundError('Capture introuvable.');
  const record = (await prisma.stockFieldCapture.findFirst({
    where: { id: captureId, tenantId },
    select: viewSelect
  })) as ViewRecord | null;
  if (!record) throw new NotFoundError('Capture introuvable.');
  return record;
}

/** `GET …/captures/{captureId}` — détail pour le visualiseur de preuve. */
export async function getCapture(tenantId: string, captureId: string, ctx: StockCallerContext): Promise<CaptureView> {
  return toView(await findCaptureForTenant(tenantId, captureId), ctx);
}

/**
 * `GET …/captures/{captureId}/file` — la photo d'une capture de l'agence.
 * Photo retirée : `404 STOCK_WHATSAPP_PHOTO_REMOVED` (levé par `readCapturePhoto`).
 */
export async function getCaptureFile(tenantId: string, captureId: string): Promise<PrivateFile> {
  if (!isUuid(captureId)) throw new NotFoundError('Capture introuvable.');
  const record = await prisma.stockFieldCapture.findFirst({
    where: { id: captureId, tenantId },
    select: { tenantId: true, fileUrl: true, receivedAt: true, photoRemovedAt: true }
  });
  if (!record) throw new NotFoundError('Capture introuvable.');
  return readCapturePhoto({
    tenantId: record.tenantId,
    fileUrl: record.photoRemovedAt ? null : record.fileUrl,
    receivedAt: record.receivedAt
  });
}

function photoAlreadyRemoved(): AppError {
  return new AppError('Cette photo a déjà été retirée.', 409, ErrorCode.STOCK_WHATSAPP_PHOTO_ALREADY_REMOVED);
}

/**
 * `POST …/captures/{captureId}/remove-photo` (W14-R5, `STOCK_DISPOSE`).
 *
 * Dans une transaction : retrait conditionnel (`photoRemovedAt` nul) et audit
 * critique `STOCK_WHATSAPP_PHOTO_REMOVED`. La ligne et l'empreinte restent. Le
 * fichier est effacé APRÈS la validation de la transaction : une transaction
 * annulée ne perd jamais la preuve ; un effacement manqué laisse un fichier
 * orphelin, signalé au journal technique, plus jamais servi (`fileUrl` nul).
 */
export async function removeCapturePhoto(
  tenantId: string,
  actorUserId: string,
  captureId: string,
  reason: string,
  ctx: StockCallerContext
): Promise<CaptureView> {
  if (!isUuid(captureId)) throw new NotFoundError('Capture introuvable.');

  const removedFileUrl = await prisma.$transaction(async tx => {
    const current = await tx.stockFieldCapture.findFirst({
      where: { id: captureId, tenantId },
      select: { id: true, fileUrl: true, photoRemovedAt: true, sha256: true, countId: true, itemId: true }
    });
    if (!current) throw new NotFoundError('Capture introuvable.');
    if (current.photoRemovedAt || !current.fileUrl) throw photoAlreadyRemoved();
    const fileUrl = current.fileUrl;

    const removedAt = new Date();
    const updated = await tx.stockFieldCapture.updateMany({
      where: { id: captureId, tenantId, photoRemovedAt: null },
      data: {
        fileUrl: null,
        photoRemovedAt: removedAt,
        photoRemovedByUserId: actorUserId,
        photoRemovalReason: reason
      }
    });
    // Deux retraits simultanés : un seul passe, l'autre voit la photo déjà retirée.
    if (updated.count !== 1) throw photoAlreadyRemoved();

    await recordAuditEvent(tx, {
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.STOCK_WHATSAPP_PHOTO_REMOVED,
      entityType: 'StockFieldCapture',
      entityId: captureId,
      payload: {
        reason,
        sha256: current.sha256,
        countId: current.countId,
        itemId: current.itemId
      }
    });
    return fileUrl;
  });

  try {
    await deleteCapturePhoto(removedFileUrl);
  } catch (error) {
    // Effacement best effort : la photo n'est plus servie (`fileUrl` nul).
    logger.warn('Inventaire WhatsApp : fichier de photo retirée non effacé', {
      tenantId,
      captureId,
      error: error instanceof Error ? error.name : 'inconnue'
    });
  }

  return getCapture(tenantId, captureId, ctx);
}

/**
 * `GET …/counts/{countId}/captures` — pour l'écran Inventaire du lot 040.
 *
 * Par article : la capture qui a fixé la quantité de sa ligne (`confirmedAt` le
 * plus récent, `ACCEPTED` ou `CORRECTED`) et le nombre de captures confirmées
 * (additions comprises). Aucun attendu : l'écran Inventaire le lit dans
 * `CountView`, sous les règles du lot 040.
 *
 * La capture la plus récente n'est rendue que si elle a écrit la valeur
 * ACTUELLE de la ligne (`captureWroteLineValue`) : après une ressaisie au
 * bureau, l'article n'a plus de badge WhatsApp ni de « Voir la photo », et ses
 * captures restent listées par `GET …/captures?countId=`.
 */
export async function listCountCaptures(tenantId: string, countId: string): Promise<CountFieldCaptures> {
  if (!isUuid(countId)) throw new NotFoundError('Inventaire introuvable.');
  const count = await prisma.stockCount.findFirst({
    where: { id: countId, tenantId },
    select: { id: true, source: true }
  });
  if (!count) throw new NotFoundError('Inventaire introuvable.');

  const captures = await prisma.stockFieldCapture.findMany({
    where: {
      tenantId,
      countId: count.id,
      outcome: { in: [...CONFIRMED_OUTCOMES] },
      confirmedAt: { not: null },
      itemId: { not: null }
    },
    orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      userId: true,
      itemId: true,
      countLineId: true,
      outcome: true,
      mergeMode: true,
      confirmedAt: true,
      confirmedQuantity: true,
      lineQuantityAfter: true,
      fileUrl: true,
      photoRemovedAt: true
    }
  });

  // Les lignes de l'inventaire (enfant sans `tenantId` : filtrées par le parent).
  const countLines = await prisma.stockCountLine.findMany({
    where: { countId: count.id, count: { tenantId } },
    select: { id: true, itemId: true, countedQuantity: true, countedByUserId: true, countedAtServer: true }
  });
  const lineById = new Map(countLines.map(line => [line.id, line]));
  const lineByItem = new Map(countLines.map(line => [line.itemId, line]));

  const byItem = new Map<string, CountFieldCaptures['lines'][number]>();
  const latestSeen = new Set<string>();
  for (const capture of captures) {
    if (!capture.itemId || !capture.confirmedAt) continue;
    const existing = byItem.get(capture.itemId);
    if (existing) {
      existing.capturesCount += 1;
      continue;
    }
    // Seule la capture la plus récente de l'article peut être « la » preuve.
    if (latestSeen.has(capture.itemId)) continue;
    latestSeen.add(capture.itemId);
    const line =
      (capture.countLineId ? lineById.get(capture.countLineId) : undefined) ?? lineByItem.get(capture.itemId);
    if (!line || !captureWroteLineValue(capture, line)) continue;
    byItem.set(capture.itemId, {
      itemId: capture.itemId,
      countLineId: capture.countLineId,
      captureId: capture.id,
      outcome: capture.outcome as 'ACCEPTED' | 'CORRECTED',
      mergeMode: mergeModeOf(capture.mergeMode),
      confirmedAt: capture.confirmedAt.toISOString(),
      hasPhoto: hasPhotoOf(capture),
      capturesCount: 1
    });
  }

  return {
    countId: count.id,
    source: count.source === 'WHATSAPP' ? 'WHATSAPP' : 'WEB',
    lines: [...byItem.values()]
  };
}
