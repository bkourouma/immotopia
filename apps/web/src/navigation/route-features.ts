import type { FeatureAccessMap } from './feature-access';
import type { NavFeature } from './model';

/**
 * Fonctionnalité d'abonnement d'un écran d'agence, déduite de son adresse.
 *
 * Miroir web de `packages/api/src/lib/subscription/route-features.ts`, limité
 * aux fonctionnalités qui PEUVENT être absentes d'un pack (CRM, SALES, RENTAL,
 * PATRIMOINE, SYNDIC, CONSTRUCTION) : le socle n'est jamais refusé. Cette
 * table ne décide de rien seule — le niveau d'accès vient de
 * `featureAccessFromModules`, exactement comme le menu (une seule source de
 * vérité pour « ce module est-il souscrit ? »).
 *
 * Les préfixes sont relatifs à `/tenant/:tenantId` et s'entendent segment par
 * segment ; la règle la plus longue l'emporte (`patrimoine/statements` RENTAL
 * avant `patrimoine` PATRIMOINE, comme dans le menu).
 */
interface PathFeatureRule {
  prefix: string;
  feature: Exclude<NavFeature, 'CORE'>;
}

const RULES: readonly PathFeatureRule[] = [
  { prefix: 'crm/deals', feature: 'CRM' },
  { prefix: 'crm/activities', feature: 'CRM' },
  { prefix: 'crm/calendar', feature: 'CRM' },
  { prefix: 'crm/dashboard', feature: 'CRM' },
  { prefix: 'sales', feature: 'SALES' },
  { prefix: 'rental', feature: 'RENTAL' },
  { prefix: 'finance/owner-accounts', feature: 'RENTAL' },
  { prefix: 'finance/commissions', feature: 'RENTAL' },
  { prefix: 'patrimoine', feature: 'PATRIMOINE' },
  { prefix: 'patrimoine/statements', feature: 'RENTAL' },
  { prefix: 'syndics', feature: 'SYNDIC' },
  { prefix: 'finance/chantiers', feature: 'CONSTRUCTION' },
  { prefix: 'finance/tableau-de-bord-chantiers', feature: 'CONSTRUCTION' },
  { prefix: 'finance/baux-terrain', feature: 'CONSTRUCTION' },
  { prefix: 'finance/stock', feature: 'CONSTRUCTION' },
  { prefix: 'finance/salaires', feature: 'CONSTRUCTION' },
  { prefix: 'finance/tacherons', feature: 'CONSTRUCTION' },
  { prefix: 'finance/retenues', feature: 'CONSTRUCTION' },
  { prefix: 'finance/bons-de-commande', feature: 'CONSTRUCTION' },
  { prefix: 'finance/pieces-de-caisse', feature: 'CONSTRUCTION' },
  { prefix: 'finance/associations', feature: 'CONSTRUCTION' }
];

/** Segments de `/tenant/:tenantId/<reste>` ; `null` hors des écrans d'agence. */
function agencySegments(pathname: string): string[] | null {
  const parts = pathname.split(/[?#]/)[0].split('/').filter(Boolean);
  // `/tenant/<id>/...` : `/tenant` seul ou `/tenant/payments` sont le portail locataire.
  if (parts[0] !== 'tenant' || parts.length < 3) return null;
  return parts.slice(2);
}

/** Fonctionnalité requise par l'adresse, ou `null` (socle, portail, inconnue). */
export function featureForAgencyPath(pathname: string): Exclude<NavFeature, 'CORE'> | null {
  const segments = agencySegments(pathname);
  if (!segments) return null;
  let best: PathFeatureRule | null = null;
  let bestLength = 0;
  for (const rule of RULES) {
    const ruleSegments = rule.prefix.split('/');
    if (ruleSegments.length <= bestLength || segments.length < ruleSegments.length) continue;
    if (ruleSegments.every((segment, i) => segment === segments[i])) {
      best = rule;
      bestLength = ruleSegments.length;
    }
  }
  return best?.feature ?? null;
}

/**
 * Vrai quand l'écran demandé relève d'une fonctionnalité que l'abonnement ne
 * comprend pas (`NONE`). `access` nul (droits en cours de lecture, lecture
 * échouée, contrôle non appliqué) ne bloque jamais ; la lecture seule non plus.
 */
export function isAgencyPathNotIncluded(pathname: string, access: FeatureAccessMap | null): boolean {
  if (!access) return false;
  const feature = featureForAgencyPath(pathname);
  return feature !== null && access[feature] === 'NONE';
}
