/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Recette gestion locative du 04/11/2026 — « Générer un document » :
 * BUG-027 (période du relevé), 028/029 (types sans générateur : 400),
 * 030 (titre et description transmis).
 */
const generateDocument = jest.fn();
jest.mock('../../src/services/document-generation-service', () => ({
  generateDocument: (...a: unknown[]) => generateDocument(...a),
  regenerateDocument: jest.fn(),
  getDocumentFile: jest.fn(),
  resolveLeaseDocumentType: jest.fn().mockResolvedValue('LEASE_HABITATION')
}));

import { generateDocumentHandler } from '../../src/controllers/document-generation-controller';

const UUID = '00000000-0000-4000-8000-000000000001';

function run(body: Record<string, unknown>) {
  const req: any = { tenantContext: { tenantId: 't' }, user: { userId: 'u' }, body };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  return generateDocumentHandler(req, res).then(() => res);
}

beforeEach(() => {
  jest.clearAllMocks();
  generateDocument.mockResolvedValue({ id: 'd', document_number: 'RCU-1', tenant_id: 't', status: 'FINAL' });
});

describe('types sans générateur', () => {
  it.each(['LEASE_ADDENDUM', 'RENT_QUITTANCE', 'DEPOSIT_RECEIPT', 'OTHER'])(
    '%s : 400, aucun document',
    async docType => {
      const res = await run({ docType, sourceKey: UUID });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(generateDocument).not.toHaveBeenCalled();
    }
  );
});

describe('relevé : période', () => {
  it('exige les deux dates', async () => {
    const res = await run({ docType: 'RENT_STATEMENT', sourceKey: UUID, startDate: '2026-01-01' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(generateDocument).not.toHaveBeenCalled();
  });

  it('refuse une fin antérieure au début', async () => {
    const res = await run({
      docType: 'RENT_STATEMENT',
      sourceKey: UUID,
      startDate: '2026-03-01',
      endDate: '2026-02-01'
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(generateDocument).not.toHaveBeenCalled();
  });

  it('transmet la période au générateur', async () => {
    const res = await run({
      docType: 'RENT_STATEMENT',
      sourceKey: UUID,
      startDate: '2026-01-01',
      endDate: '2026-03-31'
    });
    expect(res.status).toHaveBeenCalledWith(201);
    const params = generateDocument.mock.calls[0][4];
    expect(params.startDate).toBeInstanceOf(Date);
    expect(params.endDate).toBeInstanceOf(Date);
  });
});

describe('titre et description', () => {
  it('sont transmis au service pour enregistrement', async () => {
    await run({ docType: 'RENT_RECEIPT', sourceKey: UUID, title: ' Mon titre ', description: 'Ma description' });
    expect(generateDocument.mock.calls[0][6]).toEqual({ title: 'Mon titre', description: 'Ma description' });
  });
});
