import * as path from 'path';
import { env } from '../../config/env';
import { privateUploadReadRoots } from '../../lib/files/private-files';
import { getProjectRoot, getUploadsRoot } from '../../utils/project-root';
import type { FileRoots } from './file-references';

/**
 * Emplacements disque de l'export complet (lot S7).
 *
 * Les archives vivent sous `<UPLOADS_DIR>/exports/<tenantId>/<exportId>.zip`.
 * Ce dossier n'est PAS dans la liste blanche de
 * `middleware/uploads-access-middleware.ts` : `/uploads/exports/...` repond
 * 404, l'archive ne sort que par la route de telechargement du super-admin.
 */

export const EXPORT_TTL_DAYS = 7;

export function exportsRoot(): string {
  return path.join(getUploadsRoot(env.UPLOADS_DIR), 'exports');
}

function assertSafeId(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Identifiant inattendu pour un chemin d’export.');
  return value;
}

export function exportArchivePath(tenantId: string, exportId: string): string {
  return path.join(exportsRoot(), assertSafeId(tenantId), `${assertSafeId(exportId)}.zip`);
}

export function exportStagingDir(tenantId: string, exportId: string): string {
  return path.join(exportsRoot(), assertSafeId(tenantId), `${assertSafeId(exportId)}.staging`);
}

/** Vrai si `filePath` (lu en base) designe bien une archive sous la racine des exports. */
export function isInsideExportsRoot(filePath: string): boolean {
  const relative = path.relative(path.resolve(exportsRoot()), path.resolve(filePath));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function defaultFileRoots(): FileRoots {
  return {
    uploads: privateUploadReadRoots(),
    generated: path.join(getProjectRoot(), 'assets', 'generated_documents')
  };
}
