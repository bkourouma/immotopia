/**
 * AGENCE / INTEGRE : patrimoine des biens propres de l'agence, prestataires de maintenance, échéances à venir, relevés propriétaires sur 36 mois, identité des documents.
 *
 * 2e vague (recette « aucun écran vide » des comptes « 3 ans »). Ne s'exécute que pour le
 * profil 3y ; IDEMPOTENT PAR BLOC ; règles de `types.ts` ; fichiers réels via `seed-files.ts`.
 */
import type { HistoryContext } from './types';

export async function seedAgencePatrimoine(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  ctx.log('seedAgencePatrimoine : à écrire');
}
