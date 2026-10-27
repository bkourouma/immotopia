import { promises as fs } from 'fs';
import * as path from 'path';
import { env } from '../../config/env';
import { NotFoundError } from '../../middleware/error-middleware';
import { getUploadsRoot } from '../../utils/project-root';
import { privateUploadPath, readPrivateUpload, type PrivateFile } from '../files/private-files';

/**
 * Fichiers de la signature (spec 044, SG-R7) : PDF source, PDF scellé, images
 * de signature dessinée. Tous PRIVES, sous `uploads/signatures/<agence>/<demande>/` :
 * `uploadsAccessGuard` répond 404 à ce dossier en statique, ils ne sortent que
 * par les routes authentifiées ou par le jeton d'un signataire. La valeur
 * stockée en base (`/uploads/signatures/...`) est un identifiant, jamais une URL.
 */

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function folderOf(tenantId: string, requestId: string): string[] {
  if (!ID_PATTERN.test(tenantId) || !ID_PATTERN.test(requestId)) throw new NotFoundError('Fichier introuvable.');
  return ['signatures', tenantId, requestId];
}

/** Clé de stockage d'un fichier de la demande (sans l'écrire). */
export function signatureFileKey(tenantId: string, requestId: string, fileName: string): string {
  return `/uploads/${folderOf(tenantId, requestId).join('/')}/${path.basename(fileName)}`;
}

/** Écrit un fichier de la demande et renvoie sa clé de stockage. */
export async function writeSignatureFile(
  tenantId: string,
  requestId: string,
  fileName: 'source.pdf' | 'signed.pdf' | 'evidence.pdf' | `signer-${string}.png`,
  buffer: Buffer,
  options: { exclusive?: boolean } = {}
): Promise<string> {
  const folder = folderOf(tenantId, requestId);
  const directory = path.join(getUploadsRoot(env.UPLOADS_DIR), ...folder);
  await fs.mkdir(directory, { recursive: true });
  // exclusive : « wx », jamais d'écrasement d'un fichier de preuve existant.
  await fs.writeFile(path.join(directory, fileName), buffer, { flag: options.exclusive ? 'wx' : 'w' });
  return `/uploads/${folder.join('/')}/${fileName}`;
}

/** Lit un fichier de la demande ; 404 si la clé ne désigne pas le dossier de CETTE demande. */
export async function readSignatureFile(tenantId: string, requestId: string, key: string): Promise<PrivateFile> {
  const relative = privateUploadPath(key, folderOf(tenantId, requestId));
  return readPrivateUpload(relative, null, 'Fichier introuvable.');
}

/** Efface un fichier écrit par une transaction qui a échoué. Ne lève jamais. */
export async function removeSignatureFile(tenantId: string, requestId: string, fileName: string): Promise<void> {
  try {
    const folder = folderOf(tenantId, requestId);
    await fs.rm(path.join(getUploadsRoot(env.UPLOADS_DIR), ...folder, path.basename(fileName)), { force: true });
  } catch {
    // Déjà absent : rien à faire.
  }
}

/** Efface les fichiers d'une demande abandonnée (échec de création). Ne lève jamais. */
export async function removeSignatureFolder(tenantId: string, requestId: string): Promise<void> {
  try {
    const folder = folderOf(tenantId, requestId);
    await fs.rm(path.join(getUploadsRoot(env.UPLOADS_DIR), ...folder), { recursive: true, force: true });
  } catch {
    // Dossier déjà absent ou illisible : rien à faire.
  }
}
