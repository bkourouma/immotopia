/**
 * Compléments transverses de FINANCE et de TRÉSORERIE (tous packs qui exposent
 * ces écrans) : factures clients, virements entre comptes de trésorerie,
 * reversements de taxes, pièces annulées, caisse, etc.
 *
 * Complète l'historique du profil « 3 ans » : après 36 mois d'usage, aucun écran
 * du module ne doit être vide. Ne s'exécute que pour le profil 3y.
 *
 * Règles : voir `types.ts` (dates relatives, hasard seedé, aucun envoi sortant,
 * `tenantId` partout) ; IDEMPOTENT PAR BLOC ; fichiers réels via `seed-files.ts`.
 * Exécuté APRÈS les modules du pack (il peut s'appuyer sur leurs baux,
 * factures et paiements).
 */
import type { HistoryContext } from './types';

export async function seedFinanceTransverse(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  ctx.log('seedFinanceTransverse : à écrire');
}
