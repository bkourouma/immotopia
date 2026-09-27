import { promises as fs } from 'fs';
import * as path from 'path';
import { env } from '../../config/env';
import { getProjectRoot, getUploadsRoot } from '../../utils/project-root';
import { NotFoundError } from '../../middleware/error-middleware';
import { prisma } from '../../utils/database';

/**
 * Fichiers des documents de copropriété (`SyndicateDocument.fileUrl`).
 *
 * ---------------------------------------------------------------------------
 * Jamais servis en statique
 * ---------------------------------------------------------------------------
 *
 * Un document de copropriété est privé (règlement, PV, contrats
 * d'assurance, diagnostics...). `/uploads/syndics/...` est refusé par
 * `uploadsAccessGuard` (middleware/uploads-access-middleware.ts), quelle que
 * soit la session : le fichier ne sort QUE par une route qui a d'abord
 * vérifié le droit de l'appelant sur ce document —
 *   - gestion : `GET /api/tenants/:tenantId/syndics/:syndicId/documents/:documentId/fichier`
 *     (`requireTenantAccess` + permission de lecture, document de l'agence) ;
 *   - portail : `GET /api/portal/copropriete/documents/:documentId/fichier`
 *     (lots du copropriétaire connecté, règlement et PV seulement).
 * `fileUrl` garde sa forme historique `/uploads/syndics/<id>/documents/<f>` :
 * c'est un identifiant de stockage, plus une URL à ouvrir.
 *
 * ---------------------------------------------------------------------------
 * Où les fichiers sont écrits, et où ils sont relus
 * ---------------------------------------------------------------------------
 *
 * Écriture : sous la racine des dépôts de référence, `getUploadsRoot(env.UPLOADS_DIR)`
 * (variable `UPLOADS_DIR`, sinon `<monorepo>/uploads`) — la même que celle
 * des autres services.
 *
 * Lecture : cette racine d'abord, puis `packages/uploads`. Jusqu'à ce lot,
 * `createDocumentHandler` (syndic-controller.ts) calculait la racine du
 * projet en ne remontant que d'un niveau depuis `packages/api`, et écrivait
 * donc dans `packages/uploads`. Les fichiers déjà déposés y sont restés : on
 * ne les déplace pas, on continue de les y lire. Cette seconde racine pourra
 * disparaître une fois ces fichiers migrés (hors de ce lot).
 */

/** Dossier où écrire les documents d'une copropriété (racine de référence). */
export function syndicateDocumentsDir(syndicateId: string): string {
  return path.join(getUploadsRoot(env.UPLOADS_DIR), 'syndics', syndicateId, 'documents');
}

/** `fileUrl` stocké pour un fichier déposé. */
export function syndicateDocumentFileUrl(syndicateId: string, fileName: string): string {
  return `/uploads/syndics/${syndicateId}/documents/${fileName}`;
}

/** Racines relues, dans l'ordre (voir l'en-tête). */
export function syndicateDocumentReadRoots(): string[] {
  const reference = getUploadsRoot(env.UPLOADS_DIR);
  const legacy = path.join(getProjectRoot(), 'packages', 'uploads');
  return path.resolve(reference) === path.resolve(legacy) ? [reference] : [reference, legacy];
}

/**
 * Chemin relatif (`syndics/<id>/documents/<fichier>`) d'un fichier déposé
 * pour CETTE copropriété, ou `null` (lien externe, autre copropriété, chemin
 * suspect).
 */
export function localSyndicateDocumentPath(fileUrl: string, syndicateId: string): string | null {
  const match = /^\/uploads\/(syndics\/([^/]+)\/documents\/([^/\\]+))$/.exec(fileUrl);
  if (!match || match[2] !== syndicateId) return null;
  const fileName = match[3];
  if (fileName.includes('..') || fileName.includes('\0')) return null;
  return match[1];
}

export function isExternalDocumentUrl(fileUrl: string): boolean {
  return /^https?:\/\//i.test(fileUrl);
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

export interface SyndicateDocumentFile {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

/**
 * Lit le fichier d'un document DÉJÀ AUTORISÉ par l'appelant. 404 pour un
 * lien externe ou un fichier absent des deux racines.
 */
export async function readSyndicateDocumentFile(document: {
  syndicateId: string;
  title: string;
  fileUrl: string;
}): Promise<SyndicateDocumentFile> {
  const relative = localSyndicateDocumentPath(document.fileUrl, document.syndicateId);
  if (!relative) throw new NotFoundError('Document introuvable.');

  for (const root of syndicateDocumentReadRoots()) {
    const absolute = path.resolve(root, relative);
    // Défense en profondeur : le chemin reste sous la racine.
    if (!absolute.startsWith(path.resolve(root) + path.sep)) continue;
    try {
      const buffer = await fs.readFile(absolute);
      const extension = path.extname(absolute).toLowerCase();
      const safeTitle = document.title.replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || 'document';
      return {
        buffer,
        fileName: `${safeTitle}${extension}`,
        mimeType: MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'
      };
    } catch {
      // Essayer la racine suivante.
    }
  }
  throw new NotFoundError('Document introuvable.');
}

/**
 * Gestion : le fichier d'un document, à condition que sa copropriété
 * appartienne à l'agence. Toute autre situation (document inexistant, d'une
 * autre copropriété ou d'une autre agence, lien externe) répond le même 404.
 */
export async function getSyndicateDocumentFileForTenant(
  tenantId: string,
  syndicateId: string,
  documentId: string
): Promise<SyndicateDocumentFile> {
  const syndicate = await prisma.syndicate.findFirst({
    where: { id: syndicateId, tenantId },
    select: { id: true }
  });
  if (!syndicate) throw new NotFoundError('Document introuvable.');

  const document = await prisma.syndicateDocument.findFirst({
    where: { id: documentId, syndicateId: syndicate.id },
    select: { syndicateId: true, title: true, fileUrl: true }
  });
  if (!document) throw new NotFoundError('Document introuvable.');

  return readSyndicateDocumentFile(document);
}
