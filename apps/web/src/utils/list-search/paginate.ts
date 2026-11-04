/**
 * Découpe une liste en pages. La page demandée est ramenée dans [1, nombre de
 * pages] : une page devenue vide après filtrage rend la dernière page non vide.
 * Une liste vide a une seule page, vide. `pageSize` vaut au moins 1.
 */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): { items: T[]; page: number } {
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 1;
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const requested = Number.isFinite(page) ? Math.floor(page) : 1;
  const current = Math.min(Math.max(1, requested), pageCount);
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), page: current };
}
