/**
 * BUG-2026-09-28-007 : le refus de droits ne renvoie plus « Permission denied:
 * USERS_CREATE » en anglais brut. Le message est traduit (le francais est la
 * cle), le code de permission voyage dans un champ technique, statut 403 inchange.
 */
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: jest.fn().mockResolvedValue(false),
  hasAnyPermission: jest.fn().mockResolvedValue(false),
  hasAllPermissions: jest.fn().mockResolvedValue(false)
}));
jest.mock('../../src/services/subscription-service', () => ({ checkSubscriptionAccess: jest.fn() }));

import { requirePermission, requireAnyPermission, requireAllPermissions } from '../../src/middleware/rbac-middleware';
import { runWithLanguage } from '../../src/i18n';

function run(mw: any, language: 'fr' | 'en' | 'ar' = 'fr') {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  const req: any = { user: { userId: 'u1' }, tenantContext: { tenantId: 't1' } };
  return runWithLanguage(language, () => mw(req, res, jest.fn())).then(() => res);
}

describe('refus RBAC — message traduit', () => {
  it('requirePermission : 403, message francais sans code technique', async () => {
    const res = await run(requirePermission('USERS_CREATE'));
    expect(res.status).toHaveBeenCalledWith(403);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe("Vous n'avez pas les droits nécessaires pour effectuer cette action.");
    expect(body.message).not.toContain('USERS_CREATE');
    expect(body.requiredPermission).toBe('USERS_CREATE');
  });

  it('suit la langue de la requete', async () => {
    const res = await run(requirePermission('USERS_CREATE'), 'en');
    expect(res.json.mock.calls[0][0].message).toBe('You do not have the necessary permissions to perform this action.');
  });

  it('requireAnyPermission et requireAllPermissions : meme message, liste en champ technique', async () => {
    for (const mw of [requireAnyPermission(['A', 'B']), requireAllPermissions(['A', 'B'])]) {
      const res = await run(mw);
      expect(res.status).toHaveBeenCalledWith(403);
      const body = res.json.mock.calls[0][0];
      expect(body.message).not.toMatch(/Permission denied|\[A, B\]/);
      expect(body.requiredPermissions).toEqual(['A', 'B']);
    }
  });
});
