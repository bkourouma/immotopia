/**
 * Trous de finance relevés par la recette : caisse, pièces à valider, facturation, balances clients, retenue et versements, diversité des statuts, soldes aberrants.
 *
 * 2e vague (recette « aucun écran vide » des comptes « 3 ans »). Ne s'exécute que pour le
 * profil 3y ; IDEMPOTENT PAR BLOC ; règles de `types.ts` ; fichiers réels via `seed-files.ts`.
 * S'exécute APRÈS `seedFinanceTransverse` (il en répare et complète les données).
 *
 * Ce qui est fait, et ce qui ne l'est volontairement pas :
 *
 *  - paie rangée sur banque / Mobile Money et trésorerie équilibrée à toute date
 *    (cause du solde de −91 M de la caisse du Promoteur) : `finance-gaps-treasury.ts` ;
 *  - sessions de caisse des agences sans chantier : `finance-gaps-cash.ts` ;
 *  - pièces à valider, factures partiellement payées, bons de commande variés,
 *    journal des achats : `finance-gaps-pieces.ts` ;
 *  - campagnes de facturation (Patrimoine), balance clients (Syndic, Promoteur),
 *    commissions des agents (Patrimoine) : `finance-gaps-billing.ts`.
 *
 * Laissés vides, faute de sens métier : retenue à la source et versements DGI hors
 * gestion pour compte de tiers (elle se prélève sur les loyers reversés à un
 * propriétaire mandant : Syndic, Promoteur et Patrimoine n'en ont pas) ;
 * campagnes de facturation du Syndic et du Promoteur (elles facturent des baux, ces
 * agences n'en ont pas) ; comptabilité des mandants et propriétaires du Syndic
 * (fonds de propriétaires de gestion locative).
 */
import { runWithTenantContext } from '../../../src/utils/tenant-context';
import { neutralizeOutbound } from './types';
import type { HistoryContext } from './types';
import { activeStaff } from './finance-transverse-ops';
import { balanceTreasury, renumberTransfers, repointSalaryPayments } from './finance-gaps-treasury';
import { seedCashSessionsGeneral } from './finance-gaps-cash';
import {
  seedPartialInvoices,
  seedPendingPieces,
  seedPurchaseOrderStatuses,
  seedPurchasesJournal
} from './finance-gaps-pieces';
import { seedAgentCommissionShares, seedBillingRunsDirect, seedClientBalances } from './finance-gaps-billing';

export async function seedFinanceGaps(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  neutralizeOutbound();
  const { prisma, tenantId } = ctx;
  await runWithTenantContext({ tenantId, userId: ctx.adminUserId }, async () => {
    const staff = await activeStaff(ctx);
    const [sites, copros, leases, owners] = await Promise.all([
      prisma.constructionSite.count({ where: { tenantId } }),
      prisma.syndicate.count({ where: { tenantId } }),
      prisma.rentalLease.count({ where: { tenant_id: tenantId } }),
      prisma.tenantClient.count({ where: { tenantId, clientType: 'OWNER' } })
    ]);
    const withConstruction = sites > 0;
    const patrimoine = leases > 0 && owners === 0 && !withConstruction && copros === 0;

    // 1. Cause racine du solde négatif : la paie sort de la banque ou du portefeuille, pas de la caisse.
    await repointSalaryPayments(ctx);

    // 2. Caisse : sessions de l'agence (les agences à chantiers ont déjà celles de leurs chantiers).
    if (!withConstruction) await seedCashSessionsGeneral(ctx, staff);

    // 3. Pièces en attente, statuts variés, journal des achats.
    await seedPartialInvoices(ctx, staff);
    await seedPendingPieces(ctx, staff, withConstruction);
    if (withConstruction) await seedPurchaseOrderStatuses(ctx, staff);
    await seedPurchasesJournal(ctx);

    // 4. Facturation du mois, balances clients, commissions.
    if (patrimoine) await seedBillingRunsDirect(ctx, staff);
    if (copros > 0 && leases === 0) await seedClientBalances(ctx, staff, 'SYNDIC');
    if (withConstruction && leases === 0) await seedClientBalances(ctx, staff, 'PROMOTEUR');
    await seedAgentCommissionShares(ctx);

    // 5. Trésorerie : à la toute fin (tout ce qui précède a pu bouger des comptes), jamais négative.
    await balanceTreasury(ctx, staff, withConstruction);
    await renumberTransfers(ctx);
  });
}
