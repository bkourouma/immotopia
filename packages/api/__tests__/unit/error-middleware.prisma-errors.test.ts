/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Erreurs Prisma issues d'une entrée invalide : jamais un 500, jamais le détail
 * interne (chemin du source, colonnes) dans la réponse.
 */
import { errorHandler, ErrorCode } from '../../src/middleware/error-middleware';

function call(err: any) {
  const res: any = { headersSent: false };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  errorHandler(err, { method: 'GET', path: '/x', ip: '127.0.0.1' } as any, res, jest.fn());
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

function prismaError(name: string, code: string | undefined, message: string) {
  const err: any = new Error(message);
  err.name = name;
  if (code) err.code = code;
  return err;
}

describe('errorHandler : erreurs Prisma', () => {
  it('P2023 (UUID mal formé) répond 404 comme un objet inexistant', () => {
    const { status, body } = call(
      prismaError('PrismaClientKnownRequestError', 'P2023', 'Inconsistent column data: invalid character in "mandants"')
    );
    expect(status).toBe(404);
    expect(body.code).toBe(ErrorCode.NOT_FOUND);
    expect(JSON.stringify(body)).not.toContain('mandants');
  });

  it('PrismaClientValidationError répond 400 avec un message générique', () => {
    const detail =
      'Invalid `prisma.rentalInstallment.findMany()` invocation in D:\\APP\\packages\\api\\src\\services\\x.ts:42\n' +
      'Invalid value for argument `status`. Expected RentalInstallmentStatus.';
    const { status, body } = call(prismaError('PrismaClientValidationError', undefined, detail));
    expect(status).toBe(400);
    expect(body.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(body.message).toBe('Les données fournies sont invalides.');
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('findMany');
    expect(serialised).not.toContain('RentalInstallmentStatus');
    expect(serialised).not.toContain('D:\\\\APP');
  });

  it.each(['P2002', 'P2025', 'P2003'])('%s garde sa réponse existante', code => {
    const expected = { P2002: 409, P2025: 404, P2003: 409 }[code as 'P2002' | 'P2025' | 'P2003'];
    const { status } = call(prismaError('PrismaClientKnownRequestError', code, 'x'));
    expect(status).toBe(expected);
  });

  it('une autre erreur Prisma reste un 500 générique', () => {
    const { status, body } = call(
      prismaError('PrismaClientKnownRequestError', 'P2034', 'write conflict in table users')
    );
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('users');
  });
});
