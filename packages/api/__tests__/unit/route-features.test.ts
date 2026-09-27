/**
 * Abonnements, vague 2 (lot A) : chaque route d'agence est classee.
 *
 * Meme principe que routes-inventory.test.ts : on parcourt la pile Express
 * REELLE (aucune requete, aucune base) et on echoue si :
 * - une route sous `/api/tenants/:tenantId` n'a pas de fonctionnalite dans
 *   `lib/subscription/route-features.ts` ;
 * - une telle route ne passe pas par `subscriptionRouteGuard` (garde demonte
 *   ou monte apres un routeur) ;
 * - une route hors de ce prefixe n'appartient a aucune des familles
 *   volontairement hors abonnement (auth, super-admin, portails, webhooks,
 *   IPN et simulateur PaySecureHub, vitrines publiques) ;
 * - une regle de la table ne correspond plus a aucune route (renommage).
 */

import '../helpers/app-shims';
import { collectRoutes, installMountPathRecorder } from '../helpers/route-walker';

installMountPathRecorder();

import app from '../../src/app';
import { subscriptionRouteGuard } from '../../src/middleware/subscription-feature-middleware';
import {
  classifyTenantRoute,
  findRouteFeatureRule,
  isWriteRequest,
  NON_TENANT_SEGMENTS,
  TENANT_ROUTE_FEATURES
} from '../../src/lib/subscription/route-features';

const TENANT_PREFIX = '/api/tenants/:tenantId';

/** Familles hors abonnement, jamais gardees : chacune avec sa raison. */
const OUTSIDE_SUBSCRIPTION: Array<{ prefix: string; exact?: boolean; reason: string }> = [
  { prefix: '/health', reason: 'Sonde de sante.' },
  { prefix: '/api/auth', reason: 'Authentification.' },
  { prefix: '/api/admin', reason: 'Super-admin (permissions PLATFORM_*).' },
  { prefix: '/api/roles', reason: 'Catalogue des roles, commun a la plateforme.' },
  { prefix: '/api/portal', reason: 'Portails locataire, proprietaire et coproprietaire : jamais bloques (D8).' },
  { prefix: '/api/payment-gateway', reason: 'IPN et simulateur PaySecureHub : jamais bloques.' },
  { prefix: '/api/whatsapp', reason: 'Webhook WhatsApp.' },
  { prefix: '/api/geographic', reason: 'Referentiel public.' },
  { prefix: '/api/public', reason: 'Vitrine publique des biens.' },
  { prefix: '/api/newsletter', reason: 'Newsletter publique (inscription, desinscription).' },
  { prefix: '/api/property-templates', reason: 'Referentiel commun de gabarits.' },
  { prefix: '/api/tenants', exact: true, reason: "Vitrine d'agences." },
  ...NON_TENANT_SEGMENTS.map(segment => ({ prefix: `/api/tenants/${segment}`, reason: 'Hors agence (tenant-routes.ts).' }))
];

/** Regles sans route aujourd'hui, posees d'avance a dessein. */
const ANTICIPATED_RULES = ['/subscription'];

function outside(path: string): boolean {
  return OUTSIDE_SUBSCRIPTION.some(entry =>
    entry.exact ? path === entry.prefix : path === entry.prefix || path.startsWith(`${entry.prefix}/`)
  );
}

function relative(path: string): string {
  const rest = path.slice(TENANT_PREFIX.length);
  return rest.length > 0 ? rest : '/';
}

describe("Abonnements — classement des routes d'agence (vague 2, lot A)", () => {
  const routes = collectRoutes(app);
  const tenantRoutes = routes.filter(r => r.path === TENANT_PREFIX || r.path.startsWith(`${TENANT_PREFIX}/`));

  it("a decouvert les routes d'agence", () => {
    expect(tenantRoutes.length).toBeGreaterThan(400);
  });

  it("chaque route d'agence a une fonctionnalite", () => {
    const unclassified = tenantRoutes
      .filter(r => classifyTenantRoute(relative(r.path)) === undefined)
      .map(r => `${r.method} ${r.path}`);
    expect(unclassified).toEqual([]);
  });

  it("chaque route d'agence passe par le garde d'abonnement", () => {
    const unguarded = tenantRoutes
      .filter(r => !r.middlewares.includes(subscriptionRouteGuard))
      .map(r => `${r.method} ${r.path}`);
    expect(unguarded).toEqual([]);
  });

  it('aucune autre route ne sort des familles hors abonnement', () => {
    const stray = routes
      .filter(r => !tenantRoutes.includes(r) && !outside(r.path))
      .map(r => `${r.method} ${r.path}`);
    expect(stray).toEqual([]);
  });

  it('les routes hors abonnement ne passent pas par le garde', () => {
    const guarded = routes
      .filter(r => outside(r.path) && r.middlewares.includes(subscriptionRouteGuard))
      .filter(r => !NON_TENANT_SEGMENTS.some(s => r.path.startsWith(`/api/tenants/${s}`)))
      .map(r => `${r.method} ${r.path}`);
    expect(guarded).toEqual([]);
  });

  it('chaque regle de la table sert au moins une route', () => {
    const dead = TENANT_ROUTE_FEATURES.filter(rule => !ANTICIPATED_RULES.includes(rule.prefix))
      .filter(rule => !tenantRoutes.some(r => findRouteFeatureRule(relative(r.path)) === rule))
      .map(rule => rule.prefix);
    expect(dead).toEqual([]);
  });

  it('classe les cas mixtes de la finance', () => {
    expect(classifyTenantRoute('/finance/sites/abc/budgets')).toBe('CONSTRUCTION');
    expect(classifyTenantRoute('/finance/stock/items')).toBe('CONSTRUCTION');
    expect(classifyTenantRoute('/finance/employees/abc/salary-payments')).toBe('CONSTRUCTION');
    expect(classifyTenantRoute('/finance/contractors')).toBe('CONSTRUCTION');
    expect(classifyTenantRoute('/finance/purchase-orders')).toBe('CONSTRUCTION');
    expect(classifyTenantRoute('/finance/land-leases/abc')).toBe('CONSTRUCTION');
    expect(classifyTenantRoute('/finance/retentions/summary')).toBe('CONSTRUCTION');
    expect(classifyTenantRoute('/finance/supplier-invoices/abc/purchase-order')).toBe('CONSTRUCTION');
    expect(classifyTenantRoute('/finance/supplier-invoices/abc/validate')).toBe('CORE');
    expect(classifyTenantRoute('/cash-sessions/current')).toBe('CORE');
    expect(classifyTenantRoute('/treasury/accounts')).toBe('CORE');
    expect(classifyTenantRoute('/finance/accounting/trial-balance')).toBe('CORE');
    expect(classifyTenantRoute('/finance/billing-runs')).toBe('CORE');
    expect(classifyTenantRoute('/finance/clients/balance')).toBe('CORE');
    expect(classifyTenantRoute('/syndics/abc/lots')).toBe('SYNDIC');
    expect(classifyTenantRoute('/properties/abc/valuations')).toBe('PATRIMOINE');
    expect(classifyTenantRoute('/properties/abc/media')).toBe('CORE');
    expect(classifyTenantRoute('/maintenance/tenant/tickets')).toBe('EXEMPT');
    expect(classifyTenantRoute('/maintenance/admin/tickets')).toBe('CORE');
    expect(classifyTenantRoute('/')).toBe('CORE');
  });

  it("distingue lecture et ecriture (export et recherche = lecture)", () => {
    expect(isWriteRequest('GET', '/finance/cash-vouchers/abc.pdf')).toBe(false);
    expect(isWriteRequest('POST', '/properties/search')).toBe(false);
    expect(isWriteRequest('POST', '/properties')).toBe(true);
    expect(isWriteRequest('DELETE', '/syndics/abc')).toBe(true);
  });
});
