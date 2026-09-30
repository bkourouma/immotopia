import { useEffect, useMemo, useState } from 'react';
import { MORE_TAB_HREF } from '../navigation/model';
import type { NavGroup, PersonaNav } from '../navigation/model';
import { isMenuKeyDisabled, menuKeyFor } from '../navigation/menu-catalog';
import type { PersonaId } from '../navigation/model';
import { getMyDisabledMenus } from '../services/role-menu-service';
import { getMenuEntitlements } from '../services/entitlements-service';
import { applyFeatureAccess, applyOwnAssetsOnly, featureAccessFromModules } from '../navigation/feature-access';
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
 * Un échec réseau ne restreint pas ; avant la réponse, la coquille ne montre
 * que le socle (`useFeatureAccessState`, BUG-010). En plus :
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
  return useFeatureAccessState(tenantId, enabled).access;
}

/** Droits du socle seul : ce que le menu montre pendant la lecture des droits. */
export const CORE_ONLY_ACCESS: FeatureAccessMap = {
  CORE: 'FULL',
  CRM: 'NONE',
  SALES: 'NONE',
  RENTAL: 'NONE',
  PATRIMOINE: 'NONE',
  SYNDIC: 'NONE',
  CONSTRUCTION: 'NONE'
};

/**
 * Comme `useFeatureAccess`, avec l'état de lecture. `loading` est vrai tant
 * que la réponse de CETTE agence n'est pas arrivée : le menu ne montre alors
 * que le socle (jamais d'entrée d'un module peut-être non souscrit, BUG-010),
 * alors que la garde de route, elle, n'attend que `access` (jamais de refus
 * prononcé sur des droits inconnus). Un échec de lecture met fin à
 * `loading` avec `access` nul : rien n'est restreint.
 */
export function useFeatureAccessState(
  tenantId: string | null | undefined,
  enabled: boolean
): { access: FeatureAccessMap | null; loading: boolean } {
  const [result, setResult] = useState<{ tenantId: string; access: FeatureAccessMap | null } | null>(null);

  useEffect(() => {
    if (!enabled || !tenantId) return;
    let cancelled = false;

    getMenuEntitlements(tenantId)
      .then(entitlements => {
        if (cancelled) return;
        setResult({
          tenantId,
          access: entitlements?.enforcement === 'enforce' ? featureAccessFromModules(entitlements.moduleAccess) : null
        });
      })
      .catch(() => {
        if (!cancelled) setResult({ tenantId, access: null });
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId, enabled]);

  const active = enabled && Boolean(tenantId);
  const current = active && result?.tenantId === tenantId ? result : null;
  return { access: current?.access ?? null, loading: active && !current };
}

/**
 * Barrière « détenu en propre » (pack Patrimoine seul, lot P1) : `true` quand
 * le serveur l'applique (`enforcement === 'enforce'`) et que le seul module
 * pleinement ouvert est MODULE_PATRIMOINE. Mêmes garde-fous que
 * `useFeatureAccess` : rien n'est masqué avant la réponse, un échec réseau ne
 * restreint pas, et `enabled` à faux évite tout appel.
 */
export function useOwnAssetsOnly(tenantId: string | null | undefined, enabled: boolean): boolean {
  const [ownAssetsOnly, setOwnAssetsOnly] = useState(false);

  useEffect(() => {
    setOwnAssetsOnly(false);
    if (!enabled || !tenantId) return;
    let cancelled = false;

    getMenuEntitlements(tenantId)
      .then(entitlements => {
        if (!cancelled)
          setOwnAssetsOnly(entitlements?.enforcement === 'enforce' && Boolean(entitlements.ownAssetsOnly));
      })
      .catch(() => {
        if (!cancelled) setOwnAssetsOnly(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId, enabled]);

  return ownAssetsOnly;
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
  featureAccess: FeatureAccessMap | null = null,
  ownAssetsOnly = false
): PersonaNav | null {
  return useMemo(() => {
    if (!nav) return null;
    if (disabled.size === 0 && !featureAccess && !ownAssetsOnly) return nav;

    // Abonnement, puis barrière « détenu en propre », puis rôle : une entrée
    // non comprise disparaît, une entrée réservée à la gestion pour un tiers
    // disparaît pour un compte Patrimoine seul, une entrée d'un module retiré
    // est marquée « Lecture seule » (voir feature-access).
    const tree = nav.tree
      .map(group => (featureAccess ? applyFeatureAccess(group, featureAccess) : group))
      .filter((group): group is NavGroup => group !== null)
      .map(group => applyOwnAssetsOnly(group, ownAssetsOnly))
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
  }, [nav, disabled, featureAccess, ownAssetsOnly]);
}
