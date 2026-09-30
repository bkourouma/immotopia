/**
 * BUG-2026-09-30-037 — la barriere « detenu en propre » couvre aussi les
 * releves de gerance, les comptes proprietaires et les honoraires par
 * mandant : `requireThirdPartyAllowed(action)` refuse AVANT le controleur.
 */

const getEntitlementsMock = jest.fn();

jest.mock('../../src/lib/subscription/enforcement', () => ({
  getSubscriptionEnforcement: () => 'enforce'
}));
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: (...args: any[]) => getEntitlementsMock(...args)
}));
jest.mock('../../src/utils/database', () => ({ prisma: {} }));

import { requireThirdPartyAllowed } from '../../src/services/own-assets-barrier-service';
import { OwnAssetsOnlyError } from '../../src/middleware/error-middleware';

const ACTIONS = ['OWNER_STATEMENT', 'OWNER_ACCOUNT', 'OWNER_FEE_TERMS', 'AGENT_COMMISSION'] as const;

async function run(action: (typeof ACTIONS)[number], ownAssetsOnly: boolean) {
  getEntitlementsMock.mockResolvedValue({ tenantId: 't1', enforcement: 'enforce', ownAssetsOnly });
  const next = jest.fn();
  const req: any = { params: { tenantId: 't1' } };
  requireThirdPartyAllowed(action)(req, {} as any, next);
  await new Promise(resolve => setImmediate(resolve));
  return next;
}

describe.each(ACTIONS)('requireThirdPartyAllowed(%s)', action => {
  it('refuse un compte detenu en propre (OWN_ASSETS_ONLY) avant le controleur', async () => {
    const next = await run(action, true);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(OwnAssetsOnlyError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('OWN_ASSETS_ONLY');
  });

  it('laisse passer une agence qui detient un autre module', async () => {
    const next = await run(action, false);
    expect(next).toHaveBeenCalledWith();
  });
});
