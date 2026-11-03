/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BUG-2026-11-03-004 (montant hors bornes -> 400 clair, jamais 500) et
 * BUG-2026-11-03-009 (signature réelle du justificatif). Les erreurs du
 * contrôleur passent par errorHandler : pas de `stack`, pas de 500.
 */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));
const declarePayment = jest.fn();
jest.mock('../../src/services/tenant-portal-service', () => ({
  TenantPortalService: jest.fn().mockImplementation(() => ({
    declarePayment: (...a: any[]) => declarePayment(...a),
    getInstallmentDetails: jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('Échéance non trouvée'), { name: 'NotFoundError', statusCode: 404 })),
    getDashboard: jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('boom /srv/x.ts'), { name: 'PrismaClientUnknownRequestError' }))
  }))
}));
jest.mock('../../src/controllers/finance-controller', () => ({ handleTenantPortalFinanceStatement: jest.fn() }));

import { TenantPortalController } from '../../src/controllers/tenant-portal-controller';
import { errorHandler, NotFoundError } from '../../src/middleware/error-middleware';
import { declarePaymentSchema, validatePaymentProofFile } from '../../src/utils/tenant-portal-validators';

const controller = new TenantPortalController();

/**
 * Appelle un handler comme Express : `next(err)` mène à `errorHandler`, dernier
 * maillon de la chaîne. Les routes branchent les handlers tels quels (ils
 * reçoivent `next`) ; le contrôleur n'a plus de repli quand `next` manque.
 */
const run = (handler: (req: any, res: any, next: any) => unknown, request: any, res: any) =>
  handler(request, res, (err?: unknown) => errorHandler(err as Error, request, res, () => undefined));

function fakeRes() {
  const res: any = { headersSent: false, statusCode: 200, body: undefined };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: any) => ((res.body = b), res);
  return res;
}
const portal = { tenantClientId: 'c', leaseId: 'l', tenantId: 't' };
const req = (extra: any = {}): any => ({
  tenantPortal: portal,
  query: {},
  params: {},
  body: {},
  headers: {},
  path: '/x',
  ...extra
});

const file = (bytes: number[] | string, mimetype: string): any => {
  const buffer = typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes);
  return { buffer, size: buffer.length, mimetype, originalname: 'x' };
};

describe('déclaration de paiement : montant', () => {
  const valid = { amount: 1000, paymentDate: '2026-10-01', paymentMethod: 'CASH' };

  it('refuse un montant énorme', () => {
    const r = declarePaymentSchema.safeParse({ ...valid, amount: 999_999_999_999 });
    expect(r.success).toBe(false);
    expect(JSON.stringify((r as any).error.errors)).toContain('trop élevé');
  });

  it('accepte un montant normal', () => {
    expect(declarePaymentSchema.safeParse(valid).success).toBe(true);
  });

  it('le contrôleur répond 400 sans appeler le service', async () => {
    const res = fakeRes();
    await run(controller.declarePayment, req({ body: { ...valid, amount: '999999999999' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.stack).toBeUndefined();
    expect(declarePayment).not.toHaveBeenCalled();
  });
});

describe('contrôleur : erreurs typées', () => {
  it('une NotFoundError du service devient 404', async () => {
    const res = fakeRes();
    await run(controller.getInstallmentDetails, req({ params: { id: 'abc' } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.stack).toBeUndefined();
  });

  it('une panne de base ne livre ni chemin ni stack', async () => {
    const res = fakeRes();
    await run(controller.getDashboard, req(), res);
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(res.body)).not.toContain('/srv/x.ts');
    expect(res.body.stack).toBeUndefined();
  });

  it('sans contexte portail : 403', async () => {
    const res = fakeRes();
    await run(controller.getDashboard, req({ tenantPortal: undefined }), res);
    expect(res.statusCode).toBe(403);
  });

  it('transmet à next quand il est fourni', async () => {
    const next = jest.fn();
    await controller.getInstallmentDetails(req({ params: { id: 'abc' } }), fakeRes(), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(NotFoundError).toBeDefined();
  });
});

describe('justificatif : signature réelle (BUG-2026-11-03-009)', () => {
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];

  it('refuse un faux PNG (texte ou HTML)', () => {
    expect(validatePaymentProofFile(file('juste du texte', 'image/png')).valid).toBe(false);
    expect(validatePaymentProofFile(file('<script>alert(1)</script>', 'image/png')).valid).toBe(false);
  });

  it('refuse un PNG déclaré en PDF', () => {
    expect(validatePaymentProofFile(file(PNG, 'application/pdf')).valid).toBe(false);
  });

  it('accepte un vrai PNG, un vrai PDF, un vrai JPEG', () => {
    expect(validatePaymentProofFile(file(PNG, 'image/png')).valid).toBe(true);
    expect(validatePaymentProofFile(file('%PDF-1.4 ...', 'application/pdf')).valid).toBe(true);
    expect(validatePaymentProofFile(file([0xff, 0xd8, 0xff, 0xe0, 0], 'image/jpeg')).valid).toBe(true);
  });

  it('le fichier est optionnel', () => {
    expect(validatePaymentProofFile(undefined).valid).toBe(true);
  });
});
