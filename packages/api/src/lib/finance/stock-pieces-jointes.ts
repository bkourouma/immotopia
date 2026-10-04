/**
 * Pièces jointes du stock — lot 040, territoire API-4 (spec B5 ; data-model
 * §2.7 ; contrat `AttachmentView`).
 *
 * Deux étages dans ce fichier :
 *
 * 1. **Aides pures sur les octets** (contrat figé pour le lot 041, plan §11) :
 *    `detectStockFileKind`, `stripImageMetadata`, `sha256Hex`. Aucune
 *    dépendance nouvelle : le filtre parcourt la structure du fichier
 *    (segments JPEG, blocs PNG, blocs RIFF du WebP) et recopie tout ce qui
 *    n'est pas une métadonnée. Le lot 041 (photos reçues par WhatsApp) les
 *    appelle telles quelles.
 * 2. **Le service** : dépôt (droit propre à la cible, B5-R6 ; idempotence,
 *    B5-R7), liste, lecture du fichier et retrait (B5-R5).
 *
 * Le fichier est PRIVÉ : écrit sous `uploads/stock/<tenantId>/<aaaa>/<uuid>.<ext>`,
 * jamais servi en statique (`uploads-access-middleware.ts` ne laisse passer
 * que les médias publics), relu par `private-files.ts` après contrôle de
 * l'agence. Le dossier `stock/` est déclaré à l'export d'agence (B5-R9,
 * `tenant-data-export/file-references.ts`).
 */

import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

import { env } from '../../config/env';
import { AppError, ErrorCode, ForbiddenError, NotFoundError } from '../../middleware/error-middleware';
import { logAuditEvent, recordAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { getUploadsRoot } from '../../utils/project-root';
import { privateUploadPath, readPrivateUpload, type PrivateFile } from '../files/private-files';
import { detectProviderInvoiceFileKind } from '../syndics/provider-invoice-files';
import {
  claimClientRequestTx,
  completeClientRequestTx,
  findClientRequestReplay,
  hashRequestBody,
  isUniqueViolation,
  stockError
} from './stock-controles';
import type {
  AttachmentView,
  StockAttachmentPurpose,
  StockAttachmentTarget,
  StockCallerContext
} from './types-040-controle';

// ===========================================================================
// 1. Aides pures (contrat du lot 041, plan §11)
// ===========================================================================

/** Les quatre types acceptés, lus dans les octets (B5-R2). */
export type StockFileKind = 'jpeg' | 'png' | 'webp' | 'pdf';

/**
 * Type réel d'après les octets magiques — jamais le nom ni le type déclaré.
 * PDF, PNG et JPEG par l'aide existante des factures de prestataires
 * (`detectProviderInvoiceFileKind`), étendue ici au WebP (`RIFF....WEBP`).
 * `null` pour tout autre contenu (HTML, script, archive…).
 */
export function detectStockFileKind(buffer: Buffer): StockFileKind | null {
  const known = detectProviderInvoiceFileKind(buffer);
  if (known === 'jpg') return 'jpeg';
  if (known) return known;
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** SHA-256 hexadécimal (64 caractères minuscules) — empreinte du fichier STOCKÉ (B5-R4). */
export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function unreadableImage(): AppError {
  return stockError(
    400,
    ErrorCode.STOCK_ATTACHMENT_TYPE,
    "L'image est illisible ou incomplète. Reprenez la photo et réessayez."
  );
}

/**
 * Retire les métadonnées d'une image AVANT écriture (B5-R3) : EXIF, dont la
 * position GPS, et blocs XMP qui peuvent la répéter.
 *
 * - JPEG : segments APP1 (EXIF, XMP) et APP13 (IPTC) retirés ; le reste des
 *   segments et les données d'image recopiés tels quels ; tout octet après la
 *   fin d'image (EOI) est abandonné (certains appareils y accolent des données).
 * - PNG : bloc `eXIf` retiré, ainsi que les blocs texte qui transportent de
 *   l'EXIF ou du XMP (`XML:com.adobe.xmp`, `Raw profile type exif|xmp|iptc`).
 * - WebP : blocs `EXIF` et `XMP ` retirés, drapeaux EXIF et XMP du bloc
 *   `VP8X` remis à zéro, taille RIFF recalculée.
 * - PDF : inchangé.
 *
 * Une image dont la structure est cassée lève `400 STOCK_ATTACHMENT_TYPE` :
 * on ne stocke jamais une image qu'on n'a pas su nettoyer.
 */
export function stripImageMetadata(buffer: Buffer, kind: StockFileKind): Buffer {
  switch (kind) {
    case 'jpeg':
      return stripJpegMetadata(buffer);
    case 'png':
      return stripPngMetadata(buffer);
    case 'webp':
      return stripWebpMetadata(buffer);
    default:
      return buffer;
  }
}

/** Marqueurs sans longueur : RST0 à RST7, TEM. */
function isStandaloneJpegMarker(marker: number): boolean {
  return (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01;
}

/** APP1 (EXIF, XMP) et APP13 (Photoshop / IPTC). */
const JPEG_METADATA_MARKERS = new Set([0xe1, 0xed]);

function stripJpegMetadata(buffer: Buffer): Buffer {
  const n = buffer.length;
  if (n < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) throw unreadableImage();

  const out: Buffer[] = [buffer.subarray(0, 2)];
  let i = 2;
  let sawScan = false;
  for (;;) {
    if (i >= n) {
      // Fin de fichier sans EOI : tolérée après les données d'image seulement.
      if (sawScan) break;
      throw unreadableImage();
    }
    if (buffer[i] !== 0xff) throw unreadableImage();
    while (i < n && buffer[i] === 0xff) i += 1; // octets de remplissage
    if (i >= n) throw unreadableImage();
    const marker = buffer[i];
    i += 1;

    if (marker === 0xd9) {
      out.push(Buffer.from([0xff, 0xd9]));
      break; // EOI : tout ce qui suit est abandonné.
    }
    if (marker === 0x00 || marker === 0xd8) throw unreadableImage();
    if (isStandaloneJpegMarker(marker)) {
      out.push(Buffer.from([0xff, marker]));
      continue;
    }

    if (i + 2 > n) throw unreadableImage();
    const segmentLength = buffer.readUInt16BE(i);
    const segmentEnd = i + segmentLength;
    if (segmentLength < 2 || segmentEnd > n) throw unreadableImage();
    if (!JPEG_METADATA_MARKERS.has(marker)) {
      out.push(Buffer.from([0xff, marker]), buffer.subarray(i, segmentEnd));
    }
    i = segmentEnd;

    if (marker === 0xda) {
      // Données d'image d'un balayage : jusqu'au prochain marqueur qui n'est
      // ni un octet bourré (FF 00) ni un RST. Un JPEG progressif enchaîne
      // ensuite d'autres segments (DHT, SOS) : la boucle reprend.
      sawScan = true;
      const start = i;
      while (i < n) {
        if (buffer[i] === 0xff && i + 1 < n) {
          const next = buffer[i + 1];
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
            i += 2;
            continue;
          }
          if (next === 0xff) {
            i += 1;
            continue;
          }
          break;
        }
        i += 1;
      }
      out.push(buffer.subarray(start, i));
    }
  }
  return Buffer.concat(out);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_TEXT_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt']);
const PNG_METADATA_KEYWORD = /^(XML:com\.adobe\.xmp|Raw profile type (exif|xmp|iptc|APP1))$/i;

function isPngMetadataChunk(type: string, data: Buffer): boolean {
  if (type === 'eXIf') return true;
  if (!PNG_TEXT_CHUNKS.has(type)) return false;
  const nul = data.indexOf(0);
  const keyword = data.subarray(0, nul >= 0 ? nul : Math.min(data.length, 79)).toString('latin1');
  return PNG_METADATA_KEYWORD.test(keyword);
}

function stripPngMetadata(buffer: Buffer): Buffer {
  const n = buffer.length;
  if (n < PNG_SIGNATURE.length || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw unreadableImage();

  const out: Buffer[] = [buffer.subarray(0, 8)];
  let i = 8;
  let sawEnd = false;
  while (i < n) {
    if (i + 12 > n) throw unreadableImage();
    const length = buffer.readUInt32BE(i);
    const type = buffer.subarray(i + 4, i + 8).toString('latin1');
    const chunkEnd = i + 12 + length;
    if (!/^[A-Za-z]{4}$/.test(type) || chunkEnd > n) throw unreadableImage();
    const data = buffer.subarray(i + 8, i + 8 + length);
    if (!isPngMetadataChunk(type, data)) out.push(buffer.subarray(i, chunkEnd));
    i = chunkEnd;
    if (type === 'IEND') {
      sawEnd = true;
      break; // tout octet après IEND est abandonné
    }
  }
  if (!sawEnd) throw unreadableImage();
  return Buffer.concat(out);
}

const WEBP_METADATA_CHUNKS = new Set(['EXIF', 'XMP ']);
/** Drapeaux du bloc VP8X : EXIF (bit 3) et XMP (bit 2). */
const VP8X_EXIF_FLAG = 0x08;
const VP8X_XMP_FLAG = 0x04;

function stripWebpMetadata(buffer: Buffer): Buffer {
  const n = buffer.length;
  if (
    n < 12 ||
    buffer.subarray(0, 4).toString('latin1') !== 'RIFF' ||
    buffer.subarray(8, 12).toString('latin1') !== 'WEBP'
  ) {
    throw unreadableImage();
  }
  const riffEnd = 8 + buffer.readUInt32LE(4);
  if (riffEnd > n || riffEnd < 12) throw unreadableImage();

  const chunks: Buffer[] = [];
  let i = 12;
  while (i < riffEnd) {
    if (i + 8 > riffEnd) throw unreadableImage();
    const fourcc = buffer.subarray(i, i + 4).toString('latin1');
    const size = buffer.readUInt32LE(i + 4);
    const chunkEnd = i + 8 + size + (size & 1); // bourrage à un nombre pair
    if (chunkEnd > riffEnd) throw unreadableImage();
    if (!WEBP_METADATA_CHUNKS.has(fourcc)) {
      if (fourcc === 'VP8X' && size >= 1) {
        const copy = Buffer.from(buffer.subarray(i, chunkEnd));
        copy[8] &= ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG) & 0xff;
        chunks.push(copy);
      } else {
        chunks.push(buffer.subarray(i, chunkEnd));
      }
    }
    i = chunkEnd;
  }

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

// ===========================================================================
// 2. Le service
// ===========================================================================

/** 10 Mo au plus (B5-R2). */
export const STOCK_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Le dépositaire peut retirer sa pièce dans les 15 minutes (B5-R5). */
export const STOCK_ATTACHMENT_DEPOSITOR_WINDOW_MS = 15 * 60 * 1000;

const EXTENSION_BY_KIND: Record<StockFileKind, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', pdf: 'pdf' };
const MIME_BY_KIND: Record<StockFileKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf'
};

const ATTACHMENT_SELECT = {
  id: true,
  targetType: true,
  movementId: true,
  slipId: true,
  countLineId: true,
  purpose: true,
  caption: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  sha256: true,
  uploadedByUserId: true,
  createdAt: true,
  removedAt: true,
  removalReason: true,
  uploadedBy: { select: { fullName: true, email: true } },
  removedBy: { select: { fullName: true, email: true } }
} as const;

interface AttachmentRow {
  id: string;
  targetType: StockAttachmentTarget;
  movementId: string | null;
  slipId: string | null;
  countLineId: string | null;
  purpose: StockAttachmentPurpose;
  caption: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedByUserId: string;
  createdAt: Date;
  removedAt: Date | null;
  removalReason: string | null;
  uploadedBy?: { fullName?: string | null; email?: string | null } | null;
  removedBy?: { fullName?: string | null; email?: string | null } | null;
}

function userLabel(user?: { fullName?: string | null; email?: string | null } | null): string {
  return user?.fullName || user?.email || 'Utilisateur inconnu';
}

function targetIdOf(row: Pick<AttachmentRow, 'targetType' | 'movementId' | 'slipId' | 'countLineId'>): string {
  if (row.targetType === 'MOVEMENT') return row.movementId ?? '';
  if (row.targetType === 'SLIP') return row.slipId ?? '';
  return row.countLineId ?? '';
}

/** Fin des 15 minutes du dépositaire. */
export function attachmentRemovableUntil(createdAt: Date): Date {
  return new Date(createdAt.getTime() + STOCK_ATTACHMENT_DEPOSITOR_WINDOW_MS);
}

/**
 * Qui peut retirer (B5-R5, B5-R6) : le dépositaire jusqu'à la fin de ses 15
 * minutes, un détenteur de STOCK_DISPOSE à tout moment. Une pièce déjà
 * retirée ne se retire plus.
 */
export function canRemoveAttachment(
  row: Pick<AttachmentRow, 'uploadedByUserId' | 'createdAt' | 'removedAt'>,
  ctx: StockCallerContext,
  now: Date = new Date()
): boolean {
  if (row.removedAt) return false;
  if (ctx.canDispose) return true;
  return row.uploadedByUserId === ctx.userId && now.getTime() <= attachmentRemovableUntil(row.createdAt).getTime();
}

/** Contrat `AttachmentView`, calculé pour l'appelant. */
export function toAttachmentView(row: AttachmentRow, ctx: StockCallerContext, now: Date = new Date()): AttachmentView {
  const isDepositor = row.uploadedByUserId === ctx.userId;
  return {
    id: row.id,
    targetType: row.targetType,
    targetId: targetIdOf(row),
    purpose: row.purpose,
    caption: row.caption ?? null,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    uploadedByLabel: userLabel(row.uploadedBy),
    createdAt: row.createdAt,
    removed: row.removedAt
      ? { at: row.removedAt, byLabel: userLabel(row.removedBy), reason: row.removalReason ?? '' }
      : null,
    canRemove: canRemoveAttachment(row, ctx, now),
    removableUntil: isDepositor && !row.removedAt ? attachmentRemovableUntil(row.createdAt) : null
  };
}

/** Le filtre d'une cible, côté pièce jointe. */
function targetWhere(targetType: StockAttachmentTarget, targetId: string) {
  if (targetType === 'MOVEMENT') return { targetType, movementId: targetId };
  if (targetType === 'SLIP') return { targetType, slipId: targetId };
  return { targetType, countLineId: targetId };
}

/**
 * Les pièces jointes d'une cible, retirées comprises, plus anciennes d'abord.
 * L'appelant a déjà vérifié que la cible appartient à l'agence.
 */
export async function loadAttachmentViews(
  db: PrismaTransactionClient,
  tenantId: string,
  ctx: StockCallerContext,
  targetType: StockAttachmentTarget,
  targetId: string,
  now: Date = new Date()
): Promise<AttachmentView[]> {
  const rows = await db.stockAttachment.findMany({
    where: { tenantId, ...targetWhere(targetType, targetId) },
    select: ATTACHMENT_SELECT,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
  return (rows as AttachmentRow[]).map(row => toAttachmentView(row, ctx, now));
}

/** Ce que la cible exige pour un dépôt (B5-R6). */
interface ResolvedTarget {
  /** Le droit propre à la cible est-il détenu ? */
  allowed: (ctx: StockCallerContext) => boolean;
}

const MOVEMENT_DEPOSIT_RIGHT: Partial<Record<string, (ctx: StockCallerContext) => boolean>> = {
  ISSUE: ctx => ctx.canIssue,
  TRANSFER: ctx => ctx.canTransfer,
  SCRAP: ctx => ctx.canDispose,
  SUPPLIER_RETURN: ctx => ctx.canDispose
};

const SLIP_DEPOSIT_RIGHT: Record<string, (ctx: StockCallerContext) => boolean> = {
  RECEIPT: ctx => ctx.canReceive,
  ISSUE: ctx => ctx.canIssue,
  COUNT_REPORT: ctx => ctx.canValidateCount
};

function targetNotAllowed(message: string): AppError {
  return stockError(409, ErrorCode.STOCK_ATTACHMENT_TARGET_NOT_ALLOWED, message);
}

/**
 * Vérifie que la cible existe DANS l'agence (une cible d'une autre agence lève
 * la même `NotFoundError` qu'une cible inexistante, spec §8.3) et, pour un
 * dépôt, qu'elle accepte une pièce jointe.
 */
async function resolveAttachmentTarget(
  db: PrismaTransactionClient,
  tenantId: string,
  targetType: StockAttachmentTarget,
  targetId: string,
  forDeposit: boolean
): Promise<ResolvedTarget> {
  if (targetType === 'MOVEMENT') {
    const movement = await db.stockMovement.findFirst({
      where: { id: targetId, tenantId },
      select: { id: true, type: true, isDecrease: true }
    });
    if (!movement) throw new NotFoundError('Mouvement de stock introuvable.');
    if (forDeposit) {
      if (movement.type === 'RECEIPT') {
        throw targetNotAllowed('Une réception se documente sur son bon de réception, pas sur le mouvement.');
      }
      if (movement.type === 'ADJUSTMENT') {
        throw targetNotAllowed("Un ajustement se documente sur la ligne d'inventaire qui l'a produit.");
      }
      if (movement.type === 'TRANSFER' && !movement.isDecrease) {
        throw targetNotAllowed('Joignez la pièce à la moitié sortante du transfert.');
      }
    }
    const right = MOVEMENT_DEPOSIT_RIGHT[movement.type];
    return { allowed: ctx => (right ? right(ctx) : false) };
  }

  if (targetType === 'SLIP') {
    const slip = await db.stockSlip.findFirst({ where: { id: targetId, tenantId }, select: { id: true, kind: true } });
    if (!slip) throw new NotFoundError('Bon introuvable.');
    const right = SLIP_DEPOSIT_RIGHT[slip.kind];
    return { allowed: ctx => (right ? right(ctx) : false) };
  }

  // Ligne d'inventaire : enfant de StockCount, l'agence se lit sur le parent.
  const line = await db.stockCountLine.findFirst({
    where: { id: targetId, count: { tenantId } },
    select: { id: true, count: { select: { status: true } } }
  });
  if (!line) throw new NotFoundError("Ligne d'inventaire introuvable.");
  if (forDeposit && line.count?.status !== 'COUNTED') {
    throw stockError(
      409,
      ErrorCode.STOCK_COUNT_WRONG_STATUS,
      "Une pièce jointe se dépose sur une ligne d'inventaire clos, avant sa validation."
    );
  }
  return { allowed: ctx => ctx.canCount || ctx.canValidateCount };
}

/** Nom d'affichage nettoyé, avec l'extension du type réel ; jamais utilisé comme chemin. */
export function displayFileName(original: string | null | undefined, kind: StockFileKind): string {
  const extension = EXTENSION_BY_KIND[kind];
  const base = path.basename((original ?? '').replace(/\\/g, '/'));
  const withoutExtension = base.replace(/\.[^.]*$/, '');
  const cleaned = withoutExtension
    .replace(/[^\p{L}\p{N} ._-]/gu, '')
    .trim()
    .slice(0, 150);
  return `${cleaned || 'piece-jointe'}.${extension}`;
}

function stockFolderSegments(tenantId: string, year: string): string[] {
  return ['stock', tenantId, year];
}

/** `/uploads/stock/<tenantId>/<aaaa>/<fichier>` → chemin relatif vérifié, ou `null`. */
export function stockAttachmentRelativePath(tenantId: string, fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null;
  const match = /^\/uploads\/stock\/[^/]+\/(\d{4})\/[^/]+$/.exec(fileUrl);
  if (!match) return null;
  return privateUploadPath(fileUrl, stockFolderSegments(tenantId, match[1]));
}

async function writeStockFile(
  tenantId: string,
  buffer: Buffer,
  kind: StockFileKind,
  now: Date
): Promise<{ fileUrl: string; absolute: string }> {
  const year = String(now.getUTCFullYear());
  const segments = stockFolderSegments(tenantId, year);
  const directory = path.join(getUploadsRoot(env.UPLOADS_DIR), ...segments);
  await fs.mkdir(directory, { recursive: true });
  const fileName = `${randomUUID()}.${EXTENSION_BY_KIND[kind]}`;
  const absolute = path.join(directory, fileName);
  await fs.writeFile(absolute, buffer);
  return { fileUrl: `/uploads/${segments.join('/')}/${fileName}`, absolute };
}

async function unlinkQuietly(absolute: string): Promise<void> {
  await fs.unlink(absolute).catch(() => undefined);
}

/** Efface du disque le fichier d'une pièce retirée (au mieux : un fichier déjà absent n'est pas une erreur). */
async function deleteStoredFile(tenantId: string, fileUrl: string | null): Promise<void> {
  const relative = stockAttachmentRelativePath(tenantId, fileUrl);
  if (!relative) return;
  const root = path.resolve(getUploadsRoot(env.UPLOADS_DIR));
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep)) return;
  await unlinkQuietly(absolute);
}

async function readAttachmentView(
  tenantId: string,
  attachmentId: string,
  ctx: StockCallerContext,
  now: Date = new Date()
): Promise<AttachmentView> {
  const row = await prisma.stockAttachment.findFirst({
    where: { id: attachmentId, tenantId },
    select: ATTACHMENT_SELECT
  });
  if (!row) throw new NotFoundError('Pièce jointe introuvable.');
  return toAttachmentView(row as AttachmentRow, ctx, now);
}

export interface StockAttachmentUploadInput {
  targetType: StockAttachmentTarget;
  targetId: string;
  purpose?: StockAttachmentPurpose;
  caption?: string;
  clientRequestId?: string;
  file: { buffer: Buffer; originalName?: string | null } | null | undefined;
}

/**
 * Dépose une pièce jointe (B5-R1 à B5-R4, B5-R6, B5-R7).
 *
 * Ordre : fichier (taille, type par les octets), cible et droit propre à la
 * cible, rejeu éventuel, filtre EXIF, écriture du fichier, puis transaction
 * (clé d'idempotence en PREMIÈRE écriture, ligne, résultat de la clé). Le
 * fichier écrit est effacé si la transaction échoue. L'audit non critique
 * `STOCK_ATTACHMENT_ADDED` part après la transaction (B6-R5).
 */
export async function uploadStockAttachment(
  tenantId: string,
  ctx: StockCallerContext,
  input: StockAttachmentUploadInput,
  now: Date = new Date()
): Promise<{ attachment: AttachmentView; replayed: boolean }> {
  const buffer = input.file?.buffer;
  if (!buffer || buffer.length === 0) {
    throw stockError(400, ErrorCode.STOCK_ATTACHMENT_TYPE, 'Aucun fichier fourni.', { field: 'file' });
  }
  if (buffer.length > STOCK_ATTACHMENT_MAX_BYTES) {
    throw stockError(413, ErrorCode.STOCK_ATTACHMENT_TOO_LARGE, 'Le fichier dépasse 10 Mo.', { field: 'file' });
  }
  const kind = detectStockFileKind(buffer);
  if (!kind) {
    throw stockError(
      400,
      ErrorCode.STOCK_ATTACHMENT_TYPE,
      'Type de fichier non accepté. Formats autorisés : JPEG, PNG, WebP, PDF.',
      { field: 'file' }
    );
  }

  const target = await resolveAttachmentTarget(prisma, tenantId, input.targetType, input.targetId, true);
  if (!target.allowed(ctx)) {
    throw new ForbiddenError("Vous n'avez pas le droit de joindre une pièce à cet élément.");
  }

  const purpose: StockAttachmentPurpose = input.purpose ?? 'GOODS_PHOTO';
  const caption = input.caption?.trim() ? input.caption.trim() : null;
  const clientRequestId = input.clientRequestId ?? null;
  // L'empreinte du fichier ENVOYÉ entre dans le corps : même clé, autre photo → 409.
  const bodyHash = clientRequestId
    ? hashRequestBody({
        targetType: input.targetType,
        targetId: input.targetId,
        purpose,
        caption,
        fileSha256: sha256Hex(buffer)
      })
    : null;

  if (clientRequestId && bodyHash) {
    const replay = await findClientRequestReplay(tenantId, clientRequestId, ctx.userId, bodyHash);
    if (replay) {
      return { attachment: await readAttachmentView(tenantId, replay.resultId, ctx, now), replayed: true };
    }
  }

  const stored = stripImageMetadata(buffer, kind);
  const sha256 = sha256Hex(stored);
  const written = await writeStockFile(tenantId, stored, kind, now);

  let createdId: string;
  try {
    createdId = await prisma.$transaction(async tx => {
      const keyId =
        clientRequestId && bodyHash
          ? await claimClientRequestTx(tx, {
              tenantId,
              clientRequestId,
              operation: 'ATTACHMENT',
              bodyHash,
              userId: ctx.userId
            })
          : null;
      const created = await tx.stockAttachment.create({
        data: {
          tenantId,
          ...targetWhere(input.targetType, input.targetId),
          purpose,
          caption,
          fileName: displayFileName(input.file?.originalName, kind),
          fileUrl: written.fileUrl,
          mimeType: MIME_BY_KIND[kind],
          sizeBytes: stored.length,
          sha256,
          uploadedByUserId: ctx.userId,
          createdAt: now
        },
        select: { id: true }
      });
      if (keyId) await completeClientRequestTx(tx, keyId, 'StockAttachment', created.id);
      return created.id;
    });
  } catch (error) {
    await unlinkQuietly(written.absolute);
    if (clientRequestId && bodyHash && isUniqueViolation(error)) {
      // Rejeu concurrent : l'autre envoi a gagné, on rend sa pièce.
      const replay = await findClientRequestReplay(tenantId, clientRequestId, ctx.userId, bodyHash);
      if (replay) {
        return { attachment: await readAttachmentView(tenantId, replay.resultId, ctx, now), replayed: true };
      }
    }
    throw error;
  }

  logAuditEvent({
    actorUserId: ctx.userId,
    tenantId,
    actionKey: AuditActionKey.STOCK_ATTACHMENT_ADDED,
    entityType: 'StockAttachment',
    entityId: createdId,
    payload: {
      targetType: input.targetType,
      targetId: input.targetId,
      purpose,
      mimeType: MIME_BY_KIND[kind],
      sizeBytes: stored.length,
      sha256
    }
  });

  return { attachment: await readAttachmentView(tenantId, createdId, ctx, now), replayed: false };
}

/** `GET /stock/attachments` : cible vérifiée dans l'agence, pièces retirées comprises. */
export async function listStockAttachments(
  tenantId: string,
  ctx: StockCallerContext,
  targetType: StockAttachmentTarget,
  targetId: string
): Promise<AttachmentView[]> {
  await resolveAttachmentTarget(prisma, tenantId, targetType, targetId, false);
  return loadAttachmentViews(prisma, tenantId, ctx, targetType, targetId);
}

/**
 * Le fichier d'une pièce jointe de l'agence. Pièce retirée, d'une autre
 * agence ou inexistante : la même 404. Le type servi vient de l'extension du
 * fichier stocké, jamais du type déclaré au dépôt.
 */
export async function readStockAttachmentFile(tenantId: string, attachmentId: string): Promise<PrivateFile> {
  const row = await prisma.stockAttachment.findFirst({
    where: { id: attachmentId, tenantId },
    select: { fileUrl: true, fileName: true, removedAt: true }
  });
  if (!row || row.removedAt || !row.fileUrl) throw new NotFoundError('Pièce jointe introuvable.');
  return readPrivateUpload(
    stockAttachmentRelativePath(tenantId, row.fileUrl),
    row.fileName,
    'Pièce jointe introuvable.'
  );
}

/**
 * Retire une pièce jointe (B5-R5) : jamais de suppression silencieuse. La
 * ligne reste, avec l'heure, l'auteur, le motif et l'empreinte ; le fichier
 * est effacé du disque APRÈS la validation de la transaction, qui porte
 * l'audit critique `STOCK_ATTACHMENT_REMOVED`.
 */
export async function removeStockAttachment(
  tenantId: string,
  ctx: StockCallerContext,
  attachmentId: string,
  reason: string,
  now: Date = new Date()
): Promise<AttachmentView> {
  const row = await prisma.stockAttachment.findFirst({
    where: { id: attachmentId, tenantId },
    select: { ...ATTACHMENT_SELECT, fileUrl: true }
  });
  if (!row) throw new NotFoundError('Pièce jointe introuvable.');
  if (row.removedAt) {
    throw new AppError('Cette pièce jointe est déjà retirée.', 409, ErrorCode.CONFLICT);
  }
  if (!canRemoveAttachment(row as AttachmentRow, ctx, now)) {
    throw stockError(
      403,
      ErrorCode.STOCK_ATTACHMENT_REMOVAL_FORBIDDEN,
      "Passé 15 minutes, seul un responsable habilité peut retirer une pièce jointe déposée par quelqu'un d'autre."
    );
  }

  const withinDepositorWindow =
    row.uploadedByUserId === ctx.userId && now.getTime() <= attachmentRemovableUntil(row.createdAt).getTime();

  await prisma.$transaction(async tx => {
    const updated = await tx.stockAttachment.updateMany({
      where: { id: attachmentId, tenantId, removedAt: null },
      data: { fileUrl: null, removedAt: now, removedByUserId: ctx.userId, removalReason: reason }
    });
    if (updated.count === 0) {
      throw new AppError('Cette pièce jointe est déjà retirée.', 409, ErrorCode.CONFLICT);
    }
    await recordAuditEvent(tx, {
      actorUserId: ctx.userId,
      tenantId,
      actionKey: AuditActionKey.STOCK_ATTACHMENT_REMOVED,
      entityType: 'StockAttachment',
      entityId: attachmentId,
      payload: {
        targetType: row.targetType,
        targetId: targetIdOf(row as AttachmentRow),
        purpose: row.purpose,
        sha256: row.sha256,
        reason,
        byDepositor: withinDepositorWindow
      }
    });
  });

  await deleteStoredFile(tenantId, row.fileUrl);
  return readAttachmentView(tenantId, attachmentId, ctx, now);
}
