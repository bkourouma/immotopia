/**
 * Compléments AGENCE, volet locatif et maintenance : états des lieux, chronologie
 * des baux, colocataires, conditions d'honoraires, reversements et retenues des
 * propriétaires, documents locatifs, campagnes de facturation, paiements en ligne
 * (simulateur), remboursements, pénalités levées, déclarations de paiement,
 * carnet d'entretien, pièces jointes des tickets, liens sécurisés et accès
 * externes de tiers de confiance.
 *
 * Complète l'historique du profil « 3 ans » : après 36 mois d'usage, aucun écran
 * du module ne doit être vide. Ne s'exécute que pour le profil 3y.
 *
 * Règles : voir `types.ts` (dates relatives, hasard seedé, aucun envoi sortant,
 * `tenantId` partout) ; IDEMPOTENT PAR BLOC (un bloc dont les lignes existent
 * déjà sur le tenant est sauté, pour compléter une agence déjà peuplée sans
 * purge) ; fichiers réels via `seed-files.ts` et `agence-locatif-files.ts`.
 *
 * Sert aux packs AGENCE et INTEGRE (même module Agence). Les blocs s'enchaînent
 * dans l'ordre des dépendances : chronologie des baux avant les états des lieux
 * (préavis en cours) et les documents (avenants) ; comptes propriétaires à jour
 * avant les reversements. Un bloc en échec est journalisé et n'arrête pas les autres.
 *
 * Débogage : `LOCATIF_BLOCKS=inspections,documents` limite l'exécution à ces blocs.
 */
import { runWithTenantContext } from '../../../src/utils/tenant-context';
import { neutralizeOutbound } from './types';
import type { HistoryContext } from './types';
import { loadBase } from './agence-locatif-base';
import type { LocatifBase } from './agence-locatif-base';
import { seedCoRenters, seedFeeTerms, seedLeaseEvents } from './agence-locatif-lifecycle';
import { seedInspections } from './agence-locatif-inspections';
import { seedRentalDocuments } from './agence-locatif-documents';
import { seedOwnerPayouts, seedOwnerPortalSettings, seedWithholdings } from './agence-locatif-owners';
import {
  seedBillingRuns,
  seedGatewayAndCheckouts,
  seedInstallmentItems,
  seedPaymentDeclarations,
  seedRefunds,
  seedStatementLinks,
  seedWaivedPenalties
} from './agence-locatif-payments';
import { seedMaintenanceLog, seedTicketAttachments } from './agence-locatif-maintenance';
import { seedExternalAccess } from './agence-locatif-access';

export async function seedAgenceLocatif(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  const { prisma, tenantId, log } = ctx;

  const leaseCount = await prisma.rentalLease.count({ where: { tenant_id: tenantId } });
  if (leaseCount === 0) {
    log('agence locatif : aucun bail sur ce tenant, rien à compléter.');
    return;
  }

  // Les services lisent leur configuration d'envoi au premier import : on les charge après la neutralisation.
  neutralizeOutbound();
  const lifecycle = await import('../../../src/lib/lease-lifecycle/service');

  const only = process.env.LOCATIF_BLOCKS?.split(',').map(s => s.trim());
  const started = Date.now();

  await runWithTenantContext({ tenantId, userId: ctx.adminUserId }, async () => {
    let base: LocatifBase = await loadBase(ctx);

    const run = async (name: string, fn: () => Promise<void>) => {
      if (only && !only.includes(name)) return;
      const t0 = Date.now();
      try {
        await fn();
      } catch (error) {
        log(`bloc « ${name} » en échec — ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      }
      log(`bloc « ${name} » : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    };

    await run('coloc', () => seedCoRenters(base));
    await run('honoraires', () => seedFeeTerms(base));
    await run('chronologie', async () => {
      await seedLeaseEvents(base, lifecycle);
      base = await loadBase(ctx);
    });
    await run('inspections', () => seedInspections(base));
    await run('documents', () => seedRentalDocuments(base));
    await run('campagnes', () => seedBillingRuns(base));
    await run('lignes', () => seedInstallmentItems(base));
    await run('portail', () => seedOwnerPortalSettings(base));
    await run('retenues', () => seedWithholdings(base));
    await run('reversements', () => seedOwnerPayouts(base));
    await run('paiements-en-ligne', () => seedGatewayAndCheckouts(base));
    await run('remboursements', () => seedRefunds(base));
    await run('penalites', () => seedWaivedPenalties(base));
    await run('declarations', () => seedPaymentDeclarations(base));
    await run('liens-releves', () => seedStatementLinks(base));
    await run('carnet', () => seedMaintenanceLog(base));
    await run('pieces-tickets', () => seedTicketAttachments(base));
    await run('acces-externes', () => seedExternalAccess(base));
  });

  log(`agence locatif : terminé en ${((Date.now() - started) / 1000).toFixed(0)} s.`);
}
