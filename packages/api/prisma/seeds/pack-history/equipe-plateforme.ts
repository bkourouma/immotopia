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
 *
 * Deux temps :
 *  - `seedEquipe` (AVANT les modules) : membres, invitations, menus par rôle,
 *    pour que les modules attribuent leurs écritures à plusieurs personnes ;
 *  - `seedFacturationPlateforme` (EN DERNIER) : paie des salariés de chantier,
 *    facturation de la plateforme (factures, paiements, extensions, usage,
 *    alertes) puis journal d'activité, qui a besoin des objets de tous les
 *    modules déjà créés.
 */
import { runWithTenantContext } from '../../../src/utils/tenant-context';
import { neutralizeOutbound } from './types';
import type { HistoryContext } from './types';
import { detectPack, seedTeam } from './equipe-plateforme-team';
import { seedPayroll } from './equipe-plateforme-payroll';
import { seedAuditJournal, seedNotificationMarkers } from './equipe-plateforme-audit';
import { seedPlatformBilling } from './equipe-plateforme-billing';

export async function seedEquipe(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  neutralizeOutbound();
  const pack = await detectPack(ctx);
  if (!pack) {
    ctx.log('équipe : aucun pack souscrit, ignorée.');
    return;
  }
  await runWithTenantContext({ tenantId: ctx.tenantId, userId: ctx.adminUserId }, () => seedTeam(ctx, pack));
}

/** Facturation plateforme (factures d'abonnement, paiements, usage) : appelée EN DERNIER. */
export async function seedFacturationPlateforme(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  neutralizeOutbound();
  await runWithTenantContext({ tenantId: ctx.tenantId, userId: ctx.adminUserId }, async () => {
    await seedPayroll(ctx);
    await seedPlatformBilling(ctx);
    await seedAuditJournal(ctx);
    await seedNotificationMarkers(ctx);
  });
}
