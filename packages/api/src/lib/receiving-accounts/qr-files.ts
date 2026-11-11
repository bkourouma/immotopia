import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { env } from '../../config/env';
import { t } from '../../i18n';
import { AppError, ErrorCode } from '../../middleware/error-middleware';
import { getUploadsRoot } from '../../utils/project-root';
import { logger } from '../../utils/logger';
import {
  detectStockFileKind,
  sha256Hex,
  stripImageMetadata,
  type StockFileKind
} from '../finance/stock-pieces-jointes';
import { privateUploadPath, readPrivateUpload, type PrivateFile } from '../files/private-files';

/**
 * Image du QR d'un compte de réception (spec 048, lot Q, contrat §1).
 *
 * Fichier PRIVÉ `uploads/receiving-accounts/<tenantId>/<uuid>.<ext>`, jamais
 * servi en statique. PNG, JPEG ou WebP uniquement (type lu dans les octets,
 * SVG et PDF refusés), 2 Mo au plus, métadonnées retirées avant écriture.
 * ImmoTopia ne lit, ne génère ni ne modifie le QR : l'image est stockée telle
 * que l'agence l'a fournie, hors métadonnées.
 */

export const QR_MAX_BYTES = 2 * 1024 * 1024;
const FOLDER = 'receiving-accounts';
const EXTENSION: Record<'jpeg' | 'png' | 'webp', string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };
const MIME: Record<'jpeg' | 'png' | 'webp', string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export interface PreparedQr {
  buffer: Buffer;
  kind: 'jpeg' | 'png' | 'webp';
  mimeType: string;
  sha256: string;
}

export interface StoredQr {
  fileUrl: string;
  mimeType: string;
  sha256: string;
}

function invalid(message: string): AppError {
  return new AppError(message, 400, ErrorCode.RECEIVING_ACCOUNT_QR_INVALID);
}

/** Valide et nettoie l'image : taille, type réel, métadonnées. Ne touche pas au disque. */
export function prepareQr(file: { buffer: Buffer } | null | undefined): PreparedQr {
  const input = file?.buffer;
  if (!Buffer.isBuffer(input) || input.length === 0) throw invalid(t("L'image du QR est vide ou illisible."));
  if (input.length > QR_MAX_BYTES) {
    throw new AppError(t("L'image du QR dépasse 2 Mo."), 413, ErrorCode.RECEIVING_ACCOUNT_QR_TOO_LARGE);
  }
  const kind: StockFileKind | null = detectStockFileKind(input);
  if (kind !== 'jpeg' && kind !== 'png' && kind !== 'webp') {
    throw invalid(t("L'image du QR doit être un fichier PNG, JPEG ou WebP."));
  }
  let buffer: Buffer;
  try {
    buffer = stripImageMetadata(input, kind);
  } catch {
    throw invalid(t("L'image du QR est illisible ou incomplète."));
  }
  return { buffer, kind, mimeType: MIME[kind], sha256: sha256Hex(buffer) };
}

function tenantSegment(tenantId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(tenantId)) throw invalid(t('Identifiant de fichier invalide.'));
  return tenantId;
}

/** Écrit l'image sous un nom généré côté serveur. */
export async function writeQr(tenantId: string, prepared: PreparedQr): Promise<StoredQr> {
  const segment = tenantSegment(tenantId);
  const directory = path.join(getUploadsRoot(env.UPLOADS_DIR), FOLDER, segment);
  await fs.mkdir(directory, { recursive: true });
  const fileName = `${randomUUID()}.${EXTENSION[prepared.kind]}`;
  await fs.writeFile(path.join(directory, fileName), prepared.buffer);
  return { fileUrl: `/uploads/${FOLDER}/${segment}/${fileName}`, mimeType: prepared.mimeType, sha256: prepared.sha256 };
}

/** Supprime le fichier d'un identifiant de stockage ; une panne est journalisée, jamais levée. */
export async function deleteQrQuietly(tenantId: string, fileUrl: string | null | undefined): Promise<void> {
  const relative = privateUploadPath(fileUrl, [FOLDER, tenantSegment(tenantId)]);
  if (!relative) return;
  try {
    await fs.unlink(path.join(getUploadsRoot(env.UPLOADS_DIR), relative));
  } catch (error) {
    logger.warn('[receiving-accounts] fichier de QR non supprimé', {
      tenantId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/** Lit l'image d'un compte DÉJÀ autorisé (le dossier doit être celui de l'agence). */
export async function readQr(tenantId: string, fileUrl: string | null | undefined): Promise<PrivateFile> {
  const relative = privateUploadPath(fileUrl, [FOLDER, tenantSegment(tenantId)]);
  return readPrivateUpload(relative, 'qr', t('Image introuvable.'));
}
