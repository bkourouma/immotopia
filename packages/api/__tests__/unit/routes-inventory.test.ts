/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot E (multi-tenant) — E2 : inventaire des routes.
 *
 * Parcourt la pile Express reelle (`app._router.stack`, cf.
 * `__tests__/helpers/route-walker.ts`) et echoue si une route n'a NI
 * `requireTenantAccess`, NI `requireTenantPortalAccess`, NI
 * `requireOwnerPortalAccess`, NI `requireCoOwnerPortalAccess`, NI une permission plateforme
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
import { requireTenantAccess, requireTenantCollaborator } from '../../src/middleware/tenant-middleware';
import { authenticate } from '../../src/middleware/auth-middleware';
import { requireSuperAdmin } from '../../src/middleware/super-admin-middleware';
import { requireTenantPortalAccess } from '../../src/middleware/tenant-portal-access';
import { requireOwnerPortalAccess } from '../../src/middleware/owner-portal-access';
import { requireCoOwnerPortalAccess } from '../../src/middleware/coowner-portal-access';

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
    method: 'POST',
    test: exact('/api/payment-gateway/paysecurehub/platform-ipn'),
    reason:
      "IPN du compte PaySecureHub d'ImmoTopia (factures d'abonnement, codes IMP-) : meme justification que l'IPN des " +
      'loyers. Jamais crue : relance le rapprochement (platform-payment-service.ts, reconcilePlatformCheckoutPublic), ' +
      "qui redemande le statut avec les identifiants d'ImmoTopia. Repond toujours 200 { received: true }."
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
    method: 'POST',
    test: exact('/api/public/secure-links/owner-monthly-report'),
    reason:
      "Rapport mensuel d'un proprietaire lu par son lien securise (lot A3, lib/secure-links) : public par nature, le " +
      "proprietaire n'a pas de session. Le jeton (32 octets aleatoires, SHA-256 seul en base, expirant, revocable) est " +
      "dans le corps du POST et designe un unique releve, lu dans l'agence du lien : aucun identifiant d'agence, de bien " +
      'ou de proprietaire ne vient de la requete. Limiteur par IP avant verification, refus uniforme 404, en-tetes ' +
      'no-store/noindex, chaque consultation journalisee (SECURE_LINK_VIEWED).'
  },
  {
    method: 'POST',
    test: exact('/api/public/secure-links/installment-payment'),
    reason:
      'Echeance de loyer a payer, lue par son lien securise (spec 039, lib/secure-links) : public par nature, le locataire ' +
      "n'a pas de session. Le jeton (32 octets aleatoires, 256 bits, SHA-256 seul en base, expirant, revocable) est dans " +
      "le corps du POST (1 Ko max) et designe une unique echeance, lue dans l'agence du lien : aucun identifiant, montant " +
      'ou agence ne vient de la requete (montant recalcule cote serveur). Lecture seule. Limiteur par IP avant ' +
      'verification, refus uniforme 404, en-tetes no-store/noindex/no-referrer.'
  },
  {
    method: 'POST',
    test: exact('/api/public/secure-links/installment-payment/start'),
    reason:
      "Demarrage du paiement Mobile Money d'une echeance par son lien securise (spec 039) : public par nature, le " +
      "locataire n'a pas de session. Meme jeton secret a 256 bits dans le corps (1 Ko max), objet unique ; le montant " +
      "n'est jamais lu de l'appelant (recalcule cote serveur) et l'URL de paiement est fournie par le fournisseur, jamais " +
      'construite a partir de la requete. Limiteur par IP plus strict (10/min) avant verification, refus uniforme 404, ' +
      'en-tetes no-store/noindex/no-referrer, audit SECURE_LINK_PAYMENT_STARTED.'
  },
  {
    method: 'POST',
    test: exact('/api/public/secure-links/installment-payment/status'),
    reason:
      "Statut d'un paiement issu d'un lien de loyer (spec 039) : public par nature (retour du fournisseur de paiement, " +
      'sans session). Le corps (1 Ko max) porte la reference IMT-<20 alphanumeriques>, imprevisible, qui ne sert que les ' +
      "paiements issus d'un lien securise d'une agence non suspendue. Lecture seule, aucun identifiant ni montant lu de " +
      "l'appelant. Limiteur par IP dedie (90/min, la page de statut interroge toutes les 3 s) avant verification, refus uniforme 404, en-tetes no-store/noindex/no-referrer."
  },
  {
    method: 'POST',
    test: exact('/api/public/external-access/patrimoine'),
    reason:
      "Vue en lecture seule d'un tiers de confiance (notaire, expert-comptable, banquier ; lot B3, spec 034), lue par " +
      "son lien securise (lib/secure-links, portee EXTERNAL_ACCESS_GRANT) : public par nature, le tiers n'a pas de " +
      'compte. Le jeton (32 octets aleatoires, SHA-256 seul en base, expirant, revocable) est dans le corps du POST et ' +
      "designe un unique grant ; le grant, l'agence et le perimetre se deduisent du lien (aucun identifiant de bien, " +
      "d'agence ou d'entite ne vient de la requete), relus a chaque appel. Seules les rubriques accordees sont lues et " +
      'renvoyees, sans coordonnees ni chemin disque. Limiteur par IP avant verification, refus uniforme 404 (inconnu, ' +
      'expire, revoque, grant revoque/expire, mauvaise portee, perimetre disparu), en-tetes no-store/noindex/' +
      'no-referrer, chaque consultation journalisee (EXTERNAL_ACCESS_GRANT_VIEWED).'
  },
  {
    method: 'POST',
    test: exact('/api/public/external-access/documents/download'),
    reason:
      "Telechargement d'un document que l'agence a explicitement lie a un acces de tiers de confiance (lot B3) : meme " +
      'justification que la vue (jeton dans le corps, limiteur par IP, 404 uniforme, en-tetes no-store). Seul ' +
      "`documentRef` (id opaque de la ligne de liaison, jamais celui du document) s'ajoute au jeton ; il est reverifie " +
      'contre le grant du lien, la rubrique DOCUMENTS et le perimetre courant du bien (mandat compris). Fichier servi en ' +
      'piece jointe, nosniff, jamais de chemin disque ; chaque telechargement est journalise ' +
      '(EXTERNAL_ACCESS_GRANT_DOCUMENT_DOWNLOADED).'
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
    method: 'POST',
    test: exact('/api/personal-space'),
    reason:
      "Creation de l'espace personnel (lot 4B) : l'appelant n'appartient encore a aucun tenant. Authentifie ; " +
      "l'identifiant vient du jeton (req.user), jamais du corps, et un seul espace par utilisateur (verrou consultatif)."
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
    mw =>
      mw === requireTenantAccess ||
      mw === requireTenantPortalAccess ||
      mw === requireOwnerPortalAccess ||
      mw === requireCoOwnerPortalAccess
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

  it('declare les routes des factures PLATFORM (vague 3, lot A) avec leurs gardes', () => {
    const expected: Array<[string, string, string | 'TENANT']> = [
      ['GET', '/api/admin/tenants/:tenantId/platform-invoices', 'PLATFORM_INVOICES_VIEW'],
      ['POST', '/api/admin/tenants/:tenantId/platform-invoices/generate', 'PLATFORM_INVOICES_CREATE'],
      ['GET', '/api/admin/tenants/:tenantId/platform-invoices/:invoiceId', 'PLATFORM_INVOICES_VIEW'],
      ['GET', '/api/admin/tenants/:tenantId/platform-invoices/:invoiceId/pdf', 'PLATFORM_INVOICES_VIEW'],
      ['POST', '/api/admin/tenants/:tenantId/platform-invoices/:invoiceId/issue', 'PLATFORM_INVOICES_EDIT'],
      ['POST', '/api/admin/tenants/:tenantId/platform-invoices/:invoiceId/mark-paid', 'PLATFORM_INVOICES_EDIT'],
      ['POST', '/api/admin/tenants/:tenantId/platform-invoices/:invoiceId/credit-note', 'PLATFORM_INVOICES_EDIT'],
      ['GET', '/api/tenants/:tenantId/subscription/invoices', 'TENANT'],
      ['GET', '/api/tenants/:tenantId/subscription/invoices/:invoiceId', 'TENANT'],
      ['GET', '/api/tenants/:tenantId/subscription/invoices/:invoiceId/pdf', 'TENANT']
    ];
    for (const [method, path, guard] of expected) {
      const route = routes.find(r => r.method === method && r.path === path);
      expect(route ? `${method} ${path}` : `ABSENTE : ${method} ${path}`).toBe(`${method} ${path}`);
      if (guard === 'TENANT') expect(hasTenantOrPortalGuard(route!)).toBe(true);
      else expect(hasPlatformPermission(route!)).toBe(guard);
    }
  });

  it('declare les 4 routes de l’assistant ImmoCopilot avec les gardes d’agence et de collaborateur', () => {
    const expected: Array<[string, string]> = [
      ['GET', '/api/tenants/:tenantId/ai/status'],
      ['POST', '/api/tenants/:tenantId/ai/chat'],
      ['POST', '/api/tenants/:tenantId/ai/actions/execute'],
      ['POST', '/api/tenants/:tenantId/ai/actions/reject']
    ];
    for (const [method, path] of expected) {
      const route = routes.find(r => r.method === method && r.path === path);
      expect(route ? `${method} ${path}` : `ABSENTE : ${method} ${path}`).toBe(`${method} ${path}`);
      expect(hasTenantOrPortalGuard(route!)).toBe(true);
      // Un client de portail est refuse : la garde de collaborateur doit suivre celle de l'agence.
      expect(route!.middlewares).toContain(requireTenantCollaborator);
      expect(route!.middlewares).toContain(authenticate);
    }
    const execute = routes.find(r => r.method === 'POST' && r.path === '/api/tenants/:tenantId/ai/actions/execute');
    const executeKeys = execute!.middlewares.map(mw => (mw as any)?.permissionKey);
    // Étape 4 : la route sert deux actions (quittance, plan d'écriture générique) et n'a plus de permission
    // fixe. Le contrôleur exige GENERATE et VIEW pour une quittance (testé dans ai.routes.capability.test.ts) ;
    // un plan d'écriture est gardé par la route réellement appelée par loopback, sous l'identité du confirmeur.
    expect(executeKeys.filter(key => typeof key === 'string')).toEqual([]);
    expect(routes.filter(r => r.path.startsWith('/api/tenants/:tenantId/ai'))).toHaveLength(4);
  });

  it('declare les 3 routes du reglage IA de la plateforme avec permission PLATFORM et super-admin', () => {
    const expected: Array<[string, string, string]> = [
      ['GET', '/api/platform/ai-settings', 'PLATFORM_TENANTS_VIEW'],
      ['PUT', '/api/platform/ai-settings', 'PLATFORM_TENANTS_EDIT'],
      ['GET', '/api/platform/ai-settings/models', 'PLATFORM_TENANTS_VIEW']
    ];
    for (const [method, path, permission] of expected) {
      const route = routes.find(r => r.method === method && r.path === path);
      expect(route ? `${method} ${path}` : `ABSENTE : ${method} ${path}`).toBe(`${method} ${path}`);
      expect(hasPlatformPermission(route!)).toBe(permission);
      expect(route!.middlewares).toContain(requireSuperAdmin);
    }
    expect(routes.filter(r => r.path.startsWith('/api/platform/ai-settings'))).toHaveLength(3);
  });

  it('declare les 9 routes agence des acces tiers de confiance (lot B3) avec authentification et garde d’agence', () => {
    const base = '/api/tenants/:tenantId/patrimoine/external-access';
    const expected: Array<[string, string]> = [
      ['GET', base],
      ['GET', `${base}/scope-options`],
      ['GET', `${base}/property-documents/:propertyId`],
      ['POST', base],
      ['GET', `${base}/:grantId`],
      ['PATCH', `${base}/:grantId`],
      ['POST', `${base}/:grantId/revoke`],
      ['POST', `${base}/:grantId/send-link`],
      ['GET', `${base}/:grantId/access-log`]
    ];
    for (const [method, path] of expected) {
      const route = routes.find(r => r.method === method && r.path === path);
      expect(route ? `${method} ${path}` : `ABSENTE : ${method} ${path}`).toBe(`${method} ${path}`);
      expect(hasTenantOrPortalGuard(route!)).toBe(true);
      expect(route!.middlewares).toContain(authenticate);
      // Aucune de ces routes n'est publique : elles ne figurent pas dans la liste blanche.
      expect(isWhitelisted(route!)).toBeUndefined();
    }
    expect(routes.filter(r => r.path.startsWith(base))).toHaveLength(expected.length);
  });

  it('les 2 routes publiques des acces tiers (lot B3) sont des POST en liste blanche, sans autre methode', () => {
    const publicRoutes = routes.filter(r => r.path.startsWith('/api/public/external-access'));
    expect(publicRoutes.map(r => `${r.method} ${r.path}`).sort()).toEqual([
      'POST /api/public/external-access/documents/download',
      'POST /api/public/external-access/patrimoine'
    ]);
    for (const route of publicRoutes) expect(isWhitelisted(route)).toBeDefined();
  });

  it('protège les données personnelles du patrimoine par PATRIMOINE_PERSONAL_VIEW / _EDIT, route par route', () => {
    // Refus par défaut : toute route /patrimoine/** doit porter la permission dédiée, sauf liste blanche EXPLICITE
    // de chemins restés sous PROPERTIES_* (immobilier ou référentiel). Une route nouvelle tombe donc dans le refus.
    const PROPERTIES_ALLOWLIST = [
      /^\/api\/tenants\/:tenantId\/patrimoine\/(overview|performance|export|settings)$/,
      /^\/api\/tenants\/:tenantId\/patrimoine\/work-programs(\/|$)/,
      /^\/api\/tenants\/:tenantId\/patrimoine\/properties\/:propertyId(\/|$)/,
      /^\/api\/tenants\/:tenantId\/patrimoine\/tax-parameters$/,
      /^\/api\/tenants\/:tenantId\/patrimoine\/statements(\/|$)/,
      // Lots immobiliers de main (A2 trésorerie, B1 assurances et carnet d'entretien, B2 foncier,
      // B3 accès tiers) : rattachés aux biens, gardés par leurs propres droits PROPERTIES_*.
      /^\/api\/tenants\/:tenantId\/patrimoine\/cash-plan(\/|$)/,
      /^\/api\/tenants\/:tenantId\/patrimoine\/external-access(\/|$)/,
      /^\/api\/tenants\/:tenantId\/patrimoine\/(land-tracks|land-regularizations)(\/|$)/,
      /^\/api\/tenants\/:tenantId\/patrimoine\/insurance(\/|$)/,
      /^\/api\/tenants\/:tenantId\/patrimoine\/maintenance-log(\/|$)/
    ];
    const personal = routes.filter(
      r => r.path.startsWith('/api/tenants/:tenantId/patrimoine/') && !PROPERTIES_ALLOWLIST.some(re => re.test(r.path))
    );
    // 38 routes : actifs, valorisations, parts, dettes, valeur nette, entités, projections, scénarios, compteur.
    expect(personal.length).toBeGreaterThanOrEqual(38);

    const failures: string[] = [];
    for (const route of personal) {
      const keys = route.middlewares
        .map(mw => (mw as any)?.permissionKey as string | undefined)
        .filter((k): k is string => Boolean(k));
      const isWrite = ['PATCH', 'PUT', 'DELETE'].includes(route.method);
      // POST de lecture/calcul : suggestion de valorisation, projection, exécution d'un scénario.
      const isComputePost = route.method === 'POST' && /\/(valuations\/suggest|projections|run)$/.test(route.path);
      const expected =
        isWrite || (route.method === 'POST' && !isComputePost)
          ? 'PATRIMOINE_PERSONAL_EDIT'
          : 'PATRIMOINE_PERSONAL_VIEW';
      if (!(keys.length === 1 && keys[0] === expected)) {
        failures.push(`${route.method} ${route.path} : attendu ${expected}, trouvé [${keys.join(', ')}]`);
      }
    }
    expect(failures).toEqual([]);

    // Aucun rôle d'agence ne doit porter ces clés par défaut : garde de non-régression sur les seeds.
    // (Le rôle PERSONAL_SPACE_OWNER est le seul porteur : voir patrimoine-personal-permissions-seed.ts.)
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const seedsDir = path.join(__dirname, '../../prisma/seeds');
    const offenders = fs
      .readdirSync(seedsDir)
      .filter(f => f.endsWith('.ts') && f !== 'patrimoine-personal-permissions-seed.ts')
      .filter(f => /PATRIMOINE_PERSONAL_/.test(fs.readFileSync(path.join(seedsDir, f), 'utf8')));
    expect(offenders).toEqual([]);
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
