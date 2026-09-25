import type { NavFeature, NavGroup, NavLeaf } from './model';

/**
 * Accès aux fonctionnalités d'abonnement, vu du menu (vague 2 des abonnements).
 *
 * Miroir de `packages/api/src/lib/subscription/features.ts` et
 * `feature-access.ts` : une fonctionnalité est ouverte si UN des modules qui
 * la portent est complet ; à défaut, elle est en lecture seule si l'un d'eux
 * a été retiré (D11) ; sinon elle n'est pas comprise dans l'abonnement.
 * Le serveur reste juge : ce calcul ne sert qu'à ne pas montrer une porte
 * fermée.
 */

export type ModuleAccessLevel = 'FULL' | 'READ_ONLY' | 'NONE';
export type ModuleKey = 'MODULE_AGENCY' | 'MODULE_SYNDIC' | 'MODULE_PROMOTER';
export type FeatureAccessMap = Record<NavFeature, ModuleAccessLevel>;

const FEATURES: readonly NavFeature[] = ['CORE', 'CRM', 'SALES', 'RENTAL', 'PATRIMOINE', 'SYNDIC', 'CONSTRUCTION'];

export const MODULE_FEATURES: Readonly<Record<ModuleKey, readonly NavFeature[]>> = {
  MODULE_AGENCY: ['CORE', 'CRM', 'SALES', 'RENTAL', 'PATRIMOINE'],
  MODULE_SYNDIC: ['CORE', 'SYNDIC'],
  MODULE_PROMOTER: ['CORE', 'CRM', 'SALES', 'PATRIMOINE', 'CONSTRUCTION']
};

/** Niveau d'accès de chaque fonctionnalité, depuis `entitlements.moduleAccess`. */
export function featureAccessFromModules(
  moduleAccess: Partial<Record<string, ModuleAccessLevel>> | null | undefined
): FeatureAccessMap {
  const result = {} as FeatureAccessMap;
  for (const feature of FEATURES) {
    const providers = (Object.keys(MODULE_FEATURES) as ModuleKey[]).filter(m => MODULE_FEATURES[m].includes(feature));
    const levels = providers.map(m => moduleAccess?.[m] ?? 'NONE');
    result[feature] = levels.includes('FULL') ? 'FULL' : levels.includes('READ_ONLY') ? 'READ_ONLY' : 'NONE';
  }
  return result;
}

/**
 * Élague un groupe selon l'abonnement : entrée non comprise retirée, entrée
 * d'un module retiré marquée `readOnly`. `null` quand le groupe disparaît.
 * Un groupe dont la destination propre a disparu pointe vers son premier
 * enfant restant (le groupe CRM garde « Contacts » sans son tableau de bord).
 */
export function applyFeatureAccess(group: NavGroup, access: FeatureAccessMap): NavGroup | null {
  const groupLevel = access[group.feature ?? 'CORE'];
  if (groupLevel === 'NONE') return null;

  if (!group.children || group.children.length === 0) {
    return groupLevel === 'READ_ONLY' ? { ...group, readOnly: true } : group;
  }

  const children: NavLeaf[] = [];
  for (const leaf of group.children) {
    const level = access[leaf.feature ?? group.feature ?? 'CORE'];
    if (level === 'NONE') continue;
    children.push(level === 'READ_ONLY' ? { ...leaf, readOnly: true } : leaf);
  }
  if (children.length === 0) return null;

  const original = group.children;
  const unchanged = children.length === original.length && children.every((c, i) => c === original[i]);
  if (unchanged && groupLevel === 'FULL') return group;

  const href = group.href && !children.some(c => c.href === group.href) ? children[0].href : group.href;
  return {
    ...group,
    href,
    children,
    readOnly: groupLevel === 'READ_ONLY' || children.every(c => c.readOnly) ? true : undefined
  };
}
