/**
 * AGENCE / INTEGRE : patrimoine des biens propres de l'agence, prestataires de maintenance, échéances à venir, relevés propriétaires sur 36 mois, identité des documents.
 *
 * 2e vague (recette « aucun écran vide » des comptes « 3 ans »). Ne s'exécute que pour le
 * profil 3y ; IDEMPOTENT PAR BLOC ; règles de `types.ts` ; fichiers réels via `seed-files.ts`.
 *
 * Blocs, dans l'ordre des dépendances (débogage : `PATRIMOINE_BLOCKS=baux,emission` limite l'exécution) :
 *   baux         baux des biens propres (actifs, renouvelés, suspendu, brouillon) par les vrais services
 *   emission     campagne de facturation : échéances du mois en cours et du suivant « À payer »
 *   prestataires prestataires de maintenance (source de vérité `service_providers`) et tickets confiés
 *   vendus       mandats de vente honorés : les biens vendus restent visibles dans la liste des biens
 *   releves      relevés propriétaires des 36 mois et leurs reversements
 *   patrimoine   actifs, valorisations, prêts, dépenses, travaux, fiscalité, hypothèses de rendement, plan de trésorerie
 *   assurances   polices (actives, expirées), sinistres de tous statuts, carnet d'entretien, régularisation foncière
 *   portails     portails propriétaire et locataire ouverts, avec de vrais comptes de connexion
 *   crm          dates de gain et de conversion réparties sur l'histoire (tableau de bord CRM)
 */
import { neutralizeOutbound } from './types';
import type { HistoryContext } from './types';
import { loadOwnState, runBlock } from './agence-patrimoine-state';
import { seedOwnLeases } from './agence-patrimoine-leases';
import { seedBillingEmission } from './agence-patrimoine-billing';
import { seedVendorProviders } from './agence-patrimoine-vendors';
import { fixSoldVisibility, spreadCrmDates } from './agence-patrimoine-donnees';
import { seedOldStatementPayouts, seedStatements36 } from './agence-patrimoine-statements';
import { seedPortalAccounts } from './agence-patrimoine-portals';
import { buildProfiles } from './agence-patrimoine-profile';
import type { Profile } from './agence-patrimoine-profile';
import {
  seedAssetsAndValuations,
  seedOwnExpenses,
  seedOwnLoans,
  seedOwnWorks,
  seedTaxYieldAndCashPlan
} from './agence-patrimoine-finance';
import { seedOwnClaims, seedOwnLand, seedOwnMaintenanceLog, seedOwnPolicies } from './agence-patrimoine-dossier';

export async function seedAgencePatrimoine(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  const { prisma, tenantId, log } = ctx;
  if ((await prisma.property.count({ where: { tenantId } })) === 0) {
    log('agence patrimoine : aucun bien sur ce tenant, rien à compléter.');
    return;
  }
  neutralizeOutbound();
  const only = process.env.PATRIMOINE_BLOCKS?.split(',').map(s => s.trim());
  const started = Date.now();
  const o = await loadOwnState(ctx);
  log(`agence patrimoine : ${o.own.length} bien(s) propre(s) de l'agence.`);

  await runBlock(ctx, only, 'baux', () => seedOwnLeases(o));
  await runBlock(ctx, only, 'emission', () => seedBillingEmission(ctx));
  await runBlock(ctx, only, 'prestataires', () => seedVendorProviders(ctx));
  await runBlock(ctx, only, 'vendus', () => fixSoldVisibility(ctx));

  // Patrimoine : la fiche de chaque bien est dérivée de sa référence (hasard local), l'ordre n'a pas d'effet.
  const leased = await prisma.rentalLease.findMany({
    where: { tenant_id: tenantId, property_id: { in: o.own.map(p => p.id) }, status: { in: ['ACTIVE', 'SUSPENDED'] } },
    select: { property_id: true }
  });
  const profiles: Profile[] = buildProfiles(o, new Set(leased.map(l => l.property_id)));
  await runBlock(ctx, only, 'patrimoine', async () => {
    await seedAssetsAndValuations(o, profiles);
    await seedOwnLoans(o, profiles);
    await seedOwnExpenses(o, profiles);
    await seedOwnWorks(o, profiles);
    await seedTaxYieldAndCashPlan(o, profiles);
  });
  await runBlock(ctx, only, 'assurances', async () => {
    await seedOwnPolicies(o, profiles);
    await seedOwnClaims(o, profiles);
    await seedOwnMaintenanceLog(o, profiles);
    await seedOwnLand(o, profiles);
  });
  await runBlock(ctx, only, 'releves', async () => {
    await seedStatements36(ctx);
    await seedOldStatementPayouts(ctx);
  });
  await runBlock(ctx, only, 'portails', () => seedPortalAccounts(ctx));
  await runBlock(ctx, only, 'crm', () => spreadCrmDates(ctx));

  log(`agence patrimoine : terminé en ${((Date.now() - started) / 1000).toFixed(0)} s.`);
}
