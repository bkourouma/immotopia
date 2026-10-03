/**
 * Assemble les générateurs d'historique selon le pack de l'agence de test.
 * INTEGRE = agence + syndic + promoteur (les trois modules de l'opérateur).
 */
import { PACK } from '../../../src/lib/subscription/catalog';
import type { HistoryContext, HistorySeeder } from './types';
import { seedAgenceHistory } from './agence';
import { seedSyndicHistory } from './syndic';
import { seedPromoteurHistory } from './promoteur';
import { seedPatrimoineHistoryForPack } from './patrimoine';

export function historySeedersForPack(pack: string): HistorySeeder[] {
  switch (pack) {
    case PACK.AGENCE:
      return [seedAgenceHistory];
    case PACK.SYNDIC:
      return [seedSyndicHistory];
    case PACK.PROMOTEUR:
      return [seedPromoteurHistory];
    case PACK.INTEGRE:
      return [seedAgenceHistory, seedSyndicHistory, seedPromoteurHistory];
    case PACK.PATRIMOINE_ESSENTIEL:
      return [(ctx: HistoryContext) => seedPatrimoineHistoryForPack(ctx, 'PATRIMOINE_ESSENTIEL')];
    case PACK.PATRIMOINE_PRO:
      return [(ctx: HistoryContext) => seedPatrimoineHistoryForPack(ctx, 'PATRIMOINE_PRO')];
    default:
      return [];
  }
}

export { buildContext, neutralizeOutbound } from './types';
