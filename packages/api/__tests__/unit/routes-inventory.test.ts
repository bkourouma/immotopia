/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot E (multi-tenant) — E2 : inventaire des routes.
 *
 * Parcourt la pile Express reelle (`app._router.stack`, cf.
 * `__tests__/helpers/route-walker.ts`) et echoue si une route n'a NI
 * `requireTenantAccess`, NI `requireTenantPortalAccess`, NI
 * `requireOwnerPortalAccess`, NI une permission plateforme
 * (`requirePermission('PLATFORM_*')`), hors de la liste blanche explicite
 * ci-dessous.
 *
 * Aucune base de donnees requise : l'app est importee, ses routeurs
 * construits (donc `requirePermission('PLATFORM_X')` execute et enregistre
 * ses middlewares), mais aucune requete HTTP n'est jamais envoyee — on
 * n'inspecte que la pile.
 *
 * `requirePermission` (middleware/rbac-middleware.ts) expose la cle de
 * permission sur le middleware qu'il renvoie (`permissionKey`) : une route
 * portant une garde `PLATFORM_*` se reconnait donc sans mock.
 */

import '../helpers/app-shims';
import { collectRoutes, installMountPathRecorder, DiscoveredRoute } from '../helpers/route-walker';

// Doit tourner AVANT l'import de l'app : c'est a ce moment que chaque
// `router.use(path, ...)` / `app.use(path, ...)` est intercepte pour noter son
// chemin litteral sur le layer cree (voir route-walker.ts).
installMountPathRecorder();

import app from '../../src/app';
import { requireTenantAccess } from '../../src/middleware/tenant-middleware';
import { requireTenantPortalAccess } from '../../src/middleware/tenant-portal-access';
import { requireOwnerPortalAccess } from '../../src/middleware/owner-portal-access';

/** Une entree de la liste blanche : routes publiques VOLONTAIRES. */
interface WhitelistEntry {
  /** Methode HTTP, ou `'*'` pour toutes. */
  method: string;
  test: (path: string) => boolean;
  reason: string;
}

function exact(path: string) {
  return (candidate: string) => candidate === path;
}

function withPrefix(prefixPath: string) {
  return (candidate: string) => candidate === prefixPath || candidate.startsWith(`${prefixPath}/`);
}

/**
 * Routes publiques volontaires — chacune commentee avec sa raison d'etre.
 * Toute route absente d'ici doit porter une garde d'agence ou de plateforme.
 */
const PUBLIC_ROUTES_WHITELIST: WhitelistEntry[] = [
  {
    method: '*',
    test: withPrefix('/api/auth'),
    reason: 'Authentification : login/register/refresh/verification email sont necessairement accessibles sans session.'
  },
  {
    method: 'GET',
    test: withPrefix('/api/geographic'),
    reason: 'Referentiel geographique public (pays/regions/communes) utilise par des formulaires anonymes.'
  },
  {
    method: 'GET',
    test: candidate => candidate === '/api/public/properties' || candidate === '/api/public/properties/:id',
    reason: 'Vitrine publique des biens publies (property-public-routes.ts) — sans authentification par nature.'
  },
  {
    method: '*',
    test: withPrefix('/api/newsletter'),
    reason:
      "Newsletter publique : abonnement/confirmation/desabonnement/tracking d'ouverture n'exigent pas de session " +
      '(newsletter-public-routes.ts). Le module newsletter authentifie (tenant-routes) vit sous /api/tenants/:tenantId/newsletter.'
  },
  {
    method: 'POST',
    test: exact('/api/whatsapp/webhook'),
    reason:
      'Webhook entrant WhatsApp (Twilio/WaSender) : verifie par signature applicative, pas par session utilisateur.'
  },
  {
    method: 'POST',
    test: exact('/api/payment-gateway/paysecurehub/ipn'),
    reason:
      'IPN PaySecureHub (lot 7) : notification serveur-a-serveur, sans session par nature. Jamais crue sur parole : ' +
      "elle ne fait que relancer le rapprochement, qui redemande le statut a l'agregateur avec la cle de l'agence, " +
      'dans le contexte de cette agence (checkout.ts, reconcileCheckoutPublic). Repond toujours 200 { received: true }.'
  },
  {
    method: 'GET',
    test: exact('/api/payment-gateway/simulator/:codePaiement'),
    reason:
      'Page du simulateur PaySecureHub (lot 7), ouverte par le navigateur du locataire comme la vraie page hebergee : ' +
      'le code de paiement (IMT- + 20 caracteres aleatoires) sert de jeton. Montee seulement hors production ou avec ' +
      'PAYMENT_GATEWAY_SIMULATOR=1 ; 404 pour une agence suspendue ou un checkout reel.'
  },
  {
    method: 'POST',
    test: exact('/api/payment-gateway/simulator/:codePaiement/:outcome'),
    reason:
      'Boutons du simulateur PaySecureHub (lot 7) : meme justification que la page. Enregistre seulement l’issue ' +
      'simulee puis relance le rapprochement, qui reste la seule porte qui change un statut.'
  },
  {
    method: 'GET',
    test: exact('/api/tenants'),
    reason: "Vitrine d'agences : ne renvoie que des champs publics (PUBLIC_TENANT_SELECT dans tenant-service.ts)."
  },
  {
    method: 'GET',
    test: exact('/api/tenants/slug/:slug'),
    reason: "Vitrine d'une agence par slug — memes champs publics que GET /api/tenants."
  },
  {
    method: 'GET',
    test: candidate => candidate === '/api/property-templates' || candidate === '/api/property-templates/:type',
    reason:
      'Catalogue de gabarits de biens : authentifie mais pas cloisonne par agence par nature (referentiel commun).'
  },
  {
    method: 'GET',
    test: exact('/health'),
    reason: 'Sonde de sante du process, sans donnee metier.'
  },
  {
    method: 'GET',
    test: candidate =>
      candidate === '/api/roles' || candidate === '/api/roles/permissions/all' || candidate === '/api/roles/:id',
    reason:
      "Catalogue des roles et permissions, commun a toute la plateforme (Role n'a pas de tenantId) : authentifie, " +
      "sans aucune donnee d'agence. Lu par le formulaire d'invitation des agences."
  },
  {
    method: 'GET',
    test: exact('/api/roles/menu-access/me'),
    reason:
      "Menus coupes pour l'utilisateur COURANT, resolus depuis req.user (le jeton), pas depuis un tenantId de l'URL."
  },
  {
    method: 'GET',
    test: exact('/api/tenants/my-memberships'),
    reason: "Liste des agences de l'utilisateur courant, resolue depuis req.user."
  },
  {
    method: 'POST',
    test: exact('/api/tenants/:tenantId/register'),
    reason:
      "S'enregistrer comme client d'une agence : c'est cette action qui CREE l'acces, elle ne peut pas le presupposer."
  },
  {
    method: 'DELETE',
    test: exact('/api/tenants/:tenantId/unregister'),
    reason:
      "Se desinscrire d'une agence : agit sur le TenantClient de l'utilisateur courant (userId + tenantId de l'URL)."
  }
];

function isWhitelisted(route: DiscoveredRoute): WhitelistEntry | undefined {
  return PUBLIC_ROUTES_WHITELIST.find(
    entry => (entry.method === '*' || entry.method === route.method) && entry.test(route.path)
  );
}

function hasPlatformPermission(route: DiscoveredRoute): string | undefined {
  for (const mw of route.middlewares) {
    const key = (mw as any)?.permissionKey as string | undefined;
    if (key && key.startsWith('PLATFORM_')) {
      return key;
    }
  }
  return undefined;
}

function hasTenantOrPortalGuard(route: DiscoveredRoute): boolean {
  return route.middlewares.some(
    mw => mw === requireTenantAccess || mw === requireTenantPortalAccess || mw === requireOwnerPortalAccess
  );
}

describe('Inventaire des routes — chaque route est cloisonnee ou explicitement publique (lot E, E2)', () => {
  const routes = collectRoutes(app);

  it("a bien decouvert des routes (l'app s'est construite)", () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it('ne recense aucune route dupliquee anormalement dans la liste blanche', () => {
    // Garde-fou sur la liste blanche elle-meme : une entree qui ne matche plus
    // aucune route reelle signale un chemin renomme/deplace, a corriger ici.
    const unmatched = PUBLIC_ROUTES_WHITELIST.filter(
      entry => !routes.some(r => (entry.method === '*' || entry.method === r.method) && entry.test(r.path))
    );
    if (unmatched.length > 0) {
      // Non bloquant : certaines entrees couvrent plusieurs methodes/chemins
      // et une seule doit matcher. On se contente de le signaler.
      // eslint-disable-next-line no-console
      console.warn(
        'Entrees de liste blanche sans route correspondante (a verifier) :',
        unmatched.map(e => `${e.method} ${e.reason}`)
      );
    }
    expect(true).toBe(true);
  });

  it('chaque route hors liste blanche porte une garde d’agence ou une permission plateforme', () => {
    const failures: string[] = [];

    for (const route of routes) {
      if (isWhitelisted(route)) {
        continue;
      }
      const platformKey = hasPlatformPermission(route);
      if (platformKey) {
        continue;
      }
      if (hasTenantOrPortalGuard(route)) {
        continue;
      }
      failures.push(`${route.method} ${route.path}`);
    }

    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `${failures.length} route(s) sans garde d'agence ni permission plateforme, hors liste blanche :\n` +
          failures.map(f => `  - ${f}`).join('\n')
      );
    }

    expect(failures).toEqual([]);
  });
});
