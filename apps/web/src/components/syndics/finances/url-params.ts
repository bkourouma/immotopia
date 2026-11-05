import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Plafond de `limit` accepté par l'API des listes de la copropriété (au-delà : 400). */
export const SYNDIC_MAX_PAGE_SIZE = 100;

/**
 * Convention d'URL des écrans de copropriété à plusieurs tableaux :
 *
 * - `?tab=<clé>` : l'onglet actif (absent = premier onglet) ;
 * - la recherche de chaque tableau (critères, page, taille, tri) est portée par
 *   `useListSearch` / `useLocalListSearch` avec un `paramPrefix` par tableau :
 *   `ap.q`, `ap.status`, `ap.page` (appels de fonds), `pa.` (paiements), `im.`
 *   (impayés), `rt.` (retards), `re.` (relances), `pe.` (pénalités), `ec.`
 *   (échéanciers). Ces helpers-ci ne servent plus aux tableaux de ces écrans ;
 *   `usePagedParams` et `splitCsv` restent pour les écrans qui n'ont pas encore
 *   migré.
 *
 * Toute écriture remplace l'entrée d'historique (`replace`) et ne touche que
 * les clés nommées : les autres paramètres de l'URL restent intacts.
 */
export function useUrlPatch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const patch = useCallback(
    (updates: Record<string, string | undefined>) => {
      setSearchParams(
        previous => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(updates)) {
            if (value === undefined || value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  return { searchParams, patch };
}

/** Onglet actif porté par `?tab=` ; une clé inconnue retombe sur le défaut. */
export function useTabParam<T extends string>(tabs: readonly T[], defaultTab: T): [T, (tab: T) => void] {
  const { searchParams, patch } = useUrlPatch();
  const raw = searchParams.get('tab');
  const active = (tabs as readonly string[]).includes(raw ?? '') ? (raw as T) : defaultTab;
  const setTab = useCallback((tab: T) => patch({ tab: tab === defaultTab ? undefined : tab }), [patch, defaultTab]);
  return [active, setTab];
}

/** Page et taille de page d'un tableau paginé par le serveur, préfixées dans l'URL. */
export function usePagedParams(prefix: string, defaultLimit = 20) {
  const { searchParams, patch } = useUrlPatch();
  const pageKey = `${prefix}Page`;
  const limitKey = `${prefix}Limit`;
  const page = Math.max(1, Math.floor(Number(searchParams.get(pageKey))) || 1);
  const limit = Math.min(
    SYNDIC_MAX_PAGE_SIZE,
    Math.max(1, Math.floor(Number(searchParams.get(limitKey))) || defaultLimit)
  );
  const setPage = useCallback(
    (next: number) => patch({ [pageKey]: next <= 1 ? undefined : String(next) }),
    [patch, pageKey]
  );
  const setLimit = useCallback(
    (next: number) => patch({ [limitKey]: next === defaultLimit ? undefined : String(next), [pageKey]: undefined }),
    [patch, limitKey, pageKey, defaultLimit]
  );
  return { page, limit, setPage, setLimit };
}

/** Valeurs d'un filtre multiple porté par l'URL en liste séparée par des virgules. */
export function splitCsv(raw: string | null): string[] {
  return raw ? raw.split(',').filter(Boolean) : [];
}
