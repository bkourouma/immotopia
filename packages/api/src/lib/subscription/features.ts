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
 * - CONSTRUCTION: Promoteur (chantiers, BTP, stock) ;
 * - SYNDIC_LIVE : OPTION du pack Syndic (decision du 12/11) : AG en direct et visio.
 *                 Aucun module ne l'ouvre : elle vient de l'extension EXT_AG_EN_DIRECT ou du
 *                 pack Integre, et suppose le module Syndic (`OPTION_PROVIDERS`).
 */

import { EXTENSION, PACK, type ModuleKeyCode } from './catalog';

export type Feature = 'CORE' | 'CRM' | 'SALES' | 'RENTAL' | 'PATRIMOINE' | 'SYNDIC' | 'CONSTRUCTION' | 'SYNDIC_LIVE';

export const FEATURES: readonly Feature[] = [
  'CORE',
  'CRM',
  'SALES',
  'RENTAL',
  'PATRIMOINE',
  'SYNDIC',
  'CONSTRUCTION',
  'SYNDIC_LIVE'
];

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

/** Fonctionnalite d'option : ouverte par un pack ou une extension, jamais par un module seul. */
export interface OptionProvider {
  /** Fonctionnalite de base requise (le module doit etre pleinement ouvert). */
  requires: Feature;
  /** Packs qui l'incluent d'office. */
  packs: readonly string[];
  /** Extensions qui l'ouvrent. */
  extensions: readonly string[];
}

export const OPTION_PROVIDERS: Readonly<Partial<Record<Feature, OptionProvider>>> = {
  SYNDIC_LIVE: { requires: 'SYNDIC', packs: [PACK.INTEGRE], extensions: [EXTENSION.AG_EN_DIRECT] }
};

/** Vrai pour une fonctionnalite d'option (pas ouverte par un module). */
export function isOptionFeature(feature: Feature): boolean {
  return feature in OPTION_PROVIDERS;
}

/**
 * Fonctionnalites d'option ouvertes par les elements en vigueur, a condition que la
 * fonctionnalite de base soit presente dans `baseFeatures`. Resultat dans l'ordre de FEATURES.
 */
export function withOptionFeatures(
  baseFeatures: readonly string[],
  items: readonly { code: string; kind: 'PACK' | 'EXTENSION' | 'SETUP' }[]
): Feature[] {
  const set = new Set<string>(baseFeatures);
  for (const [feature, provider] of Object.entries(OPTION_PROVIDERS) as Array<[Feature, OptionProvider]>) {
    if (!set.has(provider.requires)) continue;
    const granted = items.some(
      item =>
        (item.kind === 'PACK' && provider.packs.includes(item.code)) ||
        (item.kind === 'EXTENSION' && provider.extensions.includes(item.code))
    );
    if (granted) set.add(feature);
  }
  return FEATURES.filter(f => set.has(f));
}
