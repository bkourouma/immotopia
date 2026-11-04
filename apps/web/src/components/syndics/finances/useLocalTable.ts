import { useEffect, useMemo, useState } from 'react';
import type { Sort } from '../../../hooks/useListParams';

/**
 * Tri d'une liste complète par champ (nombres, puis textes), appliqué avant la
 * pagination : à donner tel quel en `sortItems` de `useLocalListSearch` (le tri
 * d'en-tête porte alors sur toute la liste, pas seulement sur la page).
 */
export function sortRows<T>(items: T[], sort: Sort | null): T[] {
  if (!sort) return items;
  const { field, order } = sort;
  return [...items].sort((a, b) => {
    const av = (a as Record<string, unknown>)[field];
    const bv = (b as Record<string, unknown>)[field];
    if (av === bv) return 0;
    if (av === null || av === undefined) return order === 'asc' ? -1 : 1;
    if (bv === null || bv === undefined) return order === 'asc' ? 1 : -1;
    if (typeof av === 'number' && typeof bv === 'number') {
      return order === 'asc' ? av - bv : bv - av;
    }
    const as = String(av);
    const bs = String(bv);
    return order === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
  });
}

/**
 * Tri et pagination d'une liste déjà chargée en mémoire, appliqués côté
 * client. Réservé aux listes sans recherche (le détail des fonds) : un tableau
 * qui porte une barre de recherche passe par `useLocalListSearch`.
 *
 * Rejoue localement le contrat attendu par `<DataView>` — page courante,
 * total, tri.
 */
export function useLocalTable<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort | null>(null);

  useEffect(() => {
    setPage(1);
  }, [items]);

  const sorted = useMemo(() => sortRows(items, sort), [items, sort]);

  const total = sorted.length;
  const pageItems = useMemo(
    () => sorted.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [sorted, page, pageSize]
  );

  return {
    pageItems,
    // Toutes les lignes, triées comme à l'écran : c'est ce que l'export emporte.
    allItems: sorted,
    total,
    page,
    pageSize,
    onPageChange: (nextPage: number) => setPage(nextPage),
    sort,
    onSortChange: (nextSort: Sort | null) => {
      setSort(nextSort);
      setPage(1);
    }
  };
}
