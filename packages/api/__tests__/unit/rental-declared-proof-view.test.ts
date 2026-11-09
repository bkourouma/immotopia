/** Contrat 049 §1.6 : lecture de capture par le gestionnaire, auditée et isolée par agence. */
const readDeclarationProofStream = jest.fn();
const logAuditEvent = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/lib/rental/declared-payment/proof-files', () => ({
  readDeclarationProofStream: (...a: any[]) => readDeclarationProofStream(...a)
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: (...a: any[]) => logAuditEvent(...a) }));

import { getDeclarationProofHandler } from '../../src/controllers/rental-declared-payment-controller';
import { NotFoundError } from '../../src/middleware/error-middleware';

const run = async () => {
  const headers: Record<string, string> = {};
  const res: any = { setHeader: (k: string, v: string) => (headers[k] = v), end: jest.fn(), send: jest.fn() };
  const req: any = {
    params: { tenantId: 'tenant-A', declarationId: 'decl-1' },
    tenantContext: { tenantId: 'tenant-A' },
    user: { userId: 'user-9' }
  };
  const next = jest.fn();
  await getDeclarationProofHandler(req, res, next);
  return { res, headers, next };
};

beforeEach(() => jest.clearAllMocks());

it('sert la capture en inline sans cache et journalise la lecture (identifiants seulement)', async () => {
  readDeclarationProofStream.mockResolvedValue({
    buffer: Buffer.from('img'),
    mimeType: 'image/jpeg',
    fileName: 'p.jpg'
  });
  const { headers, next } = await run();
  expect(next).not.toHaveBeenCalled();
  expect(readDeclarationProofStream).toHaveBeenCalledWith('tenant-A', 'decl-1');
  expect(headers['Cache-Control']).toBe('private, no-store');
  expect(headers['Content-Disposition']).toMatch(/^inline/);
  expect(logAuditEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      actionKey: 'RENTAL_PAYMENT_DECLARATION_PROOF_VIEWED',
      tenantId: 'tenant-A',
      actorUserId: 'user-9',
      entityId: 'decl-1',
      payload: { declarationId: 'decl-1' }
    })
  );
});

it('autre agence ou capture absente : 404 et aucun audit', async () => {
  readDeclarationProofStream.mockRejectedValue(new NotFoundError('Capture introuvable.'));
  const { next } = await run();
  expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  expect(logAuditEvent).not.toHaveBeenCalled();
});
