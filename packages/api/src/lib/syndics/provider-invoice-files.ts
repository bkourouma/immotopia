import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { getUploadsRoot } from '../../utils/project-root';
import { BadRequestError } from '../../middleware/error-middleware';
import { privateUploadPath, readPrivateUpload, type PrivateFile } from '../files/private-files';

/**
 * Pieces jointes des factures de prestataires (S6).
 *
 * Meme regime que les documents de copropriete (`document-files.ts`) : le
 * fichier est prive, range sous `uploads/syndics/<copropriete>/factures-prestataires/`
 * — prefixe `/uploads/syndics` que `uploadsAccessGuard` refuse toujours en
 * statique — et ne sort que par la route authentifiee
 * `GET /api/tenants/:tenantId/syndics/:syndicId/factures-prestataires/:invoiceId/fichier`,
 * apres controle de l'agence et de la copropriete. La valeur stockee en base
 * n'est qu'un identifiant de stockage, jamais renvoye au client.
 *
 * Le type est lu dans les octets du fichier (PDF, PNG, JPEG), jamais dans le
 * nom ni dans le type declare au depot ; le nom stocke est regenere.
 */

export const PROVIDER_INVOICE_FILE_MAX_BYTES = 10 * 1024 * 1024;
const FOLDER = 'factures-prestataires';

export type ProviderInvoiceFileKind = 'pdf' | 'png' | 'jpg';

/** Type reel d'apres les octets magiques, ou `null` si non accepte. */
export function detectProviderInvoiceFileKind(buffer: Buffer): ProviderInvoiceFileKind | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= png.length && png.every((byte, index) => buffer[index] === byte)) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  return null;
}

/** Controle taille et type ; leve une 400 sinon. */
export function assertProviderInvoiceFile(buffer: Buffer | undefined): ProviderInvoiceFileKind {
  if (!buffer || buffer.length === 0) {
    throw new BadRequestError('Aucun fichier fourni');
  }
  if (buffer.length > PROVIDER_INVOICE_FILE_MAX_BYTES) {
    throw new BadRequestError('Fichier trop volumineux : 10 Mo au maximum.');
  }
  const kind = detectProviderInvoiceFileKind(buffer);
  if (!kind) {
    throw new BadRequestError('Type de fichier non accepté. Formats autorisés : PDF, PNG, JPEG.');
  }
  return kind;
}

function folderSegments(syndicateId: string): string[] {
  return ['syndics', syndicateId, FOLDER];
}

/** Ecrit le fichier sous la racine de reference et renvoie son identifiant de stockage. */
export async function storeProviderInvoiceFile(
  syndicateId: string,
  buffer: Buffer,
  kind: ProviderInvoiceFileKind
): Promise<string> {
  const directory = path.join(getUploadsRoot(env.UPLOADS_DIR), ...folderSegments(syndicateId));
  await fs.mkdir(directory, { recursive: true });
  const fileName = `${randomUUID()}.${kind}`;
  await fs.writeFile(path.join(directory, fileName), buffer);
  return `/uploads/${folderSegments(syndicateId).join('/')}/${fileName}`;
}

/** Supprime un fichier stocke (au mieux : un fichier deja absent n'est pas une erreur). */
export async function removeProviderInvoiceFile(syndicateId: string, filePath: string | null): Promise<void> {
  const relative = privateUploadPath(filePath, folderSegments(syndicateId));
  if (!relative) return;
  const root = path.resolve(getUploadsRoot(env.UPLOADS_DIR));
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep)) return;
  await fs.unlink(absolute).catch(() => undefined);
}

/** Lit la piece d'une facture DEJA AUTORISEE. 404 si absente. */
export function readProviderInvoiceFile(invoice: {
  syndicateId: string;
  filePath: string | null;
  fileName: string | null;
  number: string;
}): Promise<PrivateFile> {
  return readPrivateUpload(
    privateUploadPath(invoice.filePath, folderSegments(invoice.syndicateId)),
    invoice.fileName ?? `facture-${invoice.number}`,
    'Piece jointe introuvable.'
  );
}

/** Nom d'origine nettoye, conserve pour le telechargement. */
export function cleanOriginalName(name: string | undefined): string | null {
  const cleaned = (name ?? '')
    .replace(/[^\p{L}\p{N} ._-]/gu, '')
    .trim()
    .slice(0, 150);
  return cleaned || null;
}
