/**
 * Compléments PATRIMOINE : dossier documentaire, sinistres, accès tiers,
 * gestion locative directe (états des lieux, événements de bail, documents,
 * dépôts, pénalités, déclarations, tickets), actifs et scénarios.
 *
 * Complète l'historique du profil « 3 ans » : après 36 mois d'usage, aucun écran
 * du module ne doit être vide. Ne s'exécute que pour le profil 3y.
 *
 * Règles : voir `types.ts` (dates relatives, hasard seedé, aucun envoi sortant,
 * `tenantId` partout) ; IDEMPOTENT PAR BLOC (un bloc dont les lignes existent
 * déjà sur le tenant est sauté, pour compléter une agence déjà peuplée sans
 * purge) ; fichiers réels via `seed-files.ts`.
 *
 * Les blocs vivent dans des fichiers annexes :
 *   patrimoine-extras-state.ts    état relu en base et geste « document de bien »
 *   patrimoine-extras-dossier.ts  pièces des biens, sinistres, entretien, foncier
 *   patrimoine-extras-bail.ts     baux : états des lieux, événements, documents…
 *   patrimoine-extras-pilotage.ts accès tiers, actifs, scénarios, fiscalité…
 */
import { neutralizeOutbound } from './types';
import type { HistoryContext } from './types';
import { loadState } from './patrimoine-extras-state';
import {
  alignTerrain,
  seedAssetDocuments,
  seedClaims,
  seedLand,
  seedMaintenanceLog,
  seedPatrimonyDocuments,
  seedPropertyDocuments
} from './patrimoine-extras-dossier';
import {
  seedDeclarations,
  seedDeposits,
  seedInspections,
  seedLeaseEvents,
  seedPaymentLinks,
  seedPenalties,
  seedRentalDocuments,
  seedStatusHistory,
  seedTickets
} from './patrimoine-extras-bail';
import {
  seedExternalAccess,
  seedExtraAssets,
  seedExtraLoans,
  seedIntermediateValuations,
  seedOwnerPortalSettings,
  seedRecurringExpenses,
  seedScenarios,
  seedYieldAndTax
} from './patrimoine-extras-pilotage';

export async function seedPatrimoineExtras(
  ctx: HistoryContext,
  pack: 'PATRIMOINE_ESSENTIEL' | 'PATRIMOINE_PRO'
): Promise<void> {
  if (ctx.profile !== '3y') return;
  neutralizeOutbound();
  const started = Date.now();
  const s = await loadState(ctx, pack);
  if (s.properties.length === 0) {
    ctx.log(`seedPatrimoineExtras (${pack}) : aucun bien, le générateur de base n'a pas tourné.`);
    return;
  }

  // Pilotage d'abord : actifs, dettes et charges alimentent les pièces et les scénarios.
  await seedExtraAssets(s);
  await seedExtraLoans(s);
  await seedRecurringExpenses(s);
  await seedIntermediateValuations(s);
  await seedYieldAndTax(s);
  await seedOwnerPortalSettings(s);

  // Gestion locative directe.
  await seedStatusHistory(s);
  await seedInspections(s);
  await seedDeposits(s);
  await seedLeaseEvents(s);
  await seedRentalDocuments(s);
  await seedPenalties(s);
  await seedDeclarations(s);
  await seedTickets(s);
  await seedPaymentLinks(s);

  // Dossier documentaire.
  await alignTerrain(s);
  await seedPropertyDocuments(s);
  await seedLand(s);
  await seedClaims(s);
  await seedMaintenanceLog(s);
  await seedPatrimonyDocuments(s);
  await seedAssetDocuments(s);

  // Accès tiers et scénarios : après les pièces et les dettes qu'ils référencent.
  await seedExternalAccess(s);
  await seedScenarios(s);

  ctx.log(`seedPatrimoineExtras (${pack}) terminé en ${Math.round((Date.now() - started) / 1000)} s.`);
}
