import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError, ErrorCode } from './error-middleware';
import { PROOF_MAX_BYTES } from '../lib/syndics/declared-payment/proof-files';
import { t } from '../i18n';

/**
 * Réception de la capture d'une déclaration de paiement (spec 047, contrats §1.11 et §2.4).
 *
 * `multipart/form-data` : un champ fichier `proof` (en mémoire, jamais écrit ici) et un
 * champ texte `payload` (JSON). Le moteur vérifie ensuite le type RÉEL sur les octets,
 * retire l'EXIF et écrit sous `uploads/syndics/payment-proofs/` (jamais servi en statique).
 *
 * Un octet de plus que la limite métier : `prepareProofFile` rend lui-même le 413 typé
 * pour un fichier de 5 Mo + 1 ; multer ne coupe qu'au-delà, pour ne pas lire en mémoire
 * un envoi démesuré. Un seul fichier, quelques champs texte courts.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROOF_MAX_BYTES + 1, files: 1, fields: 8, fieldSize: 20_000 }
}).single('proof');

/** multer, avec le dépassement de taille traduit en `413 DECLARATION_PROOF_TOO_LARGE`. */
export function receiveDeclarationProof(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new AppError(t('La capture dépasse 5 Mo.'), 413, ErrorCode.DECLARATION_PROOF_TOO_LARGE));
      return;
    }
    next(error as Error | undefined);
  });
}
