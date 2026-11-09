/**
 * Déclaration pour un tiers (contrat §1.6) : le contrôleur délègue les règles
 * métier à `createRentalDeclaration` (tâche B, mockée) et répond 201 avec le DTO.
 */
const leaseFindFirst = jest.fn();
const createRentalDeclaration = jest.fn();
const loadDeclarationDto = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: { rentalLease: { findFirst: (...a: any[]) => leaseFindFirst(...a) } }
}));
jest.mock('../../src/lib/rental/declared-payment/declaration-create', () => ({
  createRentalDeclaration: (...a: any[]) => createRentalDeclaration(...a)
}));
jest.mock('../../src/lib/rental/declared-payment/declaration-dto', () => ({
  loadDeclarationDto: (...a: any[]) => loadDeclarationDto(...a)
}));
jest.mock('../../src/lib/rental/declared-payment/declaration-queries', () => ({ getPendingCount: jest.fn() }));

import { createDeclarationForThirdPartyHandler } from '../../src/controllers/rental-declared-payment-controller';

const LEASE = '11111111-1111-4111-8111-111111111111';
const NUMBER = '22222222-2222-4222-8222-222222222222';
const payload = {
  leaseId: LEASE,
  receivingNumberId: NUMBER,
  operator: 'ORANGE',
  reference: 'MP240101.1234',
  amount: 100000,
  paidAt: '2026-11-09T09:00:00+00:00'
};

const run = async (body: any, file?: any) => {
  const req: any = {
    params: { tenantId: 'tenant-A' },
    tenantContext: { tenantId: 'tenant-A' },
    user: { userId: 'user-9' },
    body,
    file
  };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  let error: any = null;
  await new Promise<void>(resolve => {
    createDeclarationForThirdPartyHandler(req, res, (e: any) => {
      error = e;
      resolve();
    });
    // asyncHandler résout après res.json ou next(err)
    const check = setInterval(() => {
      if (res.json.mock.calls.length > 0) {
        clearInterval(check);
        resolve();
      }
    }, 5);
    setTimeout(() => {
      clearInterval(check);
      resolve();
    }, 500);
  });
  return { res, error };
};

beforeEach(() => {
  jest.clearAllMocks();
  leaseFindFirst.mockResolvedValue({ id: LEASE, primary_renter_client_id: 'client-1' });
  createRentalDeclaration.mockResolvedValue({ declarationId: 'decl-new', duplicateSuspected: false });
  loadDeclarationDto.mockResolvedValue({ id: 'decl-new', status: 'PENDING' });
});

describe('POST /payment-declarations (tiers)', () => {
  it('crée pour le locataire principal, actor MANAGER, utilisateur de la session, 201 + DTO', async () => {
    const file = { buffer: Buffer.from('x'), mimetype: 'image/png', originalname: 'p.png' };
    const { res } = await run({ payload: JSON.stringify(payload) }, file);
    expect(createRentalDeclaration).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-A',
        leaseId: LEASE,
        declaredByClientId: 'client-1',
        declaredByUserId: 'user-9',
        actor: 'MANAGER',
        amount: 100000,
        proof: expect.objectContaining({ mimetype: 'image/png' })
      })
    );
    expect(loadDeclarationDto).toHaveBeenCalledWith('tenant-A', 'decl-new');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'decl-new', status: 'PENDING' } });
  });

  it("bail d'une autre agence : 404, rien créé", async () => {
    leaseFindFirst.mockResolvedValue(null);
    const { error } = await run({ payload: JSON.stringify(payload) });
    expect(error?.statusCode).toBe(404);
    expect(createRentalDeclaration).not.toHaveBeenCalled();
    expect(leaseFindFirst.mock.calls[0][0].where).toMatchObject({ tenant_id: 'tenant-A' });
  });

  it('declaredByUserId du corps ignoré : champ inconnu = 400 VALIDATION_ERROR', async () => {
    const { error } = await run({ payload: JSON.stringify({ ...payload, declaredByUserId: 'autre' }) });
    expect(error).toBeTruthy();
    expect(createRentalDeclaration).not.toHaveBeenCalled();
  });

  it('payload absent ou illisible : 400', async () => {
    expect((await run({})).error?.statusCode).toBe(400);
    expect((await run({ payload: '{pas du json' })).error?.statusCode).toBe(400);
  });

  it('erreur métier de createRentalDeclaration propagée telle quelle', async () => {
    const boom: any = new Error('doublon');
    boom.statusCode = 409;
    boom.code = 'RENTAL_DECLARATION_DUPLICATE_REFERENCE';
    createRentalDeclaration.mockRejectedValue(boom);
    const { error } = await run({ payload: JSON.stringify(payload) });
    expect(error.code).toBe('RENTAL_DECLARATION_DUPLICATE_REFERENCE');
  });
});
