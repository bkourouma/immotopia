import type { HelpRoute } from '../../types';

/** Motifs de route -> fiche de page du module « patrimoine ». */
export const routes: HelpRoute[] = [
  { pattern: '/tenant/:tenantId/patrimoine', helpId: 'patrimoine.accueil' },
  { pattern: '/tenant/:tenantId/patrimoine/performance', helpId: 'patrimoine.performance' },
  { pattern: '/tenant/:tenantId/patrimoine/work-programs', helpId: 'patrimoine.travaux' },
  { pattern: '/tenant/:tenantId/patrimoine/plan-tresorerie', helpId: 'patrimoine.tresorerie' },
  { pattern: '/tenant/:tenantId/patrimoine/valeur-nette', helpId: 'patrimoine.valeur-nette' },
  { pattern: '/tenant/:tenantId/patrimoine/actifs', helpId: 'patrimoine.actifs' },
  { pattern: '/tenant/:tenantId/patrimoine/actifs/:assetId', helpId: 'patrimoine.actif' },
  { pattern: '/tenant/:tenantId/patrimoine/projections', helpId: 'patrimoine.projections' },
  { pattern: '/tenant/:tenantId/patrimoine/entities', helpId: 'patrimoine.entites' },
  { pattern: '/tenant/:tenantId/patrimoine/entities/:entityId', helpId: 'patrimoine.entite' },
  { pattern: '/tenant/:tenantId/patrimoine/tax-parameters', helpId: 'patrimoine.fiscalite' },
  { pattern: '/tenant/:tenantId/patrimoine/statements', helpId: 'patrimoine.releves' },
  { pattern: '/tenant/:tenantId/patrimoine/statements/:id', helpId: 'patrimoine.releve' },
  { pattern: '/tenant/:tenantId/patrimoine/importation', helpId: 'patrimoine.importation' },
  { pattern: '/tenant/:tenantId/patrimoine/land', helpId: 'patrimoine.terrains' },
  { pattern: '/tenant/:tenantId/patrimoine/land/:regularizationId', helpId: 'patrimoine.terrain' },
  { pattern: '/tenant/:tenantId/patrimoine/claims', helpId: 'patrimoine.sinistres' },
  { pattern: '/tenant/:tenantId/patrimoine/external-access', helpId: 'patrimoine.acces-tiers' }
];
