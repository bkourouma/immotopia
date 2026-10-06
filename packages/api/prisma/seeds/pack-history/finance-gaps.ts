/**
 * Trous de finance relevés par la recette : caisse, pièces à valider, facturation, balances clients, retenue et versements, diversité des statuts, soldes aberrants.
 *
 * 2e vague (recette « aucun écran vide » des comptes « 3 ans »). Ne s'exécute que pour le
 * profil 3y ; IDEMPOTENT PAR BLOC ; règles de `types.ts` ; fichiers réels via `seed-files.ts`.
 */
import type { HistoryContext } from './types';

export async function seedFinanceGaps(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  ctx.log('seedFinanceGaps : à écrire');
}
