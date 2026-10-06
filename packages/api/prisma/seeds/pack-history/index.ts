/**
 * Assemble les générateurs d'historique selon le pack de l'agence de test.
 * INTEGRE = agence + syndic + promoteur (les trois modules de l'opérateur).
 *
 * Ordre : l'équipe d'abord (les écritures suivantes peuvent être attribuées à
 * plusieurs membres), puis chaque module et ses compléments « 3 ans »
 * (`*-extras`, `agence-commercial`, `agence-locatif`), puis la finance transverse
 * et la facturation de la plateforme. Les compléments sont idempotents par bloc et ne font rien au
 * profil 6 mois.
 */
import { PACK } from '../../../src/lib/subscription/catalog';
import type { HistoryContext, HistorySeeder } from './types';
import { seedAgenceHistory } from './agence';
import { seedAgenceCommercial } from './agence-commercial';
import { seedAgenceLocatif } from './agence-locatif';
import { seedSyndicHistory } from './syndic';
import { seedSyndicExtras } from './syndic-extras';
import { seedPromoteurHistory } from './promoteur';
import { seedPromoteurExtras } from './promoteur-extras';
import { seedPatrimoineHistoryForPack } from './patrimoine';
import { seedPatrimoineExtras } from './patrimoine-extras';
import { seedEquipe, seedFacturationPlateforme } from './equipe-plateforme';
import { seedFinanceTransverse } from './finance-transverse';
import { seedAgencePatrimoine } from './agence-patrimoine';
import { seedPromoteurCommercial } from './promoteur-commercial';
import { seedSyndicFixes } from './syndic-fixes';
import { seedPatrimoineFixes } from './patrimoine-fixes';
import { seedCoreCommunication } from './core-communication';
import { seedFinanceGaps } from './finance-gaps';

const AGENCE_SEEDERS: HistorySeeder[] = [
  seedAgenceHistory,
  seedAgenceCommercial,
  seedAgenceLocatif,
  seedAgencePatrimoine
];
const SYNDIC_SEEDERS: HistorySeeder[] = [seedSyndicHistory, seedSyndicExtras, seedSyndicFixes];
const PROMOTEUR_SEEDERS: HistorySeeder[] = [seedPromoteurHistory, seedPromoteurExtras, seedPromoteurCommercial];

function patrimoineSeeders(pack: 'PATRIMOINE_ESSENTIEL' | 'PATRIMOINE_PRO'): HistorySeeder[] {
  async function seedPatrimoineBase(ctx: HistoryContext): Promise<void> {
    await seedPatrimoineHistoryForPack(ctx, pack);
  }
  async function seedPatrimoineComplements(ctx: HistoryContext): Promise<void> {
    await seedPatrimoineExtras(ctx, pack);
  }
  async function seedPatrimoineCorrectifs(ctx: HistoryContext): Promise<void> {
    await seedPatrimoineFixes(ctx, pack);
  }
  return [seedPatrimoineBase, seedPatrimoineComplements, seedPatrimoineCorrectifs];
}

function modulesForPack(pack: string): HistorySeeder[] {
  switch (pack) {
    case PACK.AGENCE:
      return AGENCE_SEEDERS;
    case PACK.SYNDIC:
      return SYNDIC_SEEDERS;
    case PACK.PROMOTEUR:
      return PROMOTEUR_SEEDERS;
    case PACK.INTEGRE:
      return [...AGENCE_SEEDERS, ...SYNDIC_SEEDERS, ...PROMOTEUR_SEEDERS];
    case PACK.PATRIMOINE_ESSENTIEL:
      return patrimoineSeeders('PATRIMOINE_ESSENTIEL');
    case PACK.PATRIMOINE_PRO:
      return patrimoineSeeders('PATRIMOINE_PRO');
    default:
      return [];
  }
}

export function historySeedersForPack(pack: string): HistorySeeder[] {
  const modules = modulesForPack(pack);
  if (modules.length === 0) return [];
  return [
    seedEquipe,
    ...modules,
    seedCoreCommunication,
    seedFinanceTransverse,
    seedFinanceGaps,
    seedFacturationPlateforme
  ];
}

export { buildContext, neutralizeOutbound } from './types';
