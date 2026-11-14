/**
 * Index des modules d'aide. FICHIER FIGE apres le lot 0 : les lots de contenu
 * n'ont pas a le modifier. Ils n'editent que `content/<module>/{routes,fr,en,ar}.ts`.
 *
 * - `routes.ts` est importe d'emblee (leger : motifs de route -> identifiants) ;
 * - `fr.ts`, `en.ts`, `ar.ts` sont charges a la demande par `import()`.
 */
import type { HelpEntry, HelpLanguage, HelpModule, HelpRoute } from '../types';
import { routes as locatifRoutes } from './locatif/routes';
import { routes as syndicRoutes } from './syndic/routes';
import { routes as financeRoutes } from './finance/routes';
import { routes as patrimoineRoutes } from './patrimoine/routes';
import { routes as commercialRoutes } from './commercial/routes';
import { routes as communicationRoutes } from './communication/routes';
import { routes as portailsRoutes } from './portails/routes';
import { routes as administrationRoutes } from './administration/routes';

export type HelpEntryLoader = () => Promise<{ default: HelpEntry[] }>;

export const HELP_MODULES: readonly HelpModule[] = [
  'locatif',
  'syndic',
  'finance',
  'patrimoine',
  'commercial',
  'communication',
  'portails',
  'administration'
];

/** Routes de tous les modules, chargees d'emblee. */
export const helpRoutes: readonly HelpRoute[] = [
  ...locatifRoutes,
  ...syndicRoutes,
  ...financeRoutes,
  ...patrimoineRoutes,
  ...commercialRoutes,
  ...communicationRoutes,
  ...portailsRoutes,
  ...administrationRoutes
];

/** Chargeurs paresseux : un fichier par module et par langue. */
export const helpLoaders: Record<HelpModule, Record<HelpLanguage, HelpEntryLoader>> = {
  locatif: {
    fr: () => import('./locatif/fr'),
    en: () => import('./locatif/en'),
    ar: () => import('./locatif/ar')
  },
  syndic: { fr: () => import('./syndic/fr'), en: () => import('./syndic/en'), ar: () => import('./syndic/ar') },
  finance: { fr: () => import('./finance/fr'), en: () => import('./finance/en'), ar: () => import('./finance/ar') },
  patrimoine: {
    fr: () => import('./patrimoine/fr'),
    en: () => import('./patrimoine/en'),
    ar: () => import('./patrimoine/ar')
  },
  commercial: {
    fr: () => import('./commercial/fr'),
    en: () => import('./commercial/en'),
    ar: () => import('./commercial/ar')
  },
  communication: {
    fr: () => import('./communication/fr'),
    en: () => import('./communication/en'),
    ar: () => import('./communication/ar')
  },
  portails: {
    fr: () => import('./portails/fr'),
    en: () => import('./portails/en'),
    ar: () => import('./portails/ar')
  },
  administration: {
    fr: () => import('./administration/fr'),
    en: () => import('./administration/en'),
    ar: () => import('./administration/ar')
  }
};
