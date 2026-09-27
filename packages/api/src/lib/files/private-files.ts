import { promises as fs } from 'fs';
import * as path from 'path';
import type { Response } from 'express';
import { env } from '../../config/env';
import { getProjectRoot, getUploadsRoot } from '../../utils/project-root';
import { NotFoundError } from '../../middleware/error-middleware';

/**
 * Fichiers privés déposés sous `uploads/` — lecture et envoi, APRÈS contrôle
 * du droit de l'appelant par la route qui les demande.
 *
 * Aucun fichier privé n'est servi en statique : `uploadsAccessGuard`
 * (middleware/uploads-access-middleware.ts) ne laisse passer que les médias
 * publics (photos d'annonce, logos, images WhatsApp) et répond 404 à tout le
 * reste. La valeur stockée en base (`/uploads/<dossier>/.../<fichier>`) reste
 * un identifiant de stockage : ce module la relit, la vérifie contre l'objet
 * autorisé (le dossier attendu, sans `..`) et renvoie le contenu.
 *
 * Racines relues, dans l'ordre : `getUploadsRoot(env.UPLOADS_DIR)` — la
 * racine de référence — puis `<racine du monorepo>/uploads`, où écrivent
 * encore plusieurs services sans tenir compte de `UPLOADS_DIR`. Les deux
 * coïncident quand `UPLOADS_DIR` n'est pas posé.
 */

export interface PrivateFile {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

export function privateUploadReadRoots(): string[] {
  const reference = getUploadsRoot(env.UPLOADS_DIR);
  const writer = path.join(getProjectRoot(), 'uploads');
  return path.resolve(reference) === path.resolve(writer) ? [reference] : [reference, writer];
}

/**
 * Chemin relatif (`<dossier>/.../<fichier>`) si `fileUrl` désigne bien un
 * fichier du dossier `folder` (segments exacts, ex. `['rental', 'penalties',
 * penaltyId]`), sinon `null` : autre dossier, lien externe, chemin suspect.
 */
export function privateUploadPath(fileUrl: string | null | undefined, folder: string[]): string | null {
  if (!fileUrl) return null;
  const prefix = `/uploads/${folder.join('/')}/`;
  if (!fileUrl.startsWith(prefix)) return null;
  const fileName = fileUrl.slice(prefix.length);
  if (!fileName || /[/\\\0]/.test(fileName) || fileName.includes('..')) return null;
  if (folder.some(segment => !segment || /[/\\\0]/.test(segment) || segment.includes('..'))) return null;
  return `${folder.join('/')}/${fileName}`;
}

/** Nom de téléchargement sûr, avec l'extension du fichier stocké. */
function downloadName(requested: string | null | undefined, extension: string): string {
  const cleaned = (requested ?? '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim();
  if (!cleaned) return `fichier${extension}`;
  return path.extname(cleaned).toLowerCase() === extension ? cleaned : `${cleaned}${extension}`;
}

/**
 * Lit un fichier privé déjà autorisé. `relative` vient de `privateUploadPath`
 * (`null` → 404). Le type vient de l'extension du fichier stocké, jamais du
 * type déclaré au dépôt : l'API ne sert jamais de `text/html`.
 */
export async function readPrivateUpload(
  relative: string | null,
  requestedName: string | null | undefined,
  notFoundMessage: string
): Promise<PrivateFile> {
  if (!relative) throw new NotFoundError(notFoundMessage);

  for (const root of privateUploadReadRoots()) {
    const absolute = path.resolve(root, relative);
    // Défense en profondeur : le chemin reste sous la racine.
    if (!absolute.startsWith(path.resolve(root) + path.sep)) continue;
    try {
      const buffer = await fs.readFile(absolute);
      const extension = path.extname(absolute).toLowerCase();
      return {
        buffer,
        fileName: downloadName(requestedName, extension),
        mimeType: MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'
      };
    } catch {
      // Essayer la racine suivante.
    }
  }
  throw new NotFoundError(notFoundMessage);
}

/** Réponse fichier commune à toutes les routes de téléchargement privées. */
export function sendPrivateFile(res: Response, file: PrivateFile): void {
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.setHeader('Content-Length', file.buffer.length.toString());
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(file.buffer);
}
