/**
 * `property-document-controller.ts` (lot P0) — le type de document arrive
 * d'un formulaire multipart en chaine libre : verifie contre l'enum Prisma
 * AVANT toute ecriture de fichier, pour repondre 400 et non 500 sur une
 * valeur inconnue. Meme garde pour une date d'expiration invalide.
 */

const uploadDocument = jest.fn();

jest.mock('../../src/services/property-document-service', () => ({
  uploadDocument: (...a: any[]) => uploadDocument(...a),
  getDocuments: jest.fn(),
  deleteDocument: jest.fn()
}));

import { uploadDocumentHandler } from '../../src/controllers/property-document-controller';

function buildReqRes(body: Record<string, unknown>) {
  const req: any = {
    params: { id: 'prop-1' },
    propertyTenantId: 'tenant-1',
    tenantContext: { tenantId: 'tenant-1' },
    user: { userId: 'user-1' },
    file: { originalname: 'doc.pdf' },
    body
  };
  const res: any = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json: jest.fn()
  };
  return { req, res };
}

describe('uploadDocumentHandler — validation du type et de la date', () => {
  beforeEach(() => jest.clearAllMocks());

  it('repond 400 sur un documentType inconnu, sans appeler le service', async () => {
    const { req, res } = buildReqRes({ documentType: 'TYPE_INCONNU' });
    const next = jest.fn();

    await uploadDocumentHandler(req, res, next);

    expect(uploadDocument).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(400);
  });

  it('accepte un documentType du lot Patrimoine (NOTARIAL_DEED)', async () => {
    uploadDocument.mockResolvedValue({ id: 'doc-1' });
    const { req, res } = buildReqRes({ documentType: 'NOTARIAL_DEED' });
    const next = jest.fn();

    await uploadDocumentHandler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(uploadDocument).toHaveBeenCalledWith(
      'prop-1',
      'tenant-1',
      req.file,
      'NOTARIAL_DEED',
      undefined,
      false,
      'user-1'
    );
  });

  it("repond 400 sur une date d'expiration invalide", async () => {
    const { req, res } = buildReqRes({ documentType: 'INSURANCE', expirationDate: 'pas-une-date' });
    const next = jest.fn();

    await uploadDocumentHandler(req, res, next);

    expect(uploadDocument).not.toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(400);
  });
});
