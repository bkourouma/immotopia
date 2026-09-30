/**
 * BUG-2026-09-30-040 : un document locatif genere ne renvoie jamais son chemin
 * disque ni ses cles de stockage.
 */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

import { toRentalDocumentDto } from '../../src/services/rental-document-service';

const raw = {
  id: 'doc-1',
  tenant_id: 'agency-1',
  type: 'LEASE_CONTRACT',
  status: 'FINAL',
  document_number: 'BAIL-2026-0001',
  file_url: 'D:/APP/Immobillier/assets/generated_documents/agency-1/x.docx',
  file_key: 'generated_documents/agency-1/x.docx',
  file_path: 'D:/APP/Immobillier/assets/generated_documents/agency-1/x.docx',
  file_hash: 'abc',
  content_hash: 'def',
  template_hash: 'ghi',
  mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

describe('toRentalDocumentDto', () => {
  it('retire chemin disque, cles de stockage et empreintes', () => {
    const dto = toRentalDocumentDto(raw);
    for (const key of ['file_url', 'file_key', 'file_path', 'file_hash', 'content_hash', 'template_hash']) {
      expect(dto).not.toHaveProperty(key);
    }
    expect(JSON.stringify(dto)).not.toMatch(/[A-Za-z]:[\/]|generated_documents|\/APP\//);
    expect(dto.document_number).toBe('BAIL-2026-0001');
  });

  it('expose une URL de telechargement protegee, relative', () => {
    const dto = toRentalDocumentDto(raw);
    expect(dto.downloadable).toBe(true);
    expect(dto.download_url).toBe('/api/tenants/agency-1/documents/doc-1/download');
  });

  it("un document annule ou sans fichier n'est pas telechargeable", () => {
    expect(toRentalDocumentDto({ ...raw, status: 'VOID' }).download_url).toBeNull();
    expect(toRentalDocumentDto({ ...raw, file_path: null }).downloadable).toBe(false);
  });
});
