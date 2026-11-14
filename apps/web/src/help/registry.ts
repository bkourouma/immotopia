import { useEffect, useState } from 'react';
import { matchPath } from 'react-router-dom';
import i18next from '../i18n';
import { isLanguage } from '../i18n/config';
import { HELP_MODULES, helpLoaders, helpRoutes } from './content/index';
import type { HelpEntry, HelpLanguage, HelpModule } from './types';

export interface ResolvedHelpEntry {
  entry: HelpEntry;
  /** Langue effective de la fiche. */
  language: HelpLanguage;
  /** Vrai = repli sur le francais. */
  fallback: boolean;
}

export interface HelpSearchResult {
  entry: HelpEntry;
  module: HelpModule;
  score: number;
  fallback: boolean;
}

export function currentHelpLanguage(): HelpLanguage {
  const raw = i18next.resolvedLanguage ?? i18next.language;
  const base = typeof raw === 'string' ? raw.split('-')[0] : raw;
  return isLanguage(base) ? base : 'fr';
}

export function moduleOfHelpId(helpId: string): HelpModule | null {
  const first = helpId.split('.')[0];
  return (HELP_MODULES as readonly string[]).includes(first) ? (first as HelpModule) : null;
}

// ---------------------------------------------------------------------------
// Resolution de route
// ---------------------------------------------------------------------------

interface PatternRank {
  wildcard: boolean;
  statics: number;
  dynamics: number;
  length: number;
}

function rankPattern(pattern: string): PatternRank {
  const segments = pattern.split('/').filter(Boolean);
  return {
    wildcard: segments.includes('*'),
    statics: segments.filter(s => s !== '*' && !s.startsWith(':')).length,
    dynamics: segments.filter(s => s.startsWith(':')).length,
    length: pattern.length
  };
}

/** Positif si `a` est plus specifique que `b`. */
function compareRank(a: PatternRank, b: PatternRank): number {
  if (a.wildcard !== b.wildcard) return a.wildcard ? -1 : 1;
  if (a.statics !== b.statics) return a.statics - b.statics;
  if (a.dynamics !== b.dynamics) return b.dynamics - a.dynamics;
  return a.length - b.length;
}

export function resolvePageHelpId(pathname: string): string | null {
  let path = pathname.split(/[?#]/)[0] || '/';
  if (path.length > 1) path = path.replace(/\/+$/, '') || '/';
  let best: { helpId: string; rank: PatternRank } | null = null;
  for (const route of helpRoutes) {
    if (!matchPath({ path: route.pattern, end: true }, path)) continue;
    const rank = rankPattern(route.pattern);
    if (!best || compareRank(rank, best.rank) > 0) best = { helpId: route.helpId, rank };
  }
  return best ? best.helpId : null;
}

// ---------------------------------------------------------------------------
// Chargement et cache
// ---------------------------------------------------------------------------

const loaded = new Map<string, Map<string, HelpEntry>>();
const inflight = new Map<string, Promise<Map<string, HelpEntry> | null>>();

const cacheKey = (module: HelpModule, language: HelpLanguage) => `${module}:${language}`;

/** Charge un module dans une langue precise ; `null` si l'import echoue (non mis en cache). */
function loadRaw(module: HelpModule, language: HelpLanguage): Promise<Map<string, HelpEntry> | null> {
  const key = cacheKey(module, language);
  const cached = loaded.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const mod = await helpLoaders[module][language]();
      const map = new Map<string, HelpEntry>();
      for (const entry of mod.default ?? []) map.set(entry.id, entry);
      loaded.set(key, map);
      return map;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

export async function loadHelpModule(
  module: HelpModule,
  language: HelpLanguage = currentHelpLanguage()
): Promise<Map<string, HelpEntry>> {
  return (await loadRaw(module, language)) ?? new Map();
}

function resolveIn(
  helpId: string,
  language: HelpLanguage,
  primary: Map<string, HelpEntry>,
  french: Map<string, HelpEntry>
): ResolvedHelpEntry | null {
  const own = primary.get(helpId);
  if (own) return { entry: own, language, fallback: false };
  if (language !== 'fr') {
    const fr = french.get(helpId);
    if (fr) return { entry: fr, language: 'fr', fallback: true };
  }
  return null;
}

const EMPTY: Map<string, HelpEntry> = new Map();

export async function getHelpEntry(
  helpId: string,
  language: HelpLanguage = currentHelpLanguage()
): Promise<ResolvedHelpEntry | null> {
  const module = moduleOfHelpId(helpId);
  if (!module) return null;
  const [primary, french] = await Promise.all([
    loadHelpModule(module, language),
    language === 'fr' ? Promise.resolve(EMPTY) : loadHelpModule(module, 'fr')
  ]);
  return resolveIn(helpId, language, primary, french);
}

export function peekHelpEntry(
  helpId: string,
  language: HelpLanguage = currentHelpLanguage()
): ResolvedHelpEntry | null | undefined {
  const module = moduleOfHelpId(helpId);
  if (!module) return null;
  const primary = loaded.get(cacheKey(module, language));
  if (!primary) return undefined;
  const own = primary.get(helpId);
  if (own) return { entry: own, language, fallback: false };
  if (language === 'fr') return null;
  const french = loaded.get(cacheKey(module, 'fr'));
  if (!french) return undefined;
  return resolveIn(helpId, language, primary, french);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type HelpEntryStatus = 'idle' | 'loading' | 'ready' | 'missing';

interface HelpEntryState {
  entry: HelpEntry | null;
  status: HelpEntryStatus;
  fallback: boolean;
}

const IDLE: HelpEntryState = { entry: null, status: 'idle', fallback: false };
const LOADING: HelpEntryState = { entry: null, status: 'loading', fallback: false };

function fromResolved(resolved: ResolvedHelpEntry | null): HelpEntryState {
  return resolved
    ? { entry: resolved.entry, status: 'ready', fallback: resolved.fallback }
    : { entry: null, status: 'missing', fallback: false };
}

export function useHelpEntry(helpId: string | null | undefined): HelpEntryState {
  const language = currentHelpLanguage();
  const key = helpId ? `${language}|${helpId}` : '';
  const [settled, setSettled] = useState<{ key: string; state: HelpEntryState } | null>(null);

  useEffect(() => {
    if (!helpId) return;
    if (peekHelpEntry(helpId, language) !== undefined) return;
    let cancelled = false;
    void getHelpEntry(helpId, language).then(resolved => {
      if (!cancelled) setSettled({ key, state: fromResolved(resolved) });
    });
    return () => {
      cancelled = true;
    };
  }, [helpId, language, key]);

  if (!helpId) return IDLE;
  const peeked = peekHelpEntry(helpId, language);
  if (peeked !== undefined) return fromResolved(peeked);
  if (settled && settled.key === key) return settled.state;
  return LOADING;
}

// ---------------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------------

export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getAllHelpEntries(
  language: HelpLanguage = currentHelpLanguage()
): Promise<Array<{ module: HelpModule; entry: HelpEntry; fallback: boolean }>> {
  const perModule = await Promise.all(
    HELP_MODULES.map(async module => {
      const [primary, french] = await Promise.all([
        loadHelpModule(module, language),
        language === 'fr' ? Promise.resolve(EMPTY) : loadHelpModule(module, 'fr')
      ]);
      const result: Array<{ module: HelpModule; entry: HelpEntry; fallback: boolean }> = [];
      for (const entry of primary.values()) result.push({ module, entry, fallback: false });
      if (language !== 'fr') {
        for (const [id, entry] of french) {
          if (!primary.has(id)) result.push({ module, entry, fallback: true });
        }
      }
      return result;
    })
  );
  return perModule.flat();
}

function scoreEntry(entry: HelpEntry, words: string[]): number {
  const title = normalizeForSearch(entry.title);
  const keywords = normalizeForSearch((entry.keywords ?? []).join(' '));
  const summary = normalizeForSearch(entry.summary);
  const rest = normalizeForSearch(
    [entry.purpose ?? '', ...(entry.faq ?? []).flatMap(f => [f.q, f.a]), ...(entry.steps ?? []).map(s => s.title)].join(
      ' '
    )
  );
  const haystack = `${title} ${summary} ${keywords} ${rest}`;
  if (!words.every(w => haystack.includes(w))) return 0;
  let score = 1;
  for (const w of words) {
    if (title.includes(w)) {
      score += 10;
      if (title.startsWith(w)) score += 5;
    }
    if (keywords.includes(w)) score += 6;
    if (summary.includes(w)) score += 3;
    if (rest.includes(w)) score += 1;
  }
  return score;
}

export async function searchHelp(
  query: string,
  language: HelpLanguage = currentHelpLanguage()
): Promise<HelpSearchResult[]> {
  const normalized = normalizeForSearch(query);
  if (normalized.length < 2) return [];
  const words = normalized.split(' ').filter(Boolean);
  const all = await getAllHelpEntries(language);
  const results: HelpSearchResult[] = [];
  for (const item of all) {
    const score = scoreEntry(item.entry, words);
    if (score > 0) results.push({ entry: item.entry, module: item.module, score, fallback: item.fallback });
  }
  return results.sort((a, b) => b.score - a.score);
}

export function resetHelpRegistryForTests(): void {
  loaded.clear();
  inflight.clear();
}
