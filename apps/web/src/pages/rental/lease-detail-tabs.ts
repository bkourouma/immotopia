/**
 * Onglet actif de la fiche d'un bail, porté par l'URL (`?onglet=payments`),
 * comme la fiche d'un bien. Les autres paramètres (préfixes `ech`, `pai`,
 * `pen`, `doc` des listes intégrées) ne sont jamais touchés.
 */
export const LEASE_TAB_PARAM = 'onglet';

/** Onglet par défaut : les documents seuls pour une vente, les échéances sinon. */
export function defaultLeaseTab(isSaleOnly: boolean): string {
  return isSaleOnly ? 'documents' : 'installments';
}

/** Valide l'onglet demandé contre les onglets réellement présents ; repli sur le défaut. */
export function resolveLeaseTab(requested: string | null, availableKeys: readonly string[], fallback: string): string {
  return requested !== null && availableKeys.includes(requested) ? requested : fallback;
}

/** Copie des paramètres d'URL avec le nouvel onglet, tout le reste conservé. */
export function withLeaseTab(previous: URLSearchParams, key: string): URLSearchParams {
  const next = new URLSearchParams(previous);
  next.set(LEASE_TAB_PARAM, key);
  return next;
}

/**
 * Onglets qui restent montés une fois ouverts : ils portent un formulaire en
 * ligne dont la saisie serait perdue au changement d'onglet (mouvement de dépôt
 * de garantie). Les autres, à gros tableaux, sont démontés quand on les quitte.
 */
export const LEASE_KEEP_MOUNTED_TABS: readonly string[] = ['deposit'];

/**
 * Pose `destroyOnHidden` par onglet (la prop globale de `<Tabs>` l'emporterait
 * sur celle de l'item, d'où ce réglage item par item).
 */
export function withTabLifecycle<T extends { key: string; destroyOnHidden?: boolean }>(
  items: readonly T[],
  keepMounted: readonly string[] = LEASE_KEEP_MOUNTED_TABS
): T[] {
  return items.map(item => ({ ...item, destroyOnHidden: !keepMounted.includes(item.key) }));
}
