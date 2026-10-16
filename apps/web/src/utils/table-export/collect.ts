/** Plafond de lignes d'un export : au-delà, l'onglet et le fichier deviennent ingérables. */
export const EXPORT_MAX_ROWS = 10_000;

export interface CollectOptions {
  /** Taille de page demandée au serveur. 100 par défaut. */
  limit?: number;
  /** Plafond de lignes. 10 000 par défaut. */
  maxRows?: number;
}

export interface CollectedPages<T> {
  items: T[];
  total: number;
  /** Vrai si le plafond a coupé la collecte alors qu'il restait des lignes. */
  truncated: boolean;
}

/**
 * Parcourt toutes les pages d'une liste paginée par le serveur.
 *
 * S'arrête au total annoncé, à une page vide ou au plafond. Le plafond est
 * signalé par `truncated` pour que l'appelant avertisse l'utilisateur.
 */
export async function collectAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<{ items: T[]; total: number }>,
  opts: CollectOptions = {}
): Promise<CollectedPages<T>> {
  const limit = Math.max(1, opts.limit ?? 100);
  const maxRows = Math.max(1, opts.maxRows ?? EXPORT_MAX_ROWS);
  const items: T[] = [];
  let total = 0;
  let truncated = false;

  for (let page = 1; ; page += 1) {
    const result = await fetchPage(page, limit);
    if (!result.items || result.items.length === 0) break;
    total = Number.isFinite(result.total) && result.total > 0 ? result.total : 0;
    items.push(...result.items);

    if (items.length >= maxRows) {
      // Coupé seulement s'il restait des lignes (total inconnu : on suppose que oui).
      truncated = total === 0 ? true : total > maxRows;
      if (items.length > maxRows) items.length = maxRows;
      break;
    }
    if (total > 0 && items.length >= total) break;
  }

  return { items, total: total || items.length, truncated };
}
