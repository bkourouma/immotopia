/**
 * PROMOTEUR : CRM, ventes de lots, biens publiés, visites, maintenance, patrimoine des lots basculés.
 *
 * 2e vague (recette « aucun écran vide » des comptes « 3 ans »). Ne s'exécute que pour le
 * profil 3y ; IDEMPOTENT PAR BLOC ; règles de `types.ts` ; fichiers réels via `seed-files.ts`.
 */
import type { HistoryContext } from './types';

export async function seedPromoteurCommercial(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  ctx.log('seedPromoteurCommercial : à écrire');
}
