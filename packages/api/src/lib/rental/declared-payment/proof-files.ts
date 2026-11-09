/**
 * Captures de preuve d'un paiement locatif déclaré (contrat 049, §1.3 et §1.5).
 *
 * Fichiers PRIVÉS, jamais servis en statique. Le dossier définitif est celui
 * des preuves existantes (`uploads/portal/payments/<agence>/`), pour que le
 * téléchargement gestionnaire de `lib/rental/proof-files.ts` continue de
 * fonctionner. Les captures de lecture IA vont sous
 * `uploads/portal/payments/tmp/<agence>/` (purgées par `proof-read-purge`).
 *
 * Le contrôle du contenu (octets magiques, taille, EXIF) est celui du Syndic
 * (`prepareProofFile`), dont les erreurs sont mappées vers les codes RENTAL_*.
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { env } from '../../../config/env';
import { t } from '../../../i18n';
import { AppError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { getUploadsRoot } from '../../../utils/project-root';
import {
  privateUploadPath,
  privateUploadReadRoots,
  readPrivateUpload,
  type PrivateFile
} from '../../files/private-files';
import {
  prepareProofFile as prepareSyndicProofFile,
  type PreparedProofFile,
  type ProofFileInput
} from '../../syndics/declared-payment/proof-files';

export { PROOF_MAX_BYTES } from '../../syndics/declared-payment/proof-files';
export type { ProofFileInput, PreparedProofFile };

export interface StoredProofFile {
  fileUrl: string;
  sha256: string;
}

const EXTENSION_BY_KIND: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', pdf: 'pdf' };
const ROOT = ['portal', 'payments'];

function safeSegment(value: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value) || value === 'tmp') {
    throw new AppError(t('Identifiant de fichier invalide.'), 400, ErrorCode.RENTAL_DECLARATION_PROOF_INVALID);
  }
  return value;
}

const definitiveSegments = (tenantId: string) => [...ROOT, safeSegment(tenantId)];
const tempSegments = (tenantId: string) => [...ROOT, 'tmp', safeSegment(tenantId)];

/** Valide et nettoie une capture ; erreurs typées RENTAL_DECLARATION_PROOF_*. */
export function prepareProofFile(file: ProofFileInput): PreparedProofFile {
  try {
    return prepareSyndicProofFile(file);
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === ErrorCode.DECLARATION_PROOF_TOO_LARGE) {
        throw new AppError(error.message, 413, ErrorCode.RENTAL_DECLARATION_PROOF_TOO_LARGE);
      }
      if (error.code === ErrorCode.DECLARATION_PROOF_INVALID) {
        throw new AppError(error.message, 400, ErrorCode.RENTAL_DECLARATION_PROOF_INVALID);
      }
    }
    throw error;
  }
}

async function writeProof(segments: string[], baseName: string, prepared: PreparedProofFile): Promise<StoredProofFile> {
  const directory = path.join(getUploadsRoot(env.UPLOADS_DIR), ...segments);
  await fs.mkdir(directory, { recursive: true });
  const fileName = `${safeSegment(baseName)}.${EXTENSION_BY_KIND[prepared.kind]}`;
  await fs.writeFile(path.join(directory, fileName), prepared.buffer);
  return { fileUrl: `/uploads/${segments.join('/')}/${fileName}`, sha256: prepared.sha256 };
}

export async function saveDeclarationProof(params: {
  tenantId: string;
  declarationId: string;
  file: ProofFileInput;
}): Promise<StoredProofFile> {
  return writeProof(definitiveSegments(params.tenantId), params.declarationId, prepareProofFile(params.file));
}

export async function saveTempProofRead(params: {
  tenantId: string;
  readId: string;
  file: PreparedProofFile;
}): Promise<StoredProofFile> {
  return writeProof(tempSegments(params.tenantId), params.readId, params.file);
}

async function removeUpload(relative: string): Promise<void> {
  for (const root of privateUploadReadRoots()) {
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(path.resolve(root) + path.sep)) continue;
    await fs.unlink(absolute).catch(() => undefined);
  }
}

/** Supprime une capture définitive (échec de création) ; ne lève jamais. */
export async function removeDeclarationProof(tenantId: string, fileUrl: string): Promise<void> {
  try {
    const relative = privateUploadPath(fileUrl, definitiveSegments(tenantId));
    if (relative) await removeUpload(relative);
  } catch (error) {
    logger.warn('[rental-declared] nettoyage de capture en échec', { code: (error as NodeJS.ErrnoException)?.code });
  }
}

/** Copie la capture temporaire d'une lecture vers le dossier définitif de la déclaration. */
export async function promoteTempProofToDeclaration(params: {
  tenantId: string;
  declarationId: string;
  tempFileUrl: string;
}): Promise<StoredProofFile> {
  const relative = privateUploadPath(params.tempFileUrl, tempSegments(params.tenantId));
  const source = await readPrivateUpload(relative, null, t('Capture introuvable.'));
  return writeProof(
    definitiveSegments(params.tenantId),
    params.declarationId,
    prepareProofFile({ buffer: source.buffer })
  );
}

/** Supprime la capture temporaire ; rend true si elle n'existe plus. Ne lève jamais. */
export async function discardTempProof(tenantId: string, tempFileUrl: string): Promise<boolean> {
  try {
    const relative = privateUploadPath(tempFileUrl, tempSegments(tenantId));
    if (!relative) return false;
    await removeUpload(relative);
    return true;
  } catch (error) {
    logger.warn('[rental-declared] suppression de capture temporaire en échec', {
      code: (error as NodeJS.ErrnoException)?.code
    });
    return false;
  }
}

/** Capture définitive d'une déclaration de l'agence (lecture gestionnaire). */
export async function readDeclarationProofStream(tenantId: string, declarationId: string): Promise<PrivateFile> {
  const notFound = t('Capture introuvable.');
  const row = await prisma.rentalPaymentDeclaration.findFirst({
    where: { id: declarationId, tenant_id: tenantId },
    select: { proof_file_url: true }
  });
  if (!row?.proof_file_url) throw new NotFoundError(notFound);
  const relative = privateUploadPath(row.proof_file_url, definitiveSegments(tenantId));
  return readPrivateUpload(relative, `preuve-paiement-${declarationId}`, notFound);
}
