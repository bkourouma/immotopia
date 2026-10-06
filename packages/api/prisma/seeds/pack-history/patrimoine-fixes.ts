/**
 * PATRIMOINE : correctifs et compléments de la recette (hypothèses de rendement en fractions, visites, prestataires, échéances à venir, prêts, polices, balance âgée…).
 *
 * 2e vague (recette « aucun écran vide » des comptes « 3 ans »). Ne s'exécute que pour le
 * profil 3y ; IDEMPOTENT PAR BLOC ; règles de `types.ts` ; fichiers réels via `seed-files.ts`.
 */
import type { HistoryContext } from './types';

export async function seedPatrimoineFixes(
  ctx: HistoryContext,
  pack: 'PATRIMOINE_ESSENTIEL' | 'PATRIMOINE_PRO'
): Promise<void> {
  if (ctx.profile !== '3y') return;
  ctx.log(`seedPatrimoineFixes (${pack}) : à écrire`);
}
