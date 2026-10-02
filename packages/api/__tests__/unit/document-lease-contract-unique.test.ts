/**
 * Un contrat de bail porte le numéro du bail : un seul contrat par bail. Un
 * second `generateDocument` doit répondre par un AppError explicite (409,
 * renvoi vers « Régénérer »), sans écrire de fichier ni lever d'erreur brute.
 */
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../src/utils/logger', () => ({ logger }));

const rentalLeaseFindFirst = jest.fn();
const rentalDocumentFindFirst = jest.fn();
const rentalDocumentCreate = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalLease: { findFirst: (...a: unknown[]) => rentalLeaseFindFirst(...a) },
    rentalDocument: {
      findFirst: (...a: unknown[]) => rentalDocumentFindFirst(...a),
      create: (...a: unknown[]) => rentalDocumentCreate(...a)
    },
    rentalPayment: { findFirst: jest.fn() },
    documentCounter: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() }
  }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/document-template-service', () => ({
  resolveTemplate: jest.fn().mockResolvedValue({ id: 'tpl-1', name: 'Bail', placeholders: [], file_hash_sha256: 'h' })
}));
jest.mock('../../src/services/document-context-builder', () => ({
  buildDocumentContext: jest.fn().mockResolvedValue({}),
  validateContext: jest.fn().mockReturnValue({ missing: [], warnings: [] })
}));
const saveGeneratedDocument = jest.fn().mockResolvedValue('/tmp/x.docx');
jest.mock('../../src/services/docx-renderer', () => ({
  renderDocx: jest.fn().mockResolvedValue(Buffer.from('docx')),
  calculateHash: jest.fn().mockReturnValue('hash'),
  saveGeneratedDocument: (...a: unknown[]) => saveGeneratedDocument(...a)
}));

import { DocumentType } from '@prisma/client';
import { AppError } from '../../src/middleware/error-middleware';
import { generateDocument } from '../../src/services/document-generation-service';

const LEASE_ID = '11111111-1111-4111-8111-111111111111';

describe('generateDocument — contrat de bail unique', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rentalLeaseFindFirst.mockResolvedValue({ lease_number: 'BAIL-2026-0001' });
    saveGeneratedDocument.mockResolvedValue('/tmp/x.docx');
  });

  it('un contrat existe déjà pour ce bail : AppError 409 explicite, aucun fichier écrit ni ligne créée', async () => {
    rentalDocumentFindFirst.mockResolvedValue({ id: 'doc-existant' });

    const error = await generateDocument(
      'tenant-1',
      DocumentType.LEASE_HABITATION,
      LEASE_ID,
      undefined,
      undefined,
      'user-1'
    ).catch(e => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(409);
    expect(error.message).toContain('Régénérer');
    expect(saveGeneratedDocument).not.toHaveBeenCalled();
    expect(rentalDocumentCreate).not.toHaveBeenCalled();
    expect(rentalDocumentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenant_id: 'tenant-1', document_number: 'BAIL-2026-0001' } })
    );
  });

  it('le second type de contrat sur le même bail est refusé de la même façon', async () => {
    rentalDocumentFindFirst.mockResolvedValue({ id: 'doc-habitation' });

    await expect(
      generateDocument('tenant-1', DocumentType.LEASE_COMMERCIAL, LEASE_ID, undefined, undefined, 'user-1')
    ).rejects.toBeInstanceOf(AppError);
  });

  it('premier contrat : généré avec le numéro du bail', async () => {
    rentalDocumentFindFirst.mockResolvedValue(null);
    rentalDocumentCreate.mockReturnValue(Promise.resolve({ id: 'doc-1', document_number: 'BAIL-2026-0001' }));

    const doc = await generateDocument(
      'tenant-1',
      DocumentType.LEASE_HABITATION,
      LEASE_ID,
      undefined,
      undefined,
      'user-1'
    );

    expect(doc.document_number).toBe('BAIL-2026-0001');
    expect(rentalDocumentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ document_number: 'BAIL-2026-0001' }) })
    );
  });

  it("course : l'index unique tranche (P2002) → même AppError, pas d'erreur brute", async () => {
    rentalDocumentFindFirst.mockResolvedValue(null);
    rentalDocumentCreate.mockReturnValue(Promise.reject(Object.assign(new Error('unique'), { code: 'P2002' })));

    const error = await generateDocument(
      'tenant-1',
      DocumentType.LEASE_HABITATION,
      LEASE_ID,
      undefined,
      undefined,
      'user-1'
    ).catch(e => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toContain('Régénérer');
  });

  it("une autre erreur de création n'est pas masquée", async () => {
    rentalDocumentFindFirst.mockResolvedValue(null);
    rentalDocumentCreate.mockReturnValue(Promise.reject(new Error('connexion perdue')));

    await expect(
      generateDocument('tenant-1', DocumentType.LEASE_HABITATION, LEASE_ID, undefined, undefined, 'user-1')
    ).rejects.toThrow('connexion perdue');
  });
});
