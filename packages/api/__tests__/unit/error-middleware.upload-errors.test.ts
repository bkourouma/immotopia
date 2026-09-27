/**
 * Erreurs d'upload (multer) vues par `errorHandler`.
 *
 * En recette, un `.txt` déposé dans le coffre documentaire d'une copropriété
 * répondait 500 `{"code":"INTERNAL", ...}` : les `fileFilter` de multer
 * levaient un `Error` nu (voir `middleware/upload-middleware.ts`), que
 * `errorHandler` ne savait traiter que comme une panne serveur. Ce fichier
 * épingle que :
 *  - une erreur de validation posée par un `fileFilter` (désormais une
 *    `BadRequestError`) répond 400 ;
 *  - une `MulterError` native (fichier trop volumineux, champ inattendu…),
 *    qui ne passe jamais par `fileFilter`, répond 413 pour `LIMIT_FILE_SIZE`
 *    et 400 pour les autres codes — jamais 500.
 */

import multer from 'multer';
import { errorHandler, BadRequestError } from '../../src/middleware/error-middleware';

type Row = Record<string, any>;

function reponseFactice() {
  const res: Row = {};
  res.headersSent = false;
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function requeteFactice(): any {
  return { method: 'POST', path: '/api/tenants/t1/syndics/s1/documents', ip: '127.0.0.1' };
}

describe('errorHandler — erreurs de téléversement', () => {
  it("une BadRequestError posée par un fileFilter répond 400, jamais 500", () => {
    const req = requeteFactice();
    const res = reponseFactice();
    const next = jest.fn();

    errorHandler(
      new BadRequestError('Type de fichier non accepté. Formats autorisés : PDF, DOC, DOCX, JPEG, PNG, TIFF.'),
      req,
      res as any,
      next
    );

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.message).toBe('Type de fichier non accepté. Formats autorisés : PDF, DOC, DOCX, JPEG, PNG, TIFF.');
    expect(body.error).toBe(body.message);
  });

  it('une MulterError LIMIT_FILE_SIZE répond 413, avec un message clair', () => {
    const req = requeteFactice();
    const res = reponseFactice();
    const next = jest.fn();

    const err = new multer.MulterError('LIMIT_FILE_SIZE');
    errorHandler(err, req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(413);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).toBe('Le fichier envoyé dépasse la taille maximale autorisée.');
  });

  it('une autre MulterError (champ inattendu) répond 400, pas 500', () => {
    const req = requeteFactice();
    const res = reponseFactice();
    const next = jest.fn();

    const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE');
    errorHandler(err, req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('une Error nue et inconnue reste un 500 (non-régression)', () => {
    const req = requeteFactice();
    const res = reponseFactice();
    const next = jest.fn();

    errorHandler(new Error('Boum interne'), req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
