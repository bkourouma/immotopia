import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { t } from '../i18n';
import { PROOF_MAX_BYTES } from '../lib/rental/declared-payment/proof-files';
import { AppError, ErrorCode } from './error-middleware';

/**
 * Réception de la capture d'une déclaration de paiement locatif (contrat 049, §1.3 et §1.5).
 *
 * `multipart/form-data` : un champ fichier `proof` (en mémoire, jamais écrit ici) et des
 * champs texte courts. Le moteur vérifie ensuite le type RÉEL sur les octets, retire
 * l'EXIF et écrit en privé. multer ne coupe qu'un octet au-delà de la limite métier :
 * `prepareProofFile` rend lui-même le 413 typé pour un fichier de 5 Mo + 1.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROOF_MAX_BYTES + 1, files: 1, fields: 16, fieldSize: 20_000 }
}).single('proof');

export function receiveRentalDeclarationProof(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(new AppError(t('La capture dépasse 5 Mo.'), 413, ErrorCode.RENTAL_DECLARATION_PROOF_TOO_LARGE));
        return;
      }
      next(new AppError(t('La capture est invalide.'), 400, ErrorCode.RENTAL_DECLARATION_PROOF_INVALID));
      return;
    }
    next(error as Error | undefined);
  });
}
