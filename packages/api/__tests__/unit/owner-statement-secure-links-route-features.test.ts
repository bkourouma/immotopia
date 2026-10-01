/**
 * Abonnements : les routes de liens sécurisés et d'envoi du rapport mensuel
 * d'un relevé (lot A3) relèvent de la fonctionnalité des relevés (RENTAL), via
 * le préfixe `/owner-statements`, et comptent comme des écritures — hors
 * lecture (GET), qui reste permise en lecture seule d'abonnement.
 *
 * Test pur sur la table de `lib/subscription/route-features.ts` : le parcours
 * de la pile Express réelle est fait par `route-features.test.ts`.
 */
import { classifyTenantRoute, isWriteRequest } from '../../src/lib/subscription/route-features';

const BASE = '/owner-statements/statement-1';

describe('routes de liens sécurisés des relevés — fonctionnalité et écriture', () => {
  it.each([`${BASE}/secure-links`, `${BASE}/secure-links/link-1`, `${BASE}/send-monthly-report`])(
    '%s relève de RENTAL',
    path => {
      expect(classifyTenantRoute(path)).toBe('RENTAL');
    }
  );

  it('création, révocation et envoi sont des écritures, la liste est une lecture', () => {
    expect(isWriteRequest('POST', `${BASE}/secure-links`)).toBe(true);
    expect(isWriteRequest('DELETE', `${BASE}/secure-links/link-1`)).toBe(true);
    expect(isWriteRequest('POST', `${BASE}/send-monthly-report`)).toBe(true);
    expect(isWriteRequest('GET', `${BASE}/secure-links`)).toBe(false);
  });
});
