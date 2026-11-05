/**
 * Liste des documents de location : recherche libre et période d'émission
 * (validation 400, construction du where, tenant_id conservé).
 */
const findMany = jest.fn();
const count = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalDocument: { findMany: (...a: unknown[]) => findMany(...a), count: (...a: unknown[]) => count(...a) }
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

import { listDocuments } from '../../src/services/rental-document-service';
import { listDocumentsHandler } from '../../src/controllers/rental-document-controller';
import { parseDocumentListExtras } from '../../src/lib/rental/document-list-filters';
import { BadRequestError } from '../../src/middleware/error-middleware';

describe('listDocuments : where', () => {
  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
    count.mockReset().mockResolvedValue(0);
  });
  const whereOf = () => findMany.mock.calls[0][0].where;

  it('sans filtre : seulement l agence', async () => {
    await listDocuments('T1');
    expect(whereOf()).toEqual({ tenant_id: 'T1' });
  });

  it('recherche sur numéro, titre et numéro de bail, avec le tenant et le bail', async () => {
    await listDocuments('T1', { leaseId: 'L1', search: 'bail' });
    const contains = { contains: 'bail', mode: 'insensitive' };
    expect(whereOf()).toEqual({
      tenant_id: 'T1',
      lease_id: 'L1',
      AND: [{ OR: [{ document_number: contains }, { title: contains }, { lease: { is: { lease_number: contains } } }] }]
    });
  });

  it('période d émission : bornes incluses', async () => {
    await listDocuments('T1', { from: '2026-01-01', to: '2026-01-31' });
    expect(whereOf().tenant_id).toBe('T1');
    expect(whereOf().issued_at).toEqual({
      gte: new Date('2026-01-01T00:00:00.000Z'),
      lte: new Date('2026-01-31T23:59:59.999Z')
    });
  });

  it('une seule borne', async () => {
    await listDocuments('T1', { to: '2026-01-31' });
    expect(whereOf().issued_at).toEqual({ lte: new Date('2026-01-31T23:59:59.999Z') });
  });
});

describe('parseDocumentListExtras', () => {
  it('valeurs vides ignorées, recherche rognée', () => {
    expect(parseDocumentListExtras({ search: '  ', from: '' })).toEqual({});
    expect(parseDocumentListExtras({ search: ' loy ' })).toEqual({ search: 'loy' });
  });

  it('refuse un jour impossible, une période inversée et une recherche trop longue', () => {
    expect(() => parseDocumentListExtras({ from: '2026-13-45' })).toThrow(BadRequestError);
    expect(() => parseDocumentListExtras({ to: '2026-02-31' })).toThrow(BadRequestError);
    expect(() => parseDocumentListExtras({ from: '2026-02-01', to: '2026-01-01' })).toThrow(BadRequestError);
    expect(() => parseDocumentListExtras({ search: 'a'.repeat(201) })).toThrow(BadRequestError);
  });
});

describe('listDocumentsHandler', () => {
  it('transmet une erreur 400 au middleware pour une date invalide', async () => {
    const next = jest.fn();
    const req: any = {
      user: { userId: 'u1' },
      params: { tenantId: 'T1' },
      tenantContext: { tenantId: 'T1' },
      query: { from: '2026-13-45' }
    };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await (listDocumentsHandler as any)(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    expect(res.json).not.toHaveBeenCalled();
  });
});
