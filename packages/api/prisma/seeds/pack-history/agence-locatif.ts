/**
 * Compléments AGENCE, volet locatif et trésorerie : états des lieux, événements de bail, reversements, retenues, documents locatifs, caisse, factures.
 *
 * Complète l'historique du profil « 3 ans » : après 36 mois d'usage, aucun écran
 * du module ne doit être vide. Ne s'exécute que pour le profil 3y.
 *
 * Règles : voir `types.ts` (dates relatives, hasard seedé, aucun envoi sortant,
 * `tenantId` partout) ; IDEMPOTENT PAR BLOC (un bloc dont les lignes existent
 * déjà sur le tenant est sauté, pour compléter une agence déjà peuplée sans
 * purge) ; fichiers réels via `seed-files.ts`.
 */
import type { HistoryContext } from './types';

export async function seedAgenceLocatif(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  ctx.log('seedAgenceLocatif : à écrire');
}
