import { useCallback, useEffect, useRef, useState } from 'react';
import type { SearchCriterion, SearchOption, SearchValues } from '../../../utils/list-search/types';
import { isActiveValue } from '../../../utils/list-search/filter';
import { cacheKey, knownOptionLabel } from './format';

/**
 * Mémoire des libellés d'options vus par la barre.
 *
 * Deux sources la remplissent : les options rendues par `loadOptions` (le
 * contrôle les déclare via `remember`) et `resolveLabel`, appelé UNE fois par
 * valeur de `select` venue de l'URL dont le libellé est inconnu. Les puces et
 * les champs s'en servent pour afficher « Villa Angré » plutôt que l'id.
 *
 * `resolveLabel` est lu dans une ref (toujours la dernière fonction reçue) :
 * l'identité de la fonction ne relance jamais l'appel, seule une valeur
 * nouvelle à résoudre le fait. Une identité qui change (nouvelle agence) n'a
 * donc pas à être redemandée par la barre.
 */
export function useOptionLabels(criteria: readonly SearchCriterion[], values: SearchValues) {
  const [cache, setCache] = useState<Record<string, string>>({});
  const criteriaRef = useRef(criteria);
  criteriaRef.current = criteria;
  const tried = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const remember = useCallback((key: string, options: readonly SearchOption[]) => {
    if (!mounted.current) return;
    setCache(previous => {
      let next = previous;
      for (const option of options) {
        const id = cacheKey(key, option.value);
        if (previous[id] !== option.label) {
          if (next === previous) next = { ...previous };
          next[id] = option.label;
        }
      }
      return next;
    });
  }, []);

  // Valeurs de `select` à résoudre : actives, libellé inconnu, jamais essayées.
  const pending: Array<{ key: string; value: string }> = [];
  for (const criterion of criteria) {
    if (criterion.type !== 'select' || !criterion.resolveLabel) continue;
    const value = values[criterion.key];
    if (typeof value !== 'string' || !isActiveValue(value)) continue;
    if (knownOptionLabel(criterion, value, cache) !== undefined) continue;
    if (tried.current.has(cacheKey(criterion.key, value))) continue;
    pending.push({ key: criterion.key, value });
  }
  const signature = pending.map(item => cacheKey(item.key, item.value)).join('|');

  useEffect(() => {
    for (const item of pending) {
      const id = cacheKey(item.key, item.value);
      if (tried.current.has(id)) continue;
      tried.current.add(id);
      const criterion = criteriaRef.current.find(c => c.key === item.key);
      if (!criterion || criterion.type !== 'select' || !criterion.resolveLabel) continue;
      Promise.resolve()
        .then(() => criterion.resolveLabel?.(item.value))
        .then(label => {
          if (label) remember(item.key, [{ value: item.value, label }]);
        })
        .catch(() => {
          // Libellé introuvable : la puce garde la valeur brute.
        });
    }
    // `pending` découle de `signature` : c'est elle qui décide du relancement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, remember]);

  return { cache, remember };
}
