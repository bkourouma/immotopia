/**
 * Aucun chemin disque ne doit atteindre une réponse : docx-renderer lève des
 * erreurs typées sans chemin, le contrôleur ne renvoie que le message d'une
 * erreur typée (AppError).
 */
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../src/utils/logger', () => ({ logger }));
jest.mock('../../src/utils/database', () => ({ prisma: {} }));

const generateDocument = jest.fn();
const getDocumentFile = jest.fn();
jest.mock('../../src/services/document-generation-service', () => ({
  generateDocument: (...a: unknown[]) => generateDocument(...a),
  regenerateDocument: jest.fn(),
  getDocumentFile: (...a: unknown[]) => getDocumentFile(...a)
}));

import type { Request, Response } from 'express';
import { renderDocx } from '../../src/services/docx-renderer';
import { NotFoundError, BadRequestError, AppError } from '../../src/middleware/error-middleware';
import { generateDocumentHandler, downloadDocumentHandler } from '../../src/controllers/document-generation-controller';

const SECRET_PATH = '/srv/immotopia/assets/modeles_documents/tenants/abc/secret_tpl.docx';
const noPath = (text: string) => {
  expect(text).not.toContain('/');
  expect(text).not.toContain('storage_path');
  expect(text).not.toContain('secret_tpl');
  expect(text).not.toContain('\\');
};

describe('renderDocx', () => {
  it('modèle introuvable : NotFoundError sans chemin, chemins dans les journaux', async () => {
    const template = {
      id: 'tpl-1',
      storage_path: SECRET_PATH,
      stored_filename: 'secret_tpl.docx',
      tenant_id: 'abc'
    } as any;
    const error = await renderDocx(template, {}).catch(e => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.statusCode).toBe(404);
    noPath(error.message);
    expect(JSON.stringify(logger.error.mock.calls)).toContain(SECRET_PATH);
  });

  it('erreur de moteur ou de lecture : BadRequestError générique sans chemin', async () => {
    const error = await renderDocx({ id: 't', storage_path: __filename, stored_filename: 'x.docx' } as any, {}).catch(
      e => e
    ); // ce fichier n'est pas un zip : le moteur lève
    expect(error).toBeInstanceOf(BadRequestError);
    noPath(error.message);
  });
});

function fakeRes() {
  const res: any = { statusCode: 200 };
  res.status = jest.fn((code: number) => ((res.statusCode = code), res));
  res.json = jest.fn(body => ((res.body = body), res));
  return res as Response & { body: any };
}
const req = (extra: object = {}) =>
  ({
    tenantContext: { tenantId: 'tenant-1' },
    user: { userId: 'user-1' },
    body: { docType: 'RENT_RECEIPT', sourceKey: '11111111-1111-4111-8111-111111111111' },
    params: { id: 'doc-1' },
    ...extra
  }) as unknown as Request;

describe('document-generation-controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['génération', () => generateDocumentHandler(req(), res1), generateDocument],
    ['téléchargement', () => downloadDocumentHandler(req(), res1), getDocumentFile]
  ])('%s : une Error non typée ne renvoie pas son message', async (_name, call, mocked) => {
    (mocked as jest.Mock).mockRejectedValue(new Error(`ENOENT: no such file, open '${SECRET_PATH}'`));
    res1 = fakeRes();
    await (call as () => Promise<void>)();
    const body = res1.body;
    expect(JSON.stringify(body)).not.toContain('ENOENT');
    noPath(body.message);
    expect(res1.statusCode).toBe(400);
  });

  it('génération : une erreur typée garde son message et son statut', async () => {
    generateDocument.mockRejectedValue(new NotFoundError('Modèle de document introuvable : ré-importez le modèle.'));
    res1 = fakeRes();
    await generateDocumentHandler(req(), res1);
    expect(res1.statusCode).toBe(404);
    expect(res1.body.message).toContain('Modèle de document introuvable');
    expect(new NotFoundError('x')).toBeInstanceOf(AppError);
  });
});
let res1: Response & { body: any };
