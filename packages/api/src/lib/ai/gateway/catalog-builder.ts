/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireTenantAccess } from '../../../middleware/tenant-middleware';
import { isDestructive, isSensitivePath } from './path-rules';
import type { DiscoveredRoute } from './route-walker';

/**
 * Construction du catalogue de la passerelle IA (plan V2, étape 3) à partir de
 * la pile Express réelle (voir `route-walker.ts`).
 *
 * Le catalogue n'est qu'un INDEX : il aide le modèle à trouver une route, il ne
 * confère aucun droit. L'autorité reste la chaîne de middlewares réelle, que
 * `call_read` rejoue par un appel loopback sous l'identité de l'utilisateur.
 *
 * Périmètre : routes d'agence (`/api/tenants/:tenantId/...` portant
 * `requireTenantAccess`). Exclus par construction : authentification,
 * administration et plateforme, portails, l'assistant lui-même, les webhooks,
 * toute route publique (aucune garde d'agence) et TOUTE écriture destructrice
 * (méthode `DELETE`, ou chemin finissant par /delete|/remove|/destroy|/purge,
 * qui est une suppression déguisée en POST).
 */

export interface CatalogEntry {
  /** `METHOD /chemin/normalisé` (avec `:params`), stable d'une génération à l'autre. */
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  /** Chemin complet, `:tenantId` compris : l'outil l'impose, le modèle ne le fournit jamais. */
  path: string;
  /** Paramètres de chemin que le modèle doit fournir (`:tenantId` exclu). */
  pathParams: string[];
  /** Premier segment après `:tenantId` (« finance », « rental », « crm »…) ; `agence` pour la racine. */
  module: string;
  summary: string;
  /** Permissions TOUTES exigées par la chaîne (lues sur les gardes qui les exposent), sinon null. */
  permissions: string[] | null;
  /** Groupes « au moins une de » exigés par la chaîne, sinon null. */
  anyOfPermissions: string[][] | null;
  /** Chemin évoquant un secret : absente de la recherche, refusée par `call_read`. */
  sensitive: boolean;
}

export interface BuiltCatalog {
  entries: CatalogEntry[];
  /** Routes d'agence exclues parce que destructrices (jamais écrites dans le fichier). */
  excludedDestructive: Array<{ id: string; destructive: true }>;
}

const TENANT_PREFIX = '/api/tenants/:tenantId';
const KEPT_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH']);

/** Préfixes (chemin absolu) hors périmètre, par défense en profondeur : aucune route d'agence n'y vit. */
export const EXCLUDED_ABSOLUTE_PREFIXES = ['/api/auth', '/api/admin', '/api/platform', '/api/portal'] as const;
/** Segments d'agence hors périmètre : l'assistant lui-même. */
const EXCLUDED_TENANT_SEGMENTS = new Set(['ai']);
/**
 * Segments exclus où qu'ils se trouvent dans le chemin : le simulateur de
 * l'inventaire par WhatsApp (lot 041, W13-R6) parle AU NOM d'un chef de
 * chantier ; l'assistant ne doit jamais pouvoir s'en servir.
 */
export const EXCLUDED_ANY_SEGMENTS = new Set(['simulator']);

export { isSensitivePath, isDestructive };

function isExcludedPath(path: string): boolean {
  if (EXCLUDED_ABSOLUTE_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) return true;
  if (/webhook/i.test(path)) return true;
  const segments = path.slice(TENANT_PREFIX.length).split('/');
  if (segments.some(segment => EXCLUDED_ANY_SEGMENTS.has(segment.toLowerCase()))) return true;
  return EXCLUDED_TENANT_SEGMENTS.has(segments[1] ?? '');
}

export function pathParamsOf(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map(match => match[1]!).filter(name => name !== 'tenantId');
}

function moduleOf(path: string): string {
  const rest = path.slice(TENANT_PREFIX.length).split('/').filter(Boolean);
  const first = rest[0];
  return !first || first.startsWith(':') ? 'agence' : first;
}

/** « listContactsHandler » -> « list contacts » ; null si le nom ne dit rien. */
function handlerWords(handler: unknown): string | null {
  const name = typeof handler === 'function' ? (handler as { name?: string }).name : undefined;
  if (!name || /^(anonymous|middleware|handler|bound .*)$/i.test(name)) return null;
  const words = name
    .replace(/Handler$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  return words.length >= 3 ? words : null;
}

function summaryOf(path: string, handler: unknown): string {
  const trail = path
    .slice(TENANT_PREFIX.length)
    .split('/')
    .filter(Boolean)
    .map(segment => (segment.startsWith(':') ? `{${segment.slice(1)}}` : segment))
    .join(' / ');
  const words = handlerWords(handler);
  return words ? `${words} (${trail || 'agence'})` : trail || 'agence';
}

function permissionsOf(route: DiscoveredRoute): Pick<CatalogEntry, 'permissions' | 'anyOfPermissions'> {
  const all = new Set<string>();
  const anyOf: string[][] = [];
  for (const mw of route.middlewares as any[]) {
    if (typeof mw?.permissionKey === 'string') all.add(mw.permissionKey);
    if (Array.isArray(mw?.allPermissionKeys)) mw.allPermissionKeys.forEach((key: string) => all.add(key));
    if (Array.isArray(mw?.anyPermissionKeys)) anyOf.push([...mw.anyPermissionKeys].sort());
  }
  return {
    permissions: all.size > 0 ? [...all].sort() : null,
    anyOfPermissions: anyOf.length > 0 ? anyOf : null
  };
}

/** Une route d'agence est dans le périmètre de la passerelle : `requireTenantAccess` ET préfixe `:tenantId`. */
export function isTenantScoped(route: DiscoveredRoute): boolean {
  const underTenant = route.path === TENANT_PREFIX || route.path.startsWith(`${TENANT_PREFIX}/`);
  return underTenant && route.middlewares.includes(requireTenantAccess as any);
}

export function buildCatalog(routes: DiscoveredRoute[]): BuiltCatalog {
  const byId = new Map<string, CatalogEntry>();
  const destructive = new Map<string, { id: string; destructive: true }>();

  for (const route of routes) {
    if (!isTenantScoped(route)) continue;
    const id = `${route.method} ${route.path}`;
    if (isDestructive(route.method, route.path)) {
      destructive.set(id, { id, destructive: true });
      continue;
    }
    if (!KEPT_METHODS.has(route.method) || isExcludedPath(route.path)) continue;
    // Express sert la PREMIÈRE route qui correspond : un doublon ultérieur est inatteignable.
    if (byId.has(id)) continue;
    const handler = route.middlewares[route.middlewares.length - 1];
    byId.set(id, {
      id,
      method: route.method as CatalogEntry['method'],
      path: route.path,
      pathParams: pathParamsOf(route.path),
      module: moduleOf(route.path),
      summary: summaryOf(route.path, handler),
      ...permissionsOf(route),
      sensitive: isSensitivePath(route.path)
    });
  }

  const byText = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    entries: [...byId.values()].sort(byText),
    excludedDestructive: [...destructive.values()].sort(byText)
  };
}

export const CATALOG_VERSION = 1;

/** Forme exacte du fichier commité : générateur et test de fraîcheur doivent produire le même texte. */
export function serializeCatalog(entries: CatalogEntry[]): string {
  return `${JSON.stringify({ version: CATALOG_VERSION, entries }, null, 2)}\n`;
}
