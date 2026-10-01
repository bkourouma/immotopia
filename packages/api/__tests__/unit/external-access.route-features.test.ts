/**
 * Abonnements : les routes d'agence des accès tiers de confiance (lot B3)
 * relèvent de la fonctionnalité PATRIMOINE, via le préfixe `/patrimoine`, et
 * comptent comme des écritures — hors lecture (GET), qui reste permise en
 * lecture seule d'abonnement. La clé e-mail du lien relève aussi de PATRIMOINE.
 *
 * Test pur sur la table de `lib/subscription/route-features.ts` : le parcours
 * de la pile Express réelle est fait par `route-features.test.ts`.
 */
import { classifyTenantRoute, isWriteRequest } from '../../src/lib/subscription/route-features';
import { featureOfNotificationKey } from '../../src/constants/notification-key-features';

const BASE = '/patrimoine/external-access';

describe('routes des accès tiers de confiance — fonctionnalité et écriture', () => {
  it.each([
    BASE,
    `${BASE}/scope-options`,
    `${BASE}/property-documents/p1`,
    `${BASE}/grant-1`,
    `${BASE}/grant-1/revoke`,
    `${BASE}/grant-1/send-link`,
    `${BASE}/grant-1/access-log`
  ])('%s relève de PATRIMOINE', path => {
    expect(classifyTenantRoute(path)).toBe('PATRIMOINE');
  });

  it('création, modification, révocation et envoi sont des écritures, les lectures non', () => {
    expect(isWriteRequest('POST', BASE)).toBe(true);
    expect(isWriteRequest('PATCH', `${BASE}/grant-1`)).toBe(true);
    expect(isWriteRequest('POST', `${BASE}/grant-1/revoke`)).toBe(true);
    expect(isWriteRequest('POST', `${BASE}/grant-1/send-link`)).toBe(true);
    for (const path of [BASE, `${BASE}/scope-options`, `${BASE}/grant-1`, `${BASE}/grant-1/access-log`]) {
      expect(isWriteRequest('GET', path)).toBe(false);
    }
  });

  it('la clé e-mail EXTERNAL_ACCESS_LINK_SENT relève de PATRIMOINE', () => {
    expect(featureOfNotificationKey('EXTERNAL_ACCESS_LINK_SENT')).toBe('PATRIMOINE');
  });
});
