import { useEffect, useMemo, useState } from 'react';
import { MORE_TAB_HREF } from '../navigation/model';
import type { NavGroup, PersonaNav } from '../navigation/model';
import { menuKeyFor } from '../navigation/menu-catalog';
import type { PersonaId } from '../navigation/model';
import { getMyDisabledMenus } from '../services/role-menu-service';

/**
 * Menus coupés pour la personne connectée, et navigation filtrée.
 *
 * L'écran « Rôles et permissions » ne serait qu'une déclaration d'intention si
 * la coquille n'en tenait pas compte. Ce hook fait le lien : il demande au
 * serveur les clés de menu coupées, puis élague l'arbre du persona.
 *
 * Deux garde-fous :
 *
 *   - **Tant que la réponse n'est pas arrivée, rien n'est coupé.** Masquer par
 *     défaut ferait clignoter un menu amputé à chaque chargement, pour tout le
 *     monde, y compris quand aucune restriction n'existe.
 *   - **Un échec réseau ne restreint pas.** Une API injoignable ne doit pas se
 *     traduire par une application qui perd la moitié de sa navigation ; c'est
 *     le contraire d'un mode dégradé utilisable.
 */
export function useDisabledMenuKeys(tenantId?: string | null): Set<string> {
  const [disabled, setDisabled] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;

    getMyDisabledMenus(tenantId)
      .then(keys => {
        if (!cancelled) setDisabled(new Set(keys));
      })
      .catch(() => {
        if (!cancelled) setDisabled(new Set());
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return disabled;
}

/**
 * Élague un groupe de navigation.
 *
 * Renvoie `null` quand le groupe entier disparaît — soit qu'il ait été coupé
 * lui-même, soit qu'il n'ait plus aucune sous-entrée alors qu'il en avait. Un
 * accordéon vide est pire qu'une entrée absente : il promet un contenu qui
 * n'existe plus.
 */
function pruneGroup(persona: PersonaId, group: NavGroup, disabled: Set<string>): NavGroup | null {
  if (disabled.has(menuKeyFor(persona, group.key))) return null;

  if (!group.children || group.children.length === 0) return group;

  const children = group.children.filter(leaf => !disabled.has(menuKeyFor(persona, group.key, leaf.key)));
  if (children.length === 0) return null;

  return { ...group, children };
}

/**
 * Navigation du persona, privée des entrées coupées pour cette personne.
 *
 * Les onglets du bas sont filtrés par destination et non par clé : ce sont des
 * raccourcis vers des entrées de l'arbre, ils portent leurs propres clés
 * (`tab-biens`) qui ne sont pas des menus réglables. « Plus » survit toujours,
 * c'est un déclencheur d'interface, pas une destination.
 */
export function useFilteredNavigation(nav: PersonaNav | null, disabled: Set<string>): PersonaNav | null {
  return useMemo(() => {
    if (!nav) return null;
    if (disabled.size === 0) return nav;

    const tree = nav.tree
      .map(group => pruneGroup(nav.id, group, disabled))
      .filter((group): group is NavGroup => group !== null);

    const remainingHrefs = new Set<string>();
    for (const group of tree) {
      if (group.href) remainingHrefs.add(group.href);
      for (const leaf of group.children ?? []) remainingHrefs.add(leaf.href);
    }

    const tabs = nav.tabs.filter(tab => tab.href === MORE_TAB_HREF || remainingHrefs.has(tab.href));

    return { ...nav, tree, tabs };
  }, [nav, disabled]);
}
