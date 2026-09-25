import multer from 'multer';
import { Request } from 'express';

/**
 * Upload du logo d'une agence (lot G). Instance multer dediee, distincte de
 * `upload-middleware.ts` (medias de biens : jusqu'a 50 Mo, photos ET videos) :
 * un logo est PNG/JPEG/WebP uniquement — jamais de SVG, qui peut embarquer du
 * script — et plafonne a 2 Mo.
 *
 * Nom de fichier volontairement hors de `tenant-*.ts` : ce prefixe est
 * reserve (voir la consigne de territoire du lot multi-tenant).
 */

const ALLOWED_LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024;

function logoFileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void {
  if (file.mimetype && ALLOWED_LOGO_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
    return;
  }
  // Erreur multer generique ici (elle transite par `cb`, pas par la pile
  // Express) : le controleur/service revalide de toute facon le type et la
  // taille du fichier recu, avec des `BadRequestError` typees (modele
  // property-media-controller.ts) — c'est cette seconde verification qui
  // porte le message renvoye au client.
  cb(new Error('Type de fichier non autorisé pour un logo. Formats acceptés : PNG, JPEG, WebP.'));
}

export const logoUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: logoFileFilter,
  limits: { fileSize: LOGO_MAX_SIZE_BYTES }
});
