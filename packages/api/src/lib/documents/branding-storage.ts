import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { getUploadsRoot } from '../../utils/project-root';
import { BadRequestError } from '../../middleware/error-middleware';
import { logger } from '../../utils/logger';

/**
 * Stockage PRIVÉ des images d'identité des documents (lot S1, besoin 7) :
 * logos, signatures et cachets des agences mandantes, logo d'une
 * copropriété, signature et cachet de l'agence elle-même.
 *
 * - Racine : `<UPLOADS_DIR>/branding/<tenantId>/...`. `branding/` n'est PAS
 *   dans la liste blanche de `middleware/uploads-access-middleware.ts` : ces
 *   fichiers ne sortent jamais en statique, seulement par les routes
 *   authentifiées de `routes/document-branding-routes.ts`.
 * - En base, on garde une CLÉ relative (`branding/<tenantId>/mandants/<id>/logo-<uuid>.png`),
 *   jamais renvoyée au client (les réponses exposent `hasLogo`…).
 * - PNG ou JPEG seulement, reconnus par leurs octets magiques (le type
 *   déclaré par le navigateur ne compte pas), 2 Mo au plus, nom régénéré.
 */

export const BRANDING_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export type BrandingImageFormat = 'png' | 'jpg';

export interface BrandingImage {
  bytes: Uint8Array;
  format: BrandingImageFormat;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Format réel d'une image d'après ses premiers octets, ou `null`. */
export function detectImageFormat(bytes: Uint8Array | null | undefined): BrandingImageFormat | null {
  if (!bytes || bytes.length < 8) return null;
  if (PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  return null;
}

/**
 * Valide un fichier déposé et renvoie son format réel. Lève `BadRequestError`
 * (400) pour un fichier absent, trop lourd ou qui n'est ni PNG ni JPEG.
 */
export function validateBrandingImage(
  file: { buffer?: Buffer; size?: number } | undefined | null
): BrandingImageFormat {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new BadRequestError('Aucune image reçue : joignez un fichier PNG ou JPEG dans le champ « file ».');
  }
  const size = file.size ?? file.buffer.length;
  if (size > BRANDING_IMAGE_MAX_BYTES || file.buffer.length > BRANDING_IMAGE_MAX_BYTES) {
    throw new BadRequestError('Image trop volumineuse : 2 Mo maximum.');
  }
  const format = detectImageFormat(file.buffer);
  if (!format) {
    throw new BadRequestError('Image invalide : seuls les formats PNG et JPEG sont acceptés.');
  }
  return format;
}

function isSafeSegment(segment: string): boolean {
  return segment.length > 0 && !/[/\\\0]/.test(segment) && segment !== '.' && segment !== '..';
}

/**
 * Chemin absolu d'une clé, à condition qu'elle appartienne bien à l'agence
 * (`branding/<tenantId>/...`) et reste sous la racine. `null` sinon.
 */
export function resolveBrandingKey(tenantId: string, key: string | null | undefined): string | null {
  if (!key) return null;
  const segments = key.split('/');
  if (segments.length < 3 || segments[0] !== 'branding' || segments[1] !== tenantId) return null;
  if (!segments.every(isSafeSegment)) return null;
  const root = path.resolve(getUploadsRoot(env.UPLOADS_DIR));
  const absolute = path.resolve(root, ...segments);
  if (!absolute.startsWith(root + path.sep)) return null;
  return absolute;
}

/**
 * Écrit l'image sous `branding/<tenantId>/<dossier...>/<nom>-<uuid>.<ext>` et
 * renvoie sa clé. `folder` et `baseName` sont fixés par le code, jamais par
 * la requête (seuls des identifiants déjà vérifiés y figurent).
 */
export async function saveBrandingImage(
  tenantId: string,
  folder: string[],
  baseName: string,
  buffer: Buffer,
  format: BrandingImageFormat
): Promise<string> {
  const segments = ['branding', tenantId, ...folder];
  if (!segments.every(isSafeSegment) || !isSafeSegment(baseName)) {
    throw new BadRequestError('Emplacement de fichier invalide.');
  }
  const key = [...segments, `${baseName}-${randomUUID()}.${format}`].join('/');
  const absolute = resolveBrandingKey(tenantId, key);
  if (!absolute) throw new BadRequestError('Emplacement de fichier invalide.');
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, buffer);
  return key;
}

/** Supprime un fichier ; absent ou clé étrangère : rien à faire, jamais d'erreur. */
export async function deleteBrandingImage(tenantId: string, key: string | null | undefined): Promise<void> {
  const absolute = resolveBrandingKey(tenantId, key);
  if (!absolute) return;
  try {
    await fs.unlink(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('Branding image deletion failed', { tenantId, error });
    }
  }
}

/** Lit une image stockée ; fichier manquant, illisible ou non reconnu : `null`. */
export async function readBrandingImage(
  tenantId: string,
  key: string | null | undefined
): Promise<BrandingImage | null> {
  const absolute = resolveBrandingKey(tenantId, key);
  if (!absolute) return null;
  return readImageFile(absolute);
}

/** Lit un fichier image quelconque ; `null` s'il manque ou n'est ni PNG ni JPEG. */
export async function readImageFile(absolute: string): Promise<BrandingImage | null> {
  try {
    const buffer = await fs.readFile(absolute);
    const format = detectImageFormat(buffer);
    return format ? { bytes: new Uint8Array(buffer), format } : null;
  } catch {
    return null;
  }
}

export const BRANDING_IMAGE_MIME: Record<BrandingImageFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg'
};
