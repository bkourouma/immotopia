/**
 * SYNDIC : données fausses ou maigres relevées par la recette (quotes-parts de lots, statuts d'appels, programmations, contacts).
 *
 * 2e vague (recette « aucun écran vide » des comptes « 3 ans »). Ne s'exécute que pour le
 * profil 3y ; IDEMPOTENT PAR BLOC ; règles de `types.ts` ; fichiers réels via `seed-files.ts`.
 */
import type { HistoryContext } from './types';

export async function seedSyndicFixes(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  ctx.log('seedSyndicFixes : à écrire');
}
