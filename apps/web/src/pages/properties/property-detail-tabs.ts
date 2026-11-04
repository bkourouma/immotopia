/**
 * Règles des onglets de la fiche d'un bien : cycle de vie des onglets et
 * nettoyage de l'URL au changement d'onglet.
 */

/** Onglets qui restent montés une fois ouverts (formulaire en ligne : planifier une visite). */
export const PROPERTY_KEEP_MOUNTED_TABS: readonly string[] = ['visites'];

/** Préfixes des listes intégrées dans les onglets (lots, maintenance, visites, sinistres…). */
export const PROPERTY_TAB_PARAM_PREFIXES: readonly string[] = [
  'lot.',
  'mnt.',
  'vis.',
  'sin.',
  'val.',
  'dep.',
  'cre.',
  'trv.',
  'doc.',
  'pdoc.'
];

/** Clés isolées posées par un onglet (rubrique de l'onglet patrimoine). */
export const PROPERTY_TAB_PARAM_KEYS: readonly string[] = ['rubrique'];

/** Pose `destroyOnHidden` par onglet : la prop globale de `<Tabs>` l'emporterait sur celle de l'item. */
export function withTabLifecycle<T extends { key: string; destroyOnHidden?: boolean }>(
  items: readonly T[],
  keepMounted: readonly string[] = PROPERTY_KEEP_MOUNTED_TABS
): T[] {
  return items.map(item => ({ ...item, destroyOnHidden: !keepMounted.includes(item.key) }));
}

/** Copie des paramètres avec le nouvel onglet, sans les paramètres propres aux autres onglets ; le reste est conservé. */
export function switchPropertyTab(previous: URLSearchParams, key: string): URLSearchParams {
  const next = new URLSearchParams();
  previous.forEach((value, name) => {
    const owned = PROPERTY_TAB_PARAM_KEYS.includes(name) || PROPERTY_TAB_PARAM_PREFIXES.some(p => name.startsWith(p));
    if (!owned) next.append(name, value);
  });
  next.set('onglet', key);
  return next;
}
