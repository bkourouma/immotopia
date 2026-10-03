import rawCatalog from './catalog.generated.json';
import type { CatalogEntry } from './catalog-builder';

/**
 * Accès en lecture au catalogue généré (`npm run ai:catalog`). Index seulement :
 * il n'accorde aucun droit, la chaîne de middlewares réelle tranche à l'appel.
 */

interface CatalogFile {
  version: number;
  entries: CatalogEntry[];
}

const ENTRIES: readonly CatalogEntry[] = (rawCatalog as CatalogFile).entries;
const BY_ID: ReadonlyMap<string, CatalogEntry> = new Map(ENTRIES.map(entry => [entry.id, entry]));

/** Plafond de résultats de `list_capabilities`. */
export const MAX_CAPABILITY_RESULTS = 20;

/** Étape 3 : lecture seule. L'étape 4 ouvrira les écritures par un outil distinct (`plan_write`). */
export const READABLE_METHODS: ReadonlySet<string> = new Set(['GET']);

export function getCatalogEntries(): readonly CatalogEntry[] {
  return ENTRIES;
}

export function findCatalogEntry(id: string): CatalogEntry | undefined {
  return BY_ID.get(id);
}

/** L'utilisateur détient-il les permissions que le catalogue connaît pour cette route ? (sans info : oui, l'appel réel tranche) */
export function isPermittedByCatalog(entry: CatalogEntry, permissions: ReadonlySet<string>): boolean {
  if (entry.permissions && !entry.permissions.every(key => permissions.has(key))) return false;
  if (entry.anyOfPermissions && !entry.anyOfPermissions.every(group => group.some(key => permissions.has(key)))) {
    return false;
  }
  return true;
}

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface CapabilityQuery {
  query?: string;
  module?: string;
  permissions: ReadonlySet<string>;
}

export interface CapabilitySearchResult {
  total: number;
  entries: CatalogEntry[];
}

/** Recherche textuelle (tous les mots présents) dans les routes GET consultables : jamais les routes sensibles. */
export function searchCapabilities({ query, module, permissions }: CapabilityQuery): CapabilitySearchResult {
  const words = fold(query ?? '')
    .split(/[^a-z0-9]+/)
    .filter(word => word.length > 0);
  const wantedModule = module ? fold(module).trim() : null;

  const scored: Array<{ entry: CatalogEntry; score: number }> = [];
  for (const entry of ENTRIES) {
    if (!READABLE_METHODS.has(entry.method) || entry.sensitive) continue;
    if (wantedModule && fold(entry.module) !== wantedModule) continue;
    if (!isPermittedByCatalog(entry, permissions)) continue;
    const haystack = fold(`${entry.module} ${entry.summary} ${entry.path}`);
    if (!words.every(word => haystack.includes(word))) continue;
    // Un mot dans le résumé (plus lisible que le chemin brut) compte davantage.
    const summary = fold(entry.summary);
    const score = words.reduce((sum, word) => sum + (summary.includes(word) ? 2 : 1), 0);
    scored.push({ entry, score });
  }
  scored.sort(
    (a, b) => b.score - a.score || a.entry.path.length - b.entry.path.length || (a.entry.id < b.entry.id ? -1 : 1)
  );
  return {
    total: scored.length,
    entries: scored.slice(0, MAX_CAPABILITY_RESULTS).map(item => item.entry)
  };
}

/** Modules consultables et leur nombre de routes, pour guider une recherche sans mot-clé. */
export function listReadableModules(permissions: ReadonlySet<string>): Array<{ module: string; routes: number }> {
  const counts = new Map<string, number>();
  for (const entry of ENTRIES) {
    if (!READABLE_METHODS.has(entry.method) || entry.sensitive || !isPermittedByCatalog(entry, permissions)) continue;
    counts.set(entry.module, (counts.get(entry.module) ?? 0) + 1);
  }
  return [...counts.entries()].map(([module, routes]) => ({ module, routes })).sort((a, b) => b.routes - a.routes);
}
