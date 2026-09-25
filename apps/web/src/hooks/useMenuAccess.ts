import { useEffect, useMemo, useState } from 'react';
import { MORE_TAB_HREF } from '../navigation/model';
import type { NavGroup, PersonaNav } from '../navigation/model';
import { isMenuKeyDisabled, menuKeyFor } from '../navigation/menu-catalog';
import type { PersonaId } from '../navigation/model';
import { getMyDisabledMenus } from '../services/role-menu-service';
import { getMenuEntitlements } from '../services/entitlements-service';
import { applyFeatureAccess, featureAccessFromModules } from '../navigation/feature-access';
import type { FeatureAccessMap } from '../navigation/feature-access';

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
 * Accès aux fonctionnalités d'abonnement de l'agence (vague 2 des
 * abonnements), ou `null` quand le menu ne doit pas en tenir compte.
 *
 * Mêmes garde-fous que les menus coupés : rien n'est masqué avant la réponse,
 * et un échec réseau ne restreint pas. En plus :
 *
 *   - le menu ne suit l'abonnement que si le serveur l'applique
 *     (`SUBSCRIPTION_ENFORCEMENT=enforce`). En `warn`, l'API laisse tout
 *     passer : masquer une entrée qui fonctionne serait mentir ;
 *   - `enabled` à faux (super-admin, portails) : aucun appel.
 *
 * Import statique : ce hook ne vit que dans la coquille, chunk paresseux ; un
 * `import()` de plus alourdirait la table de préchargement du chunk d'entrée.
 */
export function useFeatureAccess(tenantId: string | null | undefined, enabled: boolean): FeatureAccessMap | null {
  const [access, setAccess] = useState<FeatureAccessMap | null>(null);

  useEffect(() => {
    setAccess(null);
    if (!enabled || !tenantId) return;
    let cancelled = false;

    getMenuEntitlements(tenantId)
      .then(entitlements => {
        if (cancelled) return;
        setAccess(entitlements?.enforcement === 'enforce' ? featureAccessFromModules(entitlements.moduleAccess) : null);
      })
      .catch(() => {
        if (!cancelled) setAccess(null);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId, enabled]);

  return access;
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
  // `isMenuKeyDisabled` et non `disabled.has` : une entrée issue d'une
  // réorganisation du menu hérite des coupures posées sur ses anciennes clés.
  if (isMenuKeyDisabled(menuKeyFor(persona, group.key), disabled)) return null;

  if (!group.children || group.children.length === 0) return group;

  const children = group.children.filter(
    leaf => !isMenuKeyDisabled(menuKeyFor(persona, group.key, leaf.key), disabled)
  );
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
export function useFilteredNavigation(
  nav: PersonaNav | null,
  disabled: Set<string>,
  featureAccess: FeatureAccessMap | null = null
): PersonaNav | null {
  return useMemo(() => {
    if (!nav) return null;
    if (disabled.size === 0 && !featureAccess) return nav;

    // Abonnement puis rôle : une entrée non comprise disparaît, une entrée
    // d'un module retiré est marquée « Lecture seule » (voir feature-access).
    const tree = nav.tree
      .map(group => (featureAccess ? applyFeatureAccess(group, featureAccess) : group))
      .filter((group): group is NavGroup => group !== null)
      .map(group => pruneGroup(nav.id, group, disabled))
      .filter((group): group is NavGroup => group !== null);

    const remainingHrefs = new Set<string>();
    for (const group of tree) {
      if (group.href) remainingHrefs.add(group.href);
      for (const leaf of group.children ?? []) remainingHrefs.add(leaf.href);
    }

    const tabs = nav.tabs.filter(tab => tab.href === MORE_TAB_HREF || remainingHrefs.has(tab.href));

    return { ...nav, tree, tabs };
  }, [nav, disabled, featureAccess]);
}
