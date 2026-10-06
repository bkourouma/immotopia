/**
 * Équipe de l'agence (membres, rôles, salariés, paie) et facturation plateforme.
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

export async function seedEquipe(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  ctx.log('seedEquipe : à écrire');
}

/** Facturation plateforme (factures d'abonnement, paiements, usage) : appelée EN DERNIER. */
export async function seedFacturationPlateforme(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  ctx.log('seedFacturationPlateforme : à écrire');
}
