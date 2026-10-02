/**
 * Liste blanche des espaces PARTICULIER : parcourt la pile Express REELLE (comme
 * route-features.test.ts) et verifie que toute route d'agence sensible est
 * refusee par defaut, que les routes du patrimoine restent ouvertes, et que
 * chaque regle de la table sert au moins une route.
 */

import '../helpers/app-shims';
import { collectRoutes, installMountPathRecorder } from '../helpers/route-walker';

installMountPathRecorder();

import app from '../../src/app';
import { isRouteAllowedForParticulier, PARTICULIER_ROUTE_RULES } from '../../src/lib/subscription/particulier-routes';
import { findBestRule } from '../../src/lib/subscription/route-features';

const TENANT_PREFIX = '/api/tenants/:tenantId';

function relative(path: string): string {
  const rest = path.slice(TENANT_PREFIX.length);
  return rest.length > 0 ? rest : '/';
}

/** Familles d'agence qu'un particulier ne doit JAMAIS atteindre. */
const FORBIDDEN_PREFIXES = [
  '/newsletter',
  '/crm/deals',
  '/crm/activities',
  '/crm/calendar',
  '/crm/dashboard',
  '/crm/tags',
  '/sales',
  '/syndics',
  '/syndic-mandating-agencies',
  '/finance',
  '/users',
  '/invitations',
  '/whatsapp-notifications',
  '/email-notifications',
  '/settings',
  '/ai',
  '/mandates',
  '/owner-statements',
  '/owner-accounts',
  '/cash-sessions',
  '/treasury',
  '/maintenance',
  '/register',
  '/unregister',
  '/client-details',
  '/document-identity'
];

const ALLOWED_PREFIXES = ['/patrimoine', '/subscription', '/entitlements', '/work-programs', '/rental', '/dashboard'];

describe('Espace PARTICULIER — liste blanche des routes', () => {
  const routes = collectRoutes(app).filter(r => r.path === TENANT_PREFIX || r.path.startsWith(`${TENANT_PREFIX}/`));

  it('a decouvert les routes d agence', () => {
    expect(routes.length).toBeGreaterThan(400);
  });

  it('refuse toute route des familles d agence sensibles', () => {
    const leaked = routes
      .map(r => ({ r, rel: relative(r.path) }))
      .filter(({ rel }) => FORBIDDEN_PREFIXES.some(p => rel === p || rel.startsWith(`${p}/`)))
      .filter(({ rel }) => isRouteAllowedForParticulier(rel))
      // Contacts du socle, volontairement ouverts (baux) : /crm/contacts*, pas /crm/tags.
      .map(({ r }) => `${r.method} ${r.path}`);
    expect(leaked).toEqual([]);
  });

  it('laisse passer les routes du patrimoine, de l abonnement et des droits', () => {
    const blocked = routes
      .map(r => ({ r, rel: relative(r.path) }))
      .filter(({ rel }) => ALLOWED_PREFIXES.some(p => rel === p || rel.startsWith(`${p}/`)))
      .filter(({ rel }) => !isRouteAllowedForParticulier(rel))
      .map(({ r }) => `${r.method} ${r.path}`);
    expect(blocked).toEqual([]);
  });

  it('refuse par defaut une route absente de la table', () => {
    expect(isRouteAllowedForParticulier('/route-oubliee')).toBe(false);
    expect(isRouteAllowedForParticulier('/finance/accounting/journal')).toBe(false);
    expect(isRouteAllowedForParticulier('/users/invite')).toBe(false);
  });

  it('les exceptions de /properties l emportent sur la regle generale', () => {
    expect(isRouteAllowedForParticulier('/properties/abc')).toBe(true);
    expect(isRouteAllowedForParticulier('/properties/abc/valuations')).toBe(true);
    expect(isRouteAllowedForParticulier('/properties/abc/mandates')).toBe(false);
    expect(isRouteAllowedForParticulier('/properties/abc/publish')).toBe(false);
    expect(isRouteAllowedForParticulier('/properties/visits/calendar')).toBe(false);
  });

  it('chaque regle de la table sert au moins une route', () => {
    const dead = PARTICULIER_ROUTE_RULES.filter(
      rule => !routes.some(r => findBestRule(PARTICULIER_ROUTE_RULES, relative(r.path)) === rule)
    ).map(rule => rule.prefix);
    expect(dead).toEqual([]);
  });
});
