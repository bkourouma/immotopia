/** N3 : enable / revoke-sessions passent par asyncHandler (403/404 typés, pas de 400 deviné). */
const mockEnable = jest.fn();
const mockRevoke = jest.fn();
jest.mock('../../src/services/membership-service', () => ({
  listMembers: jest.fn(),
  listAssignableMembers: jest.fn(),
  getMemberById: jest.fn(),
  updateMemberRoles: jest.fn(),
  disableMember: jest.fn(),
  enableMember: (...a: unknown[]) => mockEnable(...a),
  resetMemberPassword: jest.fn(),
  revokeMemberSessions: (...a: unknown[]) => mockRevoke(...a)
}));

import { enableMemberHandler, revokeSessionsHandler } from '../../src/controllers/membership-controller';
import { ForbiddenError, NotFoundError } from '../../src/middleware/error-middleware';

function run(handler: any) {
  const req: any = { user: { userId: 'actor' }, params: { tenantId: 't1', userId: 'u2' } };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return new Promise<{ res: any; next: jest.Mock }>(resolve => {
    next.mockImplementation(() => resolve({ res, next }));
    res.json.mockImplementation(() => {
      resolve({ res, next });
      return res;
    });
    handler(req, res, next);
  });
}

describe('membership-controller : erreurs typées', () => {
  it('enable : ForbiddenError transmise (403), pas de réponse 400', async () => {
    mockEnable.mockRejectedValue(new ForbiddenError('non'));
    const { res, next } = await run(enableMemberHandler);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('revoke-sessions : ForbiddenError (403) et NotFoundError (404) transmises', async () => {
    mockRevoke.mockRejectedValue(new ForbiddenError('non'));
    expect((await run(revokeSessionsHandler)).next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    mockRevoke.mockRejectedValue(new NotFoundError('absent'));
    expect((await run(revokeSessionsHandler)).next.mock.calls[0][0]).toMatchObject({ statusCode: 404 });
  });

  it('revoke-sessions : message explicite quand rien n’est révoqué', async () => {
    mockRevoke.mockResolvedValue({ sessionsRevoked: false, tokensRevoked: 0 });
    const { res } = await run(revokeSessionsHandler);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ sessionsRevoked: false, message: expect.stringContaining('ne sont pas révoquées') })
    );
  });
});
