/**
 * Un jeton d'accès expiré ou illisible répond 401 (défaut d'authentification),
 * jamais 403 : l'intercepteur du client ne rafraîchit la session que sur un
 * 401. En 403, une écriture faite avec un jeton périmé échouait sans message
 * ni redirection (recette Syndic du 2026-09-28, BUG-2026-09-28-011).
 */
const mockVerifyToken = jest.fn();
jest.mock('../../src/utils/jwt-utils', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args)
}));

import { authenticate } from '../../src/middleware/auth-middleware';

function run(headers: Record<string, string> = {}, cookies: Record<string, string> = {}) {
  const req: any = { headers, cookies };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  authenticate(req, res, next);
  return { req, res, next };
}

describe('authenticate — jeton expiré ou invalide', () => {
  beforeEach(() => mockVerifyToken.mockReset());

  it('répond 401 quand le jeton est expiré ou illisible', () => {
    mockVerifyToken.mockReturnValue(null);
    const { res, next } = run({}, { accessToken: 'perime' });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('répond 401 quand le jeton est absent', () => {
    const { res, next } = run();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('laisse passer un jeton valide', () => {
    mockVerifyToken.mockReturnValue({ userId: 'u1' });
    const { req, next } = run({}, { accessToken: 'valide' });
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ userId: 'u1' });
  });
});
