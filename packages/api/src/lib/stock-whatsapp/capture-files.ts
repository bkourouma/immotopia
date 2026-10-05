import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { env } from '../../config/env';
import { AppError, ErrorCode } from '../../middleware/error-middleware';
import { getUploadsRoot } from '../../utils/project-root';
import { privateUploadPath, privateUploadReadRoots, readPrivateUpload, type PrivateFile } from '../files/private-files';
import { detectStockFileKind, sha256Hex, stripImageMetadata, type StockFileKind } from './lot040-bridge';

/**
 * Stockage et relecture des photos de capture de l'inventaire par WhatsApp
 * (lot 041, spec W6-R10, W14-R4, W14-R5).
 *
 * Dossier PRIVÉ `uploads/stock-whatsapp/<tenantId>/<aaaa>/<uuid>.<ext>` sous
 * `getUploadsRoot(env.UPLOADS_DIR)` — jamais sous `uploads/whatsapp/`, dossier
 * public des diffusions. Le fichier n'est jamais servi en statique : il se relit
 * par `readCapturePhoto` après contrôle de l'agence par la route.
 *
 * PREUVE : l'empreinte rendue est celle du fichier STOCKÉ (EXIF retiré), pas
 * celle du fichier reçu. Les aides d'octets viennent du lot 040 (plan 040 §11)
 * par le pont `lot040-bridge`.
 */

export const CAPTURE_MAX_BYTES = 10 * 1024 * 1024;

/** Premier segment du dossier des captures (règle d'export d'agence, data-model §6). */
export const CAPTURE_UPLOAD_FOLDER = 'stock-whatsapp';

type CaptureMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

const IMAGE_KINDS: Record<Exclude<StockFileKind, 'pdf'>, { mimeType: CaptureMimeType; extension: string }> = {
  jpeg: { mimeType: 'image/jpeg', extension: 'jpg' },
  png: { mimeType: 'image/png', extension: 'png' },
  webp: { mimeType: 'image/webp', extension: 'webp' }
};

/** Un identifiant d'agence devient un segment de chemin : il n'en sort jamais. */
function assertSafeSegment(value: string): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new Error('Identifiant d’agence invalide pour un chemin de capture.');
  }
}

function utcYear(date: Date): string {
  return String(date.getUTCFullYear());
}

/**
 * Valide, nettoie et écrit une photo reçue.
 *
 * `detectStockFileKind` (octets magiques) → `stripImageMetadata` → `sha256Hex`
 * → écriture. Refus sans écriture : `TOO_LARGE` au-delà de 10 Mo, `TYPE` pour
 * tout ce qui n'est pas JPEG, PNG ou WebP (PDF compris).
 */
export async function storeCapturePhoto(
  tenantId: string,
  buffer: Buffer
): Promise<
  | {
      fileUrl: string;
      mimeType: CaptureMimeType;
      sizeBytes: number;
      sha256: string;
    }
  | { refused: 'TYPE' | 'TOO_LARGE' }
> {
  assertSafeSegment(tenantId);
  if (buffer.length > CAPTURE_MAX_BYTES) return { refused: 'TOO_LARGE' };

  const kind = detectStockFileKind(buffer);
  if (!kind || kind === 'pdf') return { refused: 'TYPE' };
  const { mimeType, extension } = IMAGE_KINDS[kind];

  const stored = stripImageMetadata(buffer, kind);
  if (stored.length > CAPTURE_MAX_BYTES) return { refused: 'TOO_LARGE' };
  const sha256 = sha256Hex(stored);

  const year = utcYear(new Date());
  const fileName = `${randomUUID()}.${extension}`;
  const directory = path.join(getUploadsRoot(env.UPLOADS_DIR), CAPTURE_UPLOAD_FOLDER, tenantId, year);
  await fs.mkdir(directory, { recursive: true });
  // `wx` : un nom déjà pris n'est jamais écrasé (une preuve ne se remplace pas).
  await fs.writeFile(path.join(directory, fileName), stored, { flag: 'wx' });

  return {
    fileUrl: `/uploads/${CAPTURE_UPLOAD_FOLDER}/${tenantId}/${year}/${fileName}`,
    mimeType,
    sizeBytes: stored.length,
    sha256
  };
}

/**
 * Relit la photo d'une capture déjà autorisée (agence vérifiée par l'appelant).
 *
 * Le chemin stocké est vérifié contre le dossier attendu
 * `['stock-whatsapp', tenantId, <aaaa de receivedAt>]` (`privateUploadPath`) :
 * un chemin d'une autre agence, d'un autre dossier ou suspect répond 404. Photo
 * retirée (`fileUrl` nul) : `404 STOCK_WHATSAPP_PHOTO_REMOVED`.
 */
export async function readCapturePhoto(capture: {
  tenantId: string;
  fileUrl: string | null;
  receivedAt: Date;
}): Promise<PrivateFile> {
  if (!capture.fileUrl) {
    throw new AppError('Cette photo a été retirée.', 404, ErrorCode.STOCK_WHATSAPP_PHOTO_REMOVED);
  }
  const receivedYear = capture.receivedAt.getUTCFullYear();
  // L'écriture précède de quelques millisecondes l'horodatage de la capture :
  // autour du 1er janvier, le dossier peut porter l'année voisine.
  const relative =
    privateUploadPath(capture.fileUrl, [CAPTURE_UPLOAD_FOLDER, capture.tenantId, String(receivedYear)]) ??
    privateUploadPath(capture.fileUrl, [CAPTURE_UPLOAD_FOLDER, capture.tenantId, String(receivedYear - 1)]) ??
    privateUploadPath(capture.fileUrl, [CAPTURE_UPLOAD_FOLDER, capture.tenantId, String(receivedYear + 1)]);
  return readPrivateUpload(relative, 'photo-comptage', 'Photo introuvable.');
}

/**
 * Efface le fichier d'une photo de capture (retrait, W14-R5). La ligne de
 * capture et son empreinte restent : c'est l'appelant qui met `fileUrl` à nul.
 * Un fichier déjà absent n'est pas une erreur ; un chemin hors du dossier des
 * captures est refusé sans rien effacer.
 */
export async function deleteCapturePhoto(fileUrl: string): Promise<void> {
  const match = /^\/uploads\/stock-whatsapp\/([A-Za-z0-9_-]{1,64})\/(\d{4})\/[^/\\]+$/.exec(fileUrl);
  const relative = match ? privateUploadPath(fileUrl, [CAPTURE_UPLOAD_FOLDER, match[1], match[2]]) : null;
  if (!relative) {
    throw new Error('Chemin de photo de capture invalide.');
  }
  for (const root of privateUploadReadRoots()) {
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(path.resolve(root) + path.sep)) continue;
    try {
      await fs.unlink(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
