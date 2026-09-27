import multer from 'multer';
import { Request } from 'express';
import { BadRequestError } from './error-middleware';
import { BRANDING_IMAGE_MAX_BYTES } from '../lib/documents/branding-storage';

/**
 * Dépôt d'une image d'identité des documents (lot S1) : logo, signature ou
 * cachet. Champ multipart `file`, en mémoire, 2 Mo au plus. Ce filtre ne
 * regarde que le type déclaré, pour refuser tôt ; le vrai contrôle (octets
 * magiques PNG/JPEG) est fait par `validateBrandingImage` avant l'écriture.
 */
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

function brandingImageFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void {
  if (file.mimetype && ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new BadRequestError('Image invalide : seuls les formats PNG et JPEG sont acceptés.'));
}

export const brandingImageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: brandingImageFilter,
  limits: { fileSize: BRANDING_IMAGE_MAX_BYTES, files: 1 }
});
