/**
 * Fonctionnalites ouvertes par chaque module (table de verite de la vague 2 :
 * gardes de routes et menu web). Pure, sans acces base.
 *
 * Calque de la couverture fonctionnelle du site (pricing.ts, `coverageAll`) :
 * - CORE        : tous les modules (biens, contacts, documents, roles, audit,
 *                 tableaux de bord, maintenance, finance operationnelle,
 *                 communication) ;
 * - CRM, SALES  : Agence, Promoteur ;
 * - RENTAL      : Agence (baux, echeances, paiements, portails), Patrimoine
 *                 (gestion locative DIRECTE des biens detenus en propre : la
 *                 barriere « detenu en propre » de guards.ts refuse mandat et
 *                 proprietaire tiers a un compte qui n'a que ce module) ;
 * - PATRIMOINE  : Agence, Promoteur, Patrimoine ;
 *   Les packs Particulier (Gratuit, Plus) ouvrent MODULE_PATRIMOINE : memes
 *   fonctionnalites (CORE, RENTAL, PATRIMOINE), deduites de `modules` du pack ;
 * - SYNDIC      : Syndic ;
 * - CONSTRUCTION: Promoteur (chantiers, BTP, stock).
 */

import type { ModuleKeyCode } from './catalog';

export type Feature = 'CORE' | 'CRM' | 'SALES' | 'RENTAL' | 'PATRIMOINE' | 'SYNDIC' | 'CONSTRUCTION';

export const FEATURES: readonly Feature[] = ['CORE', 'CRM', 'SALES', 'RENTAL', 'PATRIMOINE', 'SYNDIC', 'CONSTRUCTION'];

export const MODULE_FEATURES: Readonly<Record<ModuleKeyCode, readonly Feature[]>> = {
  MODULE_AGENCY: ['CORE', 'CRM', 'SALES', 'RENTAL', 'PATRIMOINE'],
  MODULE_SYNDIC: ['CORE', 'SYNDIC'],
  MODULE_PROMOTER: ['CORE', 'CRM', 'SALES', 'PATRIMOINE', 'CONSTRUCTION'],
  MODULE_PATRIMOINE: ['CORE', 'RENTAL', 'PATRIMOINE']
};

/** Modules qui ouvrent une fonctionnalite (inverse de MODULE_FEATURES). */
export function modulesForFeature(feature: Feature): ModuleKeyCode[] {
  return (Object.keys(MODULE_FEATURES) as ModuleKeyCode[]).filter(m => MODULE_FEATURES[m].includes(feature));
}

/** Union des fonctionnalites des modules donnes, dans l'ordre de FEATURES. */
export function featuresForModules(modules: readonly string[]): Feature[] {
  const set = new Set<Feature>();
  for (const moduleKey of modules) {
    for (const feature of MODULE_FEATURES[moduleKey as ModuleKeyCode] ?? []) set.add(feature);
  }
  return FEATURES.filter(f => set.has(f));
}
