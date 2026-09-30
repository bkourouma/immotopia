/**
 * BUG-2026-09-30-066 : un second contrat pour le meme bail est refuse en 409
 * typé avec l'identifiant du document existant (au lieu d'une erreur générique).
 */
const rentalLeaseFindFirst = jest.fn();
const rentalDocumentFindFirst = jest.fn();
const rentalDocumentCreate = jest.fn();
const resolveTemplate = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalLease: { findFirst: (...a: any[]) => rentalLeaseFindFirst(...a) },
    rentalDocument: {
      findFirst: (...a: any[]) => rentalDocumentFindFirst(...a),
      create: (...a: any[]) => rentalDocumentCreate(...a)
    },
    rentalPayment: { findFirst: jest.fn() },
    documentCounter: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() }
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/document-template-service', () => ({
  resolveTemplate: (...a: any[]) => resolveTemplate(...a)
}));
jest.mock('../../src/services/document-context-builder', () => ({
  buildDocumentContext: jest.fn().mockResolvedValue({}),
  validateContext: jest.fn().mockReturnValue({ missing: [], warnings: [] })
}));
jest.mock('../../src/services/docx-renderer', () => ({
  renderDocx: jest.fn().mockResolvedValue(Buffer.from('x')),
  calculateHash: jest.fn().mockReturnValue('h'),
  saveGeneratedDocument: jest.fn().mockResolvedValue('/tmp/x.docx')
}));

import { DocumentType } from '@prisma/client';
import { AppError } from '../../src/middleware/error-middleware';
import { generateDocument } from '../../src/services/document-generation-service';

beforeEach(() => {
  jest.clearAllMocks();
  rentalLeaseFindFirst.mockResolvedValue({ lease_number: 'BAIL-2026-0001' });
  resolveTemplate.mockResolvedValue({ id: 'tpl', placeholders: [], file_hash_sha256: 'h' });
});

describe('generateDocument : contrat déjà généré', () => {
  it('refus 409 avant tout rendu, avec le document existant', async () => {
    rentalDocumentFindFirst.mockResolvedValue({ id: 'doc-1' });

    const error: AppError = await generateDocument(
      'agency-1',
      DocumentType.LEASE_HABITATION,
      'lease-1',
      undefined,
      undefined,
      'user-1'
    ).catch(e => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(409);
    expect(error.message).toContain('Régénérer');
    expect(error.data).toEqual({ existingDocumentId: 'doc-1' });
    expect(rentalDocumentFindFirst.mock.calls[0][0].where).toEqual({
      tenant_id: 'agency-1',
      document_number: 'BAIL-2026-0001'
    });
    expect(rentalDocumentCreate).not.toHaveBeenCalled();
  });

  it("course sur l'index unique (P2002) : même 409", async () => {
    rentalDocumentFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'doc-2' });
    rentalLeaseFindFirst.mockResolvedValue({ lease_number: 'BAIL-2026-0001' });
    rentalDocumentCreate.mockRejectedValue(Object.assign(new Error('Unique'), { code: 'P2002' }));

    const error: AppError = await generateDocument(
      'agency-1',
      DocumentType.LEASE_COMMERCIAL,
      'lease-1',
      undefined,
      undefined,
      'user-1'
    ).catch(e => e);

    expect(error.statusCode).toBe(409);
    expect(error.data).toEqual({ existingDocumentId: 'doc-2' });
  });
});
