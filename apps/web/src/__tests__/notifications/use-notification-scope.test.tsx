import { renderHook } from '@testing-library/react';
import { useNotificationScope } from '../../components/notifications/useNotificationScope';

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => auth.value }));

function scopeFor(value: Record<string, unknown>) {
  auth.value = { user: { globalRole: 'USER' }, isLoadingMembership: false, ...value };
  return renderHook(() => useNotificationScope()).result.current;
}

describe('useNotificationScope', () => {
  it("renvoie l'agence d'un collaborateur rattaché", () => {
    expect(scopeFor({ tenantMembership: { tenantId: 't1' } })).toEqual({ kind: 'agency', tenantId: 't1' });
  });

  it.each([
    ['OWNER', 'owner'],
    ['RENTER', 'tenant'],
    ['CO_OWNER', 'copropriete']
  ])('renvoie le portail %s -> %s pour un client', (clientType, portal) => {
    expect(scopeFor({ tenantClient: { clientType } })).toEqual({ kind: 'portal', portal });
  });

  it('renvoie null pour un super-administrateur, un compte non rattaché ou pendant le chargement', () => {
    expect(scopeFor({ user: { globalRole: 'SUPER_ADMIN' } })).toBeNull();
    expect(scopeFor({})).toBeNull();
    expect(scopeFor({ isLoadingMembership: true })).toBeNull();
  });
});
