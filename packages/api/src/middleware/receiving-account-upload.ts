import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError, ErrorCode } from './error-middleware';
import { QR_MAX_BYTES } from '../lib/receiving-accounts/qr-files';
import { t } from '../i18n';

/**
 * Réception de l'image du QR d'un compte de réception (spec 048, lot Q).
 *
 * `multipart/form-data` : un champ fichier `qr` (en mémoire, jamais écrit ici)
 * et des champs texte courts. Le service vérifie ensuite le type RÉEL sur les
 * octets, retire les métadonnées et écrit sous `uploads/receiving-accounts/`.
 * Un octet de plus que la limite métier : `prepareQr` rend lui-même le 413 typé.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: QR_MAX_BYTES + 1, files: 1, fields: 12, fieldSize: 4_000 }
}).single('qr');

/** multer, avec le dépassement de taille traduit en `413 RECEIVING_ACCOUNT_QR_TOO_LARGE`. */
export function receiveReceivingAccountQr(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new AppError(t("L'image du QR dépasse 2 Mo."), 413, ErrorCode.RECEIVING_ACCOUNT_QR_TOO_LARGE));
      return;
    }
    next(error as Error | undefined);
  });
}
