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
  // Un PNG de quelques Ko peut déclarer 8000 x 8000 pixels : décompressé à la
  // génération d'un PDF, il saturerait la mémoire (bombe de décompression).
  const dimensions = readImageDimensions(file.buffer, format);
  if (!dimensions) {
    throw new BadRequestError('Image invalide : dimensions illisibles.');
  }
  if (
    dimensions.width > BRANDING_IMAGE_MAX_SIDE ||
    dimensions.height > BRANDING_IMAGE_MAX_SIDE ||
    dimensions.width * dimensions.height > BRANDING_IMAGE_MAX_PIXELS
  ) {
    throw new BadRequestError('Image trop grande : 3000 x 3000 pixels maximum.');
  }
  return format;
}

export const BRANDING_IMAGE_MAX_SIDE = 3000;
export const BRANDING_IMAGE_MAX_PIXELS = 8_000_000;

/**
 * Dimensions déclarées par l'en-tête d'une image, sans la décoder.
 * PNG : bloc IHDR (largeur octets 16-19, hauteur 20-23). JPEG : premier
 * marqueur SOFn trouvé en parcourant les segments. `null` si illisible.
 */
export function readImageDimensions(
  bytes: Uint8Array,
  format: BrandingImageFormat
): { width: number; height: number } | null {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === 'png') {
    if (buffer.length < 24 || buffer.toString('latin1', 12, 16) !== 'IHDR') return null;
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return readJpegDimensions(buffer);
}

/** SOF0 à SOF15, hors DHT (C4), JPG (C8) et DAC (CC) qui partagent la plage. */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2; // après SOI (FF D8)
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    if (marker === 0xff) {
      offset += 1; // octet de remplissage
      continue;
    }
    // Marqueurs sans longueur : RSTn, TEM. SOS (DA) ou EOI : plus de SOF à attendre.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return null;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (isStartOfFrame(marker)) {
      if (offset + 9 > buffer.length) return null;
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += 2 + length;
  }
  return null;
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

/**
 * Cache mémoire des octets d'image déjà validés (lot « anomalies-recette » :
 * une quittance avec logo/signature/cachet lit ces fichiers à chaque
 * génération de PDF — un document non stocké, ou l'impression groupée qui ne
 * stocke jamais rien, relit donc le même logo d'agence à chaque appel). Clé :
 * chemin absolu ; invalidée par `mtimeMs` (un nouveau dépôt écrase le fichier
 * sous le même chemin uniquement si la clé de stockage n'a pas changé, ce qui
 * n'arrive jamais ici — `saveBrandingImage` régénère un nom à chaque dépôt —
 * mais la vérification reste bon marché et couvre aussi un remplacement
 * manuel du fichier sur le disque).
 *
 * Bornée en octets ET en entrées : une image pèse au plus
 * `BRANDING_IMAGE_MAX_BYTES` (2 Mo), le cache ne dépasse donc jamais
 * `IMAGE_CACHE_MAX_BYTES` en mémoire process. LRU par ordre d'insertion d'une
 * `Map` : l'entrée la plus ancienne est la première retirée.
 *
 * Ceci n'accélère PAS la génération elle-même (décodage PNG et
 * réencodage par pdf-lib, mesurés à plusieurs secondes pour une image proche
 * de 3000 x 3000 px, voir le rapport du lot) : seule la lecture disque en
 * profite. Le vrai remède — réduire la résolution à l'upload — est hors lot
 * (aucune bibliothèque d'image, ex. `sharp`, n'est installée côté API).
 */
const IMAGE_CACHE_MAX_ENTRIES = 50;
const IMAGE_CACHE_MAX_BYTES = 100 * 1024 * 1024;

interface CachedImage {
  image: BrandingImage;
  mtimeMs: number;
}

const imageBytesCache = new Map<string, CachedImage>();
let imageCacheBytes = 0;

function cacheGet(absolute: string, mtimeMs: number): BrandingImage | null {
  const entry = imageBytesCache.get(absolute);
  if (!entry || entry.mtimeMs !== mtimeMs) return null;
  // Réinsertion : la `Map` conserve l'ordre, donc la fin devient « le plus récent ».
  imageBytesCache.delete(absolute);
  imageBytesCache.set(absolute, entry);
  return entry.image;
}

function cacheSet(absolute: string, mtimeMs: number, image: BrandingImage): void {
  const existing = imageBytesCache.get(absolute);
  if (existing) imageCacheBytes -= existing.image.bytes.byteLength;
  imageBytesCache.set(absolute, { image, mtimeMs });
  imageCacheBytes += image.bytes.byteLength;
  while (imageBytesCache.size > IMAGE_CACHE_MAX_ENTRIES || imageCacheBytes > IMAGE_CACHE_MAX_BYTES) {
    const oldestKey = imageBytesCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = imageBytesCache.get(oldestKey);
    imageBytesCache.delete(oldestKey);
    if (oldest) imageCacheBytes -= oldest.image.bytes.byteLength;
  }
}

/** Vide le cache ; réservé aux tests (deux fichiers différents ne doivent jamais partager un chemin en production). */
export function clearImageFileCache(): void {
  imageBytesCache.clear();
  imageCacheBytes = 0;
}

/** Lit un fichier image quelconque ; `null` s'il manque ou n'est ni PNG ni JPEG. */
export async function readImageFile(absolute: string): Promise<BrandingImage | null> {
  try {
    const stat = await fs.stat(absolute);
    const cached = cacheGet(absolute, stat.mtimeMs);
    if (cached) return cached;
    const buffer = await fs.readFile(absolute);
    const format = detectImageFormat(buffer);
    if (!format) return null;
    const image: BrandingImage = { bytes: new Uint8Array(buffer), format };
    cacheSet(absolute, stat.mtimeMs, image);
    return image;
  } catch {
    return null;
  }
}

export const BRANDING_IMAGE_MIME: Record<BrandingImageFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg'
};
