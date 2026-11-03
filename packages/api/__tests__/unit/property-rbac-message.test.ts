/**
 * BUG-2026-11-03-014 : les gardes `property-rbac-middleware` (relevés
 * propriétaires, etc.) refusent en français traduit, sans exposer la clé de
 * permission dans le texte (elle voyage dans un champ technique).
 */
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: jest.fn().mockResolvedValue(false)
}));

import { requirePropertyPermission, requireAnyPropertyPermission } from '../../src/middleware/property-rbac-middleware';
import { runWithLanguage } from '../../src/i18n';

function run(mw: any, language: 'fr' | 'en' = 'fr') {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  const req: any = { user: { userId: 'u1' }, tenantContext: { tenantId: 't1' }, path: '/x' };
  return runWithLanguage(language, () => mw(req, res, jest.fn())).then(() => res);
}

describe('refus RBAC des biens et relevés — message traduit', () => {
  it('requireAnyPropertyPermission : 403 français, sans clé brute', async () => {
    const res = await run(requireAnyPropertyPermission(['OWNER_STATEMENTS_VIEW']));
    expect(res.status).toHaveBeenCalledWith(403);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe("Vous n'avez pas les droits nécessaires pour effectuer cette action.");
    expect(body.message).not.toMatch(/OWNER_STATEMENTS_VIEW|Permission denied/);
    expect(body.requiredPermissions).toEqual(['OWNER_STATEMENTS_VIEW']);
  });

  it('requirePropertyPermission : 403 français, clé en champ technique', async () => {
    const res = await run(requirePropertyPermission('PROPERTIES_EDIT'));
    const body = res.json.mock.calls[0][0];
    expect(body.message).not.toMatch(/PROPERTIES_EDIT|Permission denied/);
    expect(body.requiredPermission).toBe('PROPERTIES_EDIT');
  });

  it('suit la langue de la requête', async () => {
    const res = await run(requireAnyPropertyPermission(['A']), 'en');
    expect(res.json.mock.calls[0][0].message).toBe('You do not have the necessary permissions to perform this action.');
  });
});
