/**
 * BUG-2026-09-30-021 — `POST /tenants/:id/properties/:id/mandates` :
 * - corps sans `propertyId` : 400 VALIDATION_ERROR, jamais un 500 qui recite
 *   l'invocation Prisma et le chemin disque du serveur ;
 * - une erreur inattendue ne renvoie jamais chemin de fichier ni texte Prisma.
 */

const createMandate = jest.fn();

jest.mock('../../src/services/property-mandate-service', () => ({
  createMandate: (...a: any[]) => createMandate(...a),
  revokeMandate: jest.fn(),
  getPropertyMandates: jest.fn(),
  getTenantMandates: jest.fn()
}));

jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  getTenantIdFromRequest: (req: any) => req.tenantContext?.tenantId
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { createMandateHandler } from '../../src/controllers/property-mandate-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

function mockRes() {
  const res: any = { headersSent: false };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

async function run(body: any, err?: unknown) {
  const req: any = {
    params: { tenantId: 'tenant-A', id: '7252991d-9621-4d28-b54b-790da8477df5' },
    tenantContext: { tenantId: 'tenant-A' },
    body,
    headers: {},
    query: {},
    path: '/x'
  };
  const res = mockRes();
  const next = jest.fn((e: unknown) => errorHandler(e as Error, req, res, jest.fn()));
  if (err) createMandate.mockRejectedValue(err);
  await createMandateHandler(req, res, next);
  await new Promise(resolve => setImmediate(resolve));
  return { res, next };
}

beforeEach(() => jest.clearAllMocks());

describe('createMandateHandler', () => {
  it('rejette un corps sans propertyId en 400 VALIDATION_ERROR sans toucher au service', async () => {
    const { res } = await run({ startDate: '2026-10-01' });
    expect(createMandate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
  });

  it("ne renvoie jamais l'invocation Prisma ni le chemin disque d'une erreur inattendue", async () => {
    const leak = new Error(
      '\nInvalid `prisma.property.findUnique()` invocation in\nD:/APP/Immobillier/packages/api/src/services/property-mandate-service.ts:19\n'
    );
    const { res } = await run({ propertyId: '7252991d-9621-4d28-b54b-790da8477df5', startDate: '2026-10-01' }, leak);
    expect(res.status).toHaveBeenCalledWith(500);
    const payload = JSON.stringify(res.json.mock.calls[0][0]);
    expect(payload).not.toMatch(/prisma|property-mandate-service|D:\/APP/i);
  });
});
