/**
 * Compléments transverses de FINANCE et de TRÉSORERIE (tous packs qui exposent
 * ces écrans) : comptes de trésorerie, comptabilité de la gestion locative,
 * fournisseurs, virements entre comptes, versements DGI, pièces annulées.
 *
 * Complète l'historique du profil « 3 ans » : après 36 mois d'usage, aucun écran
 * du module ne doit être vide. Ne s'exécute que pour le profil 3y.
 *
 * Règles : voir `types.ts` (dates relatives, hasard seedé, aucun envoi sortant,
 * `tenantId` partout) ; IDEMPOTENT PAR BLOC. Exécuté APRÈS les modules du pack
 * (il s'appuie sur leurs baux, encaissements et pièces).
 *
 * Ordre des blocs (chacun dépend du précédent) :
 *  1. comptes de trésorerie et paramètres financiers ;
 *  2. apport initial, honoraires de syndic, fournisseurs et règlements ;
 *  3. rattrapage de la comptabilité locative (journal, 411, 4731) et rangement des
 *     règlements de chantier sur leur banque ;
 *  4. versements DGI, virements de trésorerie (avec les apports qui les financent) ;
 *  5. pièces annulées.
 *
 * Fichiers annexes : `finance-transverse-ledger.ts` (trésorerie, paramètres,
 * rattrapage locatif), `finance-transverse-ops.ts` (fournisseurs, honoraires,
 * annulations), `finance-transverse-treasury.ts` (DGI, virements).
 */
import { runWithTenantContext } from '../../../src/utils/tenant-context';
import { neutralizeOutbound } from './types';
import type { HistoryContext } from './types';
import { seedFinanceSettings, seedRentalLedger, seedTreasuryAccounts } from './finance-transverse-ledger';
import {
  activeStaff,
  repointConstructionPayments,
  seedOpeningContribution,
  seedSuppliers,
  seedSyndicFees,
  seedVoids
} from './finance-transverse-ops';
import type { PackFlavor } from './finance-transverse-ops';
import { seedTaxRemittances, seedTreasuryTransfers } from './finance-transverse-treasury';
import { repointSalaryPayments } from './finance-gaps-treasury';
import { seedPayroll } from './equipe-plateforme-payroll';

/** Nature de l'agence, déduite de ses données (pas du nom du pack : l'opérateur intégré porte tout). */
async function detect(ctx: HistoryContext) {
  const { prisma, tenantId } = ctx;
  const [sites, copros, leases, owners] = await Promise.all([
    prisma.constructionSite.count({ where: { tenantId } }),
    prisma.syndicate.count({ where: { tenantId } }),
    prisma.rentalLease.count({ where: { tenant_id: tenantId } }),
    prisma.tenantClient.count({ where: { tenantId, clientType: 'OWNER' } })
  ]);
  const flavor: PackFlavor =
    leases > 0 && owners === 0 && sites === 0 && copros === 0
      ? 'PATRIMOINE'
      : copros > 0 && leases === 0
        ? 'SYNDIC'
        : 'AGENCE';
  return { withConstruction: sites > 0, hasSyndic: copros > 0, flavor, leases };
}

export async function seedFinanceTransverse(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  neutralizeOutbound();
  await runWithTenantContext({ tenantId: ctx.tenantId, userId: ctx.adminUserId }, async () => {
    const staff = await activeStaff(ctx);
    await seedTreasuryAccounts(ctx);
    await seedFinanceSettings(ctx);
    const kind = await detect(ctx);
    // La paie est écrite par défaut après la finance : on la fait avant, pour que les alimentations de caisse la voient.
    if (kind.withConstruction) await seedPayroll(ctx);
    // Patrimoine : gestion directe ; Agence/Opérateur : mandats ; Syndic : honoraires ; chantiers : fournisseurs du module.
    // Ni chantiers ni fournisseurs : fonctionnement courant de l'agence.
    await seedOpeningContribution(ctx, kind.flavor, kind.withConstruction);
    if (kind.hasSyndic) await seedSyndicFees(ctx);
    if (!kind.withConstruction) await seedSuppliers(ctx, kind.flavor, staff);
    await seedRentalLedger(ctx);
    if (kind.withConstruction) {
      await repointConstructionPayments(ctx);
      // La paie crédite la caisse par défaut : on la range avant de calculer les alimentations.
      await repointSalaryPayments(ctx);
    }
    await seedTaxRemittances(ctx, staff);
    await seedTreasuryTransfers(ctx, staff, kind.withConstruction);
    await seedVoids(ctx, staff);
  });
}
