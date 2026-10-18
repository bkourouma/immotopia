/**
 * Captures de preuve d'un paiement mobile money déclaré (spec 047, R12, S5, S6).
 *
 * Le fichier est PRIVÉ, jamais servi en statique (`uploadsAccessGuard` ne
 * laisse passer que les médias publics). Deux dossiers sous `uploads/` :
 *
 * - définitif : `uploads/syndics/payment-proofs/<tenantId>/<syndicateId>/<declarationId>.<ext>`
 * - temporaire (lecture IA, PR3) : `uploads/syndics/payment-proofs/tmp/<tenantId>/<readId>.<ext>`,
 *   purgé à l'expiration par `purgeExpiredProofReads`.
 *
 * Le contenu décide du type (octets magiques : JPEG, PNG, WebP, PDF), jamais
 * l'extension ni le type déclaré. Les métadonnées des images (EXIF, GPS) sont
 * retirées avant écriture ; les PDF sont stockés tels quels (limite assumée,
 * comme les pièces jointes du stock). Le nom sur disque est généré côté
 * serveur à partir d'un identifiant, jamais du nom envoyé.
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
  detectStockFileKind,
  sha256Hex,
  stripImageMetadata,
  type StockFileKind
} from '../../finance/stock-pieces-jointes';
import {
  privateUploadPath,
  privateUploadReadRoots,
  readPrivateUpload,
  type PrivateFile
} from '../../files/private-files';

export type { StockFileKind };

/** 5 Mo au plus (R12). */
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

export type ProofFileInput = { buffer: Buffer; originalname?: string; mimetype?: string };

export interface PreparedProofFile {
  buffer: Buffer;
  kind: StockFileKind;
  mimeType: string;
  sha256: string;
  sizeBytes: number;
}

export interface StoredProofFile {
  fileUrl: string;
  sha256: string;
  kind: StockFileKind;
  mimeType: string;
  sizeBytes: number;
}

const EXTENSION_BY_KIND: Record<StockFileKind, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', pdf: 'pdf' };
const MIME_BY_KIND: Record<StockFileKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf'
};

const PROOF_ROOT = ['syndics', 'payment-proofs'];

// ---------------------------------------------------------------------------
// Chemins
// ---------------------------------------------------------------------------

/** Un identifiant interpolé dans un chemin : lettres, chiffres, tiret, souligné, rien d'autre. */
function safeSegment(value: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value) || value === 'tmp') {
    throw new AppError(t('Identifiant de fichier invalide.'), 400, ErrorCode.DECLARATION_PROOF_INVALID);
  }
  return value;
}

function definitiveSegments(tenantId: string, syndicateId: string): string[] {
  return [...PROOF_ROOT, safeSegment(tenantId), safeSegment(syndicateId)];
}

function tempSegments(tenantId: string): string[] {
  return [...PROOF_ROOT, 'tmp', safeSegment(tenantId)];
}

// ---------------------------------------------------------------------------
// Préparation
// ---------------------------------------------------------------------------

/**
 * Valide et nettoie une capture : 5 Mo au plus (413 `DECLARATION_PROOF_TOO_LARGE`),
 * type réel JPEG/PNG/WebP/PDF (400 `DECLARATION_PROOF_INVALID`), métadonnées
 * des images retirées. `sha256` est celui du contenu FINAL stocké.
 */
export function prepareProofFile(file: ProofFileInput): PreparedProofFile {
  const input = file?.buffer;
  if (!Buffer.isBuffer(input) || input.length === 0) {
    throw new AppError(t('La capture est vide ou illisible.'), 400, ErrorCode.DECLARATION_PROOF_INVALID);
  }
  if (input.length > PROOF_MAX_BYTES) {
    throw new AppError(t('La capture dépasse 5 Mo.'), 413, ErrorCode.DECLARATION_PROOF_TOO_LARGE);
  }
  const kind = detectStockFileKind(input);
  if (!kind) {
    throw new AppError(
      t('La capture doit être une image JPEG, PNG ou WebP, ou un PDF.'),
      400,
      ErrorCode.DECLARATION_PROOF_INVALID
    );
  }
  let buffer: Buffer;
  try {
    buffer = stripImageMetadata(input, kind);
  } catch {
    throw new AppError(t('La capture est illisible ou incomplète.'), 400, ErrorCode.DECLARATION_PROOF_INVALID);
  }
  return { buffer, kind, mimeType: MIME_BY_KIND[kind], sha256: sha256Hex(buffer), sizeBytes: buffer.length };
}

async function writeProof(segments: string[], baseName: string, prepared: PreparedProofFile): Promise<StoredProofFile> {
  const directory = path.join(getUploadsRoot(env.UPLOADS_DIR), ...segments);
  await fs.mkdir(directory, { recursive: true });
  const fileName = `${safeSegment(baseName)}.${EXTENSION_BY_KIND[prepared.kind]}`;
  await fs.writeFile(path.join(directory, fileName), prepared.buffer);
  return {
    fileUrl: `/uploads/${segments.join('/')}/${fileName}`,
    sha256: prepared.sha256,
    kind: prepared.kind,
    mimeType: prepared.mimeType,
    sizeBytes: prepared.sizeBytes
  };
}

/** Enregistre la capture définitive d'une déclaration. */
export async function saveDeclarationProof(params: {
  tenantId: string;
  syndicateId: string;
  declarationId: string;
  file: ProofFileInput;
}): Promise<StoredProofFile> {
  const prepared = prepareProofFile(params.file);
  return writeProof(definitiveSegments(params.tenantId, params.syndicateId), params.declarationId, prepared);
}

/** Enregistre une capture temporaire pour la lecture IA (PR3), nommée d'après `readId`. */
export async function saveTempProofRead(params: {
  tenantId: string;
  readId: string;
  file: ProofFileInput;
}): Promise<StoredProofFile> {
  const prepared = prepareProofFile(params.file);
  return writeProof(tempSegments(params.tenantId), params.readId, prepared);
}

/** Absent du disque : pas une erreur. */
async function unlinkQuietly(absolute: string): Promise<void> {
  await fs.unlink(absolute).catch(() => undefined);
}

/** Supprime un fichier privé sous toutes les racines d'écriture connues. */
async function removeUpload(relative: string): Promise<void> {
  for (const root of privateUploadReadRoots()) {
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(path.resolve(root) + path.sep)) continue;
    await unlinkQuietly(absolute);
  }
}

/**
 * Promeut une capture temporaire de CETTE agence vers le dossier définitif de
 * la déclaration, puis supprime le temporaire. `tempFileUrl` doit être sous le
 * dossier temporaire de l'agence (sans `..`) ; sinon 404, comme un fichier
 * inexistant. Le contenu est revalidé (type, taille) avant d'être recopié.
 */
export async function promoteTempProofToDeclaration(params: {
  tenantId: string;
  syndicateId: string;
  declarationId: string;
  tempFileUrl: string;
  /** Conserve le temporaire (supprimé ensuite par `discardTempProof`) : la création peut encore échouer. */
  keepSource?: boolean;
}): Promise<StoredProofFile> {
  const relative = privateUploadPath(params.tempFileUrl, tempSegments(params.tenantId));
  const source = await readPrivateUpload(relative, null, t('Capture introuvable.'));
  const prepared = prepareProofFile({ buffer: source.buffer });
  const stored = await writeProof(
    definitiveSegments(params.tenantId, params.syndicateId),
    params.declarationId,
    prepared
  );
  if (relative && !params.keepSource) await removeUpload(relative);
  return stored;
}

/** Supprime la capture temporaire d'une lecture ; rend `true` si elle n'existe plus. Ne lève jamais. */
export async function discardTempProof(tenantId: string, tempFileUrl: string): Promise<boolean> {
  try {
    const relative = privateUploadPath(tempFileUrl, tempSegments(tenantId));
    if (!relative) return false;
    await removeUpload(relative);
    return true;
  } catch (error) {
    logger.warn('[declared-payment] suppression de capture temporaire en échec', {
      code: (error as NodeJS.ErrnoException)?.code
    });
    return false;
  }
}

/** Âge au-delà duquel une capture temporaire n'a plus lieu d'être (durée de conservation d'une lecture). */
export const TEMP_PROOF_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Balayage du dossier temporaire par DATE DE MODIFICATION, sans passer par la base : supprime tout
 * fichier de `uploads/syndics/payment-proofs/tmp/<agence>/` de plus de 24 h. Rattrape les captures
 * orphelines (processus arrêté entre l'écriture et l'enregistrement, ligne supprimée, chemin non
 * effacé). Un échec sur un fichier est journalisé sans arrêter le balayage ; rend le nombre supprimé.
 */
export async function purgeOrphanTempProofs(now: Date = new Date()): Promise<number> {
  let removed = 0;
  const roots = new Set(privateUploadReadRoots().map(root => path.resolve(root)));
  for (const root of roots) {
    const tmpRoot = path.join(root, ...PROOF_ROOT, 'tmp');
    const tenants = await fs.readdir(tmpRoot, { withFileTypes: true }).catch(() => []);
    for (const tenantDir of tenants) {
      if (!tenantDir.isDirectory()) continue;
      const directory = path.join(tmpRoot, tenantDir.name);
      const files = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
      for (const file of files) {
        if (!file.isFile()) continue;
        const absolute = path.join(directory, file.name);
        try {
          const stat = await fs.stat(absolute);
          if (now.getTime() - stat.mtimeMs <= TEMP_PROOF_MAX_AGE_MS) continue;
          await fs.unlink(absolute);
          removed += 1;
        } catch (error) {
          logger.warn('[declared-payment] balayage de capture temporaire en échec', {
            code: (error as NodeJS.ErrnoException)?.code
          });
        }
      }
    }
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Capture d'une déclaration, pour le gestionnaire. 404 `NotFoundError` si la
 * déclaration n'existe pas dans cette agence et cette copropriété, n'a pas de
 * preuve, si le chemin stocké sort du dossier de l'agence, ou si le fichier est
 * absent.
 *
 * Le contrôleur (route `GET .../paiements-declares/:declarationId/preuve`)
 * l'enveloppe dans `asyncHandler`, l'appelle avec `tenantId` du contexte
 * d'agence et `syndicId` de l'URL (déjà vérifiés), puis sert le résultat par
 * `sendPrivateFile(res, file)`. Le contrat §1.8 demande `Content-Disposition:
 * inline` : `sendPrivateFile` pose aujourd'hui `attachment`, le contrôleur doit
 * donc remplacer cet en-tête avant l'envoi (ou `sendPrivateFile` gagner une option).
 */
export async function getDeclarationProofForTenant(params: {
  tenantId: string;
  syndicateId: string;
  declarationId: string;
}): Promise<PrivateFile> {
  const notFound = t('Capture introuvable.');
  const declaration = await prisma.syndicPaymentDeclaration.findFirst({
    where: { id: params.declarationId, tenantId: params.tenantId, syndicateId: params.syndicateId },
    select: { proofFileUrl: true }
  });
  if (!declaration?.proofFileUrl) throw new NotFoundError(notFound);
  const relative = privateUploadPath(declaration.proofFileUrl, definitiveSegments(params.tenantId, params.syndicateId));
  return readPrivateUpload(relative, `preuve-paiement-${params.declarationId}`, notFound);
}

// ---------------------------------------------------------------------------
// Purge
// ---------------------------------------------------------------------------

/**
 * Supprime les captures temporaires des lectures IA expirées et non
 * consommées, met `tempFileUrl` à null et renvoie le nombre de lectures
 * purgées. Un fichier déjà absent n'est pas une erreur ; un échec sur une
 * lecture est journalisé (identifiant seulement) et n'arrête pas les autres.
 */
export async function purgeExpiredProofReads(now: Date = new Date()): Promise<number> {
  const rows = await prisma.syndicPaymentProofRead.findMany({
    where: { expiresAt: { lt: now }, tempFileUrl: { not: null } },
    select: { id: true, tenantId: true, tempFileUrl: true }
  });
  let purged = 0;
  for (const row of rows) {
    try {
      const relative = privateUploadPath(row.tempFileUrl, tempSegments(row.tenantId));
      if (relative) {
        await removeUpload(relative);
      } else {
        logger.warn('[declared-payment] chemin de capture temporaire inattendu, non supprimé', { readId: row.id });
      }
      await prisma.syndicPaymentProofRead.updateMany({
        where: { id: row.id, tenantId: row.tenantId },
        data: { tempFileUrl: null }
      });
      purged += 1;
    } catch (error) {
      logger.warn('[declared-payment] purge de capture temporaire en échec', {
        readId: row.id,
        code: (error as NodeJS.ErrnoException)?.code
      });
    }
  }
  return purged;
}
