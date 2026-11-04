import type { PageRequest, Paged } from '../types';

/** Échappe `\`, `%` et `_` : le texte saisi est cherché tel quel dans un LIKE / ILIKE. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, match => '\\' + match);
}

/** Motif « contient » d'un ILIKE, jokers de l'utilisateur neutralisés. */
export function containsPattern(value: string): string {
  return '%' + escapeLike(value) + '%';
}

/** Comparaison ordinale stable, indépendante de la locale. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Recherche saisie nettoyée : `undefined` quand elle est vide. */
export function cleanSearch(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** `skip` / `take` d'une page ; rien pour `'all'`. */
export function skipTake(page: PageRequest): { skip?: number; take?: number } {
  if (page === 'all') return {};
  return { skip: (page.page - 1) * page.limit, take: page.limit };
}

/** Pagination en mémoire d'une liste déjà filtrée et triée. */
export function paginate<T>(items: T[], page: PageRequest): Paged<T> {
  if (page === 'all') return { items, total: items.length, page: 1, limit: items.length };
  const start = (page.page - 1) * page.limit;
  return { items: items.slice(start, start + page.limit), total: items.length, page: page.page, limit: page.limit };
}

/** Page rendue à partir d'un total connu côté serveur. */
export function pagedResult<T>(items: T[], total: number, page: PageRequest): Paged<T> {
  if (page === 'all') return { items, total, page: 1, limit: total };
  return { items, total, page: page.page, limit: page.limit };
}
