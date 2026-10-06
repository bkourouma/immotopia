/**
 * Compléments SYNDIC : tout écran du module syndic encore vide.
 *
 * Complète l'historique du profil « 3 ans » : après 36 mois d'usage, aucun écran
 * du module ne doit être vide. Ne s'exécute que pour le profil 3y.
 *
 * Règles : voir `types.ts` (dates relatives, hasard seedé, aucun envoi sortant,
 * `tenantId` partout) ; IDEMPOTENT PAR BLOC (un bloc dont les lignes existent
 * déjà sur le tenant est sauté, pour compléter une agence déjà peuplée sans
 * purge) ; fichiers réels via `seed-files.ts`.
 *
 * Ordre : identité (mandants, logos) → fiche du bâtiment (pack Syndic seul) → finances (appel du
 * trimestre en cours, régularisations, échéanciers, programmation, fonds,
 * budget suivant) → vie de l'immeuble (contrats, parties communes, incidents,
 * tickets, coûts, occupants, assemblées) → quittances et reçus (PDF) →
 * documents de copropriété et pièces des factures → copropriété en litige →
 * registre des lots de l'abonnement.
 *
 * Détail de chaque bloc : `syndic-extras-*.ts`.
 */
import { neutralizeOutbound } from './types';
import type { HistoryContext } from './types';
import { loadSyndicEnv } from './syndic-extras-common';
import { seedMandantsAndBranding, seedChargeReceipts } from './syndic-extras-receipts';
import { seedSyndicFinances } from './syndic-extras-finance';
import { seedProviderInvoiceFiles, seedSyndicDocuments } from './syndic-extras-docs';
import {
  flagTroubledSyndicate,
  seedAssets,
  seedBuildings,
  seedContracts,
  seedIncidentCosts,
  seedIncidents,
  seedMaintenanceTickets,
  seedMeetingExtras,
  seedOccupantsAndOwners
} from './syndic-extras-ops';

export async function seedSyndicExtras(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  neutralizeOutbound();
  const env = await loadSyndicEnv(ctx);
  if (!env) return;
  const started = Date.now();
  const step = async (name: string, run: () => Promise<void>): Promise<void> => {
    const t0 = Date.now();
    await run();
    ctx.log(`syndic-extras ${name} : ${Math.round((Date.now() - t0) / 100) / 10} s`);
  };

  await step('identité', () => seedMandantsAndBranding(env));
  await step('bâtiments', () => seedBuildings(env));
  await step('finances', () => seedSyndicFinances(env));
  await step('contrats', () => seedContracts(env));
  await step('parties communes', () => seedAssets(env));
  await step('incidents', () => seedIncidents(env));
  await step('tickets', () => seedMaintenanceTickets(env));
  await step('coûts des incidents', () => seedIncidentCosts(env));
  await step('occupants et propriétaires', () => seedOccupantsAndOwners(env));
  await step('assemblées', () => seedMeetingExtras(env));
  await step('quittances', () => seedChargeReceipts(env));
  await step('documents', () => seedSyndicDocuments(env));
  await step('pièces de factures', () => seedProviderInvoiceFiles(env));
  await step('copropriété en litige', () => flagTroubledSyndicate(env));
  await step('registre des lots', () => reconcileLots(env.tenantId, env.adminId, env.prisma, ctx.log));
  ctx.log(`syndic-extras terminé en ${Math.round((Date.now() - started) / 1000)} s`);
}

/**
 * Ouvre, dans le registre des lots de l'abonnement, les lots de copropriété de
 * l'agence (lots principaux d'une copropriété active). Seules les unités des
 * copropriétés sont touchées : le registre des autres modules reste à leur générateur.
 */
async function reconcileLots(
  tenantId: string,
  adminUserId: string,
  prisma: HistoryContext['prisma'],
  log: (message: string) => void
): Promise<void> {
  try {
    const { activateLotTx, computeQualifyingUnits } = await import('../../../src/services/lot-registry-service');
    type Db = Parameters<typeof activateLotTx>[0];
    const lots = await prisma.syndicateLot.findMany({ where: { syndicate: { tenantId } }, select: { id: true } });
    const units = await computeQualifyingUnits(prisma as unknown as Db, tenantId, {
      propertyIds: [],
      syndicateLotIds: lots.map(l => l.id),
      siteLotIds: []
    });
    let opened = 0;
    await prisma.$transaction(
      async tx => {
        for (const unit of units) {
          // eslint-disable-next-line no-await-in-loop -- séquentiel dans la même transaction.
          const result = await activateLotTx(tx as unknown as Db, tenantId, unit, adminUserId);
          if (result.created) opened++;
        }
      },
      { timeout: 60_000 }
    );
    log(`syndic-extras registre des lots : ${units.length} lot(s) de copropriété qualifiés, ${opened} ouvert(s).`);
  } catch (error) {
    log(`syndic-extras registre des lots non aligné (${error instanceof Error ? error.message : String(error)}).`);
  }
}
