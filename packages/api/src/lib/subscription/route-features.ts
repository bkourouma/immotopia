/**
 * Table declarative « route d'agence -> fonctionnalite » (vague 2, lot A).
 * Pure : aucun acces base, aucune configuration.
 *
 * Portee : les routes servies sous `/api/tenants/:tenantId/...`. Les chemins
 * ci-dessous sont RELATIFS a ce prefixe. Le garde
 * `middleware/subscription-feature-middleware.ts` est monte une seule fois,
 * AVEC ce chemin, dans `app.ts` : il lit cette table, jamais les routeurs.
 *
 * Correspondance : segment par segment ; un segment `:x` du motif accepte
 * n'importe quelle valeur. La regle la plus specifique l'emporte (plus de
 * segments, puis plus de segments litteraux), si bien qu'une exception
 * (`/finance/supplier-invoices/:id/purchase-order`, CONSTRUCTION) peut vivre a
 * cote de sa regle generale (`/finance/supplier-invoices`, CORE) quel que soit
 * l'ordre du tableau.
 *
 * Toute route d'agence DOIT etre classee : `__tests__/unit/route-features.test.ts`
 * parcourt la pile Express reelle et echoue sur une route oubliee. Une route
 * absente de la table n'est jamais bloquee a l'execution (journalisee
 * seulement) : le test est le filet, pas la production.
 *
 * Voir docs/architecture/PLAN-ABONNEMENTS.md (§9) et features.ts.
 */

import type { Feature } from './features';

/** `EXEMPT` : jamais bloquee (portails, paiements, auto-inscription, droits eux-memes). */
export type RouteFeature = Feature | 'EXEMPT';

export interface RouteFeatureRule {
  /** Chemin relatif a `/api/tenants/:tenantId`, segments `:param` acceptes. */
  prefix: string;
  feature: RouteFeature;
  /** Vrai : le chemin doit correspondre exactement (pas de sous-chemins). */
  exact?: boolean;
  /** Pourquoi, quand le classement n'est pas evident. */
  note?: string;
}

export const TENANT_ROUTE_FEATURES: readonly RouteFeatureRule[] = [
  // ------------------------------------------------------------ exceptions
  { prefix: '/entitlements', feature: 'EXEMPT', note: 'Le menu web lit les droits : toujours lisible.' },
  {
    prefix: '/subscription',
    feature: 'EXEMPT',
    note: "L'agence consulte et regle son abonnement meme en lecture seule."
  },
  {
    prefix: '/subscription/invoices',
    feature: 'EXEMPT',
    note: 'Factures PLATFORM (vague 3) : une agence en lecture seule doit voir, telecharger et payer ses factures.'
  },
  { prefix: '/register', feature: 'EXEMPT', note: "Auto-inscription d'un client, pas une action de l'agence." },
  { prefix: '/unregister', feature: 'EXEMPT', note: "Desinscription d'un client." },
  { prefix: '/client-details', feature: 'EXEMPT', note: 'Un client met a jour sa propre fiche.' },
  {
    prefix: '/maintenance/tenant',
    feature: 'EXEMPT',
    note: 'Demandes des locataires (vue demandeur) : portail locataire, jamais bloque (D8).'
  },

  // ------------------------------------------------------------ socle (CORE)
  { prefix: '/', exact: true, feature: 'CORE', note: "Fiche et parametres de l'agence." },
  { prefix: '/logo', feature: 'CORE' },
  {
    prefix: '/document-identity',
    feature: 'CORE',
    note: "Signature et cachet de l'agence sur ses documents (lot S1)."
  },
  { prefix: '/clients', feature: 'CORE' },
  { prefix: '/invitations', feature: 'CORE' },
  { prefix: '/users', feature: 'CORE' },
  { prefix: '/members', feature: 'CORE', note: 'Membres assignables (liste minimale pour les listes deroulantes).' },
  { prefix: '/dashboard', feature: 'CORE' },
  { prefix: '/audit', feature: 'CORE', note: "Journal d'activité de l'agence (ADR-006) : lecture seule." },
  { prefix: '/documents', feature: 'CORE' },
  {
    prefix: '/ai',
    feature: 'CORE',
    note:
      "Assistant ImmoCopilot : statut, chat et confirmation. La confirmation d'une quittance exige en plus le module " +
      "RENTAL (vérifié par le contrôleur, selon l'action du jeton) ; celle d'une écriture générique est gardée par la route " +
      'réellement appelée (même chaîne, même abonnement).'
  },
  { prefix: '/maintenance', feature: 'CORE' },
  { prefix: '/email-notifications', feature: 'CORE' },
  { prefix: '/whatsapp-notifications', feature: 'CORE' },
  { prefix: '/newsletter', feature: 'CORE' },
  { prefix: '/properties', feature: 'CORE', note: 'Biens, medias, documents, visites, mandats de bien, indivision.' },
  { prefix: '/mandates', feature: 'CORE' },
  { prefix: '/crm/contacts', feature: 'CORE', note: 'Les contacts sont du socle (features.ts), le pipeline est CRM.' },
  { prefix: '/crm/contacts-search', feature: 'CORE' },
  { prefix: '/crm/tags', feature: 'CORE' },
  { prefix: '/cash-sessions', feature: 'CORE', note: "Caisse d'agence." },
  { prefix: '/treasury', feature: 'CORE' },
  { prefix: '/settings/finance', feature: 'CORE' },
  { prefix: '/settings/payment-gateway', feature: 'CORE' },
  {
    prefix: '/settings/owner-portal',
    feature: 'CORE',
    note: 'Masquage de la vue patrimoine du portail propriétaire (lot P5).'
  },
  { prefix: '/finance/accounting', feature: 'CORE', note: 'Journal, grand livre, balances, exports.' },
  { prefix: '/finance/accounts', feature: 'CORE' },
  { prefix: '/finance/clients', feature: 'CORE', note: 'Balances clients.' },
  { prefix: '/finance/billing-runs', feature: 'CORE', note: 'Facturation.' },
  {
    prefix: '/finance/suppliers',
    feature: 'CORE',
    note: 'Fournisseurs communs ; le rattachement a un chantier est facultatif.'
  },
  { prefix: '/finance/supplier-invoices', feature: 'CORE' },
  { prefix: '/finance/supplier-payments', feature: 'CORE' },
  {
    prefix: '/finance/cost-categories',
    feature: 'CORE',
    note: 'Postes de depense, aussi utilises par les factures fournisseurs.'
  },
  { prefix: '/finance/validation-queue', feature: 'CORE', note: 'File mixte (factures, pieces, bons).' },

  // ------------------------------------------------------------ CRM
  { prefix: '/crm/deals', feature: 'CRM' },
  { prefix: '/crm/activities', feature: 'CRM' },
  { prefix: '/crm/calendar', feature: 'CRM' },
  { prefix: '/crm/dashboard', feature: 'CRM' },

  // ------------------------------------------------------------ ventes
  { prefix: '/sales', feature: 'SALES' },

  // ------------------------------------------------------------ gestion locative
  { prefix: '/rental', feature: 'RENTAL', note: 'Baux, echeances, paiements, penalites, etats des lieux.' },
  { prefix: '/owner-statements', feature: 'RENTAL' },
  { prefix: '/owner-accounts', feature: 'RENTAL' },
  { prefix: '/settings/finance/owners', feature: 'RENTAL', note: 'Honoraires de gestion par mandant.' },
  { prefix: '/settings/finance/agents', feature: 'RENTAL', note: 'Gestionnaires et commissions de gestion.' },
  { prefix: '/finance/agent-commissions', feature: 'RENTAL' },

  // ------------------------------------------------------------ patrimoine
  { prefix: '/patrimoine', feature: 'PATRIMOINE' },
  { prefix: '/work-programs', feature: 'PATRIMOINE' },
  { prefix: '/properties/:propertyId/valuations', feature: 'PATRIMOINE' },
  { prefix: '/properties/:propertyId/expenses', feature: 'PATRIMOINE' },
  { prefix: '/properties/:propertyId/loans', feature: 'PATRIMOINE' },
  { prefix: '/properties/:propertyId/work-programs', feature: 'PATRIMOINE' },
  { prefix: '/properties/:propertyId/yield', feature: 'PATRIMOINE' },
  {
    prefix: '/properties/:propertyId/patrimoine',
    feature: 'PATRIMOINE',
    note: "Export du patrimoine d'un seul bien (lot P3) ; l'export d'agence est deja couvert par /patrimoine."
  },

  // ------------------------------------------------------------ syndic
  { prefix: '/syndics', feature: 'SYNDIC' },
  { prefix: '/syndic-mandating-agencies', feature: 'SYNDIC', note: 'Agences mandantes du cabinet de syndic (lot S1).' },

  // ------------------------------------------------------------ construction
  {
    prefix: '/finance/sites',
    feature: 'CONSTRUCTION',
    note: 'Chantiers, avancement, budgets, lots, cloture, stock de chantier.'
  },
  { prefix: '/finance/stock', feature: 'CONSTRUCTION' },
  {
    prefix: '/finance/cash-vouchers',
    feature: 'CONSTRUCTION',
    note: 'Pieces de caisse de chantier (siteId obligatoire).'
  },
  { prefix: '/finance/budget-alerts', feature: 'CONSTRUCTION' },
  { prefix: '/finance/site-budgets', feature: 'CONSTRUCTION' },
  { prefix: '/finance/budget-amendments', feature: 'CONSTRUCTION' },
  { prefix: '/finance/purchase-orders', feature: 'CONSTRUCTION' },
  { prefix: '/finance/supplier-invoices/:invoiceId/purchase-order', feature: 'CONSTRUCTION' },
  { prefix: '/finance/land-leases', feature: 'CONSTRUCTION' },
  { prefix: '/finance/land-lease-payments', feature: 'CONSTRUCTION' },
  { prefix: '/finance/employees', feature: 'CONSTRUCTION', note: 'Salaires de chantier.' },
  { prefix: '/finance/salary-notes', feature: 'CONSTRUCTION' },
  { prefix: '/finance/salary-payments', feature: 'CONSTRUCTION' },
  { prefix: '/finance/partnerships', feature: 'CONSTRUCTION' },
  { prefix: '/finance/partnership-shares', feature: 'CONSTRUCTION' },
  { prefix: '/finance/properties/:propertyId/partnership', feature: 'CONSTRUCTION' },
  { prefix: '/finance/contractors', feature: 'CONSTRUCTION', note: 'Tacherons.' },
  { prefix: '/finance/contractor-contracts', feature: 'CONSTRUCTION' },
  { prefix: '/finance/contractor-payments', feature: 'CONSTRUCTION' },
  { prefix: '/finance/progress-statements', feature: 'CONSTRUCTION' },
  { prefix: '/finance/retentions', feature: 'CONSTRUCTION', note: 'Retenues de garantie.' }
];

/**
 * Ecritures qui n'en sont pas : recherches ou devis en POST. Elles restent
 * permises a un module en lecture seule (D11 : lecture et export).
 * Chemins relatifs, meme syntaxe que la table.
 */
export const READ_LIKE_POSTS: readonly string[] = ['/properties/search', '/ai/chat'];

/**
 * Premiers segments sous `/api/tenants/` qui ne sont PAS un identifiant
 * d'agence (routes de tenant-routes.ts) : le garde les ignore.
 */
export const NON_TENANT_SEGMENTS: readonly string[] = ['slug', 'my-memberships'];

function splitPath(path: string): string[] {
  const clean = path.split('?')[0].replace(/\/{2,}/g, '/');
  return clean.split('/').filter(segment => segment.length > 0);
}

/** Segments : `:x` = joker ; un joker suivi d'un suffixe (`:id.pdf`) reste un joker. */
function segmentMatches(pattern: string, actual: string): boolean {
  if (pattern.startsWith(':')) return true;
  return pattern === actual;
}

type CompiledRule = ReturnType<typeof compile<RouteFeatureRule>>;

function compile<T extends { prefix: string; exact?: boolean }>(
  rule: T
): { rule: T; segments: string[]; score: number } {
  const segments = splitPath(rule.prefix);
  const literals = segments.filter(s => !s.startsWith(':')).length;
  return { rule, segments, score: segments.length * 100 + literals };
}

const COMPILED = TENANT_ROUTE_FEATURES.map(compile);
const READ_LIKE = READ_LIKE_POSTS.map(p => splitPath(p));

function matches(compiled: { segments: string[] }, actual: string[], exact: boolean): boolean {
  if (exact ? actual.length !== compiled.segments.length : actual.length < compiled.segments.length) return false;
  return compiled.segments.every((pattern, i) => segmentMatches(pattern, actual[i]));
}

/**
 * Regle la plus specifique d'une table `{ prefix, exact? }` pour un chemin
 * relatif (memes regles de correspondance que la table des fonctionnalites).
 * Sert aussi a la liste blanche des espaces PARTICULIER.
 */
export function findBestRule<T extends { prefix: string; exact?: boolean }>(
  rules: readonly T[],
  relativePath: string
): T | undefined {
  const actual = splitPath(relativePath);
  let best: { rule: T; score: number } | undefined;
  for (const rule of rules) {
    const compiled = compile(rule);
    if (!matches(compiled, actual, Boolean(rule.exact))) continue;
    if (!best || compiled.score > best.score) best = { rule, score: compiled.score };
  }
  return best?.rule;
}

/** Regle applicable a un chemin relatif, ou `undefined` si la route n'est pas classee. */
export function findRouteFeatureRule(relativePath: string): RouteFeatureRule | undefined {
  const actual = splitPath(relativePath);
  let best: CompiledRule | undefined;
  for (const compiled of COMPILED) {
    if (!matches(compiled, actual, Boolean(compiled.rule.exact))) continue;
    if (!best || compiled.score > best.score) best = compiled;
  }
  return best?.rule;
}

/** Fonctionnalite d'un chemin relatif a `/api/tenants/:tenantId`. */
export function classifyTenantRoute(relativePath: string): RouteFeature | undefined {
  return findRouteFeatureRule(relativePath)?.feature;
}

/**
 * Vrai si la requete modifie des donnees. GET, HEAD, OPTIONS lisent ; les
 * POST de `READ_LIKE_POSTS` aussi.
 */
export function isWriteRequest(method: string, relativePath: string): boolean {
  const upper = method.toUpperCase();
  if (upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS') return false;
  if (upper === 'POST') {
    const actual = splitPath(relativePath);
    if (READ_LIKE.some(segments => matches({ segments }, actual, true))) return false;
  }
  return true;
}
