/**
 * Fonctions du socle CORE absentes de certains packs : newsletters, modèles de documents, étiquettes, identité de l'agence.
 *
 * 2e vague (recette « aucun écran vide » des comptes « 3 ans »). Ne s'exécute que pour le
 * profil 3y ; IDEMPOTENT PAR BLOC ; règles de `types.ts` ; fichiers réels via `seed-files.ts`.
 */
import type { HistoryContext } from './types';

export async function seedCoreCommunication(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  ctx.log('seedCoreCommunication : à écrire');
}
